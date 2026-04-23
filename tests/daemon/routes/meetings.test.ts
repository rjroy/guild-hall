import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import {
  activeMeetingListRequestSchema,
  activeMeetingListResponseSchema,
} from "@/daemon/routes/meetings";
import type { MeetingSessionForRoutes } from "@/daemon/services/meeting/orchestrator";
import type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
import { asMeetingId, type GuildHallEvent, type MeetingId } from "@/daemon/types";

// -- Mock meeting session --

function makeMockMeetingSession(
  overrides: Partial<MeetingSessionForRoutes> = {},
): MeetingSessionForRoutes {
  return {
    async *acceptMeetingRequest(): AsyncGenerator<GuildHallEvent> {
      await Promise.resolve();
      yield {
        type: "session",
        meetingId: "accepted-meeting-001",
        sessionId: "sdk-session-accept",
        worker: "Assistant",
      };
      yield { type: "text_delta", text: "Meeting request accepted" };
      yield { type: "turn_end", cost: 0.01 };
    },
    async *createMeeting(): AsyncGenerator<GuildHallEvent> {
      await Promise.resolve();
      yield {
        type: "session",
        meetingId: "test-meeting-001",
        sessionId: "sdk-session-abc",
        worker: "Assistant",
      };
      yield { type: "text_delta", text: "Hello from the worker" };
      yield { type: "turn_end", cost: 0.01 };
    },
    async *sendMessage(): AsyncGenerator<GuildHallEvent> {
      await Promise.resolve();
      yield { type: "text_delta", text: "Follow-up response" };
      yield { type: "turn_end", cost: 0.005 };
    },
    closeMeeting(): Promise<{ notes: string }> {
      return Promise.resolve({ notes: "Mock meeting notes." });
    },
    declineMeeting(): Promise<void> {
      // Default: succeeds silently
      return Promise.resolve();
    },
    deferMeeting(): Promise<void> {
      // Default: succeeds silently
      return Promise.resolve();
    },
    interruptTurn(): void {
      // Default: succeeds silently
    },
    recoverMeetings: () => Promise.resolve(0),
    getActiveMeetings: () => 0,
    createMeetingRequest: () => Promise.resolve(),
    getOpenMeetingsForProject: () => [],
    listAllActiveMeetings: () => [],
    ...overrides,
  };
}

function makeTestApp(
  sessionOverrides: Partial<MeetingSessionForRoutes> = {},
) {
  const meetingSession = makeMockMeetingSession(sessionOverrides);
  return createApp({
    health: {
      getMeetingCount: () => meetingSession.getActiveMeetings(),
      getUptimeSeconds: () => 42,
    },
    meetingSession,
  }).app;
}

/**
 * Parses SSE response body into individual event data payloads.
 * SSE format: "data: <json>\n\n" per event, with possible "event:" and "id:" lines.
 */
async function parseSSEResponse(res: Response): Promise<GuildHallEvent[]> {
  const text = await res.text();
  const events: GuildHallEvent[] = [];

  // Split on double newlines to get individual SSE messages
  const blocks = text.split("\n\n").filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    // Extract the data line(s) from each block
    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const jsonStr = line.slice("data:".length).trim();
        if (jsonStr) {
          events.push(JSON.parse(jsonStr) as GuildHallEvent);
        }
      }
    }
  }

  return events;
}

// -- Tests --

