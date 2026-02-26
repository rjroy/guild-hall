import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  loadConfig,
  buildActivationContext,
  buildQueryOptions,
  main,
} from "@/daemon/commission-worker";
import type { WorkerDeps, QueryFn, CommissionQueryOptions } from "@/daemon/commission-worker";
import type { CommissionWorkerConfig } from "@/daemon/services/commission-worker-config";
import type {
  ActivationResult,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-worker-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const validConfig: CommissionWorkerConfig = {
  commissionId: "commission-researcher-20260221-143000",
  projectName: "guild-hall",
  projectPath: "/home/user/projects/guild-hall",
  workerPackageName: "guild-hall-sample-assistant",
  prompt: "Research OAuth 2.0 patterns for CLI tools",
  dependencies: [],
  workingDirectory: "/tmp/guild-hall-abc123",
  daemonSocketPath: "/home/user/.guild-hall/guild-hall.sock",
  packagesDir: "/home/user/.guild-hall/packages",
  guildHallHome: "/home/user/.guild-hall",
};

const testWorkerMeta: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "researcher",
    description: "A research specialist",
    displayTitle: "Research Specialist",
  },
  posture: "You are a careful research specialist.",
  domainToolboxes: [],
  builtInTools: [],
  checkoutScope: "sparse",
  resourceDefaults: {
    maxTurns: 100,
    maxBudgetUsd: 1.0,
  },
};

const testResolvedTools: ResolvedToolSet = {
  mcpServers: [],
  allowedTools: ["Read", "Write"],
};

// -- loadConfig --

describe("loadConfig", () => {
  test("reads and validates a config file from --config flag", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(validConfig), "utf-8");

    const result = await loadConfig(["--config", configPath]);

    expect(result.commissionId).toBe("commission-researcher-20260221-143000");
    expect(result.projectName).toBe("guild-hall");
    expect(result.prompt).toBe("Research OAuth 2.0 patterns for CLI tools");
    expect(result.dependencies).toEqual([]);
  });

  test("throws when --config flag is missing", async () => {
    await expect(loadConfig([])).rejects.toThrow("Missing required --config flag");
  });

  test("throws when config file does not exist", async () => {
    const bogusPath = path.join(tmpDir, "nonexistent.json");
    await expect(loadConfig(["--config", bogusPath])).rejects.toThrow();
  });

  test("throws when config file contains invalid JSON", async () => {
    const configPath = path.join(tmpDir, "bad.json");
    await fs.writeFile(configPath, "not json", "utf-8");
    await expect(loadConfig(["--config", configPath])).rejects.toThrow();
  });

  test("throws when config file is missing required fields", async () => {
    const configPath = path.join(tmpDir, "incomplete.json");
    await fs.writeFile(configPath, JSON.stringify({ commissionId: "x" }), "utf-8");
    await expect(loadConfig(["--config", configPath])).rejects.toThrow();
  });

  test("parses config with resourceOverrides", async () => {
    const config = {
      ...validConfig,
      resourceOverrides: { maxTurns: 50, maxBudgetUsd: 2.5 },
    };
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config), "utf-8");

    const result = await loadConfig(["--config", configPath]);

    expect(result.resourceOverrides?.maxTurns).toBe(50);
    expect(result.resourceOverrides?.maxBudgetUsd).toBe(2.5);
  });
});

// -- buildActivationContext --

describe("buildActivationContext", () => {
  test("builds context with commission fields", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.posture).toBe("You are a careful research specialist.");
    expect(context.injectedMemory).toBe("");
    expect(context.resolvedTools).toBe(testResolvedTools);
    expect(context.projectPath).toBe("/home/user/projects/guild-hall");
    expect(context.workingDirectory).toBe("/tmp/guild-hall-abc123");
  });

  test("includes commissionContext with prompt and dependencies", () => {
    const config = {
      ...validConfig,
      dependencies: ["dep-1", "dep-2"],
    };

    const context = buildActivationContext(
      config,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.commissionContext).toBeDefined();
    expect(context.commissionContext!.commissionId).toBe(
      "commission-researcher-20260221-143000",
    );
    expect(context.commissionContext!.prompt).toBe(
      "Research OAuth 2.0 patterns for CLI tools",
    );
    expect(context.commissionContext!.dependencies).toEqual(["dep-1", "dep-2"]);
  });

  test("does not include meetingContext", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.meetingContext).toBeUndefined();
  });

  test("passes worker resourceDefaults", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.resourceDefaults.maxTurns).toBe(100);
    expect(context.resourceDefaults.maxBudgetUsd).toBe(1.0);
  });

  test("handles worker without resourceDefaults", () => {
    const workerNoDefaults: WorkerMetadata = {
      ...testWorkerMeta,
      resourceDefaults: undefined,
    };

    const context = buildActivationContext(
      validConfig,
      workerNoDefaults,
      testResolvedTools,
    );

    expect(context.resourceDefaults.maxTurns).toBeUndefined();
    expect(context.resourceDefaults.maxBudgetUsd).toBeUndefined();
  });
});

// -- buildQueryOptions --

