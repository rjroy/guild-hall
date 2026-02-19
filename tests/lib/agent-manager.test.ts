import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { AgentManager, AgentManagerError, CONTEXT_FILE_PROMPT, buildSystemPrompt, buildWorkerDispatchPrompt } from "@/lib/agent-manager";
import type { AgentManagerDeps } from "@/lib/agent-manager";
import { createEventBus } from "@/lib/agent";
import type { QueryFn } from "@/lib/agent";
import type { SSEEvent } from "@/lib/types";
import { SessionStore } from "@/lib/session-store";
import { MCPManager } from "@/lib/mcp-manager";
import type { MCPServerFactory } from "@/lib/mcp-manager";
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

function makeGuildMember(name: string, options?: { capabilities?: string[]; description?: string }): GuildMember {
  return {
    name,
    displayName: name,
    description: options?.description ?? `The ${name} member`,
    version: "1.0.0",
    transport: "http",
    capabilities: options?.capabilities,
    mcp: { command: "node", args: [`${name}.js`] },
    status: "disconnected",
    tools: [],
    pluginDir: `/test/${name}`,
  };
}

function makePluginMember(name: string, options?: { description?: string }): GuildMember {
  return {
    name,
    displayName: name,
    description: options?.description ?? `The ${name} member`,
    version: "1.0.0",
    capabilities: [],
    status: "available",
    tools: [],
    pluginDir: `/test/${name}`,
    pluginPath: `/test/${name}/plugin`,
    memberType: "plugin",
  };
}

function makeHybridMember(name: string, options?: { description?: string }): GuildMember {
  return {
    name,
    displayName: name,
    description: options?.description ?? `The ${name} member`,
    version: "1.0.0",
    transport: "http",
    capabilities: [],
    mcp: { command: "node", args: [`${name}.js`] },
    status: "disconnected",
    tools: [],
    pluginDir: `/test/${name}`,
    pluginPath: `/test/${name}/plugin`,
    memberType: "hybrid",
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
    roster,
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

  describe("MCP config ordering", () => {
    it("passes MCP server configs to SDK even after servers were released by a previous query", async () => {
      // This test catches a bug where getServerConfigs() was called before
      // startServersForSession(). After the first query released its servers,
      // getServerConfigs() would return empty configs because the servers
      // were disconnected, even though startServersForSession() would
      // immediately respawn them.
      const sdkSid = "sdk-session-1";
      const messages = [
        makeInitMessage(sdkSid),
        makeStreamTextDelta("Hello", sdkSid),
        makeSuccessResult(sdkSid),
      ];

      const { queryFn: capturingFn, calls } = createCapturingQueryFn(messages);

      const { deps } = setup({ sdkSessionId: null });
      (deps as { queryFn: QueryFn }).queryFn = capturingFn;
      const manager = new AgentManager(deps);

      const sessionId = "2026-02-12-test-session";

      // First query: servers start, query runs, servers release on completion
      await manager.runQuery(sessionId, "First message");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second query: servers must be restarted and configs must reflect them
      await manager.runQuery(sessionId, "Second message");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both calls should have received MCP server configs
      expect(calls).toHaveLength(2);

      const firstMcp = calls[0].options.mcpServers as Record<string, unknown>;
      const secondMcp = calls[1].options.mcpServers as Record<string, unknown>;

      expect(Object.keys(firstMcp)).toContain("alpha");
      expect(Object.keys(secondMcp)).toContain("alpha");
    });
  });
});

describe("buildWorkerDispatchPrompt", () => {
  it("returns empty string when no workers are provided", () => {
    expect(buildWorkerDispatchPrompt([])).toBe("");
  });

  it("includes worker name and dispatch server name", () => {
    const prompt = buildWorkerDispatchPrompt([
      { name: "researcher", description: "Research agent" },
    ]);

    expect(prompt).toContain("researcher");
    expect(prompt).toContain("researcher-dispatch");
    expect(prompt).toContain("Research agent");
  });

  it("lists multiple workers", () => {
    const prompt = buildWorkerDispatchPrompt([
      { name: "researcher", description: "Research agent" },
      { name: "writer", description: "Writing agent" },
    ]);

    expect(prompt).toContain("researcher (via researcher-dispatch)");
    expect(prompt).toContain("writer (via writer-dispatch)");
  });

  it("includes workflow guidance (dispatch, status, result)", () => {
    const prompt = buildWorkerDispatchPrompt([
      { name: "researcher", description: "Research agent" },
    ]);

    expect(prompt).toContain("`dispatch`");
    expect(prompt).toContain("`status`");
    expect(prompt).toContain("`result`");
  });

  it("lists all available dispatch tools", () => {
    const prompt = buildWorkerDispatchPrompt([
      { name: "researcher", description: "Research agent" },
    ]);

    expect(prompt).toContain("dispatch");
    expect(prompt).toContain("list");
    expect(prompt).toContain("status");
    expect(prompt).toContain("result");
    expect(prompt).toContain("cancel");
    expect(prompt).toContain("delete");
  });

  it("mentions relaying questions to the user", () => {
    const prompt = buildWorkerDispatchPrompt([
      { name: "researcher", description: "Research agent" },
    ]);

    expect(prompt).toContain("questions");
    expect(prompt).toContain("relay");
  });
});

