import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";

export interface IssueRouteDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  log?: Log;
}

/**
 * Converts a title to a URL-safe slug: lowercase, non-alphanumeric runs
 * replaced with a single hyphen, leading/trailing hyphens stripped.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Finds a free filename in issuesDir by appending -2, -3, ... suffixes
 * until no collision exists.
 */
export async function resolveSlug(
  issuesDir: string,
  baseSlug: string,
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;
  while (true) {
    try {
      await fs.access(nodePath.join(issuesDir, `${slug}.md`));
      slug = `${baseSlug}-${counter}`;
      counter++;
    } catch {
      return slug;
    }
  }
}

export function createWorkspaceIssueRoutes(deps: IssueRouteDeps): RouteModule {
  const log = deps.log ?? nullLog("workspace-issue");
  const routes = new Hono();

  routes.post("/workspace/issue/create", async (c) => {
    let body: { projectName?: string; title?: string; body?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { projectName, title, body: issueBody } = body;

    if (!title || title.trim() === "") {
      return c.json({ error: "Title is required" }, 400);
    }
    if (title.trim().length > 200) {
      return c.json({ error: "Title must be 200 characters or fewer" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const baseSlug = slugify(title.trim());
    if (baseSlug === "") {
      return c.json({ error: "Title must contain at least one alphanumeric character" }, 400);
    }

    const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName!);
    const issuesDir = nodePath.join(worktreePath, ".lore", "issues");

    await fs.mkdir(issuesDir, { recursive: true });

    const slug = await resolveSlug(issuesDir, baseSlug);
    const filePath = nodePath.join(issuesDir, `${slug}.md`);

    const today = new Date().toISOString().split("T")[0];
    const escapedTitle = title.trim().replace(/"/g, '\\"');
    let content = `---\ntitle: "${escapedTitle}"\ndate: ${today}\nstatus: open\n---`;
    if (issueBody && issueBody.trim() !== "") {
      content += `\n\n${issueBody}`;
    }

    try {
      await fs.writeFile(filePath, content, "utf-8");
    } catch (err: unknown) {
      log.error("issue write failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }

    try {
      await deps.gitOps.commitAll(worktreePath, `Add issue: ${slug}`);
    } catch (err: unknown) {
      log.warn("issue commit failed (non-fatal):", errorMessage(err));
    }

    const relativePath = `.lore/issues/${slug}.md`;
    return c.json({ path: relativePath, slug }, 201);
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "workspace.issue.create",
      version: "1",
      name: "create",
      description: "Create an issue in .lore/issues/ and commit it to the integration worktree",
      invocation: { method: "POST", path: "/workspace/issue/create" },
      sideEffects: "Creates an issue file in .lore/issues/ and commits it to the integration worktree",
      context: { project: true },
      idempotent: false,
      hierarchy: { root: "workspace", feature: "issue", object: "create" },
      parameters: [
        { name: "projectName", required: true, in: "body" as const },
        { name: "title", required: true, in: "body" as const },
        { name: "body", required: false, in: "body" as const },
      ],
    },
  ];

  const descriptions: Record<string, string> = {
    "workspace.issue": "Create and manage issues in .lore/issues/",
  };

  return { routes, operations, descriptions };
}
