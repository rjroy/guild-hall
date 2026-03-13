import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { asCommissionId } from "../types";
import type { CommissionSessionForRoutes } from "../services/commission/orchestrator";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig } from "@/lib/types";
import { integrationWorktreePath, projectLorePath, resolveCommissionBasePath } from "@/lib/paths";
import { scanCommissions, readCommissionMeta, parseActivityTimeline } from "@/lib/commissions";

export interface CommissionRoutesDeps {
  commissionSession: CommissionSessionForRoutes;
  /** Required for GET read routes. */
  config?: AppConfig;
  /** Required for GET read routes. */
  guildHallHome?: string;
}

/**
 * Creates commission management routes.
 *
 * POST   /commissions                       - Create commission
 * POST   /commissions/check-dependencies   - Trigger dependency auto-transitions
 * PUT    /commissions/:id                  - Update pending commission
 * POST   /commissions/:id/dispatch         - Dispatch commission to worker
 * DELETE /commissions/:id             - Cancel commission
 * POST   /commissions/:id/redispatch  - Re-dispatch failed/cancelled commission
 * POST   /commissions/:id/abandon     - Abandon a commission
 * POST   /commissions/:id/note        - User adds note
 */
export function createCommissionRoutes(deps: CommissionRoutesDeps): Hono {
  const routes = new Hono();

  // POST /commissions - Create commission
  routes.post("/commissions", async (c) => {
    let body: {
      projectName?: string;
      title?: string;
      workerName?: string;
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
      type?: string;
      cron?: string;
      repeat?: number;
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
      console.log(`[route] POST /commissions project="${projectName}" worker="${workerName}" type="${body.type ?? "one-shot"}"`);

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

  // POST /commissions/check-dependencies - Trigger dependency auto-transitions
  // Must be registered before :id routes to avoid matching "check-dependencies" as an ID.
  routes.post("/commissions/check-dependencies", async (c) => {
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

  // PUT /commissions/:id - Update pending commission
  routes.put("/commissions/:id", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    try {
      await deps.commissionSession.updateCommission(commissionId, body);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = errorMessage(err);
      if (message.includes("must be \"pending\"")) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commissions/:id/dispatch - Dispatch commission
  routes.post("/commissions/:id/dispatch", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/dispatch`);
      const result =
        await deps.commissionSession.dispatchCommission(commissionId);
      return c.json(result, 202);
    } catch (err: unknown) {
      const message = errorMessage(err);
      console.error(`[route] dispatch failed: ${message}`);
      if (message.includes("must be \"pending\"")) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // DELETE /commissions/:id - Cancel commission
  routes.delete("/commissions/:id", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    try {
      console.log(`[route] DELETE /commissions/${commissionId as string} (cancel)`);
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

  // POST /commissions/:id/redispatch - Re-dispatch failed/cancelled commission
  routes.post("/commissions/:id/redispatch", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/redispatch`);
      const result =
        await deps.commissionSession.redispatchCommission(commissionId);
      return c.json(result, 202);
    } catch (err: unknown) {
      const message = errorMessage(err);
      console.error(`[route] redispatch failed: ${message}`);
      if (
        message.includes("must be \"failed\" or \"cancelled\"") ||
        message.includes("Cannot redispatch")
      ) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /commissions/:id/abandon - Abandon a commission
  routes.post("/commissions/:id/abandon", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { reason?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { reason } = body;
    if (!reason) {
      return c.json({ error: "Missing required field: reason" }, 400);
    }

    try {
      console.log(
        `[route] POST /commissions/${commissionId as string}/abandon`,
      );
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

  // POST /commissions/:id/schedule-status - Update schedule status (pause/resume/complete)
  routes.post("/commissions/:id/schedule-status", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { status?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { status } = body;
    if (!status) {
      return c.json({ error: "Missing required field: status" }, 400);
    }

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/schedule-status target="${status}"`);
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

  // POST /commissions/:id/note - User adds note
  routes.post("/commissions/:id/note", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

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

  // -- Read routes (Phase 1 DAB migration) --

  // GET /commissions?projectName=X - List commissions for a project
  routes.get("/commissions", async (c) => {
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

  // GET /commissions/:id?projectName=X - Read commission detail
  routes.get("/commissions/:id", async (c) => {
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

    const commissionId = c.req.param("id");

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

  return routes;
}
