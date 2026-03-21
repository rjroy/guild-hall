/* eslint-disable @typescript-eslint/require-await -- test helpers use async generators for type compat without await */
import { describe, test, expect } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationResult,
  AppConfig,
  CanUseToolRule,
  DiscoveredPackage,
  ModelDefinition,
  ResolvedModel,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { noopEventBus } from "@/daemon/lib/event-bus";
import {
  runSdkSession,
  drainSdkSession,
  prepareSdkSession,
  isSessionExpiryError,
  prefixLocalModelError,
  type SdkRunnerEvent,
  type SdkQueryOptions,
  type SessionPrepSpec,
  type SessionPrepDeps,
} from "@/daemon/lib/agent-sdk/sdk-runner";

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

  test("agents in options passes through to queryFn", async () => {
    const agents = {
      Thorne: {
        description: "Guild Warden. Reviews code.",
        prompt: "You are Thorne, the Guild Warden.",
        model: "sonnet",
      },
      Octavia: {
        description: "Guild Chronicler. Reviews specs.",
        prompt: "You are Octavia, the Guild Chronicler.",
        model: "inherit",
      },
    };

    let capturedOptions: SdkQueryOptions | undefined;
    const queryFn = (params: { prompt: string; options: SdkQueryOptions }) => {
      capturedOptions = params.options;
      return sdkMessages([initMessage]);
    };

    await collectEvents(runSdkSession(queryFn, "test", { agents }));

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!.agents).toEqual(agents);
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

    expect(outcome.sessionId).toBeNull();
    expect(outcome.aborted).toBe(false);
    expect(outcome.error).toBeUndefined();
  });

  test("reason is 'completed' on normal completion", async () => {
    const gen = runSdkSession(makeQueryFn([initMessage, turnEndMessage]), "test", {});
    const outcome = await drainSdkSession(gen);

    expect(outcome.reason).toBe("completed");
    expect(outcome.aborted).toBe(false);
  });

  test("reason is 'maxTurns' when turn count reaches maxTurns", async () => {
    async function* maxTurnsGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-max" };
      yield { type: "turn_end", cost: 0.01 };
      yield { type: "turn_end", cost: 0.01 };
      yield { type: "turn_end", cost: 0.01 };
    }
    const outcome = await drainSdkSession(maxTurnsGen(), { maxTurns: 3 });

    expect(outcome.reason).toBe("maxTurns");
    expect(outcome.sessionId).toBe("s-max");
  });

  test("reason is 'completed' when turn count is below maxTurns", async () => {
    async function* belowMaxGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-below" };
      yield { type: "turn_end", cost: 0.01 };
      yield { type: "turn_end", cost: 0.01 };
    }
    const outcome = await drainSdkSession(belowMaxGen(), { maxTurns: 5 });

    expect(outcome.reason).toBe("completed");
  });

  test("reason is undefined when aborted", async () => {
    async function* abortedGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-abort" };
      yield { type: "turn_end", cost: 0.01 };
      yield { type: "aborted" };
    }
    const outcome = await drainSdkSession(abortedGen(), { maxTurns: 1 });

    expect(outcome.aborted).toBe(true);
    expect(outcome.reason).toBeUndefined();
  });

  test("reason is undefined when error occurs", async () => {
    async function* errorGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-err" };
      yield { type: "error", reason: "boom" };
    }
    const outcome = await drainSdkSession(errorGen());

    expect(outcome.error).toBe("boom");
    expect(outcome.reason).toBeUndefined();
  });

  test("reason works without maxTurns opt (always completed on success)", async () => {
    async function* normalGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-no-opt" };
      yield { type: "turn_end", cost: 0.01 };
    }
    const outcome = await drainSdkSession(normalGen());

    expect(outcome.reason).toBe("completed");
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
    builtInTools: ["Read", "Write"],
    canUseToolRules: [],
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker",
    model: "sonnet",
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
      loadMemories: async () => ({ memoryBlock: "test memories" }),
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
    expect(opts.model).toBe("sonnet");
    expect(opts.maxTurns).toBe(10);
    expect(opts.maxBudgetUsd).toBe(1.0);
    expect(opts.permissionMode).toBe("dontAsk");
    expect(opts.settingSources).toEqual(["local", "project", "user"]);
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
        builtInTools: [],
        canUseToolRules: [],
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

  test("worker with domainPlugins where package has pluginPath produces options.plugins", async () => {
    const pluginWorkerMeta: WorkerMetadata = {
      ...mockWorkerMeta,
      domainPlugins: ["pkg-a"],
    };
    const pluginWorkerPkg: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: pluginWorkerMeta,
    };
    const pluginPkg: DiscoveredPackage = {
      name: "pkg-a",
      path: "/tmp/packages/pkg-a",
      metadata: { type: "toolbox", name: "pkg-a", description: "A plugin package" },
      pluginPath: "/tmp/packages/pkg-a",
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [pluginWorkerPkg, pluginPkg] }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.plugins).toEqual([
      { type: "local", path: "/tmp/packages/pkg-a" },
    ]);
  });

  test("worker with domainPlugins where package is missing returns error", async () => {
    const pluginWorkerMeta: WorkerMetadata = {
      ...mockWorkerMeta,
      domainPlugins: ["pkg-a"],
    };
    const pluginWorkerPkg: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: pluginWorkerMeta,
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [pluginWorkerPkg] }),
      makeDeps(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no matching package was found");
    expect(result.error).toContain("pkg-a");
  });

  test("worker with domainPlugins where package exists but has no pluginPath returns error", async () => {
    const pluginWorkerMeta: WorkerMetadata = {
      ...mockWorkerMeta,
      domainPlugins: ["pkg-a"],
    };
    const pluginWorkerPkg: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: pluginWorkerMeta,
    };
    const pkgNoPlugin: DiscoveredPackage = {
      name: "pkg-a",
      path: "/tmp/packages/pkg-a",
      metadata: { type: "toolbox", name: "pkg-a", description: "No plugin" },
      // no pluginPath
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [pluginWorkerPkg, pkgNoPlugin] }),
      makeDeps(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("does not contain a plugin");
    expect(result.error).toContain("pkg-a");
  });

  test("worker with no domainPlugins produces no plugins in options", async () => {
    const result = await prepareSdkSession(makeSpec(), makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.plugins).toBeUndefined();
  });

  test("worker with domainPlugins referencing its own package works", async () => {
    const selfPluginMeta: WorkerMetadata = {
      ...mockWorkerMeta,
      domainPlugins: ["@guild-hall/test-worker"],
    };
    const selfPluginPkg: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: selfPluginMeta,
      pluginPath: "/tmp/packages/test-worker",
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [selfPluginPkg] }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.plugins).toEqual([
      { type: "local", path: "/tmp/packages/test-worker" },
    ]);
  });

  test("worker with multiple domainPlugins produces multiple plugin entries", async () => {
    const multiPluginMeta: WorkerMetadata = {
      ...mockWorkerMeta,
      domainPlugins: ["pkg-a", "pkg-b"],
    };
    const multiPluginWorkerPkg: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: multiPluginMeta,
    };
    const pkgA: DiscoveredPackage = {
      name: "pkg-a",
      path: "/tmp/packages/pkg-a",
      metadata: { type: "toolbox", name: "pkg-a", description: "Plugin A" },
      pluginPath: "/tmp/packages/pkg-a",
    };
    const pkgB: DiscoveredPackage = {
      name: "pkg-b",
      path: "/tmp/packages/pkg-b",
      metadata: { type: "toolbox", name: "pkg-b", description: "Plugin B" },
      pluginPath: "/tmp/packages/pkg-b",
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [multiPluginWorkerPkg, pkgA, pkgB] }),
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.plugins).toEqual([
      { type: "local", path: "/tmp/packages/pkg-a" },
      { type: "local", path: "/tmp/packages/pkg-b" },
    ]);
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

  test("model from activation flows to options when no override present", async () => {
    const modelActivation: ActivationResult = {
      ...mockActivation,
      model: "sonnet",
    };

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => modelActivation }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.model).toBe("sonnet");
  });

  test("resourceOverrides.model overrides activation model", async () => {
    const modelActivation: ActivationResult = {
      ...mockActivation,
      model: "sonnet",
    };

    const result = await prepareSdkSession(
      makeSpec({ resourceOverrides: { model: "opus" } }),
      makeDeps({ activateWorker: async () => modelActivation }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.model).toBe("opus");
  });

  test("no model in activation or overrides produces no model key in options", async () => {
    const noModelActivation: ActivationResult = {
      ...mockActivation,
      model: undefined,
    };

    const result = await prepareSdkSession(
      makeSpec({ resourceOverrides: { maxTurns: 5 } }),
      makeDeps({ activateWorker: async () => noModelActivation }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("model" in result.result.options).toBe(false);
  });

  test("workerMeta.model is passed through to activation context", async () => {
    let capturedModel: string | undefined;
    const workerWithModel: WorkerMetadata = {
      ...mockWorkerMeta,
      model: "haiku",
    };
    const workerPkgWithModel: DiscoveredPackage = {
      name: "@guild-hall/test-worker",
      path: "/tmp/packages/test-worker",
      metadata: workerWithModel,
    };

    const result = await prepareSdkSession(
      makeSpec({ packages: [workerPkgWithModel, mockToolboxPkg] }),
      makeDeps({
        activateWorker: async (_pkg, ctx) => {
          capturedModel = ctx.model;
          return mockActivation;
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedModel).toBe("haiku");
  });

  // -- Local model support tests (REQ-LOCAL-10 through REQ-LOCAL-18) --

  const localModelDef: ModelDefinition = {
    name: "llama3",
    modelId: "llama3:latest",
    baseUrl: "http://localhost:11434",
  };

  const localModelWithAuth: ModelDefinition = {
    name: "custom-server",
    modelId: "gpt-4o",
    baseUrl: "http://192.168.1.50:8080",
    auth: { token: "my-token", apiKey: "my-key" },
  };

  const configWithLocal: AppConfig = {
    projects: [],
    models: [localModelDef, localModelWithAuth],
  };

  test("local model session: options.env contains ANTHROPIC_BASE_URL, AUTH_TOKEN, API_KEY", async () => {
    const localActivation: ActivationResult = {
      ...mockActivation,
      model: "llama3",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => localActivation,
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const env = result.result.options.env;
    expect(env).toBeDefined();
    expect(env!.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
    expect(env!.ANTHROPIC_AUTH_TOKEN).toBe("ollama");
    expect(env!.ANTHROPIC_API_KEY).toBe("");
  });

  test("local model session: options.model is modelId, not definition name", async () => {
    const localActivation: ActivationResult = {
      ...mockActivation,
      model: "llama3",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => localActivation,
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.model).toBe("llama3:latest");
  });

  test("built-in model session: options.env is absent", async () => {
    const result = await prepareSdkSession(makeSpec(), makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.env).toBeUndefined();
  });

  test("local model with custom auth: token and apiKey flow to env", async () => {
    const customAuthActivation: ActivationResult = {
      ...mockActivation,
      model: "custom-server",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => customAuthActivation,
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const env = result.result.options.env;
    expect(env!.ANTHROPIC_BASE_URL).toBe("http://192.168.1.50:8080");
    expect(env!.ANTHROPIC_AUTH_TOKEN).toBe("my-token");
    expect(env!.ANTHROPIC_API_KEY).toBe("my-key");
  });

  test("reachability check succeeds: session proceeds", async () => {
    const localActivation: ActivationResult = {
      ...mockActivation,
      model: "llama3",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => localActivation,
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
  });

  test("reachability check fails: returns ok=false with model name and URL", async () => {
    const localActivation: ActivationResult = {
      ...mockActivation,
      model: "llama3",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => localActivation,
        checkReachability: async () => ({ reachable: false, error: "connection refused" }),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("llama3");
    expect(result.error).toContain("http://localhost:11434");
    expect(result.error).toContain("not reachable");
    expect(result.error).toContain("connection refused");
  });

  test("built-in model: checkReachability is never called", async () => {
    let reachabilityCalled = false;

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({
        checkReachability: async () => {
          reachabilityCalled = true;
          return { reachable: true };
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(reachabilityCalled).toBe(false);
  });

  test("local model override via resourceOverrides.model works", async () => {
    const result = await prepareSdkSession(
      makeSpec({
        config: configWithLocal,
        resourceOverrides: { model: "llama3" },
      }),
      makeDeps({
        activateWorker: async () => ({ ...mockActivation, model: undefined }),
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.model).toBe("llama3:latest");
    expect(result.result.options.env).toBeDefined();
    expect(result.result.options.env!.ANTHROPIC_BASE_URL).toBe("http://localhost:11434");
  });

  test("unknown model name returns model resolution error", async () => {
    const unknownActivation: ActivationResult = {
      ...mockActivation,
      model: "nonexistent-model",
    };

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => unknownActivation }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Model resolution failed");
    expect(result.error).toContain("nonexistent-model");
  });

  // -- Sandbox injection tests (REQ-SBX-10) --

  describe("sandbox injection", () => {
    test("includes sandbox in options when worker has Bash in builtInTools", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Bash"],
          builtInTools: ["Read", "Bash"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.sandbox).toBeDefined();
      expect(result.result.options.sandbox?.enabled).toBe(true);
      expect(result.result.options.sandbox?.autoAllowBashIfSandboxed).toBe(true);
      expect(result.result.options.sandbox?.allowUnsandboxedCommands).toBe(false);
    });

    test("sandbox sets network.allowLocalBinding to false", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Bash"],
          builtInTools: ["Bash"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.sandbox?.network?.allowLocalBinding).toBe(false);
    });

    test("does NOT include sandbox when worker has no Bash in builtInTools", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Glob", "Grep"],
          builtInTools: ["Read", "Glob", "Grep"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.sandbox).toBeUndefined();
    });

    test("Dalton-like worker (has Bash) gets sandbox, Thorne-like worker (no Bash) does not", async () => {
      // Dalton: has Bash among full tool set
      const daltonDeps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Skill", "Task"],
          builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Skill", "Task"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const daltonResult = await prepareSdkSession(makeSpec(), daltonDeps);
      expect(daltonResult.ok).toBe(true);
      if (!daltonResult.ok) return;
      expect(daltonResult.result.options.sandbox?.enabled).toBe(true);

      // Thorne: read-only tools, no Bash
      const thorneDeps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Glob", "Grep"],
          builtInTools: ["Read", "Glob", "Grep"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const thorneResult = await prepareSdkSession(makeSpec(), thorneDeps);
      expect(thorneResult.ok).toBe(true);
      if (!thorneResult.ok) return;
      expect(thorneResult.result.options.sandbox).toBeUndefined();
    });
  });

  // -- canUseTool callback tests (REQ-SBX-24) --

  describe("canUseTool callback", () => {
    test("prepareSdkSession does NOT include canUseTool when rules are empty", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read"],
          builtInTools: ["Read"],
          canUseToolRules: [],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.canUseTool).toBeUndefined();
    });

    test("prepareSdkSession includes canUseTool when rules are non-empty", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Bash"],
          builtInTools: ["Read", "Bash"],
          canUseToolRules: [{ tool: "Bash", allow: false, reason: "No Bash" }],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.canUseTool).toBeDefined();
      expect(typeof result.result.options.canUseTool).toBe("function");
    });

    test("allows call when no rule matches (different tool than rules target)", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Read", "Edit", "Bash"],
          builtInTools: ["Read", "Edit", "Bash"],
          canUseToolRules: [
            { tool: "Bash", allow: false, reason: "No Bash" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const decision = await result.result.options.canUseTool!(
        "Edit",
        { file_path: "/some/file.ts" },
        { signal: new AbortController().signal },
      );
      expect(decision.behavior).toBe("allow");
    });

    test("denies Bash call matching a catch-all deny rule", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Bash"],
          builtInTools: ["Bash"],
          canUseToolRules: [
            { tool: "Bash", allow: false, reason: "All Bash denied" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const decision = await result.result.options.canUseTool!(
        "Bash",
        { command: "rm -rf /" },
        { signal: new AbortController().signal },
      );
      expect(decision.behavior).toBe("deny");
      if (decision.behavior === "deny") {
        expect(decision.message).toBe("All Bash denied");
      }
    });

    test("allowlist pattern: allows git status, denies rm -rf", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Bash"],
          builtInTools: ["Bash"],
          canUseToolRules: [
            { tool: "Bash", commands: ["git status", "git log"], allow: true },
            { tool: "Bash", allow: false, reason: "Only git status and git log" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const allowDecision = await result.result.options.canUseTool!(
        "Bash",
        { command: "git status" },
        { signal: new AbortController().signal },
      );
      expect(allowDecision.behavior).toBe("allow");

      const denyDecision = await result.result.options.canUseTool!(
        "Bash",
        { command: "rm -rf /" },
        { signal: new AbortController().signal },
      );
      expect(denyDecision.behavior).toBe("deny");
      if (denyDecision.behavior === "deny") {
        expect(denyDecision.message).toBe("Only git status and git log");
      }
    });

    test("path-based deny: blocks Edit to **/.ssh/**, allows .lore/ paths", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Edit"],
          builtInTools: ["Edit"],
          canUseToolRules: [
            { tool: "Edit", paths: ["**/.ssh/**"], allow: false, reason: "Cannot edit credentials" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // SDK delivers absolute paths
      const denyDecision = await result.result.options.canUseTool!(
        "Edit",
        { file_path: "/home/user/.ssh/id_rsa" },
        { signal: new AbortController().signal },
      );
      expect(denyDecision.behavior).toBe("deny");
      if (denyDecision.behavior === "deny") {
        expect(denyDecision.message).toBe("Cannot edit credentials");
      }

      const allowDecision = await result.result.options.canUseTool!(
        "Edit",
        { file_path: "/home/user/project/.lore/specs/example.md" },
        { signal: new AbortController().signal },
      );
      expect(allowDecision.behavior).toBe("allow");
    });

    test("path patterns match dotfile directories", async () => {
      // micromatch requires { dot: true } to match leading dots
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Edit"],
          builtInTools: ["Edit"],
          canUseToolRules: [
            { tool: "Edit", paths: ["**/.lore/**"], allow: false, reason: "Cannot edit lore" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const decision = await result.result.options.canUseTool!(
        "Edit",
        { file_path: "/home/user/project/.lore/specs/example.md" },
        { signal: new AbortController().signal },
      );
      expect(decision.behavior).toBe("deny");
    });

    test("denial sets interrupt: false", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Bash"],
          builtInTools: ["Bash"],
          canUseToolRules: [
            { tool: "Bash", allow: false, reason: "Denied" },
          ],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          tools: context.resolvedTools,
          resourceBounds: {},
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const decision = await result.result.options.canUseTool!(
        "Bash",
        { command: "anything" },
        { signal: new AbortController().signal },
      );
      expect(decision.behavior).toBe("deny");
      if (decision.behavior === "deny") {
        expect(decision.interrupt).toBe(false);
      }
    });

    // -- Octavia rules (REQ-WTR-17 cases 1-7) --

    describe("Octavia rules (REQ-WTR-17)", () => {
      const octaviaRules: CanUseToolRule[] = [
        { tool: "Bash", commands: ["rm .lore/**", "rm -f .lore/**"], allow: true },
        { tool: "Bash", allow: false, reason: "Only file deletion within .lore/ is permitted" },
      ];

      function octaviaDeps() {
        return makeDeps({
          resolveToolSet: async () => ({
            mcpServers: [],
            allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
            builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
            canUseToolRules: octaviaRules,
          }),
          activateWorker: async (_pkg, context) => ({
            systemPrompt: "test",
            tools: context.resolvedTools,
            resourceBounds: {},
          }),
        });
      }

      async function getCanUseTool() {
        const result = await prepareSdkSession(makeSpec(), octaviaDeps());
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("prep failed");
        expect(result.result.options.canUseTool).toBeDefined();
        return result.result.options.canUseTool!;
      }

      test("case 1: rm .lore/commissions/commission-Octavia-20260312.md is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "rm .lore/commissions/commission-Octavia-20260312.md" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 2: rm -f .lore/meetings/audience-Guild-Master-20260311.md is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "rm -f .lore/meetings/audience-Guild-Master-20260311.md" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 3: rm .lore/specs/some-spec.md is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "rm .lore/specs/some-spec.md" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 4: rm -rf / is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "rm -rf /" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
        if (decision.behavior === "deny") {
          expect(decision.message).toBe("Only file deletion within .lore/ is permitted");
        }
      });

      test("case 5: ls .lore/ is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "ls .lore/" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });

      test("case 6: cat .lore/specs/some-spec.md is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "cat .lore/specs/some-spec.md" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });

      test("case 7: rm -rf .lore/commissions/ is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "rm -rf .lore/commissions/" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });
    });

    // -- Guild Master rules (REQ-WTR-17 cases 8-15) --

    describe("Guild Master rules (REQ-WTR-17)", () => {
      const guildMasterRules: CanUseToolRule[] = [
        {
          tool: "Bash",
          commands: [
            "git status", "git status *",
            "git log", "git log *",
            "git diff", "git diff *",
            "git show", "git show *",
          ],
          allow: true,
        },
        {
          tool: "Bash",
          allow: false,
          reason: "Only read-only git commands (status, log, diff, show) are permitted",
        },
      ];

      function guildMasterDeps() {
        return makeDeps({
          resolveToolSet: async () => ({
            mcpServers: [],
            allowedTools: ["Read", "Glob", "Grep", "Bash"],
            builtInTools: ["Read", "Glob", "Grep", "Bash"],
            canUseToolRules: guildMasterRules,
          }),
          activateWorker: async (_pkg, context) => ({
            systemPrompt: "test",
            tools: context.resolvedTools,
            resourceBounds: {},
          }),
        });
      }

      async function getCanUseTool() {
        const result = await prepareSdkSession(makeSpec(), guildMasterDeps());
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("prep failed");
        expect(result.result.options.canUseTool).toBeDefined();
        return result.result.options.canUseTool!;
      }

      test("case 8: git status is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git status" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 9: git log --oneline -10 is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git log --oneline -10" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 10: git diff HEAD~3..HEAD is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git diff HEAD~3..HEAD" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 11: git show abc123 is allowed", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git show abc123" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("allow");
      });

      test("case 12: git diff -- src/lib/foo.ts is denied (path with /)", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git diff -- src/lib/foo.ts" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });

      test("case 13: git push origin master is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git push origin master" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });

      test("case 14: git checkout -b new-branch is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "git checkout -b new-branch" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });

      test("case 15: curl http://example.com is denied", async () => {
        const canUseTool = await getCanUseTool();
        const decision = await canUseTool(
          "Bash",
          { command: "curl http://example.com" },
          { signal: new AbortController().signal },
        );
        expect(decision.behavior).toBe("deny");
      });
    });
  });

  // -- Tool availability enforcement tests (REQ-TAE-10) --

  test("prepareSdkSession includes tools matching worker builtInTools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [{ name: "test-server" } as ResolvedToolSet["mcpServers"][number]],
        allowedTools: ["Read", "Glob", "Grep", "mcp__test-server__*"],
        builtInTools: ["Read", "Glob", "Grep"],
        canUseToolRules: [],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.tools).toEqual(["Read", "Glob", "Grep"]);
  });

  test("tools field excludes undeclared built-in tools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep"],
        builtInTools: ["Read", "Glob", "Grep"],
        canUseToolRules: [],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.tools).not.toContain("Bash");
    expect(result.result.options.tools).not.toContain("Write");
    expect(result.result.options.tools).not.toContain("Edit");
  });

  test("tools is independent of allowedTools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [{ name: "my-mcp" } as ResolvedToolSet["mcpServers"][number]],
        allowedTools: ["Read", "Glob", "mcp__my-mcp__*"],
        builtInTools: ["Read", "Glob"],
        canUseToolRules: [],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // tools has only built-in names
    expect(result.result.options.tools).toEqual(["Read", "Glob"]);
    // allowedTools has both built-in names and MCP wildcards
    expect(result.result.options.allowedTools).toContain("mcp__my-mcp__*");
  });

  test("full builtInTools set is passed through to tools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        canUseToolRules: [],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.tools).toEqual(
      ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    );
  });

  test("tools does not include MCP server entries", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [{ name: "srv" } as ResolvedToolSet["mcpServers"][number]],
        allowedTools: ["Read", "mcp__srv__*"],
        builtInTools: ["Read"],
        canUseToolRules: [],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.tools).toEqual(["Read"]);
    expect(result.result.options.tools).not.toContain("mcp__srv__*");
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

// -- prefixLocalModelError tests --

describe("prefixLocalModelError", () => {
  const localModel: ResolvedModel = {
    type: "local",
    definition: {
      name: "llama3",
      modelId: "llama3:latest",
      baseUrl: "http://localhost:11434",
    },
  };

  const builtinModel: ResolvedModel = {
    type: "builtin",
    name: "sonnet",
  };

  test("prefixes error with model name and URL for local models", () => {
    const result = prefixLocalModelError("connection reset", localModel);
    expect(result).toBe('Local model "llama3" (http://localhost:11434) error: connection reset');
  });

  test("passes error through unchanged for built-in models", () => {
    const result = prefixLocalModelError("connection reset", builtinModel);
    expect(result).toBe("connection reset");
  });

  test("passes error through unchanged when resolvedModel is undefined", () => {
    const result = prefixLocalModelError("connection reset", undefined);
    expect(result).toBe("connection reset");
  });
});

// -- prepareSdkSession resolvedModel return shape tests (REQ-LOCAL-18) --

describe("prepareSdkSession resolvedModel", () => {
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
    builtInTools: ["Read", "Write"],
    canUseToolRules: [],
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker",
    model: "sonnet",
    tools: mockResolvedTools,
    resourceBounds: { maxTurns: 10, maxBudgetUsd: 1.0 },
  };

  const localModelDef: ModelDefinition = {
    name: "llama3",
    modelId: "llama3:latest",
    baseUrl: "http://localhost:11434",
  };

  const configWithLocal: AppConfig = {
    projects: [],
    models: [localModelDef],
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
      loadMemories: async () => ({ memoryBlock: "test memories" }),
      activateWorker: async () => mockActivation,
      ...overrides,
    };
  }

  test("returns resolvedModel with type 'local' for local models", async () => {
    const localActivation: ActivationResult = {
      ...mockActivation,
      model: "llama3",
    };

    const result = await prepareSdkSession(
      makeSpec({ config: configWithLocal }),
      makeDeps({
        activateWorker: async () => localActivation,
        checkReachability: async () => ({ reachable: true }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.resolvedModel).toBeDefined();
    expect(result.result.resolvedModel!.type).toBe("local");
    if (result.result.resolvedModel!.type !== "local") return;
    expect(result.result.resolvedModel!.definition.name).toBe("llama3");
    expect(result.result.resolvedModel!.definition.baseUrl).toBe("http://localhost:11434");
  });

  test("returns resolvedModel with type 'builtin' for built-in models", async () => {
    const result = await prepareSdkSession(makeSpec(), makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.resolvedModel).toBeDefined();
    expect(result.result.resolvedModel!.type).toBe("builtin");
    if (result.result.resolvedModel!.type !== "builtin") return;
    expect(result.result.resolvedModel!.name).toBe("sonnet");
  });

  test("resolvedModel is undefined when no model is specified", async () => {
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
    expect(result.result.resolvedModel).toBeUndefined();
  });
});
