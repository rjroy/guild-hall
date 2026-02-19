import { describe, expect, it } from "bun:test";

import {
  CreateSessionBodySchema,
  SessionMetadataSchema,
} from "@/lib/schemas";
import { SessionStore, slugify } from "@/lib/session-store";
import type { StoredMessage } from "@/lib/types";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";

const FIXED_DATE = new Date("2026-02-12T14:30:00.000Z");
const fixedClock = () => FIXED_DATE;

function makeStore(
  files: Record<string, string> = {},
  dirs: Set<string> = new Set(["/sessions"]),
  clock = fixedClock,
) {
  const fs = createMockSessionFs(files, dirs);
  const store = new SessionStore("/sessions", fs, clock);
  return { store, fs };
}

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("My Cool Session")).toBe("my-cool-session");
  });

  it("replaces special characters with hyphens", () => {
    // Trailing special chars become hyphens which get trimmed
    expect(slugify("test@session#1!")).toBe("test-session-1");
    expect(slugify("hello world!")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("a---b")).toBe("a-b");
    expect(slugify("a - - b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
    expect(slugify("---test---")).toBe("test");
  });

  it("handles unicode by replacing non-alphanumeric chars", () => {
    // The combining acute accent (U+0301) is non-alphanumeric, replaced
    // with hyphen then collapsed with the space-hyphen
    expect(slugify("caf\u00e9 session")).toBe("caf-session");
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("SessionStore.createSession", () => {
  it("creates directory with all expected files", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Test Session", ["member-a"]);

    const sessionDir = "/sessions/2026-02-12-test-session";

    // Directory was created
    expect(fs.dirs.has(sessionDir)).toBe(true);
    expect(fs.dirs.has(`${sessionDir}/artifacts`)).toBe(true);

    // Files were created
    expect(`${sessionDir}/meta.json` in fs.files).toBe(true);
    expect(`${sessionDir}/context.md` in fs.files).toBe(true);
    expect(`${sessionDir}/messages.jsonl` in fs.files).toBe(true);
  });

  it("produces meta.json that validates against SessionMetadataSchema", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Schema Check", ["member-a", "member-b"]);

    const metaPath = "/sessions/2026-02-12-schema-check/meta.json";
    const raw = fs.files[metaPath];
    const parsed: unknown = JSON.parse(raw);
    const result = SessionMetadataSchema.safeParse(parsed);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("2026-02-12-schema-check");
      expect(result.data.name).toBe("Schema Check");
      expect(result.data.status).toBe("idle");
      expect(result.data.guildMembers).toEqual(["member-a", "member-b"]);
      expect(result.data.sdkSessionId).toBeNull();
      expect(result.data.messageCount).toBe(0);
    }
  });

  it("creates context.md with expected section headers", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Context Test", []);

    const contextPath = "/sessions/2026-02-12-context-test/context.md";
    const content = fs.files[contextPath];

    expect(content).toContain("# Session Context");
    expect(content).toContain("## Goal");
    expect(content).toContain("## Decisions");
    expect(content).toContain("## In Progress");
    expect(content).toContain("## Resources");
  });

  it("creates empty messages.jsonl", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Empty Messages", []);

    const messagesPath = "/sessions/2026-02-12-empty-messages/messages.jsonl";
    expect(fs.files[messagesPath]).toBe("");
  });

  it("returns the session metadata", async () => {
    const { store } = makeStore();

    const metadata = await store.createSession("Return Check", ["m1"]);

    expect(metadata.id).toBe("2026-02-12-return-check");
    expect(metadata.name).toBe("Return Check");
    expect(metadata.status).toBe("idle");
    expect(metadata.guildMembers).toEqual(["m1"]);
    expect(metadata.createdAt).toBe("2026-02-12T14:30:00.000Z");
    expect(metadata.lastActivityAt).toBe("2026-02-12T14:30:00.000Z");
  });
});

