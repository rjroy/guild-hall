import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { asCommissionId } from "../types";
import type { CommissionSessionForRoutes } from "../services/commission/orchestrator";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import { SYSTEM_EVENT_TYPES } from "@/lib/types";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import { integrationWorktreePath, projectLorePath, resolveCommissionBasePath } from "@/lib/paths";
import { scanCommissions, readCommissionMeta, parseActivityTimeline } from "@/lib/commissions";
import { nextOccurrence } from "@/daemon/services/scheduler/cron";
import { describeCron } from "@/lib/cron-utils";
import matter from "gray-matter";

export interface CommissionRoutesDeps {
  commissionSession: CommissionSessionForRoutes;
  /** Required for GET read routes. */
  config?: AppConfig;
  /** Required for GET read routes. */
  guildHallHome?: string;
  /** Injectable logger. Defaults to nullLog("commissions"). */
  log?: Log;
}

/**
 * Creates commission management routes.
 *
 * POST /commission/request/commission/create    - Create commission
 * POST /commission/dependency/project/check     - Trigger dependency auto-transitions
 * POST /commission/request/commission/update    - Update pending commission
 * POST /commission/run/dispatch                 - Dispatch commission to worker
 * POST /commission/run/cancel                   - Cancel commission
 * POST /commission/run/redispatch               - Re-dispatch failed/cancelled commission
 * POST /commission/run/abandon                  - Abandon a commission
 * POST /commission/request/commission/note      - User adds note
 * POST /commission/schedule/commission/update   - Update schedule status
 * GET  /commission/request/commission/list      - List commissions for a project
 * GET  /commission/request/commission/read      - Read commission detail
 */
