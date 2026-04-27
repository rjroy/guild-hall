import { Hono } from "hono";
import matter from "gray-matter";
import { z } from "zod";
import { errorMessage } from "@/apps/daemon/lib/toolbox-utils";
import { nullLog } from "@/apps/daemon/lib/log";
import type { Log } from "@/apps/daemon/lib/log";
import type { GitOps } from "@/apps/daemon/lib/git";
import { integrationWorktreePath, workArtifactPath } from "@/lib/paths";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import { isNodeError } from "@/lib/types";
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
 * Finds a free filename across one or more candidate directories by
 * appending -2, -3, ... suffixes until no collision exists in any of them.
 * Accepts either a single dir (string) or an array of dirs (REQ-LDR-24
 * dedupes against both work/issues/ and the legacy flat issues/).
 */
export async function resolveSlug(
  issuesDir: string | string[],
  baseSlug: string,
): Promise<string> {
  const dirs = Array.isArray(issuesDir) ? issuesDir : [issuesDir];
  let slug = baseSlug;
  let counter = 2;
  while (true) {
    let collided = false;
    for (const dir of dirs) {
      try {
        await fs.access(nodePath.join(dir, `${slug}.md`));
        collided = true;
        break;
      } catch {
        // not in this dir; check next
      }
    }
    if (!collided) return slug;
    slug = `${baseSlug}-${counter}`;
    counter++;
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
    // REQ-LDR-24: writes target the canonical .lore/work/issues/ layout, but
    // the slug must be unique against the legacy flat .lore/issues/ too so a
    // newly-created issue can't shadow an existing one.
    const workIssuesDir = nodePath.dirname(workArtifactPath(worktreePath, "issues", "x.md"));
    const flatIssuesDir = nodePath.join(worktreePath, ".lore", "issues");

    await fs.mkdir(workIssuesDir, { recursive: true });

    const slug = await resolveSlug([workIssuesDir, flatIssuesDir], baseSlug);
    const filePath = workArtifactPath(worktreePath, "issues", `${slug}.md`);

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

    const relativePath = `.lore/work/issues/${slug}.md`;
    return c.json({ path: relativePath, slug }, 201);
  });

  // GET /workspace/issue/list?projectName=X[&status=Y]
  // Lists issue frontmatter rows from `.lore/work/issues/` and `.lore/issues/`
  // in the integration worktree, deduplicated by slug with the work/ copy
  // preferred (REQ-LDR-14). Returns an empty array if neither directory exists.
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
    const workDir = nodePath.join(worktreePath, ".lore", "work", "issues");
    const flatDir = nodePath.join(worktreePath, ".lore", "issues");

    const seen = new Set<string>();
    const issues: Array<{ slug: string; title: string; status: string; date: string }> = [];
    for (const dir of [workDir, flatDir]) {
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") continue;
        log.error("issue list failed:", errorMessage(err));
        return c.json({ error: errorMessage(err) }, 500);
      }

      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const slug = entry.slice(0, -3);
        if (seen.has(slug)) continue;
        seen.add(slug);
        try {
          const raw = await fs.readFile(nodePath.join(dir, entry), "utf-8");
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
    const workPath = nodePath.join(worktreePath, ".lore", "work", "issues", `${slug}.md`);
    const flatPath = nodePath.join(worktreePath, ".lore", "issues", `${slug}.md`);

    let raw: string | null = null;
    for (const candidate of [workPath, flatPath]) {
      try {
        raw = await fs.readFile(candidate, "utf-8");
        break;
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") continue;
        log.error("issue read failed:", errorMessage(err));
        return c.json({ error: errorMessage(err) }, 500);
      }
    }
    if (raw === null) {
      return c.json({ error: `Issue not found: ${slug}` }, 404);
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
      description: "Create an issue in .lore/work/issues/ and commit it to the integration worktree",
      invocation: { method: "POST", path: "/workspace/issue/create" },
      sideEffects: "Creates an issue file in .lore/work/issues/ and commits it to the integration worktree",
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
      description: "List issues for a project, optionally filtered by status. Scans both .lore/work/issues/ and .lore/issues/ (flat layout, for projects that have not migrated)",
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
      description: "Read a single issue's frontmatter and body. Resolves from .lore/work/issues/ first, then falls back to .lore/issues/ (flat layout)",
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
