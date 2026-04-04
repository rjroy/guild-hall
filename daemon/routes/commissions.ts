import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { asCommissionId } from "../types";
import type { CommissionSessionForRoutes } from "../services/commission/orchestrator";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import { integrationWorktreePath, projectLorePath, resolveCommissionBasePath } from "@/lib/paths";
import { scanCommissions, readCommissionMeta, parseActivityTimeline } from "@/lib/commissions";

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

    try {
      log.info(`POST /commission/request/commission/create project="${projectName}" worker="${workerName}"`);

      const result = await deps.commissionSession.createCommission(
        projectName,
        title,
        workerName,
        prompt,
        body.dependencies,
        body.resourceOverrides,
      );
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
      const allCommissions = await scanCommissions(lorePath, projectName);

      const statusFilter = c.req.query("status");
      const workerFilter = c.req.query("worker");

      let commissions = allCommissions;
      if (statusFilter) {
        commissions = commissions.filter((cm) => cm.status === statusFilter);
      }
      if (workerFilter) {
        commissions = commissions.filter((cm) => cm.worker === workerFilter);
      }

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

      return c.json({ commission: meta, timeline, rawContent });
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
    commission: "Commission requests, execution, and dependencies",
    "commission.request": "Commission request lifecycle",
    "commission.request.commission": "Commission requests",
    "commission.run": "Commission execution control",
  };

  return { routes, operations, descriptions };
}
