import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import type { MeetingSessionForRoutes } from "@/daemon/routes/meetings";
import type { GuildHallEvent, MeetingId } from "@/daemon/types";

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
  });
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

describe("POST /meetings", () => {
  test("returns SSE stream with session event first", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

    const res = await app.request("/meetings", {
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

describe("POST /meetings/:meetingId/messages", () => {
  test("returns SSE stream with response events", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/test-meeting-001/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Follow up question" }),
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

    const res = await app.request("/meetings/test-meeting-001/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: message");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/test-meeting-001/messages", {
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

    await app.request("/meetings/my-meeting-id/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What about X?" }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-meeting-id");
    expect(receivedCalls[0].message).toBe("What about X?");
  });
});

describe("DELETE /meetings/:meetingId", () => {
  test("returns 200 with status ok and notes", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/test-meeting-001", {
      method: "DELETE",
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

    const res = await app.request("/meetings/unknown-id", {
      method: "DELETE",
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

    const res = await app.request("/meetings/test-meeting-001", {
      method: "DELETE",
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

    await app.request("/meetings/specific-meeting-42", {
      method: "DELETE",
    });

    expect(closedIds).toEqual(["specific-meeting-42"]);
  });
});

describe("POST /meetings/:meetingId/interrupt", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/test-meeting-001/interrupt", {
      method: "POST",
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

    const res = await app.request("/meetings/unknown-id/interrupt", {
      method: "POST",
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

    const res = await app.request("/meetings/test-meeting-001/interrupt", {
      method: "POST",
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

    await app.request("/meetings/my-meeting-99/interrupt", {
      method: "POST",
    });

    expect(interruptedIds).toEqual(["my-meeting-99"]);
  });
});

describe("POST /meetings/:meetingId/accept", () => {
  test("returns SSE stream with events", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test-project" }),
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

    const res = await app.request("/meetings/request-meeting-001/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: projectName");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/accept", {
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

    await app.request("/meetings/my-request-42/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

describe("POST /meetings/:meetingId/decline", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test-project" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: projectName");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/decline", {
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

    const res = await app.request("/meetings/request-meeting-001/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "unknown" }),
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

    const res = await app.request("/meetings/request-meeting-001/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test-project" }),
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

    await app.request("/meetings/my-request-77/decline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "my-project" }),
    });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].meetingId).toBe("my-request-77");
    expect(receivedCalls[0].projectName).toBe("my-project");
  });
});

describe("POST /meetings/:meetingId/defer", () => {
  test("returns 200 with status ok", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

    const res = await app.request("/meetings/request-meeting-001/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deferredUntil: "2026-03-15" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when deferredUntil is missing", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test-project" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();

    const res = await app.request("/meetings/request-meeting-001/defer", {
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

    const res = await app.request("/meetings/request-meeting-001/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

    const res = await app.request("/meetings/request-meeting-001/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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

    await app.request("/meetings/my-request-88/defer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