describe("Session ID slugification", () => {
  it("slugifies spaces correctly", async () => {
    const { store } = makeStore();
    const meta = await store.createSession("My Cool Session", []);
    expect(meta.id).toBe("2026-02-12-my-cool-session");
  });

  it("slugifies special characters", async () => {
    const { store } = makeStore();
    const meta = await store.createSession("test@#$%session", []);
    expect(meta.id).toBe("2026-02-12-test-session");
  });

  it("handles unicode characters", async () => {
    const { store } = makeStore();
    const meta = await store.createSession("recherche avancee", []);
    expect(meta.id).toBe("2026-02-12-recherche-avancee");
  });
});

describe("Session ID collision detection", () => {
  it("appends -2 when base ID already exists", async () => {
    const dirs = new Set([
      "/sessions",
      "/sessions/2026-02-12-existing",
    ]);
    const { store } = makeStore({}, dirs);

    const meta = await store.createSession("Existing", []);

    expect(meta.id).toBe("2026-02-12-existing-2");
  });

  it("appends -3 when both base and -2 exist", async () => {
    const dirs = new Set([
      "/sessions",
      "/sessions/2026-02-12-popular",
      "/sessions/2026-02-12-popular-2",
    ]);
    const { store } = makeStore({}, dirs);

    const meta = await store.createSession("Popular", []);

    expect(meta.id).toBe("2026-02-12-popular-3");
  });
});

describe("SessionStore.listSessions", () => {
  it("returns sessions sorted by lastActivityAt descending", async () => {
    const olderMeta = JSON.stringify({
      id: "2026-02-10-older",
      name: "Older",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-10T10:00:00.000Z",
      lastActivityAt: "2026-02-10T10:00:00.000Z",
      messageCount: 0,
    });

    const newerMeta = JSON.stringify({
      id: "2026-02-12-newer",
      name: "Newer",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 5,
    });

    const files: Record<string, string> = {
      "/sessions/2026-02-10-older/meta.json": olderMeta,
      "/sessions/2026-02-12-newer/meta.json": newerMeta,
    };

    const dirs = new Set([
      "/sessions",
      "/sessions/2026-02-10-older",
      "/sessions/2026-02-12-newer",
    ]);

    const { store } = makeStore(files, dirs);

    const sessions = await store.listSessions();

    expect(sessions.length).toBe(2);
    expect(sessions[0].id).toBe("2026-02-12-newer");
    expect(sessions[1].id).toBe("2026-02-10-older");
  });

  it("returns empty array for empty directory", async () => {
    const { store } = makeStore({}, new Set(["/sessions"]));

    const sessions = await store.listSessions();

    expect(sessions).toEqual([]);
  });

  it("returns empty array for nonexistent directory", async () => {
    const { store } = makeStore({}, new Set());

    const sessions = await store.listSessions();

    expect(sessions).toEqual([]);
  });

  it("skips directories without valid meta.json", async () => {
    const validMeta = JSON.stringify({
      id: "2026-02-12-valid",
      name: "Valid",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
    });

    const files: Record<string, string> = {
      "/sessions/valid-session/meta.json": validMeta,
      "/sessions/invalid-session/meta.json": "not json",
    };

    const dirs = new Set([
      "/sessions",
      "/sessions/valid-session",
      "/sessions/invalid-session",
    ]);

    const { store } = makeStore(files, dirs);

    const sessions = await store.listSessions();

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("2026-02-12-valid");
  });
});

