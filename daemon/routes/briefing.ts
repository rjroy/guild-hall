import { Hono } from "hono";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { RouteModule, SkillDefinition } from "@/lib/types";

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

    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    try {
      const result = await deps.briefingGenerator.generateBriefing(projectName);
      return c.json(result);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      log.error(`Error generating briefing for "${projectName}": ${reason}`);
      return c.json({ error: "Failed to generate briefing" }, 500);
    }
  });

  const skills: SkillDefinition[] = [
    {
      skillId: "coordination.review.briefing.read",
      version: "1",
      name: "read",
      description: "Generate project status briefing",
      invocation: { method: "GET", path: "/coordination/review/briefing/read" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "coordination", feature: "review", object: "briefing" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }],
    },
  ];

  return { routes, skills };
}