describe("POST /meeting/request/meeting/create", () => {
  test("returns SSE stream with session event first", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    expect(res.status).toBe(200);

    const events = await parseSSEResponse(res);
    expect(events.length).toBe(3);
    expect(events[0].type).toBe("session");
    if (events[0].type === "session") {
      expect(events[0].meetingId).toBe("test-meeting-001");
      expect(events[0].sessionId).toBe("sdk-session-abc");
      expect(events[0].worker).toBe("Assistant");
    }
  });

  test("SSE events are properly formatted", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    const text = await res.text();

    // Each event should have a "data:" prefix
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data:"));
    expect(dataLines.length).toBe(3);

    // Verify each data line contains valid JSON
    for (const line of dataLines) {
      const jsonStr = line.slice("data:".length).trim();
      expect(() => JSON.parse(jsonStr) as unknown).not.toThrow();
    }
  });

  test("streams text_delta and turn_end events after session", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    const events = await parseSSEResponse(res);
    expect(events[1].type).toBe("text_delta");
    if (events[1].type === "text_delta") {
      expect(events[1].text).toBe("Hello from the worker");
    }
    expect(events[2].type).toBe("turn_end");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when workerName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        prompt: "Hello",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when prompt is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("streams error events from meeting session", async () => {
    const app = makeTestApp({
      async *createMeeting() {
        await Promise.resolve();
        yield { type: "error" as const, reason: "Project not found" };
      },
    });

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "nonexistent",
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    // SSE responses return 200 even when the stream contains errors,
    // because the HTTP response starts before events are yielded
    expect(res.status).toBe(200);
    const events = await parseSSEResponse(res);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].reason).toBe("Project not found");
    }
  });

  test("content-type includes text/event-stream", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "test-project",
        workerName: "test-worker",
        prompt: "Hello",
      }),
    });

    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});

describe("POST /meeting/session/message/send", () => {
  test("returns SSE stream with response events", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001", message: "Follow up question" }),
    });

    expect(res.status).toBe(200);

    const events = await parseSSEResponse(res);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("text_delta");
    if (events[0].type === "text_delta") {
      expect(events[0].text).toBe("Follow-up response");
    }
    expect(events[1].type).toBe("turn_end");
  });

  test("returns 400 when message is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: message");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("passes meetingId and message to session", async () => {
    const receivedCalls: Array<{ meetingId: string; message: string }> = [];

    const app = makeTestApp({
      async *sendMessage(meetingId: MeetingId, message: string) {
        await Promise.resolve();
        receivedCalls.push({ meetingId: meetingId as string, message });
        yield { type: "turn_end" as const };
      },
    });

    await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "my-meeting-id", message: "What about X?" }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-meeting-id");
    expect(receivedCalls[0].message).toBe("What about X?");
  });
});

describe("POST /meeting/session/meeting/close", () => {
  test("returns 200 with status ok and notes", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.notes).toBe("Mock meeting notes.");
  });

  test("returns 404 for unknown meeting", async () => {
    const app = makeTestApp({
      closeMeeting() {
        return Promise.reject(new Error('Meeting "unknown-id" not found'));
      },
    });

    const res = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "unknown-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 500 for unexpected errors", async () => {
    const app = makeTestApp({
      closeMeeting() {
        return Promise.reject(new Error("Disk full"));
      },
    });

    const res = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Disk full");
  });

  test("passes correct meetingId to session", async () => {
    const closedIds: string[] = [];

    const app = makeTestApp({
      closeMeeting(meetingId: MeetingId): Promise<{ notes: string }> {
        closedIds.push(meetingId as string);
        return Promise.resolve({ notes: "Notes." });
      },
    });

    await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "specific-meeting-42" }),
    });

    expect(closedIds).toEqual(["specific-meeting-42"]);
  });
});

describe("POST /meeting/session/generation/interrupt", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/session/generation/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("returns 404 for unknown meeting", async () => {
    const app = makeTestApp({
      interruptTurn: () => {
        throw new Error('Meeting "unknown-id" not found');
      },
    });

    const res = await app.request("/meeting/session/generation/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "unknown-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 500 for unexpected errors", async () => {
    const app = makeTestApp({
      interruptTurn: () => {
        throw new Error("Internal state corruption");
      },
    });

    const res = await app.request("/meeting/session/generation/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "test-meeting-001" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Internal state corruption");
  });

  test("passes correct meetingId to session", async () => {
    const interruptedIds: string[] = [];

    const app = makeTestApp({
      interruptTurn: (meetingId: MeetingId) => {
        interruptedIds.push(meetingId as string);
      },
    });

    await app.request("/meeting/session/generation/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "my-meeting-99" }),
    });

    expect(interruptedIds).toEqual(["my-meeting-99"]);
  });
});

