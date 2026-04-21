import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import { CLAUDE_BRANCH, cleanGitEnv, type GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
import { readConfig, writeConfig } from "@/lib/config";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import {
  syncProject as syncProjectDefault,
  hasActiveActivities as hasActiveActivitiesDefault,
  rebaseAll,
  syncAll,
} from "@/daemon/services/git-admin";

export interface AdminDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  readConfigFromDisk: () => Promise<AppConfig>;
  /** Injectable logger. Defaults to nullLog("admin"). */
  log?: Log;
  /** Optional DI override for syncProject (used by reload-config for testability). */
  syncProject?: (
    projectPath: string,
    projectName: string,
    guildHallHome?: string,
    gitOps?: GitOps,
    defaultBranch?: string,
  ) => Promise<unknown>;
  /** Optional DI override for hasActiveActivities (for testability). */
  hasActiveActivities?: (ghHome: string, projectName: string) => Promise<boolean>;
}

/**
 * Creates admin routes for operational tasks.
 *
 * POST /system/config/application/reload   - Reload configuration from disk
 * POST /system/config/project/register     - Register a new project
 * GET  /system/config/application/validate - Validate configuration and project paths
 * GET  /system/config/project/list         - List all registered projects
 * POST /workspace/git/branch/rebase        - Rebase claude branch onto default branch
 * POST /workspace/git/integration/sync     - Smart sync: fetch, detect merged PRs, rebase
 */
