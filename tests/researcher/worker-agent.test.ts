import { describe, expect, it } from "bun:test";

import { spawnWorkerAgent } from "@/guild-members/researcher/worker-agent";
import type { QueryFn } from "@/lib/agent";
import type { SDKMessage, McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

// -- Mock SDK message factories --

function makeSuccessResult(resultText: string, sessionId = "worker-session-1"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: false,
    num_turns: 1,
    result: resultText,
    stop_reason: "end_turn",
    total_cost_usd: 0.02,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000001",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeInitMessage(sessionId = "worker-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000002",
    agents: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.45",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
  } as unknown as SDKMessage;
}

// -- Mock query function factories --

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
 * Creates a capturing mock query function that records the options passed.
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

function createErrorQueryFn(errorMessage: string): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      throw new Error(errorMessage);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

// -- Mock internal tools --

const mockInternalTools: McpSdkServerConfigWithInstance = {
  type: "sdk",
  name: "worker-internal",
  instance: {} as McpSdkServerConfigWithInstance["instance"],
};

// -- Tests --

describe("spawnWorkerAgent", () => {
  it("passes correct options to queryFn", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Research report"),
    ]);

    await spawnWorkerAgent(
      "Find papers on AI",
      "You are a research agent...",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toBe("Find papers on AI");

    const opts = calls[0].options;
    expect(opts.systemPrompt).toBe("You are a research agent...");
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.settingSources).toEqual([]);
    expect(opts.persistSession).toBe(false);
  });

  it("receives only read-only tools plus internal MCP server", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    const opts = calls[0].options;
    expect(opts.tools).toEqual(["Read", "Grep", "Glob", "WebSearch", "WebFetch"]);

    const mcpServers = opts.mcpServers as Record<string, unknown>;
    expect(Object.keys(mcpServers)).toEqual(["worker-internal"]);
    expect(mcpServers["worker-internal"]).toBe(mockInternalTools);
  });

  it("uses bypassPermissions mode", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.permissionMode).toBe("bypassPermissions");
  });

  it("uses empty settingSources for isolation", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.settingSources).toEqual([]);
  });

  it("returns result text on agent completion", async () => {
    const queryFn = createMockQueryFn([
      makeInitMessage(),
      makeSuccessResult("Final research report with findings"),
    ]);

    const result = await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(result).toBe("Final research report with findings");
  });

  it("throws when agent yields no success result", async () => {
    const queryFn = createMockQueryFn([
      makeInitMessage(),
      // No success result message
    ]);

    await expect(
      spawnWorkerAgent(
        "task",
        "prompt",
        mockInternalTools,
        undefined,
        queryFn,
        new AbortController(),
      ),
    ).rejects.toThrow("Worker agent completed without producing a result");
  });

  it("throws when agent fails (for dispatch handler .catch())", async () => {
    const queryFn = createErrorQueryFn("Agent crashed");

    let caught: Error | null = null;
    try {
      await spawnWorkerAgent(
        "task",
        "prompt",
        mockInternalTools,
        undefined,
        queryFn,
        new AbortController(),
      );
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toBe("Agent crashed"); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies caught is not null
  });

  it("passes AbortController through to query options", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    const controller = new AbortController();

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      controller,
    );

    expect(calls[0].options.abortController).toBe(controller);
  });

  it("uses default maxTurns of 30 when config is undefined", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxTurns).toBe(30);
  });

  it("uses default maxBudgetUsd of 0.50 when config is undefined", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      undefined,
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxBudgetUsd).toBe(0.5);
  });

  it("overrides maxTurns from config", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      { maxTurns: 10 },
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxTurns).toBe(10);
  });

  it("overrides maxBudgetUsd from config", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      { maxBudgetUsd: 1.5 },
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxBudgetUsd).toBe(1.5);
  });

  it("ignores non-numeric maxTurns in config and uses default", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      { maxTurns: "not a number" },
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxTurns).toBe(30);
  });

  it("ignores non-numeric maxBudgetUsd in config and uses default", async () => {
    const { queryFn, calls } = createCapturingQueryFn([
      makeInitMessage(),
      makeSuccessResult("Report"),
    ]);

    await spawnWorkerAgent(
      "task",
      "prompt",
      mockInternalTools,
      { maxBudgetUsd: "expensive" },
      queryFn,
      new AbortController(),
    );

    expect(calls[0].options.maxBudgetUsd).toBe(0.5);
  });
});