describe("SessionStore.getSession", () => {
  it("returns metadata and messages for existing session", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-test",
      name: "Test",
      status: "running",
      guildMembers: ["m1"],
      sdkSessionId: "sdk-123",
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T11:00:00.000Z",
      messageCount: 2,
    });

    const msg1: StoredMessage = {
      role: "user",
      content: "Hello",
      timestamp: "2026-02-12T10:00:00.000Z",
    };
    const msg2: StoredMessage = {
      role: "assistant",
      content: "Hi there",
      timestamp: "2026-02-12T10:01:00.000Z",
    };

    const messages = JSON.stringify(msg1) + "\n" + JSON.stringify(msg2) + "\n";

    const files: Record<string, string> = {
      "/sessions/2026-02-12-test/meta.json": meta,
      "/sessions/2026-02-12-test/messages.jsonl": messages,
    };

    const dirs = new Set(["/sessions", "/sessions/2026-02-12-test"]);
    const { store } = makeStore(files, dirs);

    const result = await store.getSession("2026-02-12-test");

    expect(result).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(result!.metadata.id).toBe("2026-02-12-test");
    expect(result!.metadata.status).toBe("running");
    expect(result!.messages.length).toBe(2);
    expect(result!.messages[0].role).toBe("user");
    expect(result!.messages[0].content).toBe("Hello");
    expect(result!.messages[1].role).toBe("assistant");
    expect(result!.messages[1].content).toBe("Hi there");
  });

  it("returns null for nonexistent session", async () => {
    const { store } = makeStore();

    const result = await store.getSession("does-not-exist");

    expect(result).toBeNull();
  });

  it("returns empty messages array for session with empty messages.jsonl", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-empty",
      name: "Empty",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
    });

    const files: Record<string, string> = {
      "/sessions/2026-02-12-empty/meta.json": meta,
      "/sessions/2026-02-12-empty/messages.jsonl": "",
    };

    const dirs = new Set(["/sessions", "/sessions/2026-02-12-empty"]);
    const { store } = makeStore(files, dirs);

    const result = await store.getSession("2026-02-12-empty");

    expect(result).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(result!.messages).toEqual([]);
  });
});

describe("SessionStore.updateMetadata", () => {
  it("merges fields without overwriting unspecified fields", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-update-test",
      name: "Update Test",
      status: "idle",
      guildMembers: ["m1"],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
    });

    const files: Record<string, string> = {
      "/sessions/2026-02-12-update-test/meta.json": meta,
    };

    const dirs = new Set(["/sessions", "/sessions/2026-02-12-update-test"]);
    const { store, fs } = makeStore(files, dirs);

    const updated = await store.updateMetadata("2026-02-12-update-test", {
      status: "running",
      sdkSessionId: "sdk-456",
      messageCount: 3,
    });

    // Updated fields
    expect(updated.status).toBe("running");
    expect(updated.sdkSessionId).toBe("sdk-456");
    expect(updated.messageCount).toBe(3);

    // Preserved fields
    expect(updated.id).toBe("2026-02-12-update-test");
    expect(updated.name).toBe("Update Test");
    expect(updated.guildMembers).toEqual(["m1"]);
    expect(updated.createdAt).toBe("2026-02-12T10:00:00.000Z");

    // Verify the file was written
    const written = JSON.parse(
      fs.files["/sessions/2026-02-12-update-test/meta.json"],
    ) as Record<string, unknown>;
    expect(written.status).toBe("running");
    expect(written.name).toBe("Update Test");
  });
});

describe("SessionStore.getSession JSONL resilience", () => {
  it("skips corrupt JSONL lines and returns valid messages", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-corrupt-test",
      name: "Corrupt Test",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 3,
    });

    const validMsg: StoredMessage = {
      role: "user",
      content: "Hello",
      timestamp: "2026-02-12T10:00:00.000Z",
    };

    // Mix valid messages with corrupt lines: broken JSON, missing required fields,
    // wrong types
    const messagesContent = [
      JSON.stringify(validMsg),
      "this is not json at all",
      '{"role": "user"}', // missing required content and timestamp
      '{"role": "alien", "content": "hi", "timestamp": "2026-02-12T10:01:00.000Z"}', // invalid role
      JSON.stringify({
        role: "assistant",
        content: "Valid response",
        timestamp: "2026-02-12T10:02:00.000Z",
      }),
    ].join("\n") + "\n";

    const files: Record<string, string> = {
      "/sessions/2026-02-12-corrupt-test/meta.json": meta,
      "/sessions/2026-02-12-corrupt-test/messages.jsonl": messagesContent,
    };

    const dirs = new Set(["/sessions", "/sessions/2026-02-12-corrupt-test"]);
    const { store } = makeStore(files, dirs);

    const result = await store.getSession("2026-02-12-corrupt-test");

    expect(result).not.toBeNull();
    // Only the two valid messages should survive
    expect(result!.messages.length).toBe(2);
    expect(result!.messages[0].content).toBe("Hello");
    expect(result!.messages[1].content).toBe("Valid response");
  });
});

