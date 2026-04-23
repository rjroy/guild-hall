import { Hono } from "hono";
import type { createBriefingGenerator } from "@/apps/daemon/services/briefing-generator";
import { errorMessage } from "@/apps/daemon/lib/toolbox-utils";
import { nullLog } from "@/apps/daemon/lib/log";
import type { Log } from "@/apps/daemon/lib/log";
import type { RouteModule, OperationDefinition } from "@/lib/types";

export interface BriefingRouteDeps {
  briefingGenerator: ReturnType<typeof createBriefingGenerator>;
  /** Injectable logger. Defaults to nullLog("briefing"). */
  log?: Log;
}

/**
 * Creates the briefing route group.
 *
 * GET /coordination/review/briefing/read?projectName=X returns a project status
 * briefing with caching metadata. The briefing generator handles SDK vs template
 * fallback internally.
 */
export function createBriefingRoutes(deps: BriefingRouteDeps): RouteModule {
  const log = deps.log ?? nullLog("briefing");
  const routes = new Hono();

  routes.get("/coordination/review/briefing/read", async (c) => {
    const projectName = c.req.query("projectName");

    try {
      if (!projectName || projectName === "all") {
        const result = await deps.briefingGenerator.generateAllProjectsBriefing();
        return c.json(result);
      }

      const result = await deps.briefingGenerator.getCachedBriefing(projectName);
      if (!result) {
        return c.json({ briefing: null, generatedAt: null, cached: false, pending: true });
      }
      return c.json(result);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      log.error(`Error generating briefing for "${projectName ?? "all"}": ${reason}`);
      return c.json({ error: "Failed to generate briefing" }, 500);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "coordination.review.briefing.read",
      version: "1",
      name: "read",
      description: "Generate project status briefing (single project or all-projects synthesis)",
      invocation: { method: "GET", path: "/coordination/review/briefing/read" },
      sideEffects: "",
      context: {},

      idempotent: true,
      hierarchy: { root: "coordination", feature: "review", object: "briefing" },
      parameters: [{ name: "projectName", required: false, in: "query" as const }],
    },
  ];

  return { routes, operations };
}
