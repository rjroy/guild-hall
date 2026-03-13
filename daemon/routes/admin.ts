import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
import { readConfig, writeConfig } from "@/lib/config";
import type { AppConfig } from "@/lib/types";
import {
  syncProject as syncProjectDefault,
  rebaseAll,
  syncAll,
} from "@/daemon/services/git-admin";

export interface AdminDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  readConfigFromDisk: () => Promise<AppConfig>;
  /** Optional DI override for syncProject (used by reload-config for testability). */
  syncProject?: (
    projectPath: string,
    projectName: string,
    guildHallHome?: string,
    gitOps?: GitOps,
    defaultBranch?: string,
  ) => Promise<unknown>;
}

/**
 * Creates admin routes for operational tasks.
 *
 * POST /system/config/application/reload   - Reload configuration from disk
 * POST /system/config/project/register     - Register a new project
 * GET  /system/config/application/validate - Validate configuration and project paths
 * POST /workspace/git/branch/rebase        - Rebase claude branch onto default branch
 * POST /workspace/git/integration/sync     - Smart sync: fetch, detect merged PRs, rebase
 */
export function createAdminRoutes(deps: AdminDeps): Hono {
  const routes = new Hono();
  const doSyncProject = deps.syncProject ?? syncProjectDefault;

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
        console.log(
          `[daemon] Creating integration worktree for new project "${project.name}"`,
        );
        try {
          await fs.mkdir(path.dirname(iPath), { recursive: true });
          await deps.gitOps.initClaudeBranch(project.path);
          await deps.gitOps.createWorktree(
            project.path,
            iPath,
            CLAUDE_BRANCH,
          );
        } catch (err: unknown) {
          console.warn(
            `[daemon] Failed to create worktree for "${project.name}":`,
            errorMessage(err),
          );
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
        console.warn(
          `[daemon] Sync failed for new project "${project.name}":`,
          errorMessage(err),
        );
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
      const body = await c.req.json() as { name?: string; path?: string };

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

      // Validate .lore/ exists
      try {
        await fs.stat(path.join(resolved, ".lore"));
      } catch {
        return c.json({ error: `'${resolved}' does not contain a .lore/ directory` }, 400);
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
      diskConfig.projects.push({ name, path: resolved, defaultBranch });
      await writeConfig(diskConfig, configPath);

      // Update the in-memory config so all daemon references see the new project
      deps.config.projects.push({ name, path: resolved, defaultBranch });

      console.log(`[admin] Registered project '${name}' at ${resolved}`);

      return c.json({
        registered: true,
        name,
        path: resolved,
        defaultBranch,
      });
    } catch (err: unknown) {
      console.error("[admin] register-project failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
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
          issues.push(
            `${project.name}: '${resolved}' does not contain a .lore/ directory`,
          );
        }
      }

      return c.json({
        valid: issues.length === 0,
        issues,
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

  return routes;
}
