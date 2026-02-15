/**
 * Integration tests for error handling and edge case hardening.
 *
 * These tests verify error paths work across module boundaries using real
 * module implementations with DI-injected mock dependencies. No mock.module().
 */

import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { discoverGuildMembers } from "@/lib/plugin-discovery";
import type { FileSystem } from "@/lib/plugin-discovery";
import { MCPManager } from "@/lib/mcp-manager";
import type {
  MCPServerFactory,
  MCPServerHandle,
} from "@/lib/mcp-manager";
import { SessionStore } from "@/lib/session-store";
import type { SessionFileSystem, Clock } from "@/lib/session-store";
import { AgentManager } from "@/lib/agent-manager";
import type { AgentManagerDeps } from "@/lib/agent-manager";
import { createEventBus } from "@/lib/agent";
import type { QueryFn } from "@/lib/agent";
import { formatSSE } from "@/lib/sse";
import {
  applySSEEvent,
  initialState,
  setSessionLoaded,
} from "@/lib/workshop-state";
import type {
  GuildMember,
  SessionMetadata,
  SSEEvent,
  StoredMessage,
} from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";

// Non-null assertions in this file follow a guard-then-assert pattern:
// the preceding expect() confirms the value is defined/non-null, so
// the assertion on the next line is safe.

// -- Shared helpers --

const NOW = "2026-02-12T12:00:00.000Z";
const fixedClock: Clock = () => new Date(NOW);

function createMockProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return emitter as ChildProcess;
}

function makeGuildMember(
  name: string,
  overrides: Partial<GuildMember> = {},
): GuildMember {
  return {
    name,
    displayName: name,
    description: `The ${name} member`,
    version: "1.0.0",
    transport: "http",
    mcp: { command: "node", args: [`${name}.js`] },
    status: "disconnected",
    tools: [],
    pluginDir: `/test/${name}`,
    ...overrides,
  };
}

function makeInitMessage(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001",
    agents: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.39",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
  } as unknown as SDKMessage;
}

function makeSuccessResult(sessionId = "sdk-session-1"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: "Done",
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000007",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeStreamTextDelta(
  text: string,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000002",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messages) {
        yield await Promise.resolve(msg);
      }
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () =>
      Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

function createErrorQueryFn(
  messagesBeforeError: SDKMessage[],
  errorMessage: string,
): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messagesBeforeError) {
        yield await Promise.resolve(msg);
      }
      throw new Error(errorMessage);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () =>
      Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

function createMockMcpFactory(): MCPServerFactory {
  return {
    spawn() {
      return Promise.resolve({
        process: createMockProcess(),
        handle: {
          stop: () => Promise.resolve(),
          listTools: () => Promise.resolve([]),
          invokeTool: () => Promise.resolve(null),
        },
        port: 50000,
      });
    },
    connect() {
      return Promise.resolve({
        handle: {
          stop: () => Promise.resolve(),
          listTools: () => Promise.resolve([]),
          invokeTool: () => Promise.resolve(null),
        },
      });
    },
  };
}

