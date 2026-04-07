import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import {
  integrationWorktreePath,
  projectLorePath,
  resolveCommissionBasePath,
  resolveMeetingBasePath,
} from "@/lib/paths";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import {
  scanArtifacts,
  recentArtifacts,
  readArtifact,
  writeRawArtifactContent,
  validatePath,
  IMAGE_MIME_TYPES,
} from "@/lib/artifacts";
import type { Artifact, AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";

export interface ArtifactDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  /** Optional: trigger dependency check after writes. */
  checkDependencyTransitions?: (projectName: string) => Promise<void>;
}

/**
 * Resolves a project name to its integration worktree .lore/ path.
 * Returns null if the project is not found in config.
 */
function resolveProjectLorePath(
  config: AppConfig,
  guildHallHome: string,
  projectName: string,
): string | null {
  const project = config.projects.find((p) => p.name === projectName);
  if (!project) return null;
  const iPath = integrationWorktreePath(guildHallHome, projectName);
  return projectLorePath(iPath);
}

/**
 * Creates artifact routes for the daemon REST API.
 *
 * Routes:
 * - GET  /workspace/artifact/document/list?projectName=X           List artifacts
 * - GET  /workspace/artifact/document/list?projectName=X&recent=true&limit=N  Recent
 * - GET  /workspace/artifact/document/read?projectName=X&path=...  Read single artifact
 * - POST /workspace/artifact/document/write?projectName=X          Write artifact content
 */
