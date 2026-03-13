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
 * - GET /config                            Read application config
 * - GET /config/projects/:name             Read single project config
 * - GET /projects/:name/dependency-graph   Dependency graph data
 */
export function createConfigRoutes(deps: ConfigRoutesDeps): Hono {
  const routes = new Hono();

  // GET /config - Read application config
  routes.get("/config", (c) => {
    return c.json(deps.config);
  });

  // GET /config/projects/:name - Read single project config
  routes.get("/config/projects/:name", (c) => {
    const name = c.req.param("name");
    const project = deps.config.projects.find((p) => p.name === name);
    if (!project) {
      return c.json({ error: `Project not found: ${name}` }, 404);
    }
    return c.json(project);
  });

  // GET /projects/:name/dependency-graph - Dependency graph data
  routes.get("/projects/:name/dependency-graph", async (c) => {
    const name = c.req.param("name");
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