describe("buildQueryOptions", () => {
  const testActivation: ActivationResult = {
    systemPrompt: "You are a research specialist.",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Write"],
    },
    resourceBounds: {
      maxTurns: 100,
      maxBudgetUsd: 1.0,
    },
  };

function assertPresetSystemPrompt(
  value: unknown,
): asserts value is { type: "preset"; preset: string; append: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected systemPrompt to be an object");
  }

  if (!("type" in value) || (value as { type?: unknown }).type !== "preset") {
    throw new Error("Expected systemPrompt.type to be 'preset'");
  }

  if (!("preset" in value) || typeof (value as { preset?: unknown }).preset !== "string") {
    throw new Error("Expected systemPrompt.preset to be a string");
  }

  if (!("append" in value) || typeof (value as { append?: unknown }).append !== "string") {
    throw new Error("Expected systemPrompt.append to be a string");
  }
}

  test("builds options with activation values as defaults", () => {
    const options = buildQueryOptions(validConfig, testActivation);

    assertPresetSystemPrompt(options.systemPrompt);
    expect(options.systemPrompt.type).toBe("preset");
    expect(options.systemPrompt.preset).toBe("claude_code");
    expect(options.systemPrompt.append).toBe("You are a research specialist.");
    expect(options.allowedTools).toEqual(["Read", "Write"]);
    expect(options.maxTurns).toBe(100);
    expect(options.maxBudgetUsd).toBe(1.0);
    expect(options.permissionMode).toBe("dontAsk");
    expect(options.settingSources).toEqual(["local", "project", "user"]);
    expect(options.cwd).toBe("/tmp/guild-hall-abc123");
    expect(options.includePartialMessages).toBe(false);
  });

  test("commission resourceOverrides take priority over worker defaults", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 50,
        maxBudgetUsd: 5.0,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    expect(options.maxTurns).toBe(50);
    expect(options.maxBudgetUsd).toBe(5.0);
  });

  test("falls back to undefined maxTurns when neither override nor worker default", () => {
    const activationNoDefaults: ActivationResult = {
      ...testActivation,
      resourceBounds: {},
    };

    const options = buildQueryOptions(validConfig, activationNoDefaults);

    expect(options.maxTurns).toBeUndefined();
  });

  test("omits maxBudgetUsd when neither override nor worker default", () => {
    const activationNoDefaults: ActivationResult = {
      ...testActivation,
      resourceBounds: {},
    };

    const options = buildQueryOptions(validConfig, activationNoDefaults);

    expect(options).not.toHaveProperty("maxBudgetUsd");
  });

  test("partial resourceOverrides: only maxTurns overridden", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 25,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    expect(options.maxTurns).toBe(25);
    // maxBudgetUsd should fall through to worker default
    expect(options.maxBudgetUsd).toBe(1.0);
  });

  test("partial resourceOverrides: only maxBudgetUsd overridden", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxBudgetUsd: 10.0,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    // maxTurns should fall through to worker default
    expect(options.maxTurns).toBe(100);
    expect(options.maxBudgetUsd).toBe(10.0);
  });

  test("builds mcpServers record from activation tools", () => {
    const activationWithServers: ActivationResult = {
      ...testActivation,
      tools: {
        mcpServers: [
          { name: "guild-hall-base", type: "sdk" as const, instance: {} as never },
          { name: "guild-hall-commission", type: "sdk" as const, instance: {} as never },
        ],
        allowedTools: [],
      },
    };

    const options = buildQueryOptions(validConfig, activationWithServers);

    expect(options.mcpServers).toHaveProperty("guild-hall-base");
    expect(options.mcpServers).toHaveProperty("guild-hall-commission");
  });
});

// -- main() with injected deps --

