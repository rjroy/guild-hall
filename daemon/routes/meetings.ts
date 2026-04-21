import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { asMeetingId } from "@/daemon/types";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { AppConfig, Artifact, RouteModule, OperationDefinition } from "@/lib/types";
import { integrationWorktreePath, projectLorePath, resolveMeetingBasePath } from "@/lib/paths";
import { scanArtifacts } from "@/lib/artifacts";
import {
  scanMeetingRequests,
  readMeetingMeta,
  getActiveMeetingWorktrees,
  sortMeetingArtifacts,
  sortMeetingRequests,
  sortActiveMeetings,
  parseTranscriptToMessages,
} from "@/lib/meetings";
import type { MeetingMeta } from "@/lib/meetings";
import type { MeetingSessionForRoutes } from "@/daemon/services/meeting/orchestrator";

// Schemas for meeting.session.meeting.list (REQ-CLI-AGENT-22, Phase 1 metadata).
export const activeMeetingListRequestSchema = z.object({});

export const activeMeetingListResponseSchema = z.object({
  sessions: z.array(
    z.object({
      meetingId: z.string(),
      projectName: z.string(),
      workerName: z.string(),
      startedAt: z.string(),
      status: z.string(),
    }),
  ),
});

export interface MeetingRoutesDeps {
  meetingSession: MeetingSessionForRoutes;
  /** Required for GET read routes. */
  config?: AppConfig;
  /** Required for GET read routes. */
  guildHallHome?: string;
  /** Injectable logger. Defaults to nullLog("meetings"). */
  log?: Log;
}

/**
 * Creates meeting management routes.
 *
 * POST /meeting/request/meeting/create      - Create meeting, stream first turn via SSE
 * POST /meeting/session/message/send        - Send follow-up, stream response via SSE
 * POST /meeting/session/meeting/close       - Close an active meeting
 * POST /meeting/session/generation/interrupt - Stop current generation
 * POST /meeting/request/meeting/accept      - Accept meeting request, stream first turn
 * POST /meeting/request/meeting/decline     - Decline a meeting request
 * POST /meeting/request/meeting/defer       - Defer a meeting request
 * GET  /meeting/request/meeting/list        - List meeting requests for a project
 * GET  /meeting/request/meeting/read        - Read meeting detail
 * GET  /meeting/session/meeting/list        - List every currently-active meeting session
 */
