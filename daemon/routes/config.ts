import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig, ProjectConfig, RouteModule, OperationDefinition } from "@/lib/types";
import { integrationWorktreePath, projectLorePath } from "@/lib/paths";
import { scanCommissions } from "@/lib/commissions";
import { buildDependencyGraph } from "@/lib/dependency-graph";

export interface ConfigRoutesDeps {
  config: AppConfig;
  guildHallHome: string;
}

/**
 * Creates config and project read routes for the daemon REST API.
 *
 * Routes:
 * - GET /system/config/application/read           Read application config
 * - GET /system/config/project/read?name=X        Read single project config
 * - GET /commission/dependency/project/graph?projectName=X  Dependency graph data
 */
/**
 * Reads the first section body from a project's .lore/vision.md.
 * Returns undefined if the file doesn't exist or has no content after frontmatter.
 */
async function readVisionSummary(ghHome: string, projectName: string): Promise<string | undefined> {
  const visionPath = path.join(
    integrationWorktreePath(ghHome, projectName),
    ".lore",
    "vision.md",
  );
  try {
    const raw = await fs.readFile(visionPath, "utf-8");
    const { content } = matter(raw);
    // Extract the first section: everything from the first heading to the next heading
    const lines = content.split("\n");
    let started = false;
    const sectionLines: string[] = [];
    for (const line of lines) {
      if (!started) {
        if (/^#\s/.test(line)) started = true;
        continue;
      }
      if (/^#\s/.test(line)) break;
      sectionLines.push(line);
    }
    const text = sectionLines.join("\n").trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns a copy of the project config with description enriched from vision.md.
 */
async function enrichProject(deps: ConfigRoutesDeps, project: ProjectConfig): Promise<ProjectConfig> {
  const vision = await readVisionSummary(deps.guildHallHome, project.name);
  if (!vision) return project;
  return { ...project, description: vision };
}

export function createConfigRoutes(deps: ConfigRoutesDeps): RouteModule {
  const routes = new Hono();

  // GET /system/config/application/read - Read application config
  routes.get("/system/config/application/read", (c) => {
    return c.json(deps.config);
  });

  // GET /system/config/project/read?name=X - Read single project config
  // Enriches description from .lore/vision.md when available.
  routes.get("/system/config/project/read", async (c) => {
    const name = c.req.query("name");
    if (!name) {
      return c.json({ error: "Missing required query parameter: name" }, 400);
    }
    const project = deps.config.projects.find((p) => p.name === name);
    if (!project) {
      return c.json({ error: `Project not found: ${name}` }, 404);
    }
    const enriched = await enrichProject(deps, project);
    return c.json(enriched);
  });

  // GET /commission/dependency/project/graph?projectName=X - Dependency graph data
  routes.get("/commission/dependency/project/graph", async (c) => {
    const name = c.req.query("projectName");
    if (!name) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }
    const project = deps.config.projects.find((p) => p.name === name);
    if (!project) {
      return c.json({ error: `Project not found: ${name}` }, 404);
    }

    try {
      const iPath = integrationWorktreePath(deps.guildHallHome, name);
      const lorePath = projectLorePath(iPath);
      const commissions = await scanCommissions(lorePath, name);
      const graph = buildDependencyGraph(commissions);
      return c.json(graph);
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "system.config.application.read",
      version: "1",
      name: "read",
      description: "Read application configuration",
      invocation: { method: "GET", path: "/system/config/application/read" },
      sideEffects: "",
      context: {},

      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "application" },
    },
    {
      operationId: "system.config.project.read",
      version: "1",
      name: "read",
      description: "Read single project configuration",
      invocation: { method: "GET", path: "/system/config/project/read" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "project" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }],
    },
    {
      operationId: "commission.dependency.project.graph",
      version: "1",
      name: "graph",
      description: "Get commission dependency graph",
      invocation: { method: "GET", path: "/commission/dependency/project/graph" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "dependency", object: "project" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }],
    },
  ];

  const descriptions: Record<string, string> = {
    "system.config": "Application and project configuration",
    "system.config.application": "Application-level configuration",
    "system.config.project": "Project-specific configuration",
    "commission.dependency": "Commission dependency management",
    "commission.dependency.project": "Project-level dependency operations",
  };

  return { routes, operations, descriptions };
}