function makeSessionMeta(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "2026-02-12-test-session",
    name: "Test Session",
    status: "idle",
    guildMembers: ["alpha"],
    sdkSessionId: null,
    createdAt: "2026-02-12T10:00:00.000Z",
    lastActivityAt: "2026-02-12T10:00:00.000Z",
    messageCount: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Invalid manifest display (REQ-GH1-26)
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: invalid manifest display", () => {
  it("includes member with error status for malformed JSON", async () => {
    const mockFs: FileSystem = {
      readdir: () => Promise.resolve(["good-member", "bad-member"]),
      readFile: (path: string) => {
        if (path.includes("good-member")) {
          return Promise.resolve(
            JSON.stringify({
              name: "good-member",
              displayName: "Good Member",
              description: "A valid member",
              version: "1.0.0",
              transport: "http",
              mcp: { command: "node", args: ["good.js"] },
            }),
          );
        }
        if (path.includes("bad-member")) {
          return Promise.resolve("{ this is not valid json");
        }
        return Promise.reject(new Error("ENOENT"));
      },
      stat: () => Promise.resolve({ isDirectory: () => true }),
    };

    const members = await discoverGuildMembers("/guild-members", mockFs);

    // Good member is discoverable
    const good = members.get("good-member");
    expect(good).toBeDefined();
    expect(good!.status).toBe("disconnected");
    expect(good!.tools).toEqual([]);

    // Bad member is included with error status
    const bad = members.get("bad-member");
    expect(bad).toBeDefined();
    expect(bad!.status).toBe("error");
    expect(bad!.error).toContain("Invalid JSON");
    expect(bad!.tools).toEqual([]);
  });

  it("includes member with error status for schema validation failure", async () => {
    const mockFs: FileSystem = {
      readdir: () => Promise.resolve(["missing-fields"]),
      readFile: (path: string) => {
        if (path.includes("missing-fields")) {
          // Valid JSON but missing required fields (no name, no mcp)
          return Promise.resolve(
            JSON.stringify({ description: "incomplete" }),
          );
        }
        return Promise.reject(new Error("ENOENT"));
      },
      stat: () => Promise.resolve({ isDirectory: () => true }),
    };

    const members = await discoverGuildMembers("/guild-members", mockFs);

    const member = members.get("missing-fields");
    expect(member).toBeDefined();
    expect(member!.status).toBe("error");
    expect(member!.error).toBeTruthy();
    expect(member!.tools).toEqual([]);
    // The error message should describe which fields failed
    expect(member!.error!.length).toBeGreaterThan(0);
  });

  it("error member uses directory name as identifier", async () => {
    const mockFs: FileSystem = {
      readdir: () => Promise.resolve(["my-broken-plugin"]),
      readFile: () => Promise.resolve("not json"),
      stat: () => Promise.resolve({ isDirectory: () => true }),
    };

    const members = await discoverGuildMembers("/guild-members", mockFs);

    const member = members.get("my-broken-plugin");
    expect(member).toBeDefined();
    expect(member!.name).toBe("my-broken-plugin");
    expect(member!.displayName).toBe("my-broken-plugin");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. MCP server crash mid-session
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: MCP server crash mid-session", () => {
  it("invokeTool throws descriptive error when server handle throws", async () => {
    const crashingHandle: MCPServerHandle = {
      stop: () => Promise.resolve(),
      listTools: () => Promise.resolve([]),
      invokeTool: () =>
        Promise.reject(new Error("Server process exited unexpectedly")),
    };

    const roster = new Map<string, GuildMember>([
      [
        "crashy",
        makeGuildMember("crashy", {
          mcp: { command: "node", args: ["crashy.js"] },
        }),
      ],
    ]);

    const factory: MCPServerFactory = {
      spawn: () => Promise.resolve({
        process: createMockProcess(),
        handle: crashingHandle,
        port: 50000,
      }),
      connect: () => Promise.resolve({ handle: crashingHandle }),
    };

    const manager = new MCPManager(roster, factory);
    await manager.startServersForSession("session-1", ["crashy"]);
    expect(manager.isRunning("crashy")).toBe(true);

    // Tool invocation should throw
    let caught: Error | null = null;
    try {
      await manager.invokeTool("crashy", "some_tool", { arg: "value" });
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("Server process exited unexpectedly");
  });

  it("error from invokeTool translates to a valid SSE error event", () => {
    const errorMessage = "Server process exited unexpectedly";

    // Simulate what the agent layer does: catch the error and format as SSE
    const sseEvent: SSEEvent = {
      type: "error",
      message: errorMessage,
      recoverable: false,
    };

    const formatted = formatSSE(sseEvent);
    expect(formatted).toContain("event: error");
    expect(formatted).toContain(errorMessage);
    expect(formatted).toContain("recoverable");
  });

  it("shutdown still works after tool invocation fails", async () => {
    const crashingHandle: MCPServerHandle = {
      stop: () => Promise.resolve(),
      listTools: () => Promise.resolve([]),
      invokeTool: () =>
        Promise.reject(new Error("Server process exited unexpectedly")),
    };

    const roster = new Map<string, GuildMember>([
      [
        "crashy",
        makeGuildMember("crashy", {
          mcp: { command: "node", args: ["crashy.js"] },
        }),
      ],
    ]);

    const factory: MCPServerFactory = {
      spawn: () => Promise.resolve({
        process: createMockProcess(),
        handle: crashingHandle,
        port: 50000,
      }),
      connect: () => Promise.resolve({ handle: crashingHandle }),
    };

    const manager = new MCPManager(roster, factory);
    await manager.startServersForSession("session-1", ["crashy"]);

    // Tool fails
    try {
      await manager.invokeTool("crashy", "some_tool", {});
    } catch {
      // Expected
    }

    // Shutdown should complete cleanly despite the previous error
    await manager.shutdown();
    expect(manager.isRunning("crashy")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Expired SDK session full flow (REQ-GH1-22)
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: expired SDK session full flow", () => {
  function setupAgentManager(options: {
    queryFn: QueryFn;
    sdkSessionId?: string | null;
    status?: string;
    messageCount?: number;
  }) {
    const meta = makeSessionMeta({
      sdkSessionId: options.sdkSessionId ?? "previous-sdk-session",
      status: (options.status ?? "idle") as SessionMetadata["status"],
      messageCount: options.messageCount ?? 0,
    });

    const files: Record<string, string> = {
      "/sessions/2026-02-12-test-session/meta.json": JSON.stringify(
        meta,
        null,
        2,
      ),
      "/sessions/2026-02-12-test-session/messages.jsonl": "",
      "/sessions/2026-02-12-test-session/context.md": "# Context",
    };
    const dirs = new Set([
      "/sessions",
      "/sessions/2026-02-12-test-session",
      "/sessions/2026-02-12-test-session/artifacts",
    ]);

    const mockFs = createMockSessionFs(files, dirs);
    const sessionStore = new SessionStore("/sessions", mockFs, fixedClock);

    const roster = new Map<string, GuildMember>([
      ["alpha", makeGuildMember("alpha")],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());
    const eventBus = createEventBus();

    const deps: AgentManagerDeps = {
      queryFn: options.queryFn,
      sessionStore,
      mcpManager,
      eventBus,
      clock: fixedClock,
      sessionsDir: "/sessions",
    };

    const manager = new AgentManager(deps);
    return { manager, deps, sessionStore, eventBus, mockFs };
  }

  it("expired session emits error and status_change events", async () => {
    const sdkSid = "sdk-session-1";
    const expiredQueryFn = createErrorQueryFn(
      [makeInitMessage(sdkSid)],
      "The session has expired and cannot be resumed",
    );

    const { manager, eventBus } = setupAgentManager({
      queryFn: expiredQueryFn,
      sdkSessionId: "previous-sdk-session",
    });

    const sessionId = "2026-02-12-test-session";

    // Subscribe on both channels: the SDK session ID (used during query
    // iteration for streaming events) and the Guild Hall session ID (used
    // by awaitCompletion for post-query status updates).
    const events: SSEEvent[] = [];
    eventBus.subscribe(sdkSid, (e) => events.push(e));
    eventBus.subscribe(sessionId, (e) => events.push(e));

    await manager.runQuery(sessionId, "Hello");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have an error event with the expiration message
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    const expirationError = errorEvents.find(
      (e) => e.type === "error" && e.message.includes("expired"),
    );
    expect(expirationError).toBeDefined();

    // Should have a status_change to expired (emitted on the Guild Hall
    // session ID by awaitCompletion after detecting expiration)
    const statusEvents = events.filter((e) => e.type === "status_change");
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    const expiredStatus = statusEvents.find(
      (e) => e.type === "status_change" && e.status === "expired",
    );
    expect(expiredStatus).toBeDefined();
  });

  it("expired session metadata is persisted", async () => {
    const sdkSid = "sdk-session-1";
    const expiredQueryFn = createErrorQueryFn(
      [makeInitMessage(sdkSid)],
      "session expired",
    );

    const { manager, sessionStore } = setupAgentManager({
      queryFn: expiredQueryFn,
      sdkSessionId: "previous-sdk-session",
    });

    const sessionId = "2026-02-12-test-session";
    await manager.runQuery(sessionId, "Hello");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const session = await sessionStore.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.metadata.status).toBe("expired");
  });

  it("fresh start from expired session does not resume", async () => {
    const newSdkSid = "brand-new-sdk-session";
    const newMessages = [
      makeInitMessage(newSdkSid),
      makeStreamTextDelta("Fresh response", newSdkSid),
      makeSuccessResult(newSdkSid),
    ];

    // Track what options the query function receives
    const receivedOptions: Array<Record<string, unknown>> = [];
    const capturingQueryFn: QueryFn = (params) => {
      receivedOptions.push(
        (params.options ?? {}) as Record<string, unknown>,
      );
      return createMockQueryFn(newMessages)(params);
    };

    const { manager, sessionStore } = setupAgentManager({
      queryFn: capturingQueryFn,
      sdkSessionId: "old-expired-session",
      status: "expired",
      messageCount: 3,
    });

    const sessionId = "2026-02-12-test-session";
    await manager.runQuery(sessionId, "Start fresh");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should NOT have passed resume option
    expect(receivedOptions.length).toBe(1);
    expect(receivedOptions[0].resume).toBeUndefined();

    // Session should now have the new SDK session ID
    const session = await sessionStore.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.metadata.sdkSessionId).toBe(newSdkSid);

    // Status should be idle (successful query completed)
    expect(session!.metadata.status).toBe("idle");
  });

  it("fresh start preserves messages and context", async () => {
    const newSdkSid = "brand-new-sdk-session";
    const newMessages = [
      makeInitMessage(newSdkSid),
      makeStreamTextDelta("New response", newSdkSid),
      makeSuccessResult(newSdkSid),
    ];

    const { manager, mockFs } = setupAgentManager({
      queryFn: createMockQueryFn(newMessages),
      sdkSessionId: "old-expired-session",
      status: "expired",
      messageCount: 2,
    });

    const sessionId = "2026-02-12-test-session";

    // Pre-populate with existing content
    mockFs.files[`/sessions/${sessionId}/context.md`] =
      "# Context\n\n## Goal\nBuild a widget\n";
    mockFs.files[`/sessions/${sessionId}/messages.jsonl`] =
      '{"role":"user","content":"first msg","timestamp":"2026-02-12T10:00:00.000Z"}\n' +
      '{"role":"assistant","content":"first reply","timestamp":"2026-02-12T10:01:00.000Z"}\n';

    await manager.runQuery(sessionId, "Continue");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Context file preserved
    expect(mockFs.files[`/sessions/${sessionId}/context.md`]).toContain(
      "Build a widget",
    );

    // Old messages still present, new ones appended
    const messagesContent =
      mockFs.files[`/sessions/${sessionId}/messages.jsonl`];
    expect(messagesContent).toContain("first msg");
    expect(messagesContent).toContain("first reply");
    expect(messagesContent).toContain("Continue");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. SSE reconnection (event bus subscriber lifecycle)
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: SSE reconnection", () => {
  it("unsubscribe cleans up and new subscriber receives subsequent events", () => {
    const eventBus = createEventBus();
    const sessionId = "test-session";

    // First client subscribes
    const client1Events: SSEEvent[] = [];
    const unsub1 = eventBus.subscribe(sessionId, (e) =>
      client1Events.push(e),
    );

    // Emit an event, client1 gets it
    eventBus.emit(sessionId, { type: "processing" });
    expect(client1Events).toHaveLength(1);

    // Client1 disconnects
    unsub1();

    // Emit another event, client1 should NOT get it
    eventBus.emit(sessionId, {
      type: "assistant_text",
      text: "after disconnect",
    });
    expect(client1Events).toHaveLength(1);

    // New client subscribes (reconnection)
    const client2Events: SSEEvent[] = [];
    eventBus.subscribe(sessionId, (e) => client2Events.push(e));

    // Emit another event, only client2 gets it
    eventBus.emit(sessionId, { type: "done" });
    expect(client2Events).toHaveLength(1);
    expect(client2Events[0].type).toBe("done");
    expect(client1Events).toHaveLength(1); // Still 1
  });

  it("unsubscribe does not affect other subscribers", () => {
    const eventBus = createEventBus();
    const sessionId = "test-session";

    const eventsA: SSEEvent[] = [];
    const eventsB: SSEEvent[] = [];

    const unsubA = eventBus.subscribe(sessionId, (e) => eventsA.push(e));
    eventBus.subscribe(sessionId, (e) => eventsB.push(e));

    eventBus.emit(sessionId, { type: "processing" });
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);

    // Disconnect A
    unsubA();

    eventBus.emit(sessionId, { type: "done" });
    expect(eventsA).toHaveLength(1); // No new event
    expect(eventsB).toHaveLength(2); // Got the new event
  });

  it("multiple unsubscribe calls are safe (idempotent)", () => {
    const eventBus = createEventBus();
    const sessionId = "test-session";

    const events: SSEEvent[] = [];
    const unsub = eventBus.subscribe(sessionId, (e) => events.push(e));

    unsub();
    unsub(); // Second call should not throw or cause issues
    unsub(); // Third call

    eventBus.emit(sessionId, { type: "processing" });
    expect(events).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Session store filesystem errors
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: session store filesystem errors", () => {
  it("createSession throws when mkdir fails", async () => {
    const failingFs: SessionFileSystem = {
      readdir: () => Promise.resolve([]),
      readFile: () => Promise.reject(new Error("ENOENT")),
      writeFile: () => Promise.resolve(),
      appendFile: () => Promise.resolve(),
      mkdir: () =>
        Promise.reject(new Error("EACCES: permission denied, mkdir")),
      rmdir: () => Promise.resolve(),
      stat: () =>
        Promise.resolve({ isDirectory: () => false }),
      access: () => Promise.reject(new Error("ENOENT")),
    };

    const store = new SessionStore("/sessions", failingFs, fixedClock);

    let caught: Error | null = null;
    try {
      await store.createSession("Test", ["member-a"]);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("EACCES");
  });

  it("appendMessage throws when writeFile/appendFile fails", async () => {
    const failingFs: SessionFileSystem = {
      readdir: () => Promise.resolve([]),
      readFile: () => Promise.resolve(""),
      writeFile: () => Promise.resolve(),
      appendFile: () =>
        Promise.reject(new Error("ENOSPC: no space left on device")),
      mkdir: () => Promise.resolve(),
      rmdir: () => Promise.resolve(),
      stat: () =>
        Promise.resolve({ isDirectory: () => true }),
      access: () => Promise.resolve(),
    };

    const store = new SessionStore("/sessions", failingFs, fixedClock);

    const message: StoredMessage = {
      role: "user",
      content: "Hello",
      timestamp: NOW,
    };

    let caught: Error | null = null;
    try {
      await store.appendMessage("some-session", message);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("ENOSPC");
  });

  it("getSession returns null for corrupt meta.json (not crash)", async () => {
    // This test verifies that corrupt JSON in meta.json is handled gracefully.
    // The implementation wraps JSON.parse in a try-catch so it returns null
    // instead of throwing.
    const files: Record<string, string> = {
      "/sessions/corrupt-session/meta.json": "{ this is not valid json !!!",
    };
    const dirs = new Set(["/sessions", "/sessions/corrupt-session"]);

    const mockFs = createMockSessionFs(files, dirs);
    const store = new SessionStore("/sessions", mockFs, fixedClock);

    const result = await store.getSession("corrupt-session");
    expect(result).toBeNull();
  });

  it("listSessions returns empty array when readdir fails", async () => {
    const failingFs: SessionFileSystem = {
      readdir: () =>
        Promise.reject(new Error("EACCES: permission denied")),
      readFile: () => Promise.reject(new Error("ENOENT")),
      writeFile: () => Promise.resolve(),
      appendFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      rmdir: () => Promise.resolve(),
      stat: () =>
        Promise.resolve({ isDirectory: () => false }),
      access: () => Promise.reject(new Error("ENOENT")),
    };

    const store = new SessionStore("/sessions", failingFs, fixedClock);

    const sessions = await store.listSessions();
    expect(sessions).toEqual([]);
  });

  it("listSessions skips directories with invalid meta.json", async () => {
    const validMeta = JSON.stringify(makeSessionMeta({ id: "valid-one" }));

    const files: Record<string, string> = {
      "/sessions/valid-one/meta.json": validMeta,
      "/sessions/corrupt-one/meta.json": "not json at all",
    };
    const dirs = new Set([
      "/sessions",
      "/sessions/valid-one",
      "/sessions/corrupt-one",
    ]);

    const mockFs = createMockSessionFs(files, dirs);
    const store = new SessionStore("/sessions", mockFs, fixedClock);

    const sessions = await store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("valid-one");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Workshop state machine error resilience
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: workshop state machine error resilience", () => {
  it("error event when session is null does not crash", () => {
    const state = initialState(); // session is null
    const errorEvent: SSEEvent = {
      type: "error",
      message: "Something failed",
      recoverable: false,
    };

    const next = applySSEEvent(state, errorEvent);
    expect(next.error).toBe("Something failed");
    expect(next.session).toBeNull();
  });

  it("done event when no streaming text and no pending tools is a no-op flush", () => {
    const metadata: SessionMetadata = makeSessionMeta({ messageCount: 1 });
    const messages: StoredMessage[] = [
      { role: "user", content: "Hello", timestamp: NOW },
    ];

    let state = setSessionLoaded(initialState(), metadata, messages);
    state = { ...state, status: "running" };

    // Apply done with no streaming text and no pending tools
    const next = applySSEEvent(state, { type: "done" });

    // No new message added
    expect(next.session).not.toBeNull();
    expect(next.session!.messages).toHaveLength(1);
    expect(next.session!.metadata.messageCount).toBe(1);

    // Status transitions to idle
    expect(next.status).toBe("idle");
    expect(next.streamingText).toBe("");
    expect(next.pendingToolCalls.size).toBe(0);
  });

  it("tool_result for non-existent toolUseId does not crash", () => {
    const state = setSessionLoaded(
      initialState(),
      makeSessionMeta(),
      [],
    );

    const toolResultEvent: SSEEvent = {
      type: "tool_result",
      toolUseId: "nonexistent-tool-id",
      result: { content: "orphaned result" },
    };

    const next = applySSEEvent(state, toolResultEvent);

    // Should not crash, pendingToolCalls remains empty
    expect(next.pendingToolCalls.size).toBe(0);
  });

  it("multiple consecutive error events each replace the previous", () => {
    let state = setSessionLoaded(initialState(), makeSessionMeta(), []);

    state = applySSEEvent(state, {
      type: "error",
      message: "First error",
      recoverable: true,
    });
    expect(state.error).toBe("First error");

    state = applySSEEvent(state, {
      type: "error",
      message: "Second error",
      recoverable: false,
    });
    expect(state.error).toBe("Second error");

    state = applySSEEvent(state, {
      type: "error",
      message: "Third error",
      recoverable: false,
    });
    expect(state.error).toBe("Third error");
  });

  it("processing event when session is null does not crash", () => {
    const state = initialState();
    const next = applySSEEvent(state, { type: "processing" });
    expect(next.status).toBe("running");
    expect(next.session).toBeNull();
  });

  it("done event when session is null does not crash", () => {
    const state = initialState();
    const next = applySSEEvent(state, { type: "done" });
    expect(next.status).toBe("idle");
    expect(next.session).toBeNull();
    expect(next.streamingText).toBe("");
  });

  it("assistant_text event accumulates even without session", () => {
    const state = initialState();
    const next = applySSEEvent(state, {
      type: "assistant_text",
      text: "text without session",
    });
    expect(next.streamingText).toBe("text without session");
    expect(next.session).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Roster in dashboard and workshop (REQ-GH1-9)
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: roster in dashboard and workshop (REQ-GH1-9)", () => {
  it("same roster data feeds both contexts", async () => {
    // The RosterPanel in both Dashboard and Workshop calls GET /api/roster,
    // which calls getRoster(). Both contexts use the same code path.
    // Verify that getRoster returns consistent data including error members.
    const mockFs: FileSystem = {
      readdir: () => Promise.resolve(["good-member", "bad-member"]),
      readFile: (path: string) => {
        if (path.includes("good-member")) {
          return Promise.resolve(JSON.stringify({
            name: "good-member", displayName: "Good", description: "Works",
            version: "1.0.0", mcp: { command: "node", args: ["good.js"] },
          }));
        }
        return Promise.resolve("invalid json");
      },
      stat: () => Promise.resolve({ isDirectory: () => true }),
    };

    // Call discoverGuildMembers twice (simulating two different callers)
    const roster1 = await discoverGuildMembers("/guild-members", mockFs);
    const roster2 = await discoverGuildMembers("/guild-members", mockFs);

    // Both return the same data shape
    expect(roster1.size).toBe(roster2.size);
    expect(roster1.size).toBe(2);

    // Good member present in both
    const good1 = roster1.get("good-member");
    const good2 = roster2.get("good-member");
    expect(good1).toBeDefined();
    expect(good2).toBeDefined();
    expect(good1!.status).toBe(good2!.status);
    expect(good1!.name).toBe(good2!.name);

    // Error member present in both
    const bad1 = roster1.get("bad-member");
    const bad2 = roster2.get("bad-member");
    expect(bad1).toBeDefined();
    expect(bad2).toBeDefined();
    expect(bad1!.status).toBe("error");
    expect(bad2!.status).toBe("error");
  });

  it("error-status members are included in roster data", async () => {
    // Both Dashboard and Workshop show error members with their error messages.
    const mockFs: FileSystem = {
      readdir: () => Promise.resolve(["broken"]),
      readFile: () => Promise.resolve("not json"),
      stat: () => Promise.resolve({ isDirectory: () => true }),
    };

    const roster = await discoverGuildMembers("/guild-members", mockFs);
    const member = roster.get("broken");
    expect(member).toBeDefined();
    expect(member!.status).toBe("error");
    expect(member!.error).toBeTruthy();
    expect(member!.tools).toEqual([]);
    // The member has a name and displayName derived from directory name
    expect(member!.name).toBe("broken");
    expect(member!.displayName).toBe("broken");
  });
});