export function createAdminRoutes(deps: AdminDeps): RouteModule {
  const log = deps.log ?? nullLog("admin");
  const routes = new Hono();
  const doSyncProject = deps.syncProject ?? syncProjectDefault;
  const doHasActiveActivities = deps.hasActiveActivities ?? hasActiveActivitiesDefault;

  routes.post("/system/config/application/reload", async (c) => {
    const freshConfig = await deps.readConfigFromDisk();

    // Identify newly added projects (present in fresh config but not in current)
    const existingNames = new Set(deps.config.projects.map((p) => p.name));
    const newProjects = freshConfig.projects.filter(
      (p) => !existingNames.has(p.name),
    );

    // Mutate the existing config.projects array in place so all references
    // across the daemon see the updated list.
    deps.config.projects.length = 0;
    deps.config.projects.push(...freshConfig.projects);

    // Set up integration worktrees and run sync for newly added projects only
    for (const project of newProjects) {
      const iPath = integrationWorktreePath(deps.guildHallHome, project.name);
      try {
        await fs.access(iPath);
      } catch {
        log.info(`Creating integration worktree for new project "${project.name}"`);
        try {
          await fs.mkdir(path.dirname(iPath), { recursive: true });
          await deps.gitOps.initClaudeBranch(project.path);
          await deps.gitOps.createWorktree(
            project.path,
            iPath,
            CLAUDE_BRANCH,
          );
        } catch (err: unknown) {
          log.warn(`Failed to create worktree for "${project.name}":`, errorMessage(err));
        }
      }

      try {
        await doSyncProject(
          project.path,
          project.name,
          deps.guildHallHome,
          deps.gitOps,
          project.defaultBranch,
        );
      } catch (err: unknown) {
        log.warn(`Sync failed for new project "${project.name}":`, errorMessage(err));
      }
    }

    return c.json({
      reloaded: true,
      projectCount: deps.config.projects.length,
      newProjects: newProjects.map((p) => p.name),
    });
  });

  // -- POST /system/config/project/register --
  // Owns the full registration sequence: validate, git setup, config write, reload.
  routes.post("/system/config/project/register", async (c) => {
    try {
      const body: { name?: string; path?: string; group?: string } = await c.req.json();

      if (!body.name || !body.path) {
        return c.json({ error: "name and path are required" }, 400);
      }

      const name = body.name;
      const resolved = path.resolve(body.path);

      // Validate the project path exists and is a directory
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
          return c.json({ error: `'${resolved}' is not a directory` }, 400);
        }
      } catch {
        return c.json({ error: `path '${resolved}' does not exist` }, 400);
      }

      // Validate .git/ exists
      try {
        await fs.stat(path.join(resolved, ".git"));
      } catch {
        return c.json({ error: `'${resolved}' does not contain a .git/ directory` }, 400);
      }

      // Reject duplicate names
      if (deps.config.projects.some((p) => p.name === name)) {
        return c.json({ error: `project '${name}' is already registered` }, 409);
      }

      // Detect default branch before modifications
      const defaultBranch = await deps.gitOps.detectDefaultBranch(resolved);

      // Create claude branch from HEAD if it doesn't exist
      await deps.gitOps.initClaudeBranch(resolved);

      // Create integration worktree
      const integrationPath = integrationWorktreePath(deps.guildHallHome, name);
      await fs.mkdir(path.dirname(integrationPath), { recursive: true });
      await deps.gitOps.createWorktree(resolved, integrationPath, CLAUDE_BRANCH);

      // Ensure the activity worktrees directory exists
      const worktreeRoot = activityWorktreeRoot(deps.guildHallHome, name);
      await fs.mkdir(worktreeRoot, { recursive: true });

      // Write to config.yaml on disk
      const configPath = path.join(deps.guildHallHome, "config.yaml");
      const diskConfig = await readConfig(configPath);
      diskConfig.projects.push({ name, path: resolved, defaultBranch, ...(body.group ? { group: body.group } : {}) });
      await writeConfig(diskConfig, configPath);

      // Update the in-memory config so all daemon references see the new project
      deps.config.projects.push({ name, path: resolved, defaultBranch, ...(body.group ? { group: body.group } : {}) });

      log.info(`Registered project '${name}' at ${resolved}`);

      return c.json({
        registered: true,
        name,
        path: resolved,
        defaultBranch,
        ...(body.group ? { group: body.group } : {}),
      });
    } catch (err: unknown) {
      log.error("register-project failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // -- POST /system/config/project/group --
  // Sets (or updates) the group field for a registered project.
  routes.post("/system/config/project/group", async (c) => {
    try {
      const body: { name?: string; group?: string } = await c.req.json();

      if (!body.name || !body.group) {
        return c.json({ error: "name and group are required" }, 400);
      }

      const { name, group } = body;

      const memIdx = deps.config.projects.findIndex((p) => p.name === name);
      if (memIdx === -1) {
        return c.json({ error: `project '${name}' not found` }, 404);
      }

      const configPath = path.join(deps.guildHallHome, "config.yaml");
      const diskConfig = await readConfig(configPath);
      const diskIdx = diskConfig.projects.findIndex((p) => p.name === name);
      if (diskIdx !== -1) {
        diskConfig.projects[diskIdx].group = group;
      }
      await writeConfig(diskConfig, configPath);

      deps.config.projects[memIdx].group = group;

      return c.json({ updated: true, name, group });
    } catch (err: unknown) {
      log.error("group-project failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // -- POST /system/config/project/deregister --
  // Removes a project from config and optionally cleans filesystem artifacts.
  routes.post("/system/config/project/deregister", async (c) => {
    try {
      const body: { name?: string; clean?: boolean } = await c.req.json();

      if (!body.name) {
        return c.json({ error: "name is required" }, 400);
      }

      const name = body.name;

      const memIdx = deps.config.projects.findIndex((p) => p.name === name);
      if (memIdx === -1) {
        return c.json({ error: `project '${name}' not found` }, 404);
      }

      const active = await doHasActiveActivities(deps.guildHallHome, name);
      if (active) {
        return c.json(
          { error: `project '${name}' has active activities; stop them before deregistering` },
          409,
        );
      }

      // Remove from disk config
      const configPath = path.join(deps.guildHallHome, "config.yaml");
      const diskConfig = await readConfig(configPath);
      const diskIdx = diskConfig.projects.findIndex((p) => p.name === name);
      if (diskIdx !== -1) {
        diskConfig.projects.splice(diskIdx, 1);
      }
      await writeConfig(diskConfig, configPath);

      // Remove from in-memory config
      deps.config.projects.splice(memIdx, 1);

      const cleaned: string[] = [];
      const failedCleanup: string[] = [];

      if (body.clean) {
        const integrationPath = integrationWorktreePath(deps.guildHallHome, name);
        const worktreeRoot = activityWorktreeRoot(deps.guildHallHome, name);

        // Try git worktree remove, then rm for integration worktree
        try {
          const proc = Bun.spawn(["git", "worktree", "remove", "--force", integrationPath], {
            cwd: deps.guildHallHome,
            stdout: "pipe",
            stderr: "pipe",
            env: cleanGitEnv(),
          });
          await proc.exited;
        } catch {
          // Non-fatal — proceed to rm
        }
        try {
          await fs.rm(integrationPath, { recursive: true, force: true });
          cleaned.push(integrationPath);
        } catch {
          failedCleanup.push(integrationPath);
        }

        // Remove activity worktrees root
        try {
          await fs.rm(worktreeRoot, { recursive: true, force: true });
          cleaned.push(worktreeRoot);
        } catch {
          failedCleanup.push(worktreeRoot);
        }
      }

      log.info(`Deregistered project '${name}'`);

      return c.json({ deregistered: true, name, cleaned, failedCleanup });
    } catch (err: unknown) {
      log.error("deregister-project failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // -- GET /system/config/project/list --
  // Returns all registered projects with their path, group, and status.
  // Status is "registered" for every project present in config (the in-memory
  // config is the source of truth). Path validity is reported separately by
  // /system/config/application/validate.
  routes.get("/system/config/project/list", (c) => {
    const projects = deps.config.projects.map((p) => ({
      name: p.name,
      path: p.path,
      group: p.group,
      status: "registered" as const,
    }));
    return c.json({ projects });
  });

  // -- GET /system/config/application/validate --
  // Validates config and project paths. Returns issues found.
  routes.get("/system/config/application/validate", async (c) => {
    try {
      // deps.guildHallHome is the full path (e.g., ~/.guild-hall), not
      // a HOME override, so construct config path directly.
      const configPath = path.join(deps.guildHallHome, "config.yaml");
      let config: AppConfig;
      try {
        config = await readConfig(configPath);
      } catch (err: unknown) {
        return c.json({
          valid: false,
          issues: [`Config error: ${errorMessage(err)}`],
        });
      }

      if (config.projects.length === 0) {
        return c.json({ valid: true, issues: [], projectCount: 0 });
      }

      const issues: string[] = [];
      const warnings: string[] = [];

      for (const project of config.projects) {
        const resolved = path.resolve(project.path);

        try {
          const stat = await fs.stat(resolved);
          if (!stat.isDirectory()) {
            issues.push(`${project.name}: '${resolved}' is not a directory`);
            continue;
          }
        } catch {
          issues.push(`${project.name}: path '${resolved}' does not exist`);
          continue;
        }

        try {
          await fs.stat(path.join(resolved, ".git"));
        } catch {
          issues.push(
            `${project.name}: '${resolved}' does not contain a .git/ directory`,
          );
        }

        try {
          await fs.stat(path.join(resolved, ".lore"));
        } catch {
          warnings.push(
            `${project.name}: '${resolved}' does not contain a .lore/ directory`,
          );
        }
      }

      return c.json({
        valid: issues.length === 0,
        issues,
        ...(warnings.length > 0 && { warnings }),
        projectCount: config.projects.length,
      });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // -- POST /workspace/git/branch/rebase --
  // Rebase claude onto default branch for one or all projects.
  routes.post("/workspace/git/branch/rebase", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as { projectName?: string };
      const result = await rebaseAll(
        body.projectName,
        deps.guildHallHome,
        deps.gitOps,
        deps.config,
      );
      return c.json(result);
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  // -- POST /workspace/git/integration/sync --
  // Smart sync (fetch + detect merged PRs + reset or rebase) for one or all projects.
  routes.post("/workspace/git/integration/sync", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as { projectName?: string };
      const result = await syncAll(
        body.projectName,
        deps.guildHallHome,
        deps.gitOps,
        deps.config,
      );
      return c.json(result);
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "system.config.application.reload",
      version: "1",
      name: "reload",
      description: "Reload configuration from disk",
      invocation: { method: "POST", path: "/system/config/application/reload" },
      sideEffects: "Reloads config.yaml into daemon memory, creates worktrees for new projects",
      context: {},

      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "application" },
    },
    {
      operationId: "system.config.project.register",
      version: "1",
      name: "register",
      description: "Register a new project",
      invocation: { method: "POST", path: "/system/config/project/register" },
      sideEffects: "Creates git branch, integration worktree, writes config.yaml",
      context: {},

      idempotent: false,
      hierarchy: { root: "system", feature: "config", object: "project" },
      parameters: [
        { name: "name", required: true, in: "body" as const },
        { name: "path", required: true, in: "body" as const },
        { name: "group", required: false, in: "body" as const },
      ],
    },
    {
      operationId: "system.config.project.list",
      version: "1",
      name: "list",
      description: "List all registered projects with name, path, group, and status",
      invocation: { method: "GET", path: "/system/config/project/list" },
      sideEffects: "",
      context: {},
      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "project" },
    },
    {
      operationId: "system.config.application.validate",
      version: "1",
      name: "validate",
      description: "Validate configuration and project paths",
      invocation: { method: "GET", path: "/system/config/application/validate" },
      sideEffects: "",
      context: {},

      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "application" },
    },
    {
      operationId: "system.config.project.group",
      version: "1",
      name: "group",
      description: "Set a project's group",
      invocation: { method: "POST", path: "/system/config/project/group" },
      sideEffects: "Updates group field in config.yaml and in-memory config",
      context: {},
      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "project" },
      parameters: [
        { name: "name", required: true, in: "body" as const },
        { name: "group", required: true, in: "body" as const },
      ],
    },
    {
      operationId: "system.config.project.deregister",
      version: "1",
      name: "deregister",
      description: "Deregister a project from guild-hall",
      invocation: { method: "POST", path: "/system/config/project/deregister" },
      sideEffects: "Removes project from config.yaml, in-memory config, and optionally filesystem artifacts",
      context: {},
      idempotent: false,
      hierarchy: { root: "system", feature: "config", object: "project" },
      parameters: [
        { name: "name", required: true, in: "body" as const },
        { name: "clean", required: false, in: "body" as const },
      ],
    },
    {
      operationId: "workspace.git.branch.rebase",
      version: "1",
      name: "rebase",
      description: "Rebase claude branch onto default branch",
      invocation: { method: "POST", path: "/workspace/git/branch/rebase" },
      sideEffects: "Rebases claude branch, updates integration worktree",
      context: {},

      idempotent: true,
      hierarchy: { root: "workspace", feature: "git", object: "branch" },
      parameters: [{ name: "projectName", required: false, in: "body" as const }],
    },
    {
      operationId: "workspace.git.integration.sync",
      version: "1",
      name: "sync",
      description: "Smart sync: fetch, detect merged PRs, rebase",
      invocation: { method: "POST", path: "/workspace/git/integration/sync" },
      sideEffects: "Fetches from origin, detects merged PRs, rebases or resets claude branch",
      context: {},

      idempotent: true,
      hierarchy: { root: "workspace", feature: "git", object: "integration" },
      parameters: [{ name: "projectName", required: false, in: "body" as const }],
    },
  ];

  const descriptions: Record<string, string> = {
    "workspace.git": "Git branch and integration operations",
    "workspace.git.branch": "Branch management",
    "workspace.git.integration": "Integration worktree sync",
  };

  return { routes, operations, descriptions };
}
