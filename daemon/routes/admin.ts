import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { AppConfig } from "@/lib/types";

export interface AdminDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  readConfigFromDisk: () => Promise<AppConfig>;
  syncProject: (
    projectPath: string,
    projectName: string,
    guildHallHome?: string,
    gitOps?: GitOps,
    defaultBranch?: string,
  ) => Promise<unknown>;
}

/**
 * Creates admin routes for operational tasks.
 * These are behind /admin/ to signal they're operational, not user-facing.
 */
export function createAdminRoutes(deps: AdminDeps): Hono {
  const routes = new Hono();

  routes.post("/admin/reload-config", async (c) => {
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
        await deps.syncProject(
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

  return routes;
}
