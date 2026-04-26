import { Hono } from "hono";
import { errorMessage } from "@/apps/daemon/lib/toolbox-utils";
import { nullLog } from "@/apps/daemon/lib/log";
import type { Log } from "@/apps/daemon/lib/log";
import type { GitOps } from "@/apps/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";

export interface GitLoreDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  /** Injectable logger. Defaults to nullLog("git-lore"). */
  log?: Log;
}

export function createGitLoreRoutes(deps: GitLoreDeps): RouteModule {
  const log = deps.log ?? nullLog("git-lore");
  const routes = new Hono();

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  routes.get("/workspace/git/lore/status", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = findProject(projectName);
    if (!project) {
      return c.json({ error: `Project "${projectName}" not found` }, 404);
    }

    try {
      const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName);
      const result = await deps.gitOps.lorePendingChanges(worktreePath);
      return c.json(result, 200);
    } catch (err: unknown) {
      log.error("lore status failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  routes.post("/workspace/git/lore/commit", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = findProject(projectName);
    if (!project) {
      return c.json({ error: `Project "${projectName}" not found` }, 404);
    }

    let body: { message?: string };
    try {
      body = await c.req.json<{ message?: string }>();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const message = body.message?.trim();
    if (!message) {
      return c.json({ error: "Commit message is required" }, 400);
    }

    try {
      const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName);
      const result = await deps.gitOps.commitLore(worktreePath, message);
      if (!result.committed) {
        return c.json({ committed: false, message: "Nothing to commit" }, 200);
      }
      return c.json({ committed: true, message }, 200);
    } catch (err: unknown) {
      log.error("lore commit failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "workspace.git.lore.status",
      version: "1",
      name: "status",
      description: "Check for uncommitted .lore/ changes in the integration worktree",
      invocation: { method: "GET", path: "/workspace/git/lore/status" },
      sideEffects: "",
      context: { project: true },
      idempotent: true,
      hierarchy: { root: "workspace", feature: "git", object: "lore" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }],
    },
    {
      operationId: "workspace.git.lore.commit",
      version: "1",
      name: "commit",
      description: "Stage .lore/ changes and commit to the integration worktree",
      invocation: { method: "POST", path: "/workspace/git/lore/commit" },
      sideEffects: "Stages .lore/ changes and commits to the integration worktree",
      context: { project: true },
      idempotent: false,
      hierarchy: { root: "workspace", feature: "git", object: "lore" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "message", required: true, in: "body" as const },
      ],
    },
  ];

  const descriptions: Record<string, string> = {
    // Do NOT register "workspace.git" here — admin.ts already owns it.
    "workspace.git.lore": "Commit .lore changes to the integration worktree",
  };

  return { routes, operations, descriptions };
}
