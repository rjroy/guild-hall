import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";

import { createNodeSessionStore } from "@/lib/node-session-store";

describe("createNodeSessionStore", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setup() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guild-hall-test-"));
    return createNodeSessionStore(tmpDir);
  }

  it("createSession creates directory and meta.json", async () => {
    const store = await setup();

    const session = await store.createSession("test session", ["alpha"]);

    expect(session.name).toBe("test session");
    expect(session.guildMembers).toEqual(["alpha"]);
    expect(session.status).toBe("idle");

    // Verify files were written to disk
    const metaPath = path.join(tmpDir, session.id, "meta.json");
    const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as Record<string, unknown>;
    expect(meta.name).toBe("test session");
  });

  it("appendMessage writes to messages.jsonl", async () => {
    const store = await setup();
    const session = await store.createSession("msg test", []);

    await store.appendMessage(session.id, {
      role: "user",
      content: "hello",
      timestamp: new Date().toISOString(),
    });

    const messagesPath = path.join(tmpDir, session.id, "messages.jsonl");
    const raw = await fs.readFile(messagesPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]) as Record<string, unknown>).content).toBe("hello");
  });

  it("listSessions returns created sessions", async () => {
    const store = await setup();
    await store.createSession("first", []);
    await store.createSession("second", ["beta"]);

    const sessions = await store.listSessions();

    expect(sessions).toHaveLength(2);
    const names = sessions.map((s) => s.name);
    expect(names).toContain("first");
    expect(names).toContain("second");
  });

  it("getSession reads back metadata and messages", async () => {
    const store = await setup();
    const created = await store.createSession("read test", ["gamma"]);

    await store.appendMessage(created.id, {
      role: "assistant",
      content: "hi there",
      timestamp: new Date().toISOString(),
    });

    const result = await store.getSession(created.id);

    expect(result).not.toBeNull();
    expect(result!.metadata.name).toBe("read test");
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe("hi there");
  });

  it("deleteSession removes the session directory", async () => {
    const store = await setup();
    const session = await store.createSession("delete me", []);

    await store.deleteSession(session.id);

    const result = await store.getSession(session.id);
    expect(result).toBeNull();
  });

  it("getSession returns null for nonexistent session", async () => {
    const store = await setup();

    const result = await store.getSession("does-not-exist");
    expect(result).toBeNull();
  });
});
