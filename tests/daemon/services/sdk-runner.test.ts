/* eslint-disable @typescript-eslint/require-await -- test helpers use async generators for type compat without await */
import { describe, test, expect } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationResult,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { noopEventBus } from "@/daemon/lib/event-bus";
import {
  runSdkSession,
  drainSdkSession,
  prepareSdkSession,
  isSessionExpiryError,
  type SdkRunnerEvent,
  type SdkQueryOptions,
  type SessionPrepSpec,
  type SessionPrepDeps,
} from "@/daemon/services/sdk-runner";

// -- Test helpers --

/** Creates an async generator from a list of SDK messages. */
async function* sdkMessages(messages: unknown[]): AsyncGenerator<SDKMessage> {
  for (const msg of messages) {
    yield msg as SDKMessage;
  }
}

/** Creates a queryFn that returns an async generator of the given messages. */
function makeQueryFn(messages: unknown[]) {
  return (_params: { prompt: string; options: SdkQueryOptions }) => sdkMessages(messages);
}

/** Creates a queryFn that throws before yielding. */
function throwingQueryFn(error: Error) {
  return (_params: { prompt: string; options: SdkQueryOptions }): AsyncGenerator<SDKMessage> => {
    throw error;
  };
}

/** Creates a queryFn that yields some messages then throws. */
function midIterationThrowFn(messages: unknown[], error: Error) {
  return (_params: { prompt: string; options: SdkQueryOptions }) => {
    return (async function* (): AsyncGenerator<SDKMessage> {
      for (const msg of messages) {
        yield msg as SDKMessage;
      }
      throw error;
    })();
  };
}

/** Collects all events from a generator into an array. */
async function collectEvents(gen: AsyncGenerator<SdkRunnerEvent>): Promise<SdkRunnerEvent[]> {
  const events: SdkRunnerEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** SDK system init message that produces a session event. */
const initMessage = { type: "system", subtype: "init", session_id: "sess-123" };

/** SDK stream event that produces a text_delta. */
const textDeltaMessage = {
  type: "stream_event",
  event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
};

/** SDK stream event that produces a tool_use. */
const toolUseMessage = {
  type: "stream_event",
  event: {
    type: "content_block_start",
    content_block: { type: "tool_use", name: "read_file", id: "tu-1" },
  },
};

/** SDK user message that produces a tool_result. */
const toolResultMessage = {
  type: "user",
  message: {
    content: [{ type: "tool_result", name: "read_file", content: "file contents", tool_use_id: "tu-1" }],
  },
};

/** SDK result message that produces a turn_end. */
const turnEndMessage = { type: "result", subtype: "success", total_cost_usd: 0.05 };

/** SDK result message that produces an error. */
const errorResultMessage = {
  type: "result",
  subtype: "error_during_execution",
  errors: ["Something went wrong"],
};

// -- runSdkSession tests --

describe("runSdkSession", () => {
  test("normal iteration yields correct SdkRunnerEvent sequence", async () => {
    const queryFn = makeQueryFn([
      initMessage,
      textDeltaMessage,
      toolUseMessage,
      toolResultMessage,
      turnEndMessage,
    ]);

    const events = await collectEvents(runSdkSession(queryFn, "test prompt", {}));

    expect(events).toEqual([
      { type: "session", sessionId: "sess-123" },
      { type: "text_delta", text: "hello" },
      { type: "tool_use", name: "read_file", input: {}, id: "tu-1" },
      { type: "tool_result", name: "read_file", output: "file contents", toolUseId: "tu-1" },
      { type: "turn_end", cost: 0.05 },
    ]);
  });

  test("session event has no activity IDs", async () => {
    const queryFn = makeQueryFn([initMessage]);
    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toHaveLength(1);
    const session = events[0];
    expect(session).toEqual({ type: "session", sessionId: "sess-123" });
    // Verify no meetingId or worker fields leaked through
    expect("meetingId" in session).toBe(false);
    expect("worker" in session).toBe(false);
  });

  test("AbortError during iteration yields aborted event", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const queryFn = midIterationThrowFn([initMessage, textDeltaMessage], abortError);

    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events[0]).toEqual({ type: "session", sessionId: "sess-123" });
    expect(events[1]).toEqual({ type: "text_delta", text: "hello" });
    expect(events[2]).toEqual({ type: "aborted" });
    expect(events).toHaveLength(3);
  });

  test("generic error during iteration yields error event", async () => {
    const queryFn = midIterationThrowFn(
      [initMessage],
      new Error("network failure"),
    );

    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events[0]).toEqual({ type: "session", sessionId: "sess-123" });
    expect(events[1]).toEqual({ type: "error", reason: "network failure" });
    expect(events).toHaveLength(2);
  });

  test("pre-iteration error: queryFn throws before yielding", async () => {
    const queryFn = throwingQueryFn(new Error("connection refused"));

    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toEqual([{ type: "error", reason: "connection refused" }]);
  });

  test("pre-iteration AbortError yields aborted", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const queryFn = throwingQueryFn(abortError);

    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toEqual([{ type: "aborted" }]);
  });

  test("multiple events per SDK message are all yielded", async () => {
    // A user message with two tool_result blocks
    const multiResultMessage = {
      type: "user",
      message: {
        content: [
          { type: "tool_result", name: "read_file", content: "first" },
          { type: "tool_result", name: "write_file", content: "second" },
        ],
      },
    };

    const queryFn = makeQueryFn([multiResultMessage]);
    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "tool_result", name: "read_file", output: "first", toolUseId: undefined });
    expect(events[1]).toEqual({ type: "tool_result", name: "write_file", output: "second", toolUseId: undefined });
  });

  test("SDK messages that produce no events are skipped", async () => {
    // assistant messages are intentionally ignored by event-translator
    const assistantMessage = {
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    };
    const queryFn = makeQueryFn([assistantMessage]);
    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toHaveLength(0);
  });

  test("error event from SDK result message is yielded", async () => {
    const queryFn = makeQueryFn([errorResultMessage]);
    const events = await collectEvents(runSdkSession(queryFn, "test", {}));

    expect(events).toEqual([{ type: "error", reason: "Something went wrong" }]);
  });
});