describe("POST /meeting/request/meeting/accept", () => {
  test("returns SSE stream with events", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", projectName: "test-project" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await parseSSEResponse(res);
    expect(events.length).toBe(3);
    expect(events[0].type).toBe("session");
    if (events[0].type === "session") {
      expect(events[0].meetingId).toBe("accepted-meeting-001");
    }
    expect(events[1].type).toBe("text_delta");
    expect(events[2].type).toBe("turn_end");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: projectName");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("passes meetingId, projectName, and message to session", async () => {
    const receivedCalls: Array<{
      meetingId: string;
      projectName: string;
      message?: string;
    }> = [];

    const app = makeTestApp({
      async *acceptMeetingRequest(
        meetingId: MeetingId,
        projectName: string,
        message?: string,
      ) {
        await Promise.resolve();
        receivedCalls.push({
          meetingId: meetingId as string,
          projectName,
          message,
        });
        yield { type: "turn_end" as const };
      },
    });

    await app.request("/meeting/request/meeting/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: "my-request-42",
        projectName: "my-project",
        message: "Focus on the auth module",
      }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-request-42");
    expect(receivedCalls[0].projectName).toBe("my-project");
    expect(receivedCalls[0].message).toBe("Focus on the auth module");
  });
});

describe("POST /meeting/request/meeting/decline", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", projectName: "test-project" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: projectName");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 404 for not found errors", async () => {
    const app = makeTestApp({
      declineMeeting() {
        return Promise.reject(new Error('Project "unknown" not found'));
      },
    });

    const res = await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", projectName: "unknown" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 500 for unexpected errors", async () => {
    const app = makeTestApp({
      declineMeeting() {
        return Promise.reject(new Error("Disk full"));
      },
    });

    const res = await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", projectName: "test-project" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Disk full");
  });

  test("passes meetingId and projectName to session", async () => {
    const receivedCalls: Array<{ meetingId: string; projectName: string }> = [];

    const app = makeTestApp({
      declineMeeting(meetingId: MeetingId, projectName: string) {
        receivedCalls.push({ meetingId: meetingId as string, projectName });
        return Promise.resolve();
      },
    });

    await app.request("/meeting/request/meeting/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "my-request-77", projectName: "my-project" }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-request-77");
    expect(receivedCalls[0].projectName).toBe("my-project");
  });
});

describe("POST /meeting/request/meeting/defer", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: "request-meeting-001",
        projectName: "test-project",
        deferredUntil: "2026-03-15",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", deferredUntil: "2026-03-15" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when deferredUntil is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "request-meeting-001", projectName: "test-project" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 404 for not found errors", async () => {
    const app = makeTestApp({
      deferMeeting() {
        return Promise.reject(new Error('Project "unknown" not found'));
      },
    });

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: "request-meeting-001",
        projectName: "unknown",
        deferredUntil: "2026-03-15",
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("returns 500 for unexpected errors", async () => {
    const app = makeTestApp({
      deferMeeting() {
        return Promise.reject(new Error("Disk full"));
      },
    });

    const res = await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: "request-meeting-001",
        projectName: "test-project",
        deferredUntil: "2026-03-15",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Disk full");
  });

  test("passes meetingId, projectName, and deferredUntil to session", async () => {
    const receivedCalls: Array<{
      meetingId: string;
      projectName: string;
      deferredUntil: string;
    }> = [];

    const app = makeTestApp({
      deferMeeting(
        meetingId: MeetingId,
        projectName: string,
        deferredUntil: string,
      ) {
        receivedCalls.push({
          meetingId: meetingId as string,
          projectName,
          deferredUntil,
        });
        return Promise.resolve();
      },
    });

    await app.request("/meeting/request/meeting/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId: "my-request-88",
        projectName: "my-project",
        deferredUntil: "2026-04-01",
      }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-request-88");
    expect(receivedCalls[0].projectName).toBe("my-project");
    expect(receivedCalls[0].deferredUntil).toBe("2026-04-01");
  });
});