describe("buildSystemPrompt", () => {
  it("includes context file instructions regardless of workers", () => {
    const withWorkers = buildSystemPrompt([
      { name: "researcher", description: "Research agent" },
    ]);
    const withoutWorkers = buildSystemPrompt([]);

    expect(withWorkers).toContain("context.md");
    expect(withoutWorkers).toContain("context.md");
  });

  it("includes worker guidance when workers are present", () => {
    const prompt = buildSystemPrompt([
      { name: "researcher", description: "Research agent" },
    ]);

    expect(prompt).toContain("Worker Dispatch");
    expect(prompt).toContain("researcher-dispatch");
  });

  it("omits worker guidance when no workers are present", () => {
    const prompt = buildSystemPrompt([]);

    expect(prompt).not.toContain("Worker Dispatch");
    expect(prompt).not.toContain("-dispatch");
  });

  it("equals CONTEXT_FILE_PROMPT when no workers present", () => {
    expect(buildSystemPrompt([])).toBe(CONTEXT_FILE_PROMPT);
  });
});

describe("MCPManager.getWorkerCapableMembers", () => {
  it("returns members with 'worker' capability", () => {
    const roster = new Map<string, GuildMember>([
      ["researcher", makeGuildMember("researcher", { capabilities: ["worker"], description: "Research agent" })],
      ["example", makeGuildMember("example")],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    const workers = mcpManager.getWorkerCapableMembers(["researcher", "example"]);

    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("researcher");
  });

  it("returns empty array when no members have worker capability", () => {
    const roster = new Map<string, GuildMember>([
      ["example", makeGuildMember("example")],
      ["tools", makeGuildMember("tools", { capabilities: ["search"] })],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    const workers = mcpManager.getWorkerCapableMembers(["example", "tools"]);

    expect(workers).toHaveLength(0);
  });

  it("only checks members in the provided names list", () => {
    const roster = new Map<string, GuildMember>([
      ["researcher", makeGuildMember("researcher", { capabilities: ["worker"] })],
      ["example", makeGuildMember("example")],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    // Only ask about "example", not "researcher"
    const workers = mcpManager.getWorkerCapableMembers(["example"]);

    expect(workers).toHaveLength(0);
  });

  it("handles members with multiple capabilities", () => {
    const roster = new Map<string, GuildMember>([
      ["multi", makeGuildMember("multi", { capabilities: ["search", "worker", "summarize"] })],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    const workers = mcpManager.getWorkerCapableMembers(["multi"]);

    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("multi");
  });

  it("skips member names not in the roster", () => {
    const roster = new Map<string, GuildMember>([
      ["example", makeGuildMember("example")],
    ]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    const workers = mcpManager.getWorkerCapableMembers(["nonexistent"]);

    expect(workers).toHaveLength(0);
  });

  it("handles members with no capabilities field", () => {
    const member = makeGuildMember("bare");
    // Ensure no capabilities field at all
    delete (member as Record<string, unknown>).capabilities;

    const roster = new Map<string, GuildMember>([["bare", member]]);
    const mcpManager = new MCPManager(roster, createMockMcpFactory());

    const workers = mcpManager.getWorkerCapableMembers(["bare"]);

    expect(workers).toHaveLength(0);
  });
});

describe("AgentManager worker dispatch prompt integration", () => {
  it("passes system prompt with worker guidance when worker-capable plugins exist", async () => {
    let receivedPrompt = "";

    const captureQueryFn: QueryFn = (params) => {
      receivedPrompt = (params.options as Record<string, unknown>)?.systemPrompt as string ?? "";
      return createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult(),
      ])({ prompt: params.prompt, options: params.options });
    };

    // Build roster with a worker-capable member
    const roster = new Map<string, GuildMember>([
      ["researcher", makeGuildMember("researcher", { capabilities: ["worker"], description: "Research agent" })],
    ]);

    const mockFs = createMockSessionFs(
      {
        "/sessions/2026-02-12-test-session/meta.json": JSON.stringify({
          id: "2026-02-12-test-session",
          name: "Test Session",
          status: "idle",
          guildMembers: ["researcher"],
          sdkSessionId: null,
          createdAt: "2026-02-12T10:00:00.000Z",
          lastActivityAt: "2026-02-12T10:00:00.000Z",
          messageCount: 0,
        }, null, 2),
        "/sessions/2026-02-12-test-session/messages.jsonl": "",
        "/sessions/2026-02-12-test-session/context.md": "# Context",
      },
      new Set([
        "/sessions",
        "/sessions/2026-02-12-test-session",
        "/sessions/2026-02-12-test-session/artifacts",
      ]),
    );
    const sessionStore = new SessionStore("/sessions", mockFs, () => new Date(NOW));
    const mcpManager = new MCPManager(roster, createMockMcpFactory());
    const eventBus = createEventBus();

    const deps: AgentManagerDeps = {
      queryFn: captureQueryFn,
      sessionStore,
      mcpManager,
      eventBus,
      clock: () => new Date(NOW),
      sessionsDir: "/sessions",
      roster,
    };

    const manager = new AgentManager(deps);
    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedPrompt).toContain("context.md");
    expect(receivedPrompt).toContain("Worker Dispatch");
    expect(receivedPrompt).toContain("researcher-dispatch");
    expect(receivedPrompt).toContain("Research agent");
  });

  it("passes system prompt without worker guidance when no worker-capable plugins exist", async () => {
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
    expect(receivedPrompt).not.toContain("Worker Dispatch");
    expect(receivedPrompt).not.toContain("-dispatch");
  });

  it("references correct dispatch server name format for each worker", async () => {
    let receivedPrompt = "";

    const captureQueryFn: QueryFn = (params) => {
      receivedPrompt = (params.options as Record<string, unknown>)?.systemPrompt as string ?? "";
      return createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult(),
      ])({ prompt: params.prompt, options: params.options });
    };

    const roster = new Map<string, GuildMember>([
      ["researcher", makeGuildMember("researcher", { capabilities: ["worker"], description: "Research agent" })],
      ["writer", makeGuildMember("writer", { capabilities: ["worker"], description: "Writing agent" })],
    ]);

    const mockFs = createMockSessionFs(
      {
        "/sessions/2026-02-12-test-session/meta.json": JSON.stringify({
          id: "2026-02-12-test-session",
          name: "Test Session",
          status: "idle",
          guildMembers: ["researcher", "writer"],
          sdkSessionId: null,
          createdAt: "2026-02-12T10:00:00.000Z",
          lastActivityAt: "2026-02-12T10:00:00.000Z",
          messageCount: 0,
        }, null, 2),
        "/sessions/2026-02-12-test-session/messages.jsonl": "",
        "/sessions/2026-02-12-test-session/context.md": "# Context",
      },
      new Set([
        "/sessions",
        "/sessions/2026-02-12-test-session",
        "/sessions/2026-02-12-test-session/artifacts",
      ]),
    );
    const sessionStore = new SessionStore("/sessions", mockFs, () => new Date(NOW));
    const mcpManager = new MCPManager(roster, createMockMcpFactory());
    const eventBus = createEventBus();

    const deps: AgentManagerDeps = {
      queryFn: captureQueryFn,
      sessionStore,
      mcpManager,
      eventBus,
      clock: () => new Date(NOW),
      sessionsDir: "/sessions",
      roster,
    };

    const manager = new AgentManager(deps);
    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedPrompt).toContain("researcher (via researcher-dispatch)");
    expect(receivedPrompt).toContain("writer (via writer-dispatch)");
  });
});

describe("AgentManager plugin member integration", () => {
  function setupWithRoster(options: {
    roster: Map<string, GuildMember>;
    guildMembers: string[];
    messages?: SDKMessage[];
  }) {
    const sdkSid = "sdk-session-1";
    const messages = options.messages ?? [
      makeInitMessage(sdkSid),
      makeStreamTextDelta("Hello", sdkSid),
      makeSuccessResult(sdkSid),
    ];

    const { queryFn: capturingFn, calls } = createCapturingQueryFn(messages);

    const meta = {
      id: "2026-02-12-test-session",
      name: "Test Session",
      status: "idle",
      guildMembers: options.guildMembers,
      sdkSessionId: null,
      createdAt: "2026-02-12T10:00:00.000Z",
      lastActivityAt: "2026-02-12T10:00:00.000Z",
      messageCount: 0,
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
    const sessionStore = new SessionStore("/sessions", mockFs, () => new Date(NOW));
    const mcpManager = new MCPManager(options.roster, createMockMcpFactory());
    const eventBus = createEventBus();

    const deps: AgentManagerDeps = {
      queryFn: capturingFn,
      sessionStore,
      mcpManager,
      eventBus,
      clock: () => new Date(NOW),
      sessionsDir: "/sessions",
      roster: options.roster,
    };

    const manager = new AgentManager(deps);

    return { manager, calls, mcpManager };
  }

  it("passes plugins array for plugin-only members", async () => {
    const roster = new Map<string, GuildMember>([
      ["plugin-a", makePluginMember("plugin-a")],
    ]);

    const { manager, calls } = setupWithRoster({
      roster,
      guildMembers: ["plugin-a"],
    });

    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(1);
    const sdkPlugins = calls[0].options.plugins as Array<{ type: string; path: string }>;
    expect(sdkPlugins).toEqual([
      { type: "local", path: "/test/plugin-a/plugin" },
    ]);
  });

  it("hybrid member appears in both MCP configs and plugins array", async () => {
    const roster = new Map<string, GuildMember>([
      ["hybrid-a", makeHybridMember("hybrid-a")],
    ]);

    const { manager, calls } = setupWithRoster({
      roster,
      guildMembers: ["hybrid-a"],
    });

    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(1);

    // Should have MCP server config for hybrid member
    const mcpServers = calls[0].options.mcpServers as Record<string, unknown>;
    expect(Object.keys(mcpServers)).toContain("hybrid-a");

    // Should also have plugin entry for hybrid member
    const sdkPlugins = calls[0].options.plugins as Array<{ type: string; path: string }>;
    expect(sdkPlugins).toEqual([
      { type: "local", path: "/test/hybrid-a/plugin" },
    ]);
  });

  it("MCPManager receives only MCP member names, not plugin-only names", async () => {
    const roster = new Map<string, GuildMember>([
      ["mcp-only", makeGuildMember("mcp-only")],
      ["plugin-only", makePluginMember("plugin-only")],
    ]);

    const { manager, calls } = setupWithRoster({
      roster,
      guildMembers: ["mcp-only", "plugin-only"],
    });

    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(1);

    // MCP server config should contain mcp-only but NOT plugin-only
    const mcpServers = calls[0].options.mcpServers as Record<string, unknown>;
    expect(Object.keys(mcpServers)).toContain("mcp-only");
    expect(Object.keys(mcpServers)).not.toContain("plugin-only");

    // Plugins should contain plugin-only
    const sdkPlugins = calls[0].options.plugins as Array<{ type: string; path: string }>;
    expect(sdkPlugins).toEqual([
      { type: "local", path: "/test/plugin-only/plugin" },
    ]);
  });

  it("does not pass plugins when no plugin members exist", async () => {
    const roster = new Map<string, GuildMember>([
      ["mcp-only", makeGuildMember("mcp-only")],
    ]);

    const { manager, calls } = setupWithRoster({
      roster,
      guildMembers: ["mcp-only"],
    });

    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(1);
    expect(calls[0].options.plugins).toBeUndefined();
  });

  it("handles mix of MCP, plugin, and hybrid members", async () => {
    const roster = new Map<string, GuildMember>([
      ["mcp-a", makeGuildMember("mcp-a")],
      ["plugin-b", makePluginMember("plugin-b")],
      ["hybrid-c", makeHybridMember("hybrid-c")],
    ]);

    const { manager, calls } = setupWithRoster({
      roster,
      guildMembers: ["mcp-a", "plugin-b", "hybrid-c"],
    });

    await manager.runQuery("2026-02-12-test-session", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(1);

    // MCP configs: mcp-a and hybrid-c (both have mcp field)
    const mcpServers = calls[0].options.mcpServers as Record<string, unknown>;
    expect(Object.keys(mcpServers)).toContain("mcp-a");
    expect(Object.keys(mcpServers)).toContain("hybrid-c");
    expect(Object.keys(mcpServers)).not.toContain("plugin-b");

    // Plugins: plugin-b and hybrid-c (both have pluginPath)
    const sdkPlugins = calls[0].options.plugins as Array<{ type: string; path: string }>;
    expect(sdkPlugins).toHaveLength(2);
    expect(sdkPlugins).toContainEqual({ type: "local", path: "/test/plugin-b/plugin" });
    expect(sdkPlugins).toContainEqual({ type: "local", path: "/test/hybrid-c/plugin" });
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