// -- drainSdkSession tests --

describe("drainSdkSession", () => {
  test("captures sessionId from session events", async () => {
    const gen = runSdkSession(makeQueryFn([initMessage, turnEndMessage]), "test", {});
    const outcome = await drainSdkSession(gen);

    expect(outcome.sessionId).toBe("sess-123");
    expect(outcome.aborted).toBe(false);
    expect(outcome.error).toBeUndefined();
  });

  test("reports aborted: true on abort events", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const gen = runSdkSession(midIterationThrowFn([initMessage], abortError), "test", {});
    const outcome = await drainSdkSession(gen);

    expect(outcome.sessionId).toBe("sess-123");
    expect(outcome.aborted).toBe(true);
  });

  test("captures first error only", async () => {
    async function* multiError(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "error", reason: "first error" };
      yield { type: "error", reason: "second error" };
    }
    const outcome = await drainSdkSession(multiError());

    expect(outcome.error).toBe("first error");
  });

  test("exhausts generator fully even after error/abort", async () => {
    let finalReached = false;
    async function* genWithCleanup(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-1" };
      yield { type: "error", reason: "oops" };
      yield { type: "turn_end", cost: 0.01 };
      finalReached = true;
    }
    const outcome = await drainSdkSession(genWithCleanup());

    expect(finalReached).toBe(true);
    expect(outcome.sessionId).toBe("s-1");
    expect(outcome.error).toBe("oops");
  });

  test("returns null sessionId and false aborted for empty generator", async () => {
    async function* empty(): AsyncGenerator<SdkRunnerEvent> {
      // yields nothing
    }
    const outcome = await drainSdkSession(empty());

    expect(outcome).toEqual({ sessionId: null, aborted: false, error: undefined });
  });
});

// -- prepareSdkSession tests --

