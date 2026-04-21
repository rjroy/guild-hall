import { Hono } from "hono";
import matter from "gray-matter";
import { z } from "zod";
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

// Schemas for workspace.issue.list and workspace.issue.read (Phase 1 metadata).
// Requests are modeled as flat objects over query params.

export const issueListRequestSchema = z.object({
  projectName: z.string().min(1),
  status: z.string().optional(),
});

const issueRowSchema = z.object({
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  date: z.string(),
});

export const issueListResponseSchema = z.object({
  issues: z.array(issueRowSchema),
});

export const issueReadRequestSchema = z.object({
  projectName: z.string().min(1),
  slug: z.string().min(1),
});

export const issueReadResponseSchema = z.object({
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  date: z.string(),
  body: z.string(),
});

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

  // GET /workspace/issue/list?projectName=X[&status=Y]
  // Lists issue frontmatter rows from .lore/issues/ in the integration worktree.
  // Returns an empty array if the directory does not exist.
  routes.get("/workspace/issue/list", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "projectName is required" }, 400);
    }
    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const statusFilter = c.req.query("status");
    const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName);
    const issuesDir = nodePath.join(worktreePath, ".lore", "issues");

    let entries: string[];
    try {
      entries = await fs.readdir(issuesDir);
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ issues: [] });
      }
      log.error("issue list failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }

    const issues: Array<{ slug: string; title: string; status: string; date: string }> = [];
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const slug = entry.slice(0, -3);
      try {
        const raw = await fs.readFile(nodePath.join(issuesDir, entry), "utf-8");
        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        const title = typeof data.title === "string" ? data.title : slug;
        const status = typeof data.status === "string" ? data.status : "open";
        const date = typeof data.date === "string" ? data.date : "";
        if (statusFilter && status !== statusFilter) continue;
        issues.push({ slug, title, status, date });
      } catch (err: unknown) {
        log.warn(`issue list: skipping unreadable "${entry}":`, errorMessage(err));
      }
    }

    return c.json({ issues });
  });

  // GET /workspace/issue/read?projectName=X&slug=Y
  // Reads a single issue's frontmatter and body. 404 when slug not found.
  routes.get("/workspace/issue/read", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "projectName is required" }, 400);
    }
    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const slug = c.req.query("slug");
    if (!slug) {
      return c.json({ error: "slug is required" }, 400);
    }

    const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName);
    const filePath = nodePath.join(worktreePath, ".lore", "issues", `${slug}.md`);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: `Issue not found: ${slug}` }, 404);
      }
      log.error("issue read failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }

    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title : slug;
    const status = typeof data.status === "string" ? data.status : "open";
    const date = typeof data.date === "string" ? data.date : "";
    const body = parsed.content.replace(/^\n+/, "");

    return c.json({ slug, title, status, date, body });
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
    // Three-segment hierarchy exception: REQ-CLI-AGENT-22a permits using the
    // verb (`list`/`read`) as the `object` segment for workspace.issue.* ops,
    // matching the precedent set by workspace.issue.create.
    {
      operationId: "workspace.issue.list",
      version: "1",
      name: "list",
      description: "List issues in .lore/issues/ for a project, optionally filtered by status",
      invocation: { method: "GET", path: "/workspace/issue/list" },
      requestSchema: issueListRequestSchema,
      responseSchema: issueListResponseSchema,
      sideEffects: "",
      context: { project: true },
      idempotent: true,
      // REQ-CLI-AGENT-22a: verb-as-object is the three-segment exception.
      hierarchy: { root: "workspace", feature: "issue", object: "list" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "status", required: false, in: "query" as const },
      ],
    },
    {
      operationId: "workspace.issue.read",
      version: "1",
      name: "read",
      description: "Read a single issue's frontmatter and body from .lore/issues/",
      invocation: { method: "GET", path: "/workspace/issue/read" },
      requestSchema: issueReadRequestSchema,
      responseSchema: issueReadResponseSchema,
      sideEffects: "",
      context: { project: true },
      idempotent: true,
      // REQ-CLI-AGENT-22a: verb-as-object is the three-segment exception.
      hierarchy: { root: "workspace", feature: "issue", object: "read" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "slug", required: true, in: "query" as const },
      ],
    },
  ];

  const descriptions: Record<string, string> = {
    "workspace.issue": "Create and manage issues in .lore/issues/",
  };

  return { routes, operations, descriptions };
}
