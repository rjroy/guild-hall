import { Hono } from "hono";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

export interface BriefingRouteDeps {
  briefingGenerator: ReturnType<typeof createBriefingGenerator>;
}

/**
 * Creates the briefing route group.
 *
 * GET /coordination/review/briefing/read?projectName=X returns a project status
 * briefing with caching metadata. The briefing generator handles SDK vs template
 * fallback internally.
 */
export function createBriefingRoutes(deps: BriefingRouteDeps): Hono {
  const routes = new Hono();

  routes.get("/coordination/review/briefing/read", async (c) => {
    const projectName = c.req.query("projectName");

    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    try {
      const result = await deps.briefingGenerator.generateBriefing(projectName);
      return c.json(result);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      console.error(`[briefing-route] Error generating briefing for "${projectName}": ${reason}`);
      return c.json({ error: "Failed to generate briefing" }, 500);
    }
  });

  return routes;
}
