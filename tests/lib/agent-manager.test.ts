import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { AgentManager, AgentManagerError, CONTEXT_FILE_PROMPT } from "@/lib/agent-manager";
import type { AgentManagerDeps } from "@/lib/agent-manager";
import { createEventBus } from "@/lib/agent";
import type { QueryFn } from "@/lib/agent";
import type { SSEEvent } from "@/lib/types";
import { SessionStore } from "@/lib/session-store";
import { MCPManager } from "@/lib/mcp-manager";
import type { MCPServerFactory, MCPServerHandle } from "@/lib/mcp-manager";
import type { GuildMember } from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";

// -- Constants --

const NOW = "2026-02-12T12:00:00.000Z";

function createMockProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return emitter as ChildProcess;
}

// -- Mock SDK message factories (duplicated from agent.test.ts for isolation) --

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
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
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

function makeAssistantMessage(
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "assistant",
    message: { content },
    uuid: "00000000-0000-0000-0000-000000000003",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeToolUseSummary(
  toolUseIds: string[],
  summary: string,
  sessionId = "sdk-session-1",
): SDKMessage {
  return {
    type: "tool_use_summary",
    preceding_tool_use_ids: toolUseIds,
    summary,
    uuid: "00000000-0000-0000-0000-000000000004",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

// -- Mock query function --

function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messages) {
        yield await Promise.resolve(msg);
      }
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

/**
 * Creates a mock query function that yields some messages then throws an error.
 * Useful for simulating expired session errors from the SDK.
 */
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
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

/**
 * Creates a capturing mock query function that records the options passed to each call.
 * Returns the captured calls and the query function.
 */
function createCapturingQueryFn(messages: SDKMessage[]): {
  queryFn: QueryFn;
  calls: Array<{ prompt: string; options: Record<string, unknown> }>;
} {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

  const queryFn: QueryFn = (params) => {
    calls.push({
      prompt: params.prompt,
      options: (params.options ?? {}) as Record<string, unknown>,
    });
    return createMockQueryFn(messages)(params);
  };

  return { queryFn, calls };
}

// -- Helpers for building test dependencies --

function makeGuildMember(name: string): GuildMember {
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
  };
}

type TestSetup = {
  manager: AgentManager;
  deps: AgentManagerDeps;
  fs: ReturnType<typeof createMockSessionFs>;
  sessionStore: SessionStore;
};

function setup(options: {
  sdkSessionId?: string | null;
  messages?: SDKMessage[];
  clockTime?: string;
  status?: string;
  messageCount?: number;
} = {}): TestSetup {
  const sdkSessionId: string | null = options.sdkSessionId !== undefined ? options.sdkSessionId : null;
  const sdkSid = "sdk-session-1";
  const messages = options.messages ?? [
    makeInitMessage(sdkSid),
    makeStreamTextDelta("Hello", sdkSid),
    makeSuccessResult(sdkSid),
  ];
  const clockTime = options.clockTime ?? NOW;
  const status = options.status ?? "idle";
  const messageCount = options.messageCount ?? 0;

  // Session filesystem
  const meta = {
    id: "2026-02-12-test-session",
    name: "Test Session",
    status,
    guildMembers: ["alpha"],
    sdkSessionId,
    createdAt: "2026-02-12T10:00:00.000Z",
    lastActivityAt: "2026-02-12T10:00:00.000Z",
    messageCount,
  };

  const files: Record<string, string> = {
    "/sessions/2026-02-12-test-session/meta.json": JSON.stringify(meta, null, 2),
    "/sessions/2026-02-12-test-session/messages.jsonl": "",
    "/sessions/2026-02-12-test-session/context.md": "# Context",
  };
  const dirs = new Set([
    "/sessions",
    "/sessions/2026-02-12-test-session",
    "/sessions/2026-02-12-test-session/artifacts",
  ]);

  const mockFs = createMockSessionFs(files, dirs);
  const sessionStore = new SessionStore("/sessions", mockFs, () => new Date(clockTime));

  const roster = new Map<string, GuildMember>([
    ["alpha", makeGuildMember("alpha")],
  ]);

  const mcpManager = new MCPManager(roster, createMockMcpFactory());
  const eventBus = createEventBus();
  const queryFn = createMockQueryFn(messages);
  const clock = () => new Date(clockTime);

  const deps: AgentManagerDeps = {
    queryFn,
    sessionStore,
    mcpManager,
    eventBus,
    clock,
    sessionsDir: "/sessions",
  };

  const manager = new AgentManager(deps);

  return { manager, deps, fs: mockFs, sessionStore };
}

// -- Tests --

describe("AgentManager", () => {
  describe("runQuery", () => {
    it("runs a query and emits events through the event bus", async () => {
      const { manager, deps } = setup();
      const sessionId = "2026-02-12-test-session";

      const events: SSEEvent[] = [];
      deps.eventBus.subscribe(sessionId, (e) => events.push(e));

      await manager.runQuery(sessionId, "Hello agent");

      // Wait for the background iteration to complete
      // Give it a tick to finish
      await new Promise((resolve) => setTimeout(resolve, 50));

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("processing");
      expect(eventTypes).toContain("assistant_text");
      expect(eventTypes).toContain("done");
    });

    it("updates session status to running then back to idle", async () => {
      const { manager, sessionStore } = setup();
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello agent");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.metadata.status).toBe("idle");  
    });

    it("stores the user message in messages.jsonl", async () => {
      const { manager, fs: mockFs } = setup();
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello agent");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messagesContent = mockFs.files[`/sessions/${sessionId}/messages.jsonl`];
      expect(messagesContent).toBeDefined();
      expect(messagesContent).toContain("Hello agent");

      const lines = messagesContent.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const userMsg = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(userMsg.role).toBe("user");
      expect(userMsg.content).toBe("Hello agent");
    });

    it("stores the assistant response in messages.jsonl after query completes", async () => {
      const { manager, fs: mockFs } = setup();
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello agent");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messagesContent = mockFs.files[`/sessions/${sessionId}/messages.jsonl`];
      const lines = messagesContent.trim().split("\n").filter(Boolean);

      // Should have at least 2 lines: user message + assistant message
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const assistantMsg = JSON.parse(lines[1]) as Record<string, unknown>;
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.content).toContain("Hello");
    });

    it("stores tool use messages in messages.jsonl", async () => {
      const sdkSid = "sdk-session-1";
      const { manager, fs: mockFs } = setup({
        messages: [
          makeInitMessage(sdkSid),
          makeAssistantMessage([
            { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "/foo.txt" } },
          ], sdkSid),
          makeToolUseSummary(["tool-1"], "Read file successfully", sdkSid),
          makeStreamTextDelta("Done reading.", sdkSid),
          makeSuccessResult(sdkSid),
        ],
      });
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Read a file");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messagesContent = mockFs.files[`/sessions/${sessionId}/messages.jsonl`];
      const lines = messagesContent.trim().split("\n").filter(Boolean);

      // user message + assistant text + tool message = at least 3
      expect(lines.length).toBeGreaterThanOrEqual(3);

      // Find the tool message
      const messages = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      const toolMsg = messages.find((m) => m.toolName === "read_file");
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.role).toBe("assistant");
      expect(toolMsg!.toolInput).toEqual({ path: "/foo.txt" });
    });

    it("updates sdkSessionId in metadata after capturing from SDK", async () => {
      const { manager, sessionStore } = setup({ sdkSessionId: null });
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.metadata.sdkSessionId).toBe("sdk-session-1");  
    });

    it("increments messageCount after query completes", async () => {
      const { manager, sessionStore } = setup();
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session!.metadata.messageCount).toBe(1);  
    });

    it("throws 404 for nonexistent session", async () => {
      const { manager } = setup();

      let caught: AgentManagerError | null = null;
      try {
        await manager.runQuery("nonexistent-session", "Hello");
      } catch (err) {
        caught = err as AgentManagerError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.statusCode).toBe(404);  
      expect(caught!.message).toContain("not found");  
    });

    it("throws 409 when a query is already running", async () => {
      // Use a query that takes time (never yields result)
      const neverEndMessages = [makeInitMessage("sdk-session-1")];

      // Create a query function that yields init then hangs
      const hangingQueryFn: QueryFn = () => {
        async function* generator() {
          yield neverEndMessages[0];
          // Never return, simulating a long-running query
          await new Promise(() => {});
        }
        const gen = generator();
        (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
        (gen as unknown as Record<string, unknown>).close = () => {};
        return gen as ReturnType<QueryFn>;
      };

      const { deps } = setup();
      // Override queryFn with the hanging one
      (deps as { queryFn: QueryFn }).queryFn = hangingQueryFn;
      // Create a new manager with the updated deps
      const hangingManager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";

      // Start first query (will hang)
      await hangingManager.runQuery(sessionId, "First");

      // Try to start second query
      let caught: AgentManagerError | null = null;
      try {
        await hangingManager.runQuery(sessionId, "Second");
      } catch (err) {
        caught = err as AgentManagerError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.statusCode).toBe(409);  
      expect(caught!.message).toContain("already running");  
    });
  });

  describe("isQueryRunning", () => {
    it("returns false when no query is running", () => {
      const { manager } = setup();
      expect(manager.isQueryRunning("2026-02-12-test-session")).toBe(false);
    });

    it("returns true when a query is running", async () => {
      // Use a query that hangs
      const hangingQueryFn: QueryFn = () => {
        async function* generator() {
          yield makeInitMessage("sdk-session-1");
          await new Promise(() => {});
        }
        const gen = generator();
        (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
        (gen as unknown as Record<string, unknown>).close = () => {};
        return gen as ReturnType<QueryFn>;
      };

      const { deps } = setup();
      (deps as { queryFn: QueryFn }).queryFn = hangingQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");

      expect(manager.isQueryRunning(sessionId)).toBe(true);
    });

    it("returns false after query completes", async () => {
      const { manager } = setup();
      const sessionId = "2026-02-12-test-session";

      await manager.runQuery(sessionId, "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.isQueryRunning(sessionId)).toBe(false);
    });
  });

  describe("stopQuery", () => {
    it("aborts the controller for a running query", async () => {
      let abortSignal: AbortSignal | null = null;

      const captureQueryFn: QueryFn = (params) => {
        const ac = (params.options as Record<string, unknown>)?.abortController as AbortController;
        if (ac) abortSignal = ac.signal;
        async function* generator() {
          yield makeInitMessage("sdk-session-1");
          await new Promise(() => {});
        }
        const gen = generator();
        (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
        (gen as unknown as Record<string, unknown>).close = () => {};
        return gen as ReturnType<QueryFn>;
      };

      const { deps } = setup();
      (deps as { queryFn: QueryFn }).queryFn = captureQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");

      expect(abortSignal).not.toBeNull();
      expect(abortSignal!.aborted).toBe(false);  

      manager.stopQuery(sessionId);

      expect(abortSignal!.aborted).toBe(true);  
    });

    it("is a no-op for a session with no running query", () => {
      const { manager } = setup();
      // Should not throw
      manager.stopQuery("nonexistent");
    });
  });

  describe("system prompt", () => {
    it("includes context file instructions", () => {
      expect(CONTEXT_FILE_PROMPT).toContain("context.md");
      expect(CONTEXT_FILE_PROMPT).toContain("Goal");
      expect(CONTEXT_FILE_PROMPT).toContain("Decisions");
      expect(CONTEXT_FILE_PROMPT).toContain("In Progress");
      expect(CONTEXT_FILE_PROMPT).toContain("Resources");
    });

    it("passes system prompt to SDK query", async () => {
      let receivedPrompt = "";

      const captureQueryFn: QueryFn = (params) => {
        receivedPrompt = (params.options as Record<string, unknown>)?.systemPrompt as string ?? "";
        return createMockQueryFn([
          makeInitMessage(),
          makeSuccessResult(),
        ])({ prompt: params.prompt, options: params.options });
      };

      const { deps } = setup();
      (deps as { queryFn: QueryFn }).queryFn = captureQueryFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedPrompt).toContain("context.md");
    });
  });

  describe("session resume", () => {
    it("passes resume option when session has sdkSessionId and is not expired", async () => {
      const sdkSid = "sdk-session-1";
      const { queryFn: capturingFn, calls } = createCapturingQueryFn([
        makeInitMessage(sdkSid),
        makeSuccessResult(sdkSid),
      ]);

      const { deps } = setup({ sdkSessionId: "previous-sdk-session" });
      (deps as { queryFn: QueryFn }).queryFn = capturingFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Continue work");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.length).toBe(1);
      expect(calls[0].options.resume).toBe("previous-sdk-session");
    });

    it("does not pass resume option when session has no sdkSessionId", async () => {
      const sdkSid = "sdk-session-1";
      const { queryFn: capturingFn, calls } = createCapturingQueryFn([
        makeInitMessage(sdkSid),
        makeSuccessResult(sdkSid),
      ]);

      const { deps } = setup({ sdkSessionId: null });
      (deps as { queryFn: QueryFn }).queryFn = capturingFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.length).toBe(1);
      expect(calls[0].options.resume).toBeUndefined();
    });

    it("starts MCP servers before the resume query", async () => {
      const sdkSid = "sdk-session-1";
      const orderLog: string[] = [];

      // Track MCP server spawn order
      const trackingFactory: MCPServerFactory = {
        spawn() {
          orderLog.push("mcp-started");
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
      };

      const trackingQueryFn: QueryFn = (params) => {
        orderLog.push("query-started");
        return createMockQueryFn([
          makeInitMessage(sdkSid),
          makeSuccessResult(sdkSid),
        ])(params);
      };

      const { deps } = setup({ sdkSessionId: "previous-sdk-session" });

      // Replace factory and queryFn with tracking versions
      const roster = new Map<string, GuildMember>([
        ["alpha", makeGuildMember("alpha")],
      ]);
      (deps as { mcpManager: MCPManager }).mcpManager = new MCPManager(roster, trackingFactory);
      (deps as { queryFn: QueryFn }).queryFn = trackingQueryFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Resume");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(orderLog.indexOf("mcp-started")).toBeLessThan(orderLog.indexOf("query-started"));
    });

    it("resume vs fresh start decision is based on sdkSessionId AND status", async () => {
      // Case: sdkSessionId exists but status is "expired" => fresh start
      const sdkSid = "sdk-session-new";
      const { queryFn: capturingFn, calls } = createCapturingQueryFn([
        makeInitMessage(sdkSid),
        makeSuccessResult(sdkSid),
      ]);

      const { deps } = setup({
        sdkSessionId: "old-sdk-session",
        status: "expired",
      });
      (deps as { queryFn: QueryFn }).queryFn = capturingFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Fresh start");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.length).toBe(1);
      // Should NOT pass resume because status is "expired"
      expect(calls[0].options.resume).toBeUndefined();
    });
  });

  describe("expired session detection", () => {
    it("sets status to expired when query fails with session expired error", async () => {
      const sdkSid = "sdk-session-1";
      const expiredQueryFn = createErrorQueryFn(
        [makeInitMessage(sdkSid)],
        "The session has expired and cannot be resumed",
      );

      const { deps, sessionStore } = setup({ sdkSessionId: "previous-sdk-session" });
      (deps as { queryFn: QueryFn }).queryFn = expiredQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.metadata.status).toBe("expired");
    });

    it("persists expired status in meta.json", async () => {
      const sdkSid = "sdk-session-1";
      const expiredQueryFn = createErrorQueryFn(
        [makeInitMessage(sdkSid)],
        "session expired",
      );

      const { deps, fs: mockFs } = setup({ sdkSessionId: "previous-sdk-session" });
      (deps as { queryFn: QueryFn }).queryFn = expiredQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const metaJson = JSON.parse(mockFs.files[`/sessions/${sessionId}/meta.json`]) as Record<string, unknown>;
      expect(metaJson.status).toBe("expired");
    });

    it("detects session not found errors as expiration", async () => {
      const sdkSid = "sdk-session-1";
      const expiredQueryFn = createErrorQueryFn(
        [makeInitMessage(sdkSid)],
        "Error: session not found for the given ID",
      );

      const { deps, sessionStore } = setup({ sdkSessionId: "previous-sdk-session" });
      (deps as { queryFn: QueryFn }).queryFn = expiredQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session!.metadata.status).toBe("expired");
    });

    it("does not set expired status for non-session errors", async () => {
      const sdkSid = "sdk-session-1";
      const regularErrorQueryFn = createErrorQueryFn(
        [makeInitMessage(sdkSid)],
        "Network timeout: connection refused",
      );

      const { deps, sessionStore } = setup({ sdkSessionId: "previous-sdk-session" });
      (deps as { queryFn: QueryFn }).queryFn = regularErrorQueryFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Hello");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session!.metadata.status).toBe("idle");
    });
  });

  describe("fresh start from expired session", () => {
    it("starts a new query without resume for expired sessions", async () => {
      const sdkSid = "sdk-session-new";
      const { queryFn: capturingFn, calls } = createCapturingQueryFn([
        makeInitMessage(sdkSid),
        makeStreamTextDelta("Fresh response", sdkSid),
        makeSuccessResult(sdkSid),
      ]);

      const { deps } = setup({
        sdkSessionId: "old-expired-session",
        status: "expired",
        messageCount: 3,
      });
      (deps as { queryFn: QueryFn }).queryFn = capturingFn;
      const manager = new AgentManager(deps);

      await manager.runQuery("2026-02-12-test-session", "Start fresh");
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.length).toBe(1);
      expect(calls[0].options.resume).toBeUndefined();
    });

    it("preserves context.md and messages.jsonl on fresh start", async () => {
      const sdkSid = "sdk-session-new";

      const { deps, fs: mockFs } = setup({
        sdkSessionId: "old-expired-session",
        status: "expired",
        messageCount: 2,
      });

      // Pre-populate context and messages to verify they survive
      const sessionId = "2026-02-12-test-session";
      mockFs.files[`/sessions/${sessionId}/context.md`] = "# Context\n\n## Goal\nBuild the thing\n";
      mockFs.files[`/sessions/${sessionId}/messages.jsonl`] =
        '{"role":"user","content":"first message","timestamp":"2026-02-12T10:00:00.000Z"}\n' +
        '{"role":"assistant","content":"first response","timestamp":"2026-02-12T10:01:00.000Z"}\n';

      const newMessages = [
        makeInitMessage(sdkSid),
        makeStreamTextDelta("Fresh response", sdkSid),
        makeSuccessResult(sdkSid),
      ];
      (deps as { queryFn: QueryFn }).queryFn = createMockQueryFn(newMessages);
      const manager = new AgentManager(deps);

      await manager.runQuery(sessionId, "Continue from expired");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // context.md should still contain the original content
      expect(mockFs.files[`/sessions/${sessionId}/context.md`]).toContain("Build the thing");

      // messages.jsonl should contain the old messages plus the new ones
      const messagesContent = mockFs.files[`/sessions/${sessionId}/messages.jsonl`];
      expect(messagesContent).toContain("first message");
      expect(messagesContent).toContain("first response");
      expect(messagesContent).toContain("Continue from expired");
      expect(messagesContent).toContain("Fresh response");
    });

    it("stores new SDK session ID after fresh start", async () => {
      const newSdkSid = "brand-new-sdk-session";
      const newMessages = [
        makeInitMessage(newSdkSid),
        makeSuccessResult(newSdkSid),
      ];

      const { deps, sessionStore } = setup({
        sdkSessionId: "old-expired-session",
        status: "expired",
      });
      (deps as { queryFn: QueryFn }).queryFn = createMockQueryFn(newMessages);
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Fresh start");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.metadata.sdkSessionId).toBe(newSdkSid);
    });

    it("transitions from expired to idle after successful fresh start", async () => {
      const sdkSid = "sdk-session-new";
      const newMessages = [
        makeInitMessage(sdkSid),
        makeSuccessResult(sdkSid),
      ];

      const { deps, sessionStore } = setup({
        sdkSessionId: "old-expired-session",
        status: "expired",
      });
      (deps as { queryFn: QueryFn }).queryFn = createMockQueryFn(newMessages);
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";
      await manager.runQuery(sessionId, "Fresh start");
      await new Promise((resolve) => setTimeout(resolve, 50));

      const session = await sessionStore.getSession(sessionId);
      expect(session!.metadata.status).toBe("idle");
    });
  });
});

describe("AgentManagerError", () => {
  it("stores status code", () => {
    const err = new AgentManagerError("Not found", 404);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("AgentManagerError");
  });

  it("is an instance of Error", () => {
    const err = new AgentManagerError("Conflict", 409);
    expect(err instanceof Error).toBe(true);
  });
});