describe("GET /meeting/session/meeting/list", () => {
  function makeEntry(overrides: Partial<ActiveMeetingEntry> = {}): ActiveMeetingEntry {
    return {
      meetingId: asMeetingId("audience-Worker-20260313-120500"),
      projectName: "test-project",
      workerName: "Worker",
      packageName: "worker-pkg",
      sdkSessionId: null,
      worktreeDir: "/tmp/wt",
      branchName: "claude/meetings/test",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
      ...overrides,
    };
  }

  test("returns empty sessions array when no meetings are active", async () => {
    const app = makeTestApp({ listAllActiveMeetings: () => [] });
    const res = await app.request("/meeting/session/meeting/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sessions: [] });
  });

  test("returns rows with meetingId, projectName, workerName, startedAt, status", async () => {
    const entry = makeEntry();
    const app = makeTestApp({ listAllActiveMeetings: () => [entry] });

    const res = await app.request("/meeting/session/meeting/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toEqual({
      meetingId: "audience-Worker-20260313-120500",
      projectName: "test-project",
      workerName: "Worker",
      startedAt: "2026-03-13T12:05:00.000Z",
      status: "open",
    });
  });

  test("includes one row per project when sessions span multiple projects", async () => {
    const entries = [
      makeEntry({
        meetingId: asMeetingId("audience-A-20260313-120500"),
        projectName: "project-a",
        workerName: "WorkerA",
      }),
      makeEntry({
        meetingId: asMeetingId("audience-B-20260313-130500"),
        projectName: "project-b",
        workerName: "WorkerB",
      }),
    ];
    const app = makeTestApp({ listAllActiveMeetings: () => entries });

    const res = await app.request("/meeting/session/meeting/list");
    const body = (await res.json()) as {
      sessions: Array<{ projectName: string }>;
    };
    expect(body.sessions).toHaveLength(2);
    const projects = body.sessions.map((s) => s.projectName);
    expect(projects).toContain("project-a");
    expect(projects).toContain("project-b");
  });

  test("parses startedAt from meetingId with sequence suffix", async () => {
    const entry = makeEntry({
      meetingId: asMeetingId("audience-Worker-20260313-120500-2"),
    });
    const app = makeTestApp({ listAllActiveMeetings: () => [entry] });

    const res = await app.request("/meeting/session/meeting/list");
    const body = await res.json();
    expect(body.sessions[0].startedAt).toBe("2026-03-13T12:05:00.000Z");
  });

  test("returns empty startedAt when meetingId does not match expected format", async () => {
    const entry = makeEntry({
      meetingId: asMeetingId("malformed-id"),
    });
    const app = makeTestApp({ listAllActiveMeetings: () => [entry] });

    const res = await app.request("/meeting/session/meeting/list");
    const body = await res.json();
    expect(body.sessions[0].startedAt).toBe("");
  });

  test("response validates against activeMeetingListResponseSchema", async () => {
    const entry = makeEntry();
    const app = makeTestApp({ listAllActiveMeetings: () => [entry] });

    const res = await app.request("/meeting/session/meeting/list");
    const body = await res.json();
    const parsed = activeMeetingListResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("activeMeetingListRequestSchema accepts empty body and rejects non-object", () => {
    expect(activeMeetingListRequestSchema.safeParse({}).success).toBe(true);
    expect(activeMeetingListRequestSchema.safeParse(123).success).toBe(false);
  });

  test("activeMeetingListResponseSchema rejects missing required fields", () => {
    const bad = { sessions: [{ meetingId: "m1", projectName: "p" }] };
    expect(activeMeetingListResponseSchema.safeParse(bad).success).toBe(false);
  });
});