export function createCommissionRoutes(deps: CommissionRoutesDeps): RouteModule {
  const log = deps.log ?? nullLog("commissions");
  const routes = new Hono();

  // POST /commission/request/commission/create - Create commission
  routes.post("/commission/request/commission/create", async (c) => {
    let body: {
      projectName?: string;
      title?: string;
      workerName?: string;
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { model?: string };
      type?: string;
      cron?: string;
      repeat?: number;
      match?: { type: string; projectName?: string; fields?: Record<string, string> };
      approval?: "auto" | "confirm";
      maxDepth?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { projectName, title, workerName, prompt } = body;

    if (!projectName || !title || !workerName || !prompt) {
      return c.json(
        {
          error:
            "Missing required fields: projectName, title, workerName, prompt",
        },
        400,
      );
    }

    if (body.type === "scheduled" && !body.cron) {
      return c.json(
        { error: "Missing required field for scheduled commission: cron" },
        400,
      );
    }

    try {
      log.info(`POST /commission/request/commission/create project="${projectName}" worker="${workerName}" type="${body.type ?? "one-shot"}"`);

      let result: { commissionId: string };
      if (body.type === "scheduled") {
        result = await deps.commissionSession.createScheduledCommission({
          projectName,
          title,
          workerName,
          prompt,
          cron: body.cron!,
          repeat: body.repeat,
          dependencies: body.dependencies,
          resourceOverrides: body.resourceOverrides,
        });
      } else if (body.type === "triggered") {
        if (!body.match) {
          return c.json({ error: "Missing required field for triggered commission: match" }, 400);
        }
        if (!body.match.type || !SYSTEM_EVENT_TYPES.includes(body.match.type as never)) {
          return c.json({ error: `Invalid match.type: "${body.match.type}". Valid types: ${SYSTEM_EVENT_TYPES.join(", ")}` }, 400);
        }
        result = await deps.commissionSession.createTriggeredCommission({
          projectName,
          title,
          workerName,
          prompt,
          match: body.match,
          approval: body.approval,
          maxDepth: body.maxDepth,
          dependencies: body.dependencies,
          resourceOverrides: body.resourceOverrides,
        });
      } else {
        result = await deps.commissionSession.createCommission(
          projectName,
          title,
          workerName,
          prompt,
          body.dependencies,
          body.resourceOverrides,
        );
      }
      return c.json(result, 201);
    } catch (err: unknown) {
      const message = errorMessage(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/dependency/project/check - Trigger dependency auto-transitions
  routes.post("/commission/dependency/project/check", async (c) => {
    let body: { projectName?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { projectName } = body;
    if (!projectName) {
      return c.json({ error: "Missing required field: projectName" }, 400);
    }

    try {
      await deps.commissionSession.checkDependencyTransitions(projectName);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/request/commission/update - Update pending commission
  routes.post("/commission/request/commission/update", async (c) => {
    let body: {
      commissionId?: string;
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { model?: string };
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    // Strip commissionId from updates - it's an identifier, not a field to update
    const { commissionId: _, ...updates } = body;

    try {
      await deps.commissionSession.updateCommission(commissionId, updates);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("must be \"pending\"")) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/run/dispatch - Dispatch commission
  routes.post("/commission/run/dispatch", async (c) => {
    let body: { commissionId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    try {
      log.info(`POST /commission/run/dispatch commissionId="${commissionId as string}"`);
      const result =
        await deps.commissionSession.dispatchCommission(commissionId);
      return c.json(result, 202);
    } catch (err: unknown) {
      const message = errorMessage(err);
      log.error(`dispatch failed: ${message}`);
      if (message.includes("must be \"pending\"")) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/run/cancel - Cancel commission
  routes.post("/commission/run/cancel", async (c) => {
    let body: { commissionId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    try {
      log.info(`POST /commission/run/cancel commissionId="${commissionId as string}"`);
      await deps.commissionSession.cancelCommission(commissionId);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      if (
        message.includes("Invalid commission transition") ||
        message.includes("Cannot cancel")
      ) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/run/redispatch - Re-dispatch failed/cancelled commission
  routes.post("/commission/run/redispatch", async (c) => {
    let body: { commissionId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    try {
      log.info(`POST /commission/run/redispatch commissionId="${commissionId as string}"`);
      const result =
        await deps.commissionSession.redispatchCommission(commissionId);
      return c.json(result, 202);
    } catch (err: unknown) {
      const message = errorMessage(err);
      log.error(`redispatch failed: ${message}`);
      if (
        message.includes("must be \"failed\" or \"cancelled\"") ||
        message.includes("Cannot redispatch")
      ) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/run/abandon - Abandon a commission
  routes.post("/commission/run/abandon", async (c) => {
    let body: { commissionId?: string; reason?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    const { reason } = body;
    if (!reason) {
      return c.json({ error: "Missing required field: reason" }, 400);
    }

    try {
      log.info(`POST /commission/run/abandon commissionId="${commissionId as string}"`);
      await deps.commissionSession.abandonCommission(commissionId, reason);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      if (
        message.includes("Invalid commission transition") ||
        message.includes("Cannot abandon")
      ) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/schedule/commission/update - Update schedule status (pause/resume/complete)
  routes.post("/commission/schedule/commission/update", async (c) => {
    let body: { commissionId?: string; status?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    const { status } = body;
    if (!status) {
      return c.json({ error: "Missing required field: status" }, 400);
    }

    try {
      log.info(`POST /commission/schedule/commission/update commissionId="${commissionId as string}" target="${status}"`);
      const result = await deps.commissionSession.updateScheduleStatus(commissionId, status);
      if (result.outcome === "skipped") {
        return c.json({ error: result.reason }, 409);
      }
      return c.json({ status: result.status });
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("Cannot transition") || message.includes("not a scheduled")) {
        return c.json({ error: message }, 409);
      }
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/trigger/commission/update - Update trigger status (pause/resume/complete)
  routes.post("/commission/trigger/commission/update", async (c) => {
    let body: { commissionId?: string; status?: string; projectName?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    const { status, projectName } = body;
    if (!status) {
      return c.json({ error: "Missing required field: status" }, 400);
    }

    try {
      log.info(`POST /commission/trigger/commission/update commissionId="${commissionId as string}" target="${status}"`);
      const result = await deps.commissionSession.updateTriggerStatus(commissionId, status, projectName ?? "");
      return c.json(result);
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("Cannot transition") || message.includes("not a triggered")) {
        return c.json({ error: message }, 409);
      }
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commission/request/commission/note - User adds note
  routes.post("/commission/request/commission/note", async (c) => {
    let body: { commissionId?: string; content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.commissionId) {
      return c.json({ error: "Missing required field: commissionId" }, 400);
    }
    const commissionId = asCommissionId(body.commissionId);

    const { content } = body;
    if (!content) {
      return c.json({ error: "Missing required field: content" }, 400);
    }

    try {
      await deps.commissionSession.addUserNote(commissionId, content);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      return c.json({ error: message }, 500);
    }
  });

  // -- Read routes --

  // GET /commission/request/commission/list?projectName=X - List commissions for a project
  routes.get("/commission/request/commission/list", async (c) => {
    if (!deps.config || !deps.guildHallHome) {
      return c.json({ error: "Read routes not configured" }, 500);
    }

    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    try {
      const iPath = integrationWorktreePath(deps.guildHallHome, projectName);
      const lorePath = projectLorePath(iPath);
      const commissions = await scanCommissions(lorePath, projectName);
      return c.json({ commissions });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /commission/request/commission/read?commissionId=X&projectName=X - Read commission detail
  routes.get("/commission/request/commission/read", async (c) => {
    if (!deps.config || !deps.guildHallHome) {
      return c.json({ error: "Read routes not configured" }, 500);
    }

    const projectName = c.req.query("projectName");
    if (!projectName) {
      return c.json({ error: "Missing required query parameter: projectName" }, 400);
    }

    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: `Project not found: ${projectName}` }, 404);
    }

    const commissionId = c.req.query("commissionId");
    if (!commissionId) {
      return c.json({ error: "Missing required query parameter: commissionId" }, 400);
    }

    try {
      const basePath = await resolveCommissionBasePath(deps.guildHallHome, projectName, commissionId);
      const lorePath = projectLorePath(basePath);
      const filePath = path.join(lorePath, "commissions", `${commissionId}.md`);

      const rawContent = await fs.readFile(filePath, "utf-8");
      const meta = await readCommissionMeta(filePath, projectName);
      const timeline = parseActivityTimeline(rawContent);

      // Parse schedule info for scheduled commissions
      let scheduleInfo: Record<string, unknown> | undefined;
      if (meta.type === "scheduled") {
        const parsed = matter(rawContent);
        const sched = parsed.data.schedule as Record<string, unknown> | undefined;
        if (sched && typeof sched === "object") {
          const lastRun = sched.last_run;
          let lastRunStr: string | null = null;
          if (lastRun instanceof Date) {
            lastRunStr = lastRun.toISOString();
          } else if (typeof lastRun === "string" && lastRun) {
            lastRunStr = lastRun;
          }

          const cronExpr = typeof sched.cron === "string" ? sched.cron : "";

          let nextRunStr: string | null = null;
          if (cronExpr) {
            const referenceDate = lastRunStr ? new Date(lastRunStr) : new Date(0);
            const nextDate = nextOccurrence(cronExpr, referenceDate);
            if (nextDate) {
              nextRunStr = nextDate.toISOString();
            }
          }

          scheduleInfo = {
            cron: cronExpr,
            cronDescription: describeCron(cronExpr),
            repeat: typeof sched.repeat === "number" ? sched.repeat : null,
            runsCompleted: typeof sched.runs_completed === "number" ? sched.runs_completed : 0,
            lastRun: lastRunStr,
            lastSpawnedId: typeof sched.last_spawned_id === "string" ? sched.last_spawned_id : null,
            nextRun: nextRunStr,
          };
        }
      }

      // Parse trigger info for triggered commissions
      let triggerInfo: Record<string, unknown> | undefined;
      if (meta.type === "triggered") {
        const parsed = matter(rawContent);
        const trigger = parsed.data.trigger as Record<string, unknown> | undefined;
        if (trigger && typeof trigger === "object") {
          const match = trigger.match as Record<string, unknown> | undefined;
          const lastTriggered = trigger.last_triggered;
          let lastTriggeredStr: string | null = null;
          if (lastTriggered instanceof Date) {
            lastTriggeredStr = lastTriggered.toISOString();
          } else if (typeof lastTriggered === "string" && lastTriggered) {
            lastTriggeredStr = lastTriggered;
          }

          triggerInfo = {
            match: match ?? { type: "" },
            approval: typeof trigger.approval === "string" ? trigger.approval : "confirm",
            maxDepth: typeof trigger.maxDepth === "number" ? trigger.maxDepth : 3,
            runsCompleted: typeof trigger.runs_completed === "number" ? trigger.runs_completed : 0,
            lastTriggered: lastTriggeredStr,
            lastSpawnedId: typeof trigger.last_spawned_id === "string" ? trigger.last_spawned_id : null,
          };
        }
      }

      return c.json({ commission: meta, timeline, rawContent, scheduleInfo, triggerInfo });
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: `Commission not found: ${commissionId}` }, 404);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "commission.request.commission.create",
      version: "1",
      name: "create",
      description: "Create a new commission",
      invocation: { method: "POST", path: "/commission/request/commission/create" },
      sideEffects: "Creates commission artifact and emits commission_status event",
      context: { project: true },

      idempotent: false,
      hierarchy: { root: "commission", feature: "request", object: "commission" },
      parameters: [
        { name: "projectName", required: true, in: "body" as const },
        { name: "workerName", required: true, in: "body" as const },
        { name: "title", required: true, in: "body" as const },
        { name: "prompt", required: true, in: "body" as const },
      ],
    },
    {
      operationId: "commission.request.commission.update",
      version: "1",
      name: "update",
      description: "Update a pending commission",
      invocation: { method: "POST", path: "/commission/request/commission/update" },
      sideEffects: "Modifies commission artifact",
      context: { commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "request", object: "commission" },
      parameters: [{ name: "commissionId", required: true, in: "body" as const }],
    },
    {
      operationId: "commission.request.commission.note",
      version: "1",
      name: "note",
      description: "Add a user note to a commission",
      invocation: { method: "POST", path: "/commission/request/commission/note" },
      sideEffects: "Appends note to commission timeline",
      context: { commissionId: true },

      idempotent: false,
      hierarchy: { root: "commission", feature: "request", object: "commission" },
      parameters: [
        { name: "commissionId", required: true, in: "body" as const },
        { name: "content", required: true, in: "body" as const },
      ],
    },
    {
      operationId: "commission.request.commission.list",
      version: "1",
      name: "list",
      description: "List commissions for a project",
      invocation: { method: "GET", path: "/commission/request/commission/list" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "request", object: "commission" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "status", required: false, in: "query" as const },
        { name: "worker", required: false, in: "query" as const },
      ],
    },
    {
      operationId: "commission.request.commission.read",
      version: "1",
      name: "read",
      description: "Read commission detail",
      invocation: { method: "GET", path: "/commission/request/commission/read" },
      sideEffects: "",
      context: { project: true, commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "request", object: "commission" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }, { name: "commissionId", required: true, in: "query" as const }],
    },
    {
      operationId: "commission.run.dispatch",
      version: "1",
      name: "dispatch",
      description: "Dispatch a commission to a worker",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      sideEffects: "Transitions commission to dispatched, spawns worker session",
      context: { commissionId: true },

      idempotent: false,
      hierarchy: { root: "commission", feature: "run" },
      parameters: [{ name: "commissionId", required: true, in: "body" as const }],
    },
    {
      operationId: "commission.run.redispatch",
      version: "1",
      name: "redispatch",
      description: "Re-dispatch a failed or cancelled commission",
      invocation: { method: "POST", path: "/commission/run/redispatch" },
      sideEffects: "Transitions commission to dispatched, spawns worker session",
      context: { commissionId: true },

      idempotent: false,
      hierarchy: { root: "commission", feature: "run" },
      parameters: [{ name: "commissionId", required: true, in: "body" as const }],
    },
    {
      operationId: "commission.run.cancel",
      version: "1",
      name: "cancel",
      description: "Cancel a pending commission",
      invocation: { method: "POST", path: "/commission/run/cancel" },
      sideEffects: "Transitions commission to cancelled",
      context: { commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "run" },
      parameters: [{ name: "commissionId", required: true, in: "body" as const }],
    },
    {
      operationId: "commission.run.abandon",
      version: "1",
      name: "abandon",
      description: "Abandon a running commission",
      invocation: { method: "POST", path: "/commission/run/abandon" },
      sideEffects: "Aborts worker session, transitions commission to abandoned",
      context: { commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "run" },
      parameters: [
        { name: "commissionId", required: true, in: "body" as const },
        { name: "reason", required: true, in: "body" as const },
      ],
    },
    {
      operationId: "commission.schedule.commission.update",
      version: "1",
      name: "update",
      description: "Update schedule status (pause/resume/complete)",
      invocation: { method: "POST", path: "/commission/schedule/commission/update" },
      sideEffects: "Transitions schedule status, emits commission_status event",
      context: { commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "schedule", object: "commission" },
      parameters: [
        { name: "commissionId", required: true, in: "body" as const },
        { name: "status", required: true, in: "body" as const },
      ],
    },
    {
      operationId: "commission.trigger.commission.update",
      version: "1",
      name: "update",
      description: "Update trigger status (pause/resume/complete)",
      invocation: { method: "POST", path: "/commission/trigger/commission/update" },
      sideEffects: "Transitions trigger status, manages event subscriptions",
      context: { commissionId: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "trigger", object: "commission" },
      parameters: [
        { name: "commissionId", required: true, in: "body" as const },
        { name: "status", required: true, in: "body" as const },
        { name: "projectName", required: false, in: "body" as const },
      ],
    },
    {
      operationId: "commission.dependency.project.check",
      version: "1",
      name: "check",
      description: "Trigger dependency auto-transitions",
      invocation: { method: "POST", path: "/commission/dependency/project/check" },
      sideEffects: "Transitions blocked commissions whose dependencies are met",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "commission", feature: "dependency", object: "project" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }],
    },
  ];

  const descriptions: Record<string, string> = {
    commission: "Commission requests, execution, scheduling, and dependencies",
    "commission.request": "Commission request lifecycle",
    "commission.request.commission": "Commission requests",
    "commission.run": "Commission execution control",
    "commission.schedule": "Scheduled commission management",
    "commission.schedule.commission": "Scheduled commission lifecycle",
    "commission.trigger": "Triggered commission management",
    "commission.trigger.commission": "Triggered commission lifecycle",
  };

  return { routes, operations, descriptions };
}
