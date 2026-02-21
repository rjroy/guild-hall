import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { GuildHallEvent, MeetingId } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";

/**
 * The meeting session interface as seen by the routes layer.
 * Matches the public API returned by createMeetingSession().
 */
export interface MeetingSessionForRoutes {
  createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent>;
  sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent>;
  closeMeeting(meetingId: MeetingId): Promise<void>;
  interruptTurn(meetingId: MeetingId): void;
  getActiveMeetings(): number;
}

export interface MeetingRoutesDeps {
  meetingSession: MeetingSessionForRoutes;
}

/**
 * Creates meeting management routes.
 *
 * POST /meetings           - Create meeting, stream first turn via SSE
 * POST /meetings/:id/messages - Send follow-up, stream response via SSE
 * DELETE /meetings/:id     - Close meeting
 * POST /meetings/:id/interrupt - Stop current generation
 */
export function createMeetingRoutes(deps: MeetingRoutesDeps): Hono {
  const routes = new Hono();

  // POST /meetings - Create meeting and stream first turn
  routes.post("/meetings", async (c) => {
    let body: { projectName?: string; workerName?: string; prompt?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { projectName, workerName, prompt } = body;

    if (!projectName || !workerName || !prompt) {
      return c.json(
        { error: "Missing required fields: projectName, workerName, prompt" },
        400,
      );
    }

    return streamSSE(c, async (stream) => {
      const events = deps.meetingSession.createMeeting(
        projectName,
        workerName,
        prompt,
      );
      for await (const event of events) {
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    });
  });

  // POST /meetings/:meetingId/messages - Send follow-up message
  routes.post("/meetings/:meetingId/messages", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));

    let body: { message?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { message } = body;

    if (!message) {
      return c.json({ error: "Missing required field: message" }, 400);
    }

    return streamSSE(c, async (stream) => {
      const events = deps.meetingSession.sendMessage(meetingId, message);
      for await (const event of events) {
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    });
  });

  // DELETE /meetings/:meetingId - Close meeting
  routes.delete("/meetings/:meetingId", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));
    try {
      await deps.meetingSession.closeMeeting(meetingId);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /meetings/:meetingId/interrupt - Stop current generation
  routes.post("/meetings/:meetingId/interrupt", (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));
    try {
      deps.meetingSession.interruptTurn(meetingId);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  return routes;
}