export function createArtifactRoutes(deps: ArtifactDeps): RouteModule {
  const routes = new Hono();

  // GET /workspace/artifact/document/list - list or recent artifacts
  routes.get("/workspace/artifact/document/list", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const lorePath = resolveProjectLorePath(deps.config, deps.guildHallHome, projectName);
    if (!lorePath) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const recent = c.req.query("recent");
    const limitStr = c.req.query("limit");

    try {
      if (recent === "true") {
        const limit = limitStr ? parseInt(limitStr, 10) : 10;
        if (isNaN(limit) || limit < 1) {
          return c.json({ error: "Invalid limit parameter" }, 400);
        }
        const artifacts = await recentArtifacts(lorePath, limit);
        return c.json({ artifacts: artifacts.map(serializeArtifact) });
      }

      const artifacts = await scanArtifacts(lorePath);
      return c.json({ artifacts: artifacts.map(serializeArtifact) });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /workspace/artifact/document/read - read single artifact
  // Active meetings and commissions live in activity worktrees, not the
  // integration worktree. Resolve the correct base path based on the
  // artifact's prefix and daemon state files.
  routes.get("/workspace/artifact/document/read", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const artifactPath = c.req.query("path");
    if (!artifactPath) {
      return c.json({ error: "Missing required query parameter: path" }, 400);
    }

    try {
      let basePath: string;
      if (artifactPath.startsWith("meetings/")) {
        const filename = artifactPath.split("/").pop() ?? "";
        const meetingId = filename.replace(/\.md$/, "");
        basePath = await resolveMeetingBasePath(deps.guildHallHome, projectName, meetingId);
      } else if (artifactPath.startsWith("commissions/")) {
        const filename = artifactPath.split("/").pop() ?? "";
        const commissionId = filename.replace(/\.md$/, "");
        basePath = await resolveCommissionBasePath(deps.guildHallHome, projectName, commissionId);
      } else {
        basePath = integrationWorktreePath(deps.guildHallHome, projectName);
      }

      const lorePath = projectLorePath(basePath);
      const artifact = await readArtifact(lorePath, artifactPath);
      return c.json(serializeArtifact(artifact));
    } catch (err: unknown) {
      if (isNotFound(err)) {
        return c.json({ error: `Artifact not found: ${artifactPath}` }, 404);
      }
      if (isPathTraversal(err)) {
        return c.json({ error: "Path traversal detected" }, 400);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // POST /workspace/artifact/document/write - write artifact content
  routes.post("/workspace/artifact/document/write", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const lorePath = resolveProjectLorePath(deps.config, deps.guildHallHome, projectName);
    if (!lorePath) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    let body: { artifactPath?: string; content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { artifactPath, content } = body;
    if (!artifactPath || content === undefined) {
      return c.json(
        { error: "Missing required fields: artifactPath, content" },
        400,
      );
    }

    // Write the artifact content
    try {
      await writeRawArtifactContent(lorePath, artifactPath, content);
    } catch (err: unknown) {
      if (isPathTraversal(err)) {
        return c.json({ error: "Path traversal detected" }, 400);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }

    // Git commit (non-fatal)
    const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);
    try {
      await deps.gitOps.commitAll(integrationPath, `Edit artifact: ${artifactPath}`);
    } catch {
      // Commit failure is non-fatal
    }

    // Dependency check (non-fatal)
    if (deps.checkDependencyTransitions) {
      try {
        await deps.checkDependencyTransitions(projectName);
      } catch {
        // Dependency check failure is non-fatal
      }
    }

    return c.json({ success: true });
  });

  // GET /workspace/artifact/image/read - serve raw image bytes
  routes.get("/workspace/artifact/image/read", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const imagePath = c.req.query("path");
    if (!imagePath) {
      return c.json({ error: "Missing required query parameter: path" }, 400);
    }

    // Validate file extension
    const ext = nodePath.extname(imagePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      return c.json({ error: `Unsupported image type: ${ext}` }, 415);
    }

    try {
      // Image files can't carry activity IDs in their filenames the way
      // .md artifacts do (commission-ID.md). Use the integration worktree
      // for all image paths. If activity worktree image resolution becomes
      // needed, the path structure will need to encode the activity ID in
      // a directory segment, not the filename.
      const basePath = integrationWorktreePath(deps.guildHallHome, projectName);

      const lorePath = projectLorePath(basePath);
      const filePath = validatePath(lorePath, imagePath);
      const buffer = await fs.readFile(filePath);

      return c.body(buffer, 200, {
        "Content-Type": mimeType,
        "Cache-Control": "max-age=300, stale-while-revalidate=60",
        "Content-Length": String(buffer.length),
      });
    } catch (err: unknown) {
      if (isNotFound(err)) {
        return c.json({ error: `Image not found: ${imagePath}` }, 404);
      }
      if (isPathTraversal(err)) {
        return c.json({ error: "Path traversal detected" }, 400);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /workspace/artifact/mockup/read - serve raw HTML for a mockup artifact
  routes.get("/workspace/artifact/mockup/read", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const mockupPath = c.req.query("path");
    if (!mockupPath) {
      return c.json({ error: "Missing required query parameter: path" }, 400);
    }

    // Validate file extension (REQ-MKP-7)
    const ext = nodePath.extname(mockupPath).toLowerCase();
    if (ext !== ".html") {
      return c.json({ error: `Unsupported mockup type: ${ext}` }, 415);
    }

    try {
      // Mockups resolve from the integration worktree only (REQ-MKP-9)
      const basePath = integrationWorktreePath(deps.guildHallHome, projectName);
      const lorePath = projectLorePath(basePath);
      const filePath = validatePath(lorePath, mockupPath);
      const buffer = await fs.readFile(filePath);

      return c.body(buffer, 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cache-Control": "no-cache",
        "Content-Length": String(buffer.length),
      });
    } catch (err: unknown) {
      if (isNotFound(err)) {
        return c.json({ error: `Mockup not found: ${mockupPath}` }, 404);
      }
      if (isPathTraversal(err)) {
        return c.json({ error: "Path traversal detected" }, 400);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /workspace/artifact/image/meta - image metadata without file bytes
  routes.get("/workspace/artifact/image/meta", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const imagePath = c.req.query("path");
    if (!imagePath) {
      return c.json({ error: "Missing required query parameter: path" }, 400);
    }

    // Validate file extension
    const ext = nodePath.extname(imagePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      return c.json({ error: `Unsupported image type: ${ext}` }, 415);
    }

    try {
      // Same as image/read: images don't carry activity IDs in filenames.
      const basePath = integrationWorktreePath(deps.guildHallHome, projectName);

      const lorePath = projectLorePath(basePath);
      const filePath = validatePath(lorePath, imagePath);
      const stat = await fs.stat(filePath);

      const filename = nodePath.basename(imagePath, ext);
      const title = filename
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase());

      return c.json({
        relativePath: imagePath,
        meta: {
          title,
          date: stat.mtime.toISOString().split("T")[0],
          status: "complete",
          tags: [],
        },
        lastModified: stat.mtime.toISOString(),
        fileSize: stat.size,
        mimeType,
      });
    } catch (err: unknown) {
      if (isNotFound(err)) {
        return c.json({ error: `Image not found: ${imagePath}` }, 404);
      }
      if (isPathTraversal(err)) {
        return c.json({ error: "Path traversal detected" }, 400);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "workspace.artifact.document.list",
      version: "1",
      name: "list",
      description: "List artifacts for a project",
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }],
    },
    {
      operationId: "workspace.artifact.document.read",
      version: "1",
      name: "read",
      description: "Read a single artifact",
      invocation: { method: "GET", path: "/workspace/artifact/document/read" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }, { name: "path", required: true, in: "query" as const }],
    },
    {
      operationId: "workspace.artifact.image.read",
      version: "1",
      name: "read",
      description: "Serve raw image bytes for an artifact image",
      invocation: { method: "GET", path: "/workspace/artifact/image/read" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "image" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }, { name: "path", required: true, in: "query" as const }],
    },
    {
      operationId: "workspace.artifact.image.meta",
      version: "1",
      name: "meta",
      description: "Get image artifact metadata without file bytes",
      invocation: { method: "GET", path: "/workspace/artifact/image/meta" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "image" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }, { name: "path", required: true, in: "query" as const }],
    },
    {
      operationId: "workspace.artifact.mockup.read",
      version: "1",
      name: "read",
      description: "Serve raw HTML for a mockup artifact",
      invocation: { method: "GET", path: "/workspace/artifact/mockup/read" },
      sideEffects: "",
      context: { project: true },
      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "mockup" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "path", required: true, in: "query" as const },
      ],
    },
    {
      operationId: "workspace.artifact.document.write",
      version: "1",
      name: "write",
      description: "Write artifact content",
      invocation: { method: "POST", path: "/workspace/artifact/document/write" },
      sideEffects: "Writes artifact file, commits to git, triggers dependency check",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }],
    },
  ];

  const descriptions: Record<string, string> = {
    workspace: "Artifact management and git operations",
    "workspace.artifact": "Project artifact document management",
    "workspace.artifact.document": "Artifact documents",
    "workspace.artifact.image": "Artifact images",
    "workspace.artifact.mockup": "HTML mockup artifacts",
  };

  return { routes, operations, descriptions };
}

// -- Serialization --

/**
 * Converts an Artifact to a JSON-safe shape.
 * Date objects become ISO strings. filePath is excluded (daemon internal).
 */
function serializeArtifact(a: Artifact): Record<string, unknown> {
  return {
    relativePath: a.relativePath,
    meta: a.meta,
    content: a.content,
    lastModified: a.lastModified.toISOString(),
    artifactType: a.artifactType ?? "document",
    ...(a.rawContent !== undefined ? { rawContent: a.rawContent } : {}),
  };
}

// -- Error detection --

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isPathTraversal(err: unknown): boolean {
  return err instanceof Error && err.message === "Path traversal detected";
}
