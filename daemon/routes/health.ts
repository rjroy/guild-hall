import { Hono } from "hono";
import type { RouteModule, SkillDefinition } from "@/lib/types";

export interface HealthDeps {
  /** Returns the number of active meetings. */
  getMeetingCount: () => number;
  /** Returns the number of active commissions. */
  getCommissionCount?: () => number;
  /** Returns daemon uptime in seconds. */
  getUptimeSeconds: () => number;
}

/**
 * Creates a health check route group.
 * Dependencies are injected for testability.
 *
 * GET /system/runtime/daemon/health - Check daemon health status
 */
export function createHealthRoutes(deps: HealthDeps): RouteModule {
  const routes = new Hono();

  routes.get("/system/runtime/daemon/health", (c) => {
    return c.json({
      status: "ok",
      meetings: deps.getMeetingCount(),
      commissions: { running: deps.getCommissionCount?.() ?? 0 },
      uptime: deps.getUptimeSeconds(),
    });
  });

  const skills: SkillDefinition[] = [
    {
      skillId: "system.runtime.daemon.health",
      version: "1",
      name: "health",
      description: "Check daemon health status",
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
      sideEffects: "",
      context: {},
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      hierarchy: { root: "system", feature: "runtime", object: "daemon" },
    },
  ];

  return { routes, skills };
}
