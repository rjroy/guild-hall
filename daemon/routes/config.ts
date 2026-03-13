import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig } from "@/lib/types";
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
export function createConfigRoutes(deps: ConfigRoutesDeps): Hono {
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

  return routes;
}
