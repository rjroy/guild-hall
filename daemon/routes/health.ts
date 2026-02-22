import { Hono } from "hono";

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
 */
export function createHealthRoutes(deps: HealthDeps): Hono {
  const routes = new Hono();

  routes.get("/health", (c) => {
    return c.json({
      status: "ok",
      meetings: deps.getMeetingCount(),
      commissions: { running: deps.getCommissionCount?.() ?? 0 },
      uptime: deps.getUptimeSeconds(),
    });
  });

  return routes;
}