describe("prepareSdkSession", () => {
  // Shared test fixtures

  const mockWorkerMeta: WorkerMetadata = {
    type: "worker",
    identity: { name: "test-worker", description: "Test", displayTitle: "Test Worker" },
    posture: "helpful assistant",
    domainToolboxes: [],
    builtInTools: [],
    checkoutScope: "sparse",
    resourceDefaults: { maxTurns: 10, maxBudgetUsd: 1.0 },
  };

  const mockWorkerPkg: DiscoveredPackage = {
    name: "@guild-hall/test-worker",
    path: "/tmp/packages/test-worker",
    metadata: mockWorkerMeta,
  };

  const mockToolboxPkg: DiscoveredPackage = {
    name: "@guild-hall/some-toolbox",
    path: "/tmp/packages/some-toolbox",
    metadata: { type: "toolbox", name: "some-toolbox", description: "A toolbox" },
  };

  const mockResolvedTools: ResolvedToolSet = {
    mcpServers: [{ name: "test-server" } as ResolvedToolSet["mcpServers"][number]],
    allowedTools: ["read_file", "write_file"],
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker",
    model: "test-model",
    tools: mockResolvedTools,
    resourceBounds: { maxTurns: 10, maxBudgetUsd: 1.0 },
  };

  function makeSpec(overrides?: Partial<SessionPrepSpec>): SessionPrepSpec {
    return {
      workerName: "test-worker",
      packages: [mockWorkerPkg, mockToolboxPkg],
      config: { projects: [] },
      guildHallHome: "/tmp/guild-hall",
      projectName: "test-project",
      projectPath: "/tmp/project",
      workspaceDir: "/tmp/workspace",
      contextId: "ctx-1",
      contextType: "commission",
      eventBus: noopEventBus,
      abortController: new AbortController(),
      ...overrides,
    };
  }

  function makeDeps(overrides?: Partial<SessionPrepDeps>): SessionPrepDeps {
    return {
      resolveToolSet: async () => mockResolvedTools,
      loadMemories: async () => ({ memoryBlock: "test memories", needsCompaction: false }),
      activateWorker: async () => mockActivation,
      ...overrides,
    };
  }

  test("happy path: all 5 steps succeed", async () => {
    const result = await prepareSdkSession(makeSpec(), makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const opts = result.result.options;
    expect(opts.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: "You are a test worker",
    });
    expect(opts.cwd).toBe("/tmp/workspace");
    expect(opts.allowedTools).toEqual(["read_file", "write_file"]);
    expect(opts.model).toBe("test-model");
    expect(opts.maxTurns).toBe(10);
    expect(opts.maxBudgetUsd).toBe(1.0);
    expect(opts.permissionMode).toBe("dontAsk");
    expect(opts.settingSources).toEqual(["local", "project", "user"]);
    expect(opts.includePartialMessages).toBe(false);
  });

  test("worker not found returns error", async () => {
    const result = await prepareSdkSession(
      makeSpec({ workerName: "nonexistent" }),
      makeDeps(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("nonexistent");
    expect(result.error).toContain("not found");
  });

  test("tool resolution failure returns error", async () => {
    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ resolveToolSet: async () => { throw new Error("MCP server unreachable"); } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Tool resolution failed");
    expect(result.error).toContain("MCP server unreachable");
  });

  test("memory load failure returns error", async () => {
    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ loadMemories: async () => { throw new Error("disk full"); } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Memory load failed");
    expect(result.error).toContain("disk full");
  });

  test("activation failure returns error", async () => {
    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => { throw new Error("bad posture"); } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Worker activation failed");
    expect(result.error).toContain("bad posture");
  });

  test("memory compaction triggered when needsCompaction=true and triggerCompaction exists", async () => {
    let compactionWorker = "";
    let compactionProject = "";

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({
        loadMemories: async () => ({ memoryBlock: "memories", needsCompaction: true }),
        triggerCompaction: (workerName, projectName) => {
          compactionWorker = workerName;
          compactionProject = projectName;
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(compactionWorker).toBe("test-worker");
    expect(compactionProject).toBe("test-project");
  });

  test("memory compaction NOT triggered when needsCompaction=false", async () => {
    let compactionCalled = false;

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({
        loadMemories: async () => ({ memoryBlock: "memories", needsCompaction: false }),
        triggerCompaction: () => { compactionCalled = true; },
      }),
    );

    expect(result.ok).toBe(true);
    expect(compactionCalled).toBe(false);
  });

  test("memory compaction NOT triggered when triggerCompaction not provided", async () => {
    // This should not throw even when needsCompaction is true but no triggerCompaction
    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({
        loadMemories: async () => ({ memoryBlock: "memories", needsCompaction: true }),
        // no triggerCompaction
      }),
    );

    expect(result.ok).toBe(true);
  });

  test("resource overrides take precedence over activation bounds", async () => {
    const result = await prepareSdkSession(
      makeSpec({ resourceOverrides: { maxTurns: 50, maxBudgetUsd: 5.0 } }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.maxTurns).toBe(50);
    expect(result.result.options.maxBudgetUsd).toBe(5.0);
  });

  test("resume passed through to options", async () => {
    const result = await prepareSdkSession(
      makeSpec({ resume: "sess-old" }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.resume).toBe("sess-old");
  });

  test("includePartialMessages passed through to options", async () => {
    const result = await prepareSdkSession(
      makeSpec({ includePartialMessages: true }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.includePartialMessages).toBe(true);
  });

  test("activationExtras are spread into activation context", async () => {
    let capturedMeetingContext: unknown = undefined;

    const result = await prepareSdkSession(
      makeSpec({
        activationExtras: {
          meetingContext: { meetingId: "m-1", agenda: "discuss bugs", referencedArtifacts: [] },
        },
      }),
      makeDeps({
        activateWorker: async (_pkg, ctx) => {
          capturedMeetingContext = ctx.meetingContext;
          return mockActivation;
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedMeetingContext).toEqual({
      meetingId: "m-1",
      agenda: "discuss bugs",
      referencedArtifacts: [],
    });
  });

  test("abortController passed through to options", async () => {
    const controller = new AbortController();
    const result = await prepareSdkSession(
      makeSpec({ abortController: controller }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.abortController).toBe(controller);
  });

  test("MCP servers from activation are mapped to record", async () => {
    const mockActivationMultiServer: ActivationResult = {
      ...mockActivation,
      tools: {
        mcpServers: [
          { name: "server-a" } as ResolvedToolSet["mcpServers"][number],
          { name: "server-b" } as ResolvedToolSet["mcpServers"][number],
        ],
        allowedTools: [],
      },
    };

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => mockActivationMultiServer }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const servers = result.result.options.mcpServers as Record<string, unknown>;
    expect("server-a" in servers).toBe(true);
    expect("server-b" in servers).toBe(true);
  });

  test("no model in activation omits model from options", async () => {
    const noModelActivation: ActivationResult = {
      ...mockActivation,
      model: undefined,
    };

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => noModelActivation }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.model).toBeUndefined();
  });
});

// -- isSessionExpiryError tests --

describe("isSessionExpiryError", () => {
  test("matches 'session expired'", () => {
    expect(isSessionExpiryError("The session expired")).toBe(true);
  });

  test("matches 'session not found'", () => {
    expect(isSessionExpiryError("Session not found")).toBe(true);
  });

  test("matches 'session_expired' code", () => {
    expect(isSessionExpiryError("session_expired")).toBe(true);
  });

  test("case insensitive", () => {
    expect(isSessionExpiryError("SESSION EXPIRED")).toBe(true);
    expect(isSessionExpiryError("Session Not Found")).toBe(true);
  });

  test("rejects unrelated errors", () => {
    expect(isSessionExpiryError("network failure")).toBe(false);
    expect(isSessionExpiryError("timeout")).toBe(false);
    expect(isSessionExpiryError("connection refused")).toBe(false);
  });

  test("rejects partial matches", () => {
    expect(isSessionExpiryError("session started")).toBe(false);
    expect(isSessionExpiryError("found something")).toBe(false);
  });
});