describe("SessionStore.appendMessage", () => {
  it("appends JSONL lines readable by getSession", async () => {
    const meta = JSON.stringify({
      id: "2026-02-12-append-test",
      name: "Append Test",
      status: "idle",
      guildMembers: [],
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
    });

    const files: Record<string, string> = {
      "/sessions/2026-02-12-append-test/meta.json": meta,
      "/sessions/2026-02-12-append-test/messages.jsonl": "",
    };

    const dirs = new Set(["/sessions", "/sessions/2026-02-12-append-test"]);
    const { store } = makeStore(files, dirs);

    const msg1: StoredMessage = {
      role: "user",
      content: "First message",
      timestamp: "2026-02-12T10:00:00.000Z",
    };

    const msg2: StoredMessage = {
      role: "assistant",
      content: "Second message",
      timestamp: "2026-02-12T10:01:00.000Z",
      toolName: "readFile",
      toolInput: { path: "/tmp/test" },
      toolResult: "file contents",
    };

    await store.appendMessage("2026-02-12-append-test", msg1);
    await store.appendMessage("2026-02-12-append-test", msg2);

    const result = await store.getSession("2026-02-12-append-test");

    expect(result).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(result!.messages.length).toBe(2);
    expect(result!.messages[0].content).toBe("First message");
    expect(result!.messages[1].content).toBe("Second message");
    expect(result!.messages[1].toolName).toBe("readFile");
    expect(result!.messages[1].toolResult).toBe("file contents");
  });
});

describe("SessionStore.deleteSession", () => {
  it("removes the session directory and all its contents", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Doomed Session", ["m1"]);

    const sessionDir = "/sessions/2026-02-12-doomed-session";
    expect(fs.dirs.has(sessionDir)).toBe(true);
    expect(`${sessionDir}/meta.json` in fs.files).toBe(true);

    await store.deleteSession("2026-02-12-doomed-session");

    expect(fs.dirs.has(sessionDir)).toBe(false);
    expect(fs.dirs.has(`${sessionDir}/artifacts`)).toBe(false);
    expect(`${sessionDir}/meta.json` in fs.files).toBe(false);
    expect(`${sessionDir}/context.md` in fs.files).toBe(false);
    expect(`${sessionDir}/messages.jsonl` in fs.files).toBe(false);
  });

  it("deleted session is gone from listSessions", async () => {
    const { store } = makeStore();

    await store.createSession("Will Delete", []);
    await store.createSession("Will Keep", []);

    await store.deleteSession("2026-02-12-will-delete");

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].name).toBe("Will Keep");
  });

  it("throws for nonexistent session", async () => {
    const { store } = makeStore();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun's .rejects.toThrow() is async at runtime
    await expect(store.deleteSession("no-such-session")).rejects.toThrow(
      "Session not found: no-such-session",
    );
  });

  it("does not affect other sessions", async () => {
    const { store, fs } = makeStore();

    await store.createSession("Session A", ["m1"]);
    await store.createSession("Session B", ["m2"]);

    await store.deleteSession("2026-02-12-session-a");

    // Session B still intact
    const sessionBDir = "/sessions/2026-02-12-session-b";
    expect(fs.dirs.has(sessionBDir)).toBe(true);
    expect(`${sessionBDir}/meta.json` in fs.files).toBe(true);

    const result = await store.getSession("2026-02-12-session-b");
    expect(result).not.toBeNull();
    // Non-null safe: assertion above confirms presence
    expect(result!.metadata.name).toBe("Session B");
  });
});

describe("CreateSessionBodySchema", () => {
  it("accepts a valid create body", () => {
    const result = CreateSessionBodySchema.safeParse({
      name: "My Session",
      guildMembers: ["member-a", "member-b"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty guildMembers array", () => {
    const result = CreateSessionBodySchema.safeParse({
      name: "Solo Session",
      guildMembers: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateSessionBodySchema.safeParse({
      guildMembers: ["member-a"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing guildMembers", () => {
    const result = CreateSessionBodySchema.safeParse({
      name: "No Members Field",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateSessionBodySchema.safeParse({
      name: "",
      guildMembers: [],
    });
    expect(result.success).toBe(false);
  });
});
