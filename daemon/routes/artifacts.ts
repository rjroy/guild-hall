import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { integrationWorktreePath, projectLorePath } from "@/lib/paths";
import {
  scanArtifacts,
  recentArtifacts,
  readArtifact,
  writeRawArtifactContent,
} from "@/lib/artifacts";
import type { Artifact, AppConfig } from "@/lib/types";
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
 * - GET /artifacts?projectName=X           List artifacts for a project
 * - GET /artifacts?projectName=X&recent=true&limit=N   Recent artifacts
 * - GET /artifacts/:path?projectName=X     Read single artifact
 * - POST /artifacts?projectName=X          Write artifact content
 */
export function createArtifactRoutes(deps: ArtifactDeps): Hono {
  const routes = new Hono();

  // GET /artifacts - list or recent artifacts
  routes.get("/artifacts", async (c) => {
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

  // GET /artifacts/:path - read single artifact
  routes.get("/artifacts/:path{.+}", async (c) => {
    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const lorePath = resolveProjectLorePath(deps.config, deps.guildHallHome, projectName);
    if (!lorePath) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const artifactPath = c.req.param("path");

    try {
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

  // POST /artifacts - write artifact content
  routes.post("/artifacts", async (c) => {
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

  return routes;
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
