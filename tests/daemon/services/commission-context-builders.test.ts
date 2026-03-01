import { describe, test, expect } from "bun:test";
import {
  buildCommissionActivationContext,
  buildCommissionQueryOptions,
} from "@/daemon/services/commission-context-builders";
import type {
  ActivationResult,
  WorkerMetadata,
  ResolvedToolSet,
} from "@/lib/types";

function makeWorkerMeta(overrides: Partial<WorkerMetadata> = {}): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name: "researcher",
      description: "Research specialist",
      displayTitle: "Research Specialist",
    },
    posture: "You are a research specialist.",
    domainToolboxes: [],
    builtInTools: [],
    checkoutScope: "sparse",
    resourceDefaults: {
      maxTurns: 150,
      maxBudgetUsd: 1.0,
    },
    ...overrides,
  };
}

function makeResolvedTools(): ResolvedToolSet {
  return { mcpServers: [], allowedTools: ["read_file"] };
}

describe("buildCommissionActivationContext", () => {
  test("assembles all fields", () => {
    const ctx = buildCommissionActivationContext(
      "commission-123",
      "Do research",
      [".lore/specs/auth.md"],
      makeWorkerMeta(),
      makeResolvedTools(),
      "/projects/myapp",
      "/tmp/worktree",
    );

    expect(ctx.posture).toBe("You are a research specialist.");
    expect(ctx.injectedMemory).toBe("");
    expect(ctx.resolvedTools.allowedTools).toEqual(["read_file"]);
    expect(ctx.resourceDefaults.maxTurns).toBe(150);
    expect(ctx.resourceDefaults.maxBudgetUsd).toBe(1.0);
    expect(ctx.commissionContext).toEqual({
      commissionId: "commission-123",
      prompt: "Do research",
      dependencies: [".lore/specs/auth.md"],
    });
    expect(ctx.projectPath).toBe("/projects/myapp");
    expect(ctx.workingDirectory).toBe("/tmp/worktree");
  });

  test("passes injected memory when provided", () => {
    const ctx = buildCommissionActivationContext(
      "commission-123",
      "prompt",
      [],
      makeWorkerMeta(),
      makeResolvedTools(),
      "/p",
      "/w",
      "# Memory\nPrevious context here",
    );

    expect(ctx.injectedMemory).toBe("# Memory\nPrevious context here");
  });

  test("handles worker with no resource defaults", () => {
    const ctx = buildCommissionActivationContext(
      "commission-123",
      "prompt",
      [],
      makeWorkerMeta({ resourceDefaults: undefined }),
      makeResolvedTools(),
      "/p",
      "/w",
    );

    expect(ctx.resourceDefaults.maxTurns).toBeUndefined();
    expect(ctx.resourceDefaults.maxBudgetUsd).toBeUndefined();
  });
});

describe("buildCommissionQueryOptions", () => {
  function makeActivation(overrides: Partial<ActivationResult> = {}): ActivationResult {
    return {
      systemPrompt: "You are a test worker.",
      tools: {
        mcpServers: [],
        allowedTools: ["read_file", "write_file"],
      },
      resourceBounds: {
        maxTurns: 100,
        maxBudgetUsd: 0.5,
      },
      ...overrides,
    };
  }

  test("uses activation defaults when no overrides", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
    );

    expect(opts.cwd).toBe("/tmp/work");
    expect(opts.maxTurns).toBe(100);
    expect(opts.maxBudgetUsd).toBe(0.5);
    expect(opts.allowedTools).toEqual(["read_file", "write_file"]);
    expect(opts.permissionMode).toBe("dontAsk");
  });

  test("commission overrides take priority over worker defaults", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
      { maxTurns: 50, maxBudgetUsd: 2.0 },
    );

    expect(opts.maxTurns).toBe(50);
    expect(opts.maxBudgetUsd).toBe(2.0);
  });

  test("partial overrides only replace specified fields", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
      { maxTurns: 200 },
    );

    expect(opts.maxTurns).toBe(200);
    expect(opts.maxBudgetUsd).toBe(0.5);
  });

  test("converts MCP servers to a Record keyed by name", () => {
    const server = { name: "test-server", command: "test" };
    const opts = buildCommissionQueryOptions(
      makeActivation({
        tools: {
          mcpServers: [server as never],
          allowedTools: [],
        },
      }),
      "/tmp/work",
    );

    const servers = opts.mcpServers as Record<string, unknown>;
    expect(servers["test-server"]).toEqual(server);
  });

  test("includes abort controller when provided", () => {
    const ac = new AbortController();
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
      undefined,
      ac,
    );

    expect(opts.abortController).toBe(ac);
  });

  test("omits abort controller when not provided", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
    );

    expect("abortController" in opts).toBe(false);
  });

  test("includes model when activation specifies one", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation({ model: "claude-sonnet-4-5-20250514" }),
      "/tmp/work",
    );

    expect(opts.model).toBe("claude-sonnet-4-5-20250514");
  });

  test("omits model when activation has none", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation(),
      "/tmp/work",
    );

    expect("model" in opts).toBe(false);
  });

  test("sets systemPrompt with preset and append", () => {
    const opts = buildCommissionQueryOptions(
      makeActivation({ systemPrompt: "Custom prompt" }),
      "/tmp/work",
    );

    expect(opts.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: "Custom prompt",
    });
  });
});
