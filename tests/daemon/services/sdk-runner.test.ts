/* eslint-disable @typescript-eslint/require-await -- test helpers use async generators for type compat without await */
import { describe, test, expect } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
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

  test("reason is undefined when aborted", async () => {
    async function* abortedGen(): AsyncGenerator<SdkRunnerEvent> {
      yield { type: "session", sessionId: "s-abort" };
      yield { type: "turn_end", cost: 0.01 };
      yield { type: "aborted" };
    }
    const outcome = await drainSdkSession(abortedGen());

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

  test("reason is 'completed' on normal success", async () => {
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
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker",
    sessionContext: "",
    model: "sonnet",
    tools: mockResolvedTools,
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
    expect(opts.permissionMode).toBe("dontAsk");
    expect(opts.settingSources).toEqual(["local", "project", "user"]);
    // sessionContext is threaded through (REQ-SPO-18)
    expect(result.result.sessionContext).toBe("");
  });

  test("memoryGuidance is populated in calling worker's activation context (REQ-SPO-10)", async () => {
    let capturedContext: ActivationContext | undefined;
    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({
        activateWorker: async (_pkg, ctx) => {
          capturedContext = ctx;
          return mockActivation;
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(capturedContext).toBeDefined();
    expect(capturedContext!.memoryGuidance).toBeDefined();
    expect(capturedContext!.memoryGuidance).toContain("edit_memory");
  });

  test("sessionContext is threaded from activation result (REQ-SPO-18)", async () => {
    const activationWithContext: ActivationResult = {
      ...mockActivation,
      sessionContext: "# Commission Context\n\nBuild the thing.",
    };

    const result = await prepareSdkSession(
      makeSpec(),
      makeDeps({ activateWorker: async () => activationWithContext }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.sessionContext).toBe("# Commission Context\n\nBuild the thing.");
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
      makeSpec(),
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
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          sessionContext: "",
          tools: context.resolvedTools,
        }),
      });

      const result = await prepareSdkSession(makeSpec(), deps);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.sandbox).toBeDefined();
      expect(result.result.options.sandbox?.enabled).toBe(true);
      expect(result.result.options.sandbox?.autoAllowBashIfSandboxed).toBe(false);
      expect(result.result.options.sandbox?.allowUnsandboxedCommands).toBe(false);
    });

    test("sandbox sets network.allowLocalBinding to false", async () => {
      const deps = makeDeps({
        resolveToolSet: async () => ({
          mcpServers: [],
          allowedTools: ["Bash"],
          builtInTools: ["Bash"],
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          sessionContext: "",
          tools: context.resolvedTools,
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
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          sessionContext: "",
          tools: context.resolvedTools,
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
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          sessionContext: "",
          tools: context.resolvedTools,
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
        }),
        activateWorker: async (_pkg, context) => ({
          systemPrompt: "test",
          sessionContext: "",
          tools: context.resolvedTools,
        }),
      });

      const thorneResult = await prepareSdkSession(makeSpec(), thorneDeps);
      expect(thorneResult.ok).toBe(true);
      if (!thorneResult.ok) return;
      expect(thorneResult.result.options.sandbox).toBeUndefined();
    });
  });

  // -- Sub-agent map construction tests (Phase 4) --

  describe("sub-agent map construction", () => {
    const mockOtherWorkerMeta: WorkerMetadata = {
      type: "worker",
      identity: { name: "other-worker", description: "Other worker", displayTitle: "Other Worker" },
      posture: "diligent reviewer",
      domainToolboxes: [],
      builtInTools: [],
      checkoutScope: "sparse",
    };

    const mockOtherWorkerPkg: DiscoveredPackage = {
      name: "@guild-hall/other-worker",
      path: "/tmp/packages/other-worker",
      metadata: mockOtherWorkerMeta,
    };

    const mockOtherWorkerWithModel: WorkerMetadata = {
      ...mockOtherWorkerMeta,
      subAgentModel: "sonnet",
    };

    const mockOtherWorkerWithSoul: WorkerMetadata = {
      ...mockOtherWorkerMeta,
      soul: "A thoughtful soul",
    };

    test("calling worker excluded from agent map", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const agentMap = result.result.options.agents;
      expect(agentMap).toBeDefined();
      expect("other-worker" in agentMap!).toBe(true);
      expect("test-worker" in agentMap!).toBe(false);
    });

    test("agent has prompt with identity and posture, no commission/meeting context", async () => {
      let capturedContext: ActivationContext | undefined;
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") {
              capturedContext = ctx;
            }
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(capturedContext).toBeDefined();
      expect(capturedContext!.identity.name).toBe("other-worker");
      expect(capturedContext!.posture).toBe("diligent reviewer");
      expect(capturedContext!.meetingContext).toBeUndefined();
      expect(capturedContext!.commissionContext).toBeUndefined();
      expect(capturedContext!.managerContext).toBeUndefined();
    });

    test("agent with subAgentModel: 'sonnet' has model: 'sonnet'", async () => {
      const pkgWithModel: DiscoveredPackage = {
        ...mockOtherWorkerPkg,
        metadata: mockOtherWorkerWithModel,
      };
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, pkgWithModel, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.agents!["other-worker"].model).toBe("sonnet");
    });

    test("agent with no subAgentModel has model: 'inherit'", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.agents!["other-worker"].model).toBe("inherit");
    });

    test("agent has description containing display title", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.options.agents!["other-worker"].description).toContain("Other Worker");
    });

    test("agent with guidance uses guidance in description", async () => {
      const guidedWorkerMeta: WorkerMetadata = {
        ...mockOtherWorkerMeta,
        identity: {
          ...mockOtherWorkerMeta.identity,
          guidance: "Invoke this worker when you need diligent code review.",
        },
      };
      const guidedWorkerPkg: DiscoveredPackage = {
        ...mockOtherWorkerPkg,
        metadata: guidedWorkerMeta,
      };

      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, guidedWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const desc = result.result.options.agents!["other-worker"].description;
      expect(desc).toContain("Invoke this worker when you need diligent code review.");
      expect(desc).not.toContain("Invoke this worker when:");
    });

    test("no tools field on agent entry", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const agent = result.result.options.agents!["other-worker"];
      expect("tools" in agent).toBe(false);
    });

    test("failing sub-agent is excluded, session succeeds", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") throw new Error("activation failed");
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Agent map should be empty or not contain the failing worker
      const agentMap = result.result.options.agents;
      if (agentMap) {
        expect("other-worker" in agentMap).toBe(false);
      }
    });

    test("agent with soul content has prompt containing soul", async () => {
      const pkgWithSoul: DiscoveredPackage = {
        ...mockOtherWorkerPkg,
        metadata: mockOtherWorkerWithSoul,
      };

      let capturedContext: ActivationContext | undefined;
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, pkgWithSoul, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") {
              capturedContext = ctx;
            }
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(capturedContext).toBeDefined();
      expect(capturedContext!.soul).toBe("A thoughtful soul");
    });

    test("sub-agent receives empty memory regardless of loadMemories (REQ-SPO-1, REQ-SPO-2)", async () => {
      let capturedContext: ActivationContext | undefined;
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") {
              capturedContext = ctx;
            }
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(capturedContext).toBeDefined();
      expect(capturedContext!.injectedMemory).toBe("");
    });

    test("toolbox packages excluded from agent map", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Only toolbox-only package besides caller; no agents
      const agentMap = result.result.options.agents;
      expect(agentMap).toBeUndefined();
    });

    test("multiple workers: caller excluded, others included", async () => {
      const thirdWorkerMeta: WorkerMetadata = {
        ...mockOtherWorkerMeta,
        identity: { name: "third-worker", description: "Third", displayTitle: "Third Worker" },
      };
      const thirdWorkerPkg: DiscoveredPackage = {
        name: "@guild-hall/third-worker",
        path: "/tmp/packages/third-worker",
        metadata: thirdWorkerMeta,
      };

      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, thirdWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const agentMap = result.result.options.agents!;
      expect(Object.keys(agentMap)).toHaveLength(2);
      expect("other-worker" in agentMap).toBe(true);
      expect("third-worker" in agentMap).toBe(true);
      expect("test-worker" in agentMap).toBe(false);
    });

    test("all sub-agents fail gracefully: session succeeds with no agents", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") throw new Error("activation failed");
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // No agents or empty agents
      const agentMap = result.result.options.agents;
      if (agentMap) {
        expect(Object.keys(agentMap)).toHaveLength(0);
      }
    });

    test("model field always present on agent entry even when subAgentModel omitted", async () => {
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const agent = result.result.options.agents!["other-worker"];
      expect(agent.model).toBe("inherit");
      expect(agent.model).toBeDefined();
    });

    test("loadMemories called exactly once for calling worker, not for sub-agents (REQ-SPO-1)", async () => {
      const memoryCalls: string[] = [];
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, mockOtherWorkerPkg, mockToolboxPkg] }),
        makeDeps({
          loadMemories: async (name) => {
            memoryCalls.push(name);
            return { memoryBlock: "test memories" };
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(memoryCalls).toEqual(["test-worker"]);
    });

    test("sub-agent context has empty memory but retains soul, identity, posture, model (REQ-SPO-3)", async () => {
      const pkgWithSoul: DiscoveredPackage = {
        ...mockOtherWorkerPkg,
        metadata: {
          ...mockOtherWorkerMeta,
          soul: "A thoughtful soul",
          model: "haiku",
        },
      };

      let capturedContext: ActivationContext | undefined;
      const result = await prepareSdkSession(
        makeSpec({ packages: [mockWorkerPkg, pkgWithSoul, mockToolboxPkg] }),
        makeDeps({
          activateWorker: async (_pkg, ctx) => {
            if (ctx.identity.name === "other-worker") {
              capturedContext = ctx;
            }
            return mockActivation;
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(capturedContext).toBeDefined();
      expect(capturedContext!.injectedMemory).toBe("");
      expect(capturedContext!.soul).toBe("A thoughtful soul");
      expect(capturedContext!.identity).toEqual(mockOtherWorkerMeta.identity);
      expect(capturedContext!.posture).toBe("diligent reviewer");
      expect(capturedContext!.model).toBe("haiku");
      expect(capturedContext!.projectPath).toBe("/tmp/project");
      expect(capturedContext!.workingDirectory).toBe("/tmp/workspace");
      // Sub-agent context should not have memoryGuidance (REQ-SPO-10)
      expect(capturedContext!.memoryGuidance).toBeUndefined();
    });
  });

  // -- Tool availability enforcement tests (REQ-TAE-10) --

  test("prepareSdkSession includes tools matching worker builtInTools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [{ name: "test-server" } as ResolvedToolSet["mcpServers"][number]],
        allowedTools: ["Read", "Glob", "Grep", "mcp__test-server__*"],
        builtInTools: ["Read", "Glob", "Grep"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        sessionContext: "",
        tools: context.resolvedTools,
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
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        sessionContext: "",
        tools: context.resolvedTools,
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
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        sessionContext: "",
        tools: context.resolvedTools,
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
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        sessionContext: "",
        tools: context.resolvedTools,
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
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        sessionContext: "",
        tools: context.resolvedTools,
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
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker",
    sessionContext: "",
    model: "sonnet",
    tools: mockResolvedTools,
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