describe("main", () => {
  /** Creates a mock query function that yields the given messages then returns. */
  function createMockQuery(messages: SDKMessage[] = []): QueryFn {
    // eslint-disable-next-line @typescript-eslint/require-await
    return async function* mockQuery() {
      for (const msg of messages) {
        yield msg;
      }
    };
  }

  /** System/init message that provides a session_id for resume support. */
  const initMessage = {
    type: "system",
    subtype: "init",
    session_id: "test-session-001",
  } as unknown as SDKMessage;

  /** Builds a full WorkerDeps with all mocks wired up. Callers can override individual deps. */
  function createMockDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
    const resultSubmitted = { value: true };

    return {
      query: createMockQuery([
        initMessage,
        { type: "assistant", message: { content: [{ type: "text", text: "Working on it..." }] } } as unknown as SDKMessage,
        { type: "result", stop_reason: "end_turn", message: { content: [] } } as unknown as SDKMessage,
      ]),
      // eslint-disable-next-line @typescript-eslint/require-await
      discoverPackages: async () => [
        {
          name: "guild-hall-sample-assistant",
          path: "/mock/packages/guild-hall-sample-assistant",
          type: "worker" as const,
          metadata: testWorkerMeta,
        },
      ],
      getWorkerByName: (_packages, name) => {
        if (name === "guild-hall-sample-assistant") {
          return {
            name: "guild-hall-sample-assistant",
            path: "/mock/packages/guild-hall-sample-assistant",
            type: "worker" as const,
            metadata: testWorkerMeta,
          };
        }
        return undefined;
      },
      resolveToolSet: () => ({
        mcpServers: [],
        allowedTools: ["Read", "Write"],
        wasResultSubmitted: () => resultSubmitted.value,
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      loadMemories: async () => ({
        memoryBlock: "",
        needsCompaction: false,
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      triggerCompaction: async () => {},
      // eslint-disable-next-line @typescript-eslint/require-await
      importWorkerModule: async () => ({
        activate: () => ({
          systemPrompt: "You are a test worker.",
          tools: { mcpServers: [], allowedTools: ["Read"] },
          resourceBounds: { maxTurns: 10 },
        }),
      }),
      ...overrides,
    };
  }

  /** Writes a valid config to a temp file and sets Bun.argv so loadConfig() finds it. */
  async function writeConfigAndSetArgv(
    dir: string,
    config: CommissionWorkerConfig = validConfig,
  ): Promise<void> {
    const configPath = path.join(dir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config), "utf-8");
    // main() calls loadConfig(Bun.argv.slice(2)), so set Bun.argv[2] and [3].
    (Bun as unknown as { argv: string[] }).argv = [
      "bun",
      "commission-worker.ts",
      "--config",
      configPath,
    ];
  }

  let savedArgv: string[];

  beforeEach(() => {
    savedArgv = [...Bun.argv];
  });

  afterEach(() => {
    (Bun as unknown as { argv: string[] }).argv = savedArgv;
  });

  test("runs to completion with mock SDK (no real API calls)", async () => {
    await writeConfigAndSetArgv(tmpDir);
    const deps = createMockDeps();
    await main(deps);
    // If we get here without throwing, the happy path worked.
  });

  test("throws when worker package not found", async () => {
    await writeConfigAndSetArgv(tmpDir);
    const deps = createMockDeps({
      getWorkerByName: () => undefined,
    });
    await expect(main(deps)).rejects.toThrow(
      'Worker package "guild-hall-sample-assistant" not found',
    );
  });

  test("runs follow-up session when submit_result was not called", async () => {
    await writeConfigAndSetArgv(tmpDir);
    const queryCalls: Array<{ prompt: string; options: CommissionQueryOptions }> = [];
    const callCount = { n: 0 };

    // eslint-disable-next-line @typescript-eslint/require-await
    const mockQuery: QueryFn = async function* (params) {
      callCount.n++;
      queryCalls.push(params);
      // First call: emit init message with session_id so resume can work
      if (callCount.n === 1) {
        yield initMessage;
      }
      yield { type: "result", stop_reason: "end_turn", message: { content: [] } } as unknown as SDKMessage;
    };

    // wasResultSubmitted returns false on first check, true on second (after follow-up)
    let submitCheckCount = 0;
    const deps = createMockDeps({
      query: mockQuery,
      resolveToolSet: () => ({
        mcpServers: [],
        allowedTools: [],
        wasResultSubmitted: () => {
          submitCheckCount++;
          // First call (after main session): not submitted yet
          // Second call (after follow-up): submitted
          return submitCheckCount > 1;
        },
      }),
    });

    await main(deps);
    expect(callCount.n).toBe(2); // main session + follow-up
    expect(queryCalls[1].prompt).toContain("submit_result");
    expect(queryCalls[1].options.resume).toBe("test-session-001");
  });

  test("fires compaction when memory exceeds limit", async () => {
    await writeConfigAndSetArgv(tmpDir);
    let compactionCalled = false;

    const deps = createMockDeps({
      // eslint-disable-next-line @typescript-eslint/require-await
      loadMemories: async () => ({
        memoryBlock: "prior memories...",
        needsCompaction: true,
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      triggerCompaction: async () => {
        compactionCalled = true;
      },
    });

    await main(deps);
    // triggerCompaction is fire-and-forget (void), but our mock is synchronous
    expect(compactionCalled).toBe(true);
  });

  test("handles memory load failure gracefully", async () => {
    await writeConfigAndSetArgv(tmpDir);
    const deps = createMockDeps({
      // eslint-disable-next-line @typescript-eslint/require-await
      loadMemories: async () => {
        throw new Error("filesystem exploded");
      },
    });

    // Should not throw; memory failure is non-fatal
    await main(deps);
  });

  test("passes commission prompt to SDK query", async () => {
    const customConfig: CommissionWorkerConfig = {
      ...validConfig,
      prompt: "Analyze the OAuth flow",
    };
    await writeConfigAndSetArgv(tmpDir, customConfig);

    let capturedPrompt = "";
    // eslint-disable-next-line @typescript-eslint/require-await
    const mockQuery: QueryFn = async function* (params) {
      capturedPrompt = (params as { prompt: string }).prompt;
      yield { type: "result", stop_reason: "end_turn", message: { content: [] } } as unknown as SDKMessage;
    };

    const deps = createMockDeps({ query: mockQuery });
    await main(deps);
    expect(capturedPrompt).toBe("Analyze the OAuth flow");
  });
});