import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { GuildHallEvent, MeetingId } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig, Artifact } from "@/lib/types";
import { integrationWorktreePath, projectLorePath, resolveMeetingBasePath } from "@/lib/paths";
import { scanArtifacts } from "@/lib/artifacts";
import {
  scanMeetingRequests,
  readMeetingMeta,
  getActiveMeetingWorktrees,
  sortMeetingArtifacts,
  sortMeetingRequests,
  parseTranscriptToMessages,
} from "@/lib/meetings";

/**
 * The meeting session interface as seen by the routes layer.
 * Matches the public API returned by createMeetingSession().
 */
export interface MeetingSessionForRoutes {
  acceptMeetingRequest(
    meetingId: MeetingId,
    projectName: string,
    message?: string,
  ): AsyncGenerator<GuildHallEvent>;
  createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent>;
  sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent>;
  closeMeeting(meetingId: MeetingId): Promise<{ notes: string }>;
  recoverMeetings(): Promise<number>;
  declineMeeting(meetingId: MeetingId, projectName: string): Promise<void>;
  deferMeeting(meetingId: MeetingId, projectName: string, deferredUntil: string): Promise<void>;
  interruptTurn(meetingId: MeetingId): void;
  getActiveMeetings(): number;
}

export interface MeetingRoutesDeps {
  meetingSession: MeetingSessionForRoutes;
  /** Required for GET read routes. */
  config?: AppConfig;
  /** Required for GET read routes. */
  guildHallHome?: string;
}

/**
 * Creates meeting management routes.
 *
 * POST /meetings                - Create meeting, stream first turn via SSE
 * POST /meetings/:id/messages   - Send follow-up, stream response via SSE
 * DELETE /meetings/:id          - Close meeting
 * POST /meetings/:id/interrupt  - Stop current generation
 * POST /meetings/:id/accept     - Accept meeting request, stream first turn via SSE
 * POST /meetings/:id/decline    - Decline a meeting request
 * POST /meetings/:id/defer      - Defer a meeting request
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
      try {
        const events = deps.meetingSession.createMeeting(
          projectName,
          workerName,
          prompt,
        );
        for await (const event of events) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } catch (err: unknown) {
        console.error(`[meeting-routes] Unexpected error in create stream for meeting (project: ${projectName}, worker: ${workerName}):`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
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
      try {
        const events = deps.meetingSession.sendMessage(meetingId, message);
        for await (const event of events) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } catch (err: unknown) {
        console.error(`[meeting-routes] Unexpected error in sendMessage stream for meeting ${meetingId as string}:`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
      }
    });
  });

  // DELETE /meetings/:meetingId - Close meeting
  routes.delete("/meetings/:meetingId", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));
    try {
      const { notes } = await deps.meetingSession.closeMeeting(meetingId);
      return c.json({ status: "ok", notes });
    } catch (err: unknown) {
      console.error("[meeting-routes] close failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
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
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /meetings/:meetingId/accept - Accept a meeting request, stream first turn
  routes.post("/meetings/:meetingId/accept", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));

    let body: { projectName?: string; message?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { projectName, message } = body;

    if (!projectName) {
      return c.json({ error: "Missing required field: projectName" }, 400);
    }

    return streamSSE(c, async (stream) => {
      try {
        const events = deps.meetingSession.acceptMeetingRequest(
          meetingId,
          projectName,
          message,
        );
        for await (const event of events) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } catch (err: unknown) {
        console.error(`[meeting-routes] Unexpected error in accept stream for meeting ${meetingId as string} (project: ${projectName}):`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
      }
    });
  });

  // POST /meetings/:meetingId/decline - Decline a meeting request
  routes.post("/meetings/:meetingId/decline", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));

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
      await deps.meetingSession.declineMeeting(meetingId, projectName);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      console.error("[meeting-routes] decline failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /meetings/:meetingId/defer - Defer a meeting request
  routes.post("/meetings/:meetingId/defer", async (c) => {
    const meetingId = asMeetingId(c.req.param("meetingId"));

    let body: { projectName?: string; deferredUntil?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { projectName, deferredUntil } = body;

    if (!projectName || !deferredUntil) {
      return c.json(
        { error: "Missing required fields: projectName, deferredUntil" },
        400,
      );
    }

    try {
      await deps.meetingSession.deferMeeting(meetingId, projectName, deferredUntil);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      console.error("[meeting-routes] defer failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // -- Read routes (Phase 1-2 DAB migration) --

  // GET /meetings?projectName=X - List meeting requests for a project
  // GET /meetings?projectName=X&view=artifacts - List all meetings as artifacts
  //   (includes active worktree meetings, sorted open-first then by date desc)
  routes.get("/meetings", async (c) => {
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

    const view = c.req.query("view");

    try {
      const iPath = integrationWorktreePath(deps.guildHallHome, projectName);
      const lorePath = projectLorePath(iPath);

      // Artifacts view: return all meetings as Artifact[] with active worktree
      // merging. Used by the project page's meetings tab.
      if (view === "artifacts") {
        const meetingsPath = path.join(lorePath, "meetings");
        const integrationMeetings = await scanArtifacts(meetingsPath);

        const activeWorktrees = await getActiveMeetingWorktrees(deps.guildHallHome, projectName);
        const activeMeetingArrays = await Promise.all(
          activeWorktrees.map((wt) => scanArtifacts(path.join(wt, ".lore", "meetings"))),
        );
        const activeMeetings = activeMeetingArrays.flat();

        // Merge, deduplicating by filename
        const seenIds = new Set(integrationMeetings.map((m) => m.relativePath));
        const merged = [
          ...integrationMeetings,
          ...activeMeetings.filter((m) => !seenIds.has(m.relativePath)),
        ];
        const sorted = sortMeetingArtifacts(merged);

        return c.json({ meetings: sorted.map(serializeArtifact) });
      }

      // Default: return meeting requests (pending/deferred), sorted
      const meetings = await scanMeetingRequests(lorePath, projectName);
      const sorted = sortMeetingRequests(meetings);
      return c.json({ meetings: sorted });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /meetings/:meetingId?projectName=X - Read meeting detail
  // Returns meeting metadata, raw transcript, and parsed transcript messages.
  routes.get("/meetings/:meetingId", async (c) => {
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

    const meetingId = c.req.param("meetingId");

    try {
      const basePath = await resolveMeetingBasePath(deps.guildHallHome, projectName, meetingId);
      const lorePath = projectLorePath(basePath);
      const filePath = path.join(lorePath, "meetings", `${meetingId}.md`);

      const meta = await readMeetingMeta(filePath, projectName);

      // Read transcript if it exists
      let transcript = "";
      const transcriptPath = path.join(deps.guildHallHome, "meetings", `${meetingId}.md`);
      try {
        transcript = await fs.readFile(transcriptPath, "utf-8");
      } catch {
        // No transcript file
      }

      const parsedMessages = parseTranscriptToMessages(transcript);

      return c.json({ meeting: meta, transcript, parsedMessages });
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: `Meeting not found: ${meetingId}` }, 404);
      }
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  return routes;
}

/**
 * Converts an Artifact to a JSON-safe shape for meeting artifact responses.
 * Matches the serialization in daemon/routes/artifacts.ts.
 */
function serializeArtifact(a: Artifact): Record<string, unknown> {
  return {
    relativePath: a.relativePath,
    meta: a.meta,
    content: a.content,
    lastModified: a.lastModified.toISOString(),
    ...(a.rawContent !== undefined ? { rawContent: a.rawContent } : {}),
  };
}