export function createMeetingRoutes(deps: MeetingRoutesDeps): RouteModule {
  const log = deps.log ?? nullLog("meetings");
  const routes = new Hono();

  // POST /meeting/request/meeting/create - Create meeting and stream first turn
  routes.post("/meeting/request/meeting/create", async (c) => {
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
        log.error(`Unexpected error in create stream for meeting (project: ${projectName}, worker: ${workerName}):`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
      }
    });
  });

  // POST /meeting/session/message/send - Send follow-up message
  routes.post("/meeting/session/message/send", async (c) => {
    let body: { meetingId?: string; message?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);

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
        log.error(`Unexpected error in sendMessage stream for meeting ${meetingId as string}:`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
      }
    });
  });

  // POST /meeting/session/meeting/close - Close meeting
  routes.post("/meeting/session/meeting/close", async (c) => {
    let body: { meetingId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);
    try {
      const { notes } = await deps.meetingSession.closeMeeting(meetingId);
      return c.json({ status: "ok", notes });
    } catch (err: unknown) {
      log.error("close failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /meeting/session/generation/interrupt - Stop current generation
  routes.post("/meeting/session/generation/interrupt", async (c) => {
    let body: { meetingId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);
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

  // POST /meeting/request/meeting/accept - Accept a meeting request, stream first turn
  routes.post("/meeting/request/meeting/accept", async (c) => {
    let body: { meetingId?: string; projectName?: string; message?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);

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
        log.error(`Unexpected error in accept stream for meeting ${meetingId as string} (project: ${projectName}):`, err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", reason: errorMessage(err) }),
        });
      }
    });
  });

  // POST /meeting/request/meeting/decline - Decline a meeting request
  routes.post("/meeting/request/meeting/decline", async (c) => {
    let body: { meetingId?: string; projectName?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);

    const { projectName } = body;

    if (!projectName) {
      return c.json({ error: "Missing required field: projectName" }, 400);
    }

    try {
      await deps.meetingSession.declineMeeting(meetingId, projectName);
      return c.json({ status: "ok" });
    } catch (err: unknown) {
      log.error("decline failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // POST /meeting/request/meeting/defer - Defer a meeting request
  routes.post("/meeting/request/meeting/defer", async (c) => {
    let body: { meetingId?: string; projectName?: string; deferredUntil?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.meetingId) {
      return c.json({ error: "Missing required field: meetingId" }, 400);
    }
    const meetingId = asMeetingId(body.meetingId);

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
      log.error("defer failed for meeting", meetingId, ":", err);
      const message = errorMessage(err);
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 500);
    }
  });

  // -- Read routes (Phase 1-2 DAB migration) --

  // GET /meeting/request/meeting/list?projectName=X - List meeting requests for a project
  // GET /meeting/request/meeting/list?projectName=X&view=artifacts - List all meetings
  //   as artifacts (includes active worktree meetings, sorted open-first then by date desc)
  routes.get("/meeting/request/meeting/list", async (c) => {
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

      // Open view: return MeetingMeta[] for active (open) meetings,
      // merging integration worktree and active meeting worktrees.
      if (view === "open") {
        const meetingsPath = path.join(lorePath, "meetings");

        // Enumerate integration worktree meetings
        let integrationFiles: string[] = [];
        try {
          integrationFiles = (await fs.readdir(meetingsPath))
            .filter((f) => f.endsWith(".md"));
        } catch {
          // Directory may not exist yet
        }

        // Enumerate active worktree meetings
        const activeWorktrees = await getActiveMeetingWorktrees(deps.guildHallHome, projectName);
        const worktreeFiles: Array<{ dir: string; file: string }> = [];
        for (const wt of activeWorktrees) {
          const wtMeetingsPath = path.join(wt, ".lore", "meetings");
          try {
            const files = (await fs.readdir(wtMeetingsPath)).filter((f) => f.endsWith(".md"));
            for (const f of files) {
              worktreeFiles.push({ dir: wtMeetingsPath, file: f });
            }
          } catch {
            // Skip missing directories
          }
        }

        // Merge, deduplicating by filename (integration wins)
        const seenFiles = new Set(integrationFiles);
        const allFileEntries: Array<{ dir: string; file: string }> = [
          ...integrationFiles.map((f) => ({ dir: meetingsPath, file: f })),
          ...worktreeFiles.filter((e) => !seenFiles.has(e.file)),
        ];

        // Read metadata and filter to open status
        const metas: MeetingMeta[] = [];
        for (const entry of allFileEntries) {
          try {
            const meta = await readMeetingMeta(path.join(entry.dir, entry.file), projectName);
            if (meta.status === "open") {
              metas.push(meta);
            }
          } catch {
            // Skip unreadable files
          }
        }

        const sorted = sortActiveMeetings(metas);
        return c.json({ meetings: sorted });
      }

      // Default: return meeting requests (pending/deferred), sorted
      const meetings = await scanMeetingRequests(lorePath, projectName);
      const sorted = sortMeetingRequests(meetings);
      return c.json({ meetings: sorted });
    } catch (err: unknown) {
      return c.json({ error: errorMessage(err) }, 500);
    }
  });

  // GET /meeting/request/meeting/read?meetingId=X&projectName=X - Read meeting detail
  // Returns meeting metadata, raw transcript, and parsed transcript messages.
  routes.get("/meeting/request/meeting/read", async (c) => {
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

    const meetingId = c.req.query("meetingId");
    if (!meetingId) {
      return c.json({ error: "Missing required query parameter: meetingId" }, 400);
    }

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

  // GET /meeting/session/meeting/list - List every currently-active meeting session.
  // Cross-project: caller filters client-side. The aggregated `meeting list` CLI
  // command unions this with `meeting.request.meeting.list`.
  routes.get("/meeting/session/meeting/list", (c) => {
    const entries = deps.meetingSession.listAllActiveMeetings();
    const sessions = entries.map((entry) => ({
      meetingId: entry.meetingId as string,
      projectName: entry.projectName,
      workerName: entry.workerName,
      startedAt: parseStartedAtFromMeetingId(entry.meetingId as string),
      status: entry.status,
    }));
    return c.json({ sessions });
  });

  const operations: OperationDefinition[] = [
    {
      operationId: "meeting.request.meeting.create",
      version: "1",
      name: "create",
      description: "Create a new meeting and stream first turn",
      invocation: { method: "POST", path: "/meeting/request/meeting/create" },
      sideEffects: "Creates meeting artifact, spawns session, streams response",
      context: { project: true },

      idempotent: false,
      streaming: { eventTypes: ["meeting_message", "meeting_status"] },
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.request.meeting.accept",
      version: "1",
      name: "accept",
      description: "Accept a meeting request and stream first turn",
      invocation: { method: "POST", path: "/meeting/request/meeting/accept" },
      sideEffects: "Transitions meeting to active, spawns session, streams response",
      context: { project: true, meetingId: true },

      idempotent: false,
      streaming: { eventTypes: ["meeting_message", "meeting_status"] },
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }, { name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.request.meeting.decline",
      version: "1",
      name: "decline",
      description: "Decline a meeting request",
      invocation: { method: "POST", path: "/meeting/request/meeting/decline" },
      sideEffects: "Transitions meeting to declined",
      context: { project: true, meetingId: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }, { name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.request.meeting.defer",
      version: "1",
      name: "defer",
      description: "Defer a meeting request",
      invocation: { method: "POST", path: "/meeting/request/meeting/defer" },
      sideEffects: "Transitions meeting to deferred",
      context: { project: true, meetingId: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [{ name: "projectName", required: true, in: "body" as const }, { name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.request.meeting.list",
      version: "1",
      name: "list",
      description: "List meeting requests for a project. view=open returns active (open-status) meetings.",
      invocation: { method: "GET", path: "/meeting/request/meeting/list" },
      sideEffects: "",
      context: { project: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [
        { name: "projectName", required: true, in: "query" as const },
        { name: "view", required: false, in: "query" as const },
      ],
    },
    {
      operationId: "meeting.request.meeting.read",
      version: "1",
      name: "read",
      description: "Read meeting detail",
      invocation: { method: "GET", path: "/meeting/request/meeting/read" },
      sideEffects: "",
      context: { project: true, meetingId: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "request", object: "meeting" },
      parameters: [{ name: "projectName", required: true, in: "query" as const }, { name: "meetingId", required: true, in: "query" as const }],
    },
    {
      operationId: "meeting.session.message.send",
      version: "1",
      name: "send",
      description: "Send a message and stream response",
      invocation: { method: "POST", path: "/meeting/session/message/send" },
      sideEffects: "Sends message to worker session, streams response",
      context: { meetingId: true },

      idempotent: false,
      streaming: { eventTypes: ["meeting_message", "meeting_status"] },
      hierarchy: { root: "meeting", feature: "session", object: "message" },
      parameters: [{ name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.session.generation.interrupt",
      version: "1",
      name: "interrupt",
      description: "Stop current generation",
      invocation: { method: "POST", path: "/meeting/session/generation/interrupt" },
      sideEffects: "Aborts current worker generation turn",
      context: { meetingId: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "session", object: "generation" },
      parameters: [{ name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.session.meeting.close",
      version: "1",
      name: "close",
      description: "Close an active meeting",
      invocation: { method: "POST", path: "/meeting/session/meeting/close" },
      sideEffects: "Closes session, merges worktree, generates notes",
      context: { meetingId: true },

      idempotent: true,
      hierarchy: { root: "meeting", feature: "session", object: "meeting" },
      parameters: [{ name: "meetingId", required: true, in: "body" as const }],
    },
    {
      operationId: "meeting.session.meeting.list",
      version: "1",
      name: "list",
      description: "List every currently-active meeting session across all projects",
      invocation: { method: "GET", path: "/meeting/session/meeting/list" },
      requestSchema: activeMeetingListRequestSchema,
      responseSchema: activeMeetingListResponseSchema,
      sideEffects: "",
      context: {},
      idempotent: true,
      hierarchy: { root: "meeting", feature: "session", object: "meeting" },
      parameters: [],
    },
  ];

  const descriptions: Record<string, string> = {
    meeting: "Meeting requests, sessions, and message streaming",
    "meeting.request": "Meeting request lifecycle",
    "meeting.request.meeting": "Meeting requests",
    "meeting.session": "Active meeting session operations",
    "meeting.session.message": "Message exchange within a meeting",
    "meeting.session.generation": "AI generation control",
    "meeting.session.meeting": "Meeting session lifecycle",
  };

  return { routes, operations, descriptions };
}

/**
 * Parses the ISO timestamp embedded in a meeting ID, e.g.
 * `audience-Worker-20260313-120500[-N]` → `"2026-03-13T12:05:00.000Z"`.
 * Returns the original ID's date portion as a fallback if the format does
 * not match. The session list route uses this to surface a startedAt without
 * adding a field to ActiveMeetingEntry.
 */
function parseStartedAtFromMeetingId(meetingId: string): string {
  const match = meetingId.match(/-(\d{8})-(\d{6})(?:-\d+)?$/);
  if (!match) return "";
  const [, ymd, hms] = match;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
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
