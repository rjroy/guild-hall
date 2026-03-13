import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig, RouteModule, SkillDefinition } from "@/lib/types";
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
export function createConfigRoutes(deps: ConfigRoutesDeps): RouteModule {
  const routes = new Hono();

  // GET /system/config/application/read - Read application config
  routes.get("/system/config/application/read", (c) => {
    return c.json(deps.config);
  });

  // GET /system/config/project/read?name=X - Read single project config
  routes.get("/system/config/project/read", (c) => {
    const name = c.req.query("name");
    if (!name) {
      return c.json({ error: "Missing required query parameter: name" }, 400);
    }
    const project = deps.config.projects.find((p) => p.name === name);
    if (!project) {
      return c.json({ error: `Project not found: ${name}` }, 404);
    }
    return c.json(project);
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

  const skills: SkillDefinition[] = [
    {
      skillId: "system.config.application.read",
      version: "1",
      name: "read",
      description: "Read application configuration",
      invocation: { method: "GET", path: "/system/config/application/read" },
      sideEffects: "",
      context: {},
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "application" },
    },
    {
      skillId: "system.config.project.read",
      version: "1",
      name: "read",
      description: "Read single project configuration",
      invocation: { method: "GET", path: "/system/config/project/read" },
      sideEffects: "",
      context: { project: true },
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      hierarchy: { root: "system", feature: "config", object: "project" },
    },
    {
      skillId: "commission.dependency.project.graph",
      version: "1",
      name: "graph",
      description: "Get commission dependency graph",
      invocation: { method: "GET", path: "/commission/dependency/project/graph" },
      sideEffects: "",
      context: { project: true },
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      hierarchy: { root: "commission", feature: "dependency", object: "project" },
    },
  ];

  const descriptions: Record<string, string> = {
    "system.config": "Application and project configuration",
    "system.config.application": "Application-level configuration",
    "system.config.project": "Project-specific configuration",
    "commission.dependency": "Commission dependency management",
    "commission.dependency.project": "Project-level dependency operations",
  };

  return { routes, skills, descriptions };
}
