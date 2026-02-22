import { Hono } from "hono";
import { asCommissionId } from "../types";
import type { CommissionSessionForRoutes } from "../services/commission-session";

export interface CommissionRoutesDeps {
  commissionSession: CommissionSessionForRoutes;
}

/**
 * Creates commission management routes.
 *
 * POST   /commissions                 - Create commission
 * PUT    /commissions/:id             - Update pending commission
 * POST   /commissions/:id/dispatch    - Dispatch commission to worker
 * DELETE /commissions/:id             - Cancel commission
 * POST   /commissions/:id/redispatch  - Re-dispatch failed/cancelled commission
 * POST   /commissions/:id/progress    - Worker reports progress (IPC)
 * POST   /commissions/:id/result      - Worker reports result (IPC)
 * POST   /commissions/:id/question    - Worker logs question (IPC)
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
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
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
      console.log(`[route] POST /commissions project="${projectName}" worker="${workerName}"`);
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
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // PUT /commissions/:id - Update pending commission
  routes.put("/commissions/:id", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: {
      prompt?: string;
      dependencies?: string[];
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number };
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
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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

  // POST /commissions/:id/progress - Worker reports progress (IPC)
  routes.post("/commissions/:id/progress", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { summary?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { summary } = body;
    if (!summary) {
      return c.json({ error: "Missing required field: summary" }, 400);
    }

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/progress`);
      deps.commissionSession.reportProgress(commissionId, summary);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /commissions/:id/result - Worker reports result (IPC)
  routes.post("/commissions/:id/result", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { summary?: string; artifacts?: string[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { summary } = body;
    if (!summary) {
      return c.json({ error: "Missing required field: summary" }, 400);
    }

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/result`);
      deps.commissionSession.reportResult(
        commissionId,
        summary,
        body.artifacts,
      );
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /commissions/:id/question - Worker logs question (IPC)
  routes.post("/commissions/:id/question", async (c) => {
    const commissionId = asCommissionId(c.req.param("id"));

    let body: { question?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { question } = body;
    if (!question) {
      return c.json({ error: "Missing required field: question" }, 400);
    }

    try {
      console.log(`[route] POST /commissions/${commissionId as string}/question`);
      deps.commissionSession.reportQuestion(commissionId, question);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return routes;
}
