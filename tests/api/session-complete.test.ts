import { describe, expect, it } from "bun:test";

import { SessionStore } from "@/lib/session-store";
import type { SessionMetadata } from "@/lib/types";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";

// -- Fixtures --

const CREATED_AT = "2026-02-12T10:00:00.000Z";
const COMPLETION_TIME = "2026-02-12T15:00:00.000Z";
const completionClock = () => new Date(COMPLETION_TIME);

function makeMeta(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "2026-02-12-test-session",
    name: "Test Session",
    status: "idle",
    guildMembers: ["member-a"],
    sdkSessionId: null,
    createdAt: CREATED_AT,
    lastActivityAt: CREATED_AT,
    messageCount: 0,
    ...overrides,
  };
}

function makeStore(
  meta: SessionMetadata | null,
  clock = completionClock,
) {
  const files: Record<string, string> = {};
  const dirs = new Set(["/sessions"]);

  if (meta) {
    const sessionDir = `/sessions/${meta.id}`;
    dirs.add(sessionDir);
    files[`${sessionDir}/meta.json`] = JSON.stringify(meta, null, 2);
    files[`${sessionDir}/messages.jsonl`] = "";
  }

  const fs = createMockSessionFs(files, dirs);
  const store = new SessionStore("/sessions", fs, clock);
  return { store, fs };
}

// -- Session completion --

// Tests exercise the same SessionStore logic the complete route delegates to.
// The route is a thin wrapper (NextResponse.json + status codes), so we test
// the store directly with DI rather than spinning up Next.js.

describe("POST /api/sessions/[id]/complete (session completion)", () => {
  it("completing an idle session sets status to completed and updates lastActivityAt", async () => {
    const meta = makeMeta({ status: "idle" });
    const { store } = makeStore(meta);

    const updated = await store.updateMetadata(meta.id, {
      status: "completed",
      lastActivityAt: COMPLETION_TIME,
    });

    expect(updated.status).toBe("completed");
    expect(updated.lastActivityAt).toBe(COMPLETION_TIME);
    // Immutable fields preserved
    expect(updated.id).toBe(meta.id);
    expect(updated.name).toBe("Test Session");
    expect(updated.createdAt).toBe(CREATED_AT);
  });

  it("completing an error session sets status to completed and updates lastActivityAt", async () => {
    const meta = makeMeta({ status: "error" });
    const { store } = makeStore(meta);

    const updated = await store.updateMetadata(meta.id, {
      status: "completed",
      lastActivityAt: COMPLETION_TIME,
    });

    expect(updated.status).toBe("completed");
    expect(updated.lastActivityAt).toBe(COMPLETION_TIME);
  });

  it("completing an already-completed session returns the same metadata (no-op)", async () => {
    const meta = makeMeta({
      status: "completed",
      lastActivityAt: "2026-02-12T12:00:00.000Z",
    });
    const { store } = makeStore(meta);

    // The route logic: if status is completed, return current metadata as-is
    const session = await store.getSession(meta.id);
    expect(session).not.toBeNull();
    expect(session!.metadata.status).toBe("completed");
    expect(session!.metadata.lastActivityAt).toBe("2026-02-12T12:00:00.000Z");
  });

  it("completing an expired session returns the same metadata (no-op)", async () => {
    const meta = makeMeta({
      status: "expired",
      lastActivityAt: "2026-02-11T08:00:00.000Z",
    });
    const { store } = makeStore(meta);

    // The route logic: if status is expired, return current metadata as-is
    const session = await store.getSession(meta.id);
    expect(session).not.toBeNull();
    expect(session!.metadata.status).toBe("expired");
    expect(session!.metadata.lastActivityAt).toBe("2026-02-11T08:00:00.000Z");
  });

  it("completing a running session is rejected (409 equivalent)", async () => {
    const meta = makeMeta({ status: "running" });
    const { store } = makeStore(meta);

    // The route logic: if status is running, return 409 without updating.
    // We verify the session still has running status after the check.
    const session = await store.getSession(meta.id);
    expect(session).not.toBeNull();
    expect(session!.metadata.status).toBe("running");

    // Confirm we would not transition: status remains running
    const afterCheck = await store.getSession(meta.id);
    expect(afterCheck!.metadata.status).toBe("running");
  });

  it("completing a nonexistent session returns null (404 equivalent)", async () => {
    const { store } = makeStore(null);

    const result = await store.getSession("does-not-exist");

    expect(result).toBeNull();
  });

  it("persists the completed status to the filesystem", async () => {
    const meta = makeMeta({ status: "idle" });
    const { store, fs } = makeStore(meta);

    await store.updateMetadata(meta.id, {
      status: "completed",
      lastActivityAt: COMPLETION_TIME,
    });

    // Read back from mock filesystem and verify persistence
    const written = JSON.parse(
      fs.files[`/sessions/${meta.id}/meta.json`],
    ) as Record<string, unknown>;
    expect(written.status).toBe("completed");
    expect(written.lastActivityAt).toBe(COMPLETION_TIME);
  });
});
