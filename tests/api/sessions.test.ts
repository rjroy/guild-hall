import { describe, expect, it } from "bun:test";

import { SessionStore } from "@/lib/session-store";
import type { StoredMessage } from "@/lib/types";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";

// -- Fixtures --

const FIXED_DATE = new Date("2026-02-12T14:30:00.000Z");
const fixedClock = () => FIXED_DATE;

function makeStore(
  files: Record<string, string> = {},
  dirs: Set<string> = new Set(["/sessions"]),
) {
  const fs = createMockSessionFs(files, dirs);
  return new SessionStore("/sessions", fs, fixedClock);
}

// Tests exercise the same SessionStore logic the API routes delegate to.
// The routes themselves are thin wrappers (NextResponse.json + Zod validation),
// so we test the store directly with DI rather than spinning up Next.js.

describe("GET /api/sessions (listSessions)", () => {
  it("returns empty array when no sessions exist", async () => {
    const store = makeStore();

    const sessions = await store.listSessions();

    expect(sessions).toEqual([]);
  });

  it("returns sessions in lastActivityAt descending order", async () => {
    const meta1 = JSON.stringify({
      id: "2026-02-10-first",
      name: "First",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-10T10:00:00.000Z",
      lastActivityAt: "2026-02-10T10:00:00.000Z",
      messageCount: 0,
    });

    const meta2 = JSON.stringify({
      id: "2026-02-12-second",
      name: "Second",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
    });

    const store = makeStore(
      {
        "/sessions/2026-02-10-first/meta.json": meta1,
        "/sessions/2026-02-12-second/meta.json": meta2,
      },
      new Set([
        "/sessions",
        "/sessions/2026-02-10-first",
        "/sessions/2026-02-12-second",
      ]),
    );

    const sessions = await store.listSessions();

    expect(sessions.length).toBe(2);
    expect(sessions[0].id).toBe("2026-02-12-second");
    expect(sessions[1].id).toBe("2026-02-10-first");
  });
});

describe("POST /api/sessions (createSession)", () => {
  it("creates a session and returns metadata with 201-equivalent fields", async () => {
    const store = makeStore();

    const metadata = await store.createSession("My Session", [
      "member-a",
      "member-b",
    ]);

    expect(metadata.id).toBe("2026-02-12-my-session");
    expect(metadata.name).toBe("My Session");
    expect(metadata.status).toBe("idle");
    expect(metadata.guildMembers).toEqual(["member-a", "member-b"]);
    expect(metadata.sdkSessionId).toBeNull();
    expect(metadata.messageCount).toBe(0);
  });

  it("the created session is retrievable via getSession", async () => {
    const store = makeStore();

    const created = await store.createSession("Retrievable", ["m1"]);
    const retrieved = await store.getSession(created.id);

    expect(retrieved).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(retrieved!.metadata.id).toBe(created.id);
    expect(retrieved!.metadata.name).toBe("Retrievable");
    expect(retrieved!.messages).toEqual([]);
  });

  it("the created session appears in listSessions", async () => {
    const store = makeStore();

    await store.createSession("Listed Session", []);

    const sessions = await store.listSessions();

    expect(sessions.length).toBe(1);
    expect(sessions[0].name).toBe("Listed Session");
  });
});

describe("DELETE /api/sessions/[id] (deleteSession)", () => {
  it("deletes a session successfully (204 equivalent)", async () => {
    const store = makeStore();

    const created = await store.createSession("To Delete", ["m1"]);
    await store.deleteSession(created.id);

    const result = await store.getSession(created.id);
    expect(result).toBeNull();
  });

  it("throws for nonexistent session (404 equivalent)", async () => {
    const store = makeStore();

    await expect(store.deleteSession("no-such-session")).rejects.toThrow();
  });

  it("deleted session no longer appears in listSessions", async () => {
    const store = makeStore();

    const session1 = await store.createSession("Keep Me", []);
    const session2 = await store.createSession("Delete Me", []);

    await store.deleteSession(session2.id);

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(session1.id);
  });
});

describe("GET /api/sessions/[id] (getSession)", () => {
  it("returns session data with metadata and messages", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-test",
      name: "Test",
      status: "idle",
      guildMembers: ["m1"],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 1,
    });

    const msg: StoredMessage = {
      role: "user",
      content: "Hello",
      timestamp: "2026-02-12T10:00:00.000Z",
    };

    const store = makeStore(
      {
        "/sessions/2026-02-12-test/meta.json": meta,
        "/sessions/2026-02-12-test/messages.jsonl":
          JSON.stringify(msg) + "\n",
      },
      new Set(["/sessions", "/sessions/2026-02-12-test"]),
    );

    const result = await store.getSession("2026-02-12-test");

    expect(result).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(result!.metadata.name).toBe("Test");
    expect(result!.messages.length).toBe(1);
    expect(result!.messages[0].content).toBe("Hello");
  });

  it("returns null for nonexistent session (404 equivalent)", async () => {
    const store = makeStore();

    const result = await store.getSession("no-such-session");

    expect(result).toBeNull();
  });
});
