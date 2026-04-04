/**
 * Heartbeat routes: manual tick and status for per-project heartbeat evaluation.
 *
 * POST /heartbeat/:projectName/tick  - Trigger immediate heartbeat evaluation
 * GET  /heartbeat/:projectName/status - Get heartbeat state for a project
 */

import { Hono } from "hono";
import type { RouteModule, OperationDefinition, AppConfig } from "@/lib/types";
import type { HeartbeatService } from "@/daemon/services/heartbeat/index";
import {
  readHeartbeatFile,
  hasContentBelowHeader,
  countStandingOrders,
} from "@/daemon/services/heartbeat/heartbeat-file";
import { integrationWorktreePath } from "@/lib/paths";

export interface HeartbeatRouteDeps {
  heartbeatService: HeartbeatService;
  config: AppConfig;
  guildHallHome: string;
}

export function createHeartbeatRoutes(deps: HeartbeatRouteDeps): RouteModule {
  const routes = new Hono();

  // POST /heartbeat/:projectName/tick - Trigger immediate heartbeat evaluation (REQ-HBT-30)
  routes.post("/heartbeat/:projectName/tick", async (c) => {
    const projectName = c.req.param("projectName");

    const result = await deps.heartbeatService.tickProject(projectName);
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ triggered: true });
  });

  // GET /heartbeat/:projectName/status - Get heartbeat state (REQ-HBT-31)
  routes.get("/heartbeat/:projectName/status", async (c) => {
    const projectName = c.req.param("projectName");

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project "${projectName}" not found` }, 404);
    }

    const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);
    const content = await readHeartbeatFile(integrationPath);

    const hasContent = content !== null && hasContentBelowHeader(content);
    const standingOrderCount = content !== null ? countStandingOrders(content) : 0;

    const lastTick = deps.heartbeatService.getLastTick(projectName);
    const intervalMinutes = deps.config.heartbeatIntervalMinutes ?? 60;

    return c.json({
      hasContent,
      standingOrderCount,
      lastTick: lastTick?.timestamp ?? null,
      commissionsCreatedLastTick: lastTick?.commissionsCreated ?? 0,
      intervalMinutes,
    });
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "heartbeat.project.tick",
      version: "1",
      name: "tick",
      description: "Trigger immediate heartbeat evaluation for a project",
      invocation: { method: "POST", path: "/heartbeat/:projectName/tick" },
      sideEffects: "Creates commissions based on standing orders",
      context: { projectName: "string" },
      idempotent: false,
      hierarchy: { root: "heartbeat", feature: "project", object: "tick" },
    },
    {
      operationId: "heartbeat.project.status",
      version: "1",
      name: "status",
      description: "Get heartbeat state for a project",
      invocation: { method: "GET", path: "/heartbeat/:projectName/status" },
      sideEffects: "",
      context: { projectName: "string" },
      idempotent: true,
      hierarchy: { root: "heartbeat", feature: "project", object: "status" },
    },
  ];

  return { routes, operations };
}
