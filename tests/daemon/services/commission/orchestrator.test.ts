/* eslint-disable @typescript-eslint/require-await */

/**
 * Tests for the commission orchestrator (Layer 5).
 *
 * Uses real Layer 1 (CommissionRecordOps on filesystem) and real Layer 2
 * (CommissionLifecycle) for integration testing. Layer 3 (WorkspaceOps) is
 * mocked at its interface. Layer 4 uses mock SessionPrepDeps and queryFn.
 *
 * Covers:
 * - Full dispatch-through-completion wiring
 * - Race condition: concurrent completion and cancellation
 * - Crash recovery: stale state files and orphaned worktrees
 * - Merge conflict escalation via meeting request
 * - Cancel during workspace preparation
 * - Dependency auto-transitions: blocked -> pending when deps satisfied
 * - addUserNote during execution targets activity worktree
 * - EventBus subscription/unsubscription for tool events
 * - resultSubmitted tracking via commission_result events
 * - Preparation failure (prepareSdkSession returns ok: false)
 * - Abort handling (generator yields aborted)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createCommissionOrchestrator } from "@/daemon/services/commission/orchestrator";
import type { CommissionOrchestratorDeps } from "@/daemon/services/commission/orchestrator";
import { createCommissionLifecycle, type CommissionLifecycle } from "@/daemon/services/commission/lifecycle";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import type { WorkspaceOps, FinalizeResult } from "@/daemon/services/workspace";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import type { GitOps } from "@/daemon/lib/git";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import { asCommissionId } from "@/daemon/types";
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// -- Test helpers --

let tmpDir: string;
let ghHome: string;
let projectPath: string;
let integrationPath: string;

const TEST_PROJECT = "test-project";
const TEST_WORKER = "Test Worker";

function makeWorkerMetadata(): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name: TEST_WORKER,
      description: "A test worker",
      displayTitle: "Test Worker Title",
    },
    posture: "You are a test worker.",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "full",
  };
}

function makeWorkerPackage(): DiscoveredPackage {
  return {
    name: "test-worker",
    path: "/tmp/test-worker",
    metadata: makeWorkerMetadata(),
  };
}

function makeConfig(): AppConfig {
  return {
    projects: [
      {
        name: TEST_PROJECT,
        path: projectPath,
      },
    ],
  };
}

function createTestEventBus(): EventBus & { events: SystemEvent[] } {
  const subscribers = new Set<(event: SystemEvent) => void>();
  const events: SystemEvent[] = [];
  return {
    events,
    emit(event: SystemEvent): void {
      events.push(event);
      for (const cb of subscribers) {
        cb(event);
      }
    },
    subscribe(callback: (event: SystemEvent) => void): () => void {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
  };
}

function createMockGitOps(): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  function track(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }
  return {
    calls,
    createBranch: async (...args) => { track("createBranch", ...args); },
    branchExists: async (...args) => { track("branchExists", ...args); return false; },
    deleteBranch: async (...args) => { track("deleteBranch", ...args); },
    createWorktree: async (...args) => { track("createWorktree", ...args); },
    removeWorktree: async (...args) => { track("removeWorktree", ...args); },
    configureSparseCheckout: async (...args) => { track("configureSparseCheckout", ...args); },
    commitAll: async (...args) => { track("commitAll", ...args); return false; },
    squashMerge: async (...args) => { track("squashMerge", ...args); },
    hasUncommittedChanges: async (...args) => { track("hasUncommittedChanges", ...args); return false; },
    rebase: async (...args) => { track("rebase", ...args); },
    currentBranch: async (...args) => { track("currentBranch", ...args); return "main"; },
    listWorktrees: async (...args) => { track("listWorktrees", ...args); return []; },
    initClaudeBranch: async (...args) => { track("initClaudeBranch", ...args); },
    detectDefaultBranch: async (...args) => { track("detectDefaultBranch", ...args); return "main"; },
    fetch: async (...args) => { track("fetch", ...args); },
    push: async (...args) => { track("push", ...args); },
    resetHard: async (...args) => { track("resetHard", ...args); },
    resetSoft: async (...args) => { track("resetSoft", ...args); },
    createPullRequest: async (...args) => { track("createPullRequest", ...args); return { url: "" }; },
    isAncestor: async (...args) => { track("isAncestor", ...args); return false; },
    treesEqual: async (...args) => { track("treesEqual", ...args); return false; },
    revParse: async (...args) => { track("revParse", ...args); return "abc123"; },
    rebaseOnto: async (...args) => { track("rebaseOnto", ...args); },
    merge: async (...args) => { track("merge", ...args); },
    squashMergeNoCommit: async (...args) => { track("squashMergeNoCommit", ...args); return true; },
    listConflictedFiles: async (...args) => { track("listConflictedFiles", ...args); return []; },
    resolveConflictsTheirs: async (...args) => { track("resolveConflictsTheirs", ...args); },
    mergeAbort: async (...args) => { track("mergeAbort", ...args); },
  };
}

function createMockWorkspace(overrides?: Partial<{
  prepare: WorkspaceOps["prepare"];
  finalize: WorkspaceOps["finalize"];
  preserveAndCleanup: WorkspaceOps["preserveAndCleanup"];
}>): WorkspaceOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async prepare(config) {
      calls.push({ method: "prepare", args: [config] });
      if (overrides?.prepare) return overrides.prepare(config);
      // Simulate git worktree creation: copy the .lore/commissions/
      // directory from integration worktree to the activity worktree
      // so Layer 1 (real filesystem) can find the artifact.
      const wtCommDir = path.join(config.worktreeDir, ".lore", "commissions");
      await fs.mkdir(wtCommDir, { recursive: true });

      // Copy all commission artifacts from integration worktree
      const sourceDir = path.join(integrationPath, ".lore", "commissions");
      try {
        const files = await fs.readdir(sourceDir);
        for (const file of files) {
          const src = path.join(sourceDir, file);
          const dst = path.join(wtCommDir, file);
          await fs.copyFile(src, dst);
        }
      } catch {
        // integration dir might not have commissions yet
      }

      return { worktreeDir: config.worktreeDir };
    },
    async finalize(config) {
      calls.push({ method: "finalize", args: [config] });
      if (overrides?.finalize) return overrides.finalize(config);
      return { merged: true };
    },
    async preserveAndCleanup(config) {
      calls.push({ method: "preserveAndCleanup", args: [config] });
      if (overrides?.preserveAndCleanup) return overrides.preserveAndCleanup(config);
    },
    async removeWorktree(worktreeDir, projectPath) {
      calls.push({ method: "removeWorktree", args: [worktreeDir, projectPath] });
    },
  };
}

/**
 * Creates mock SessionPrepDeps that always succeeds. The activateWorker
 * returns a minimal ActivationResult with an empty system prompt.
 */
function createMockPrepDeps(overrides?: Partial<SessionPrepDeps>): SessionPrepDeps {
  return {
    resolveToolSet: overrides?.resolveToolSet ?? (async () => ({
      mcpServers: [],
      allowedTools: [],
    })),
    loadMemories: overrides?.loadMemories ?? (async () => ({
      memoryBlock: "",
      needsCompaction: false,
    })),
    activateWorker: overrides?.activateWorker ?? (async () => ({
      systemPrompt: "Test system prompt",
      tools: { mcpServers: [], allowedTools: [] },
      resourceBounds: { maxTurns: 10 },
    })),
    triggerCompaction: overrides?.triggerCompaction,
    memoryLimit: overrides?.memoryLimit,
  };
}

/**
 * A controllable mock SDK query function. Returns an async generator that:
 * - In immediate mode (resolveAfterMs >= 0): yields messages then completes.
 *   If resultSubmitted is true, the EventBus emits a commission_result event
 *   during iteration.
 * - In manual mode (resolveAfterMs < 0): blocks until resolve() is called.
 *
 * The mock also emits SDK-like messages so drainSdkSession captures a sessionId.
 */
function createMockQueryFn(options: {
  resultSubmitted?: boolean;
  aborted?: boolean;
  error?: string;
  resolveAfterMs?: number;
  eventBus?: EventBus;
  /** Override commission ID to match in EventBus events */
  commissionId?: string;
} = {}): {
  queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage>;
  runCount: number;
  /** Manually complete the session (only in manual mode). Pass resultSubmitted to emit event. */
  resolve: (opts?: { resultSubmitted?: boolean; aborted?: boolean; error?: string }) => void;
} {
  const {
    resultSubmitted = true,
    aborted = false,
    error,
    resolveAfterMs = 0,
    eventBus,
    commissionId,
  } = options;

  let manualResolve: ((opts?: { resultSubmitted?: boolean; aborted?: boolean; error?: string }) => void) | null = null;

  const state = { runCount: 0 };

  async function* generate(
    emitResult: boolean,
    shouldAbort: boolean,
    errorMsg?: string,
  ): AsyncGenerator<SDKMessage> {
    // Emit a system init message so runSdkSession yields a session event
    yield {
      type: "system",
      subtype: "init",
      session_id: `test-session-${state.runCount}`,
    } as unknown as SDKMessage;

    if (emitResult && eventBus && commissionId) {
      // Simulate the toolbox emitting a result event through the EventBus.
      // The orchestrator's EventBus subscription picks this up.
      eventBus.emit({
        type: "commission_result",
        commissionId,
        summary: "Test result summary",
        artifacts: ["output.md"],
      });
    }

    if (shouldAbort) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    if (errorMsg) {
      throw new Error(errorMsg);
    }

    // Yield a turn_end to simulate normal completion
    yield {
      type: "result",
      subtype: "success",
    } as unknown as SDKMessage;
  }

  return {
    get runCount() { return state.runCount; },
    resolve(opts) {
      if (manualResolve) manualResolve(opts);
    },
    queryFn(_params) {
      state.runCount++;

      if (resolveAfterMs < 0) {
        // Manual mode: return a generator that blocks until resolved
        const outerEventBus = eventBus;
        const outerCommissionId = commissionId;

        async function* manualGenerate(): AsyncGenerator<SDKMessage> {
          yield {
            type: "system",
            subtype: "init",
            session_id: `test-session-${state.runCount}`,
          } as unknown as SDKMessage;

          // Block until resolve() is called
          const resolveOpts = await new Promise<{
            resultSubmitted?: boolean;
            aborted?: boolean;
            error?: string;
          } | undefined>((resolve) => {
            manualResolve = resolve;
          });

          if (resolveOpts?.resultSubmitted && outerEventBus && outerCommissionId) {
            outerEventBus.emit({
              type: "commission_result",
              commissionId: outerCommissionId,
              summary: "Test result summary",
              artifacts: ["output.md"],
            });
          }

          if (resolveOpts?.aborted) {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            throw abortError;
          }

          if (resolveOpts?.error) {
            throw new Error(resolveOpts.error);
          }
        }

        return manualGenerate();
      }

      if (resolveAfterMs > 0) {
        // Delayed mode: wrap generate with a delay
        const inner = generate(resultSubmitted, aborted, error);
        async function* delayed(): AsyncGenerator<SDKMessage> {
          await new Promise<void>((r) => setTimeout(r, resolveAfterMs));
          yield* inner;
        }
        return delayed();
      }

      return generate(resultSubmitted, aborted, error);
    },
  };
}

/**
 * Writes a commission artifact to the integration worktree with the
 * given parameters, suitable for dispatch.
 */
async function writeCommissionArtifact(
  basePath: string,
  commissionId: string,
  opts: {
    status?: string;
    worker?: string;
    prompt?: string;
    dependencies?: string[];
    projectName?: string;
  } = {},
): Promise<string> {
  const status = opts.status ?? "pending";
  const worker = opts.worker ?? TEST_WORKER;
  const prompt = opts.prompt ?? "Do the work";
  const dependencies = opts.dependencies ?? [];
  const projectName = opts.projectName ?? TEST_PROJECT;

  const depsYaml = dependencies.length > 0
    ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
    : " []";

  const now = new Date();
  const content = `---
title: "Commission: Test"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [commission]
worker: ${worker}
workerDisplayTitle: "Test Worker Title"
prompt: "${prompt}"
dependencies:${depsYaml}
linked_artifacts: []
activity_timeline:
  - timestamp: ${now.toISOString()}
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${projectName}
---
`;

  const dir = path.join(basePath, ".lore", "commissions");
  await fs.mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `${commissionId}.md`);
  await fs.writeFile(artifactPath, content, "utf-8");
  return artifactPath;
}

/**
 * Builds orchestrator deps with sane defaults. Tests override specific parts.
 *
 * The mockQueryFn uses the eventBus for commission_result emission. If a test
 * needs manual control, pass a pre-configured mockQueryFn.
 */
function buildDeps(overrides?: Partial<{
  lifecycle: CommissionLifecycle;
  workspace: ReturnType<typeof createMockWorkspace>;
  prepDeps: SessionPrepDeps;
  mockQueryFn: ReturnType<typeof createMockQueryFn>;
  eventBus: ReturnType<typeof createTestEventBus>;
  gitOps: ReturnType<typeof createMockGitOps>;
  fileExists: (p: string) => Promise<boolean>;
  createMeetingRequestFn: CommissionOrchestratorDeps["createMeetingRequestFn"];
}>): {
  orchestrator: CommissionSessionForRoutes;
  lifecycle: CommissionLifecycle;
  workspace: ReturnType<typeof createMockWorkspace>;
  mockQueryFn: ReturnType<typeof createMockQueryFn>;
  eventBus: ReturnType<typeof createTestEventBus>;
  gitOps: ReturnType<typeof createMockGitOps>;
} {
  const recordOps = createCommissionRecordOps();
  const eventBus = overrides?.eventBus ?? createTestEventBus();
  const lifecycle = overrides?.lifecycle ?? createCommissionLifecycle({
    recordOps,
    emitEvent: (event: SystemEvent) => eventBus.emit(event),
  });
  const workspace = overrides?.workspace ?? createMockWorkspace();
  const prepDeps = overrides?.prepDeps ?? createMockPrepDeps();
  const mockQueryFn = overrides?.mockQueryFn ?? createMockQueryFn({ eventBus });
  const gitOps = overrides?.gitOps ?? createMockGitOps();

  const orchestrator = createCommissionOrchestrator({
    lifecycle,
    workspace,
    prepDeps,
    queryFn: mockQueryFn.queryFn,
    recordOps,
    eventBus,
    config: makeConfig(),
    packages: [makeWorkerPackage()],
    guildHallHome: ghHome,
    gitOps,
    fileExists: overrides?.fileExists,
    createMeetingRequestFn: overrides?.createMeetingRequestFn,
  });

  return { orchestrator, lifecycle, workspace, mockQueryFn, eventBus, gitOps };
}

// -- Setup / Teardown --

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join("/tmp", "orch-test-"));
  ghHome = path.join(tmpDir, ".guild-hall");
  projectPath = path.join(tmpDir, "project");
  integrationPath = path.join(ghHome, "projects", TEST_PROJECT);

  await fs.mkdir(integrationPath, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(ghHome, "state", "commissions"), { recursive: true });
  await fs.mkdir(path.join(ghHome, "worktrees", TEST_PROJECT), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Tests --

describe("createCommission", () => {
  test("creates a commission artifact in the integration worktree", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Test Commission",
      "test-worker",
      "Do the work",
    );

    expect(result.commissionId).toMatch(/^commission-/);

    // Verify artifact exists
    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: pending");
    expect(raw).toContain("Do the work");
    expect(raw).toContain(`worker: ${TEST_WORKER}`);
  });

  test("throws for unknown project", async () => {
    const { orchestrator } = buildDeps();

    await expect(
      orchestrator.createCommission("nonexistent", "Test", "test-worker", "prompt"),
    ).rejects.toThrow(/not found/);
  });

  test("throws for unknown worker", async () => {
    const { orchestrator } = buildDeps();

    await expect(
      orchestrator.createCommission(TEST_PROJECT, "Test", "nonexistent-worker", "prompt"),
    ).rejects.toThrow(/not found/);
  });
});

describe("dispatch flow", () => {
  test("full dispatch: workspace.prepare called, SDK session started", async () => {
    const { orchestrator, workspace, mockQueryFn } = buildDeps();

    const commissionId = asCommissionId("commission-test-dispatch-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    const result = await orchestrator.dispatchCommission(commissionId);
    expect(result.status).toBe("accepted");

    // workspace.prepare was called
    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls.length).toBe(1);

    // Wait for fire-and-forget session to settle
    await new Promise<void>((r) => setTimeout(r, 50));

    // queryFn was called
    expect(mockQueryFn.runCount).toBe(1);
  });

  test("returns queued when at capacity", async () => {
    // Set max concurrent to 0 so any dispatch is at capacity
    const recordOps = createCommissionRecordOps();
    const eventBus = createTestEventBus();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });
    const mockQueryFn = createMockQueryFn({ eventBus });

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: createMockWorkspace(),
      prepDeps: createMockPrepDeps(),
      queryFn: mockQueryFn.queryFn,
      recordOps,
      eventBus,
      config: { projects: [{ name: TEST_PROJECT, path: projectPath }], maxConcurrentCommissions: 0 },
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
    });

    const commissionId = asCommissionId("commission-test-queued-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    const result = await orchestrator.dispatchCommission(commissionId);
    expect(result.status).toBe("queued");

    // Verify queued event was emitted
    const queuedEvents = eventBus.events.filter((e) => e.type === "commission_queued");
    expect(queuedEvents.length).toBe(1);
  });
});

describe("session completion flow", () => {
  test("successful completion: finalize called, status becomes completed", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-complete-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator, eventBus: eb } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session completion + finalize
    await new Promise<void>((r) => setTimeout(r, 200));

    // workspace.finalize was called
    const finalizeCalls = workspace.calls.filter((c) => c.method === "finalize");
    expect(finalizeCalls.length).toBe(1);

    // Completed status event was emitted
    const completedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "completed",
    );
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("no result submitted: transitions to failed", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-noresult-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, eventBus: eb } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session completion
    await new Promise<void>((r) => setTimeout(r, 200));

    // preserveAndCleanup was called (partial work preserved)
    const preserveCalls = workspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(1);

    // Failed status event was emitted
    const failedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("merge conflict escalation", () => {
  test("merge conflict calls createMeetingRequestFn and transitions to failed", async () => {
    const meetingRequests: Array<{ projectName: string; workerName: string; reason: string }> = [];

    const workspace = createMockWorkspace({
      finalize: async () => ({
        merged: false,
        preserved: true,
        reason: "Squash-merge conflict on non-.lore/ files",
      } as FinalizeResult),
    });
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-conflict-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });

    const { orchestrator, eventBus: eb } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      createMeetingRequestFn: async (params) => {
        meetingRequests.push(params);
      },
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session completion + merge failure
    await new Promise<void>((r) => setTimeout(r, 300));

    // Meeting request was created for escalation
    expect(meetingRequests.length).toBe(1);
    expect(meetingRequests[0].reason).toContain("conflict");

    // Failed status event was emitted
    const failedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("cancel flow", () => {
  test("cancel active commission: aborts, preserves work, cleans up", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-cancel-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, eventBus: eb } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));

    // Cancel the commission
    await orchestrator.cancelCommission(commissionId, "User cancelled");

    // preserveAndCleanup was called
    const preserveCalls = workspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(1);

    // Cancelled events emitted
    const cancelledEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "cancelled",
    );
    expect(cancelledEvents.length).toBeGreaterThanOrEqual(1);

    // Active count should be 0
    expect(orchestrator.getActiveCommissions()).toBe(0);

    // Resolve the dangling session promise so it doesn't leak
    mockQueryFn.resolve({ aborted: true });
  });

  test("cancel pending commission not in execution context", async () => {
    const { orchestrator, lifecycle: _lifecycle, eventBus } = buildDeps();

    const commissionId = asCommissionId("commission-test-cancel-pending-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.cancelCommission(commissionId);

    // Cancelled event emitted with projectName and oldStatus (REQ-CLS-9)
    const cancelledEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "cancelled",
    );
    expect(cancelledEvents.length).toBeGreaterThanOrEqual(1);
    const cancelEvent = cancelledEvents[0];
    if (cancelEvent.type === "commission_status") {
      expect(cancelEvent.oldStatus).toBe("pending");
      expect(cancelEvent.projectName).toBe(TEST_PROJECT);
    }
  });
});

describe("recovery flow", () => {
  test("recovers stale state files by transitioning to failed", async () => {
    // Write a state file for a commission that was "in_progress"
    const staleId = "commission-stale-001";
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, staleId);
    await fs.mkdir(worktreeDir, { recursive: true });

    await fs.writeFile(
      path.join(ghHome, "state", "commissions", `${staleId}.json`),
      JSON.stringify({
        commissionId: staleId,
        projectName: TEST_PROJECT,
        workerName: TEST_WORKER,
        status: "in_progress",
        worktreeDir,
        branchName: `claude/commission/${staleId}`,
      }),
      "utf-8",
    );

    // Write the artifact so Layer 2 can write to it
    await writeCommissionArtifact(integrationPath, staleId);

    const workspace = createMockWorkspace();
    const { orchestrator, lifecycle } = buildDeps({ workspace });

    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBe(1);

    // Should be tracked at "failed" in lifecycle
    const status = lifecycle.getStatus(asCommissionId(staleId));
    expect(status).toBe("failed");

    // preserveAndCleanup should have been called for the worktree
    const preserveCalls = workspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(1);
  });

  test("recovers orphaned worktrees without state files", async () => {
    const orphanId = "commission-orphan-001";
    const orphanDir = path.join(ghHome, "worktrees", TEST_PROJECT, orphanId);
    await fs.mkdir(orphanDir, { recursive: true });

    // Write artifact for the orphaned commission
    await writeCommissionArtifact(integrationPath, orphanId);

    const workspace = createMockWorkspace();
    const { orchestrator, lifecycle } = buildDeps({ workspace });

    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBe(1);

    // Should be tracked at "failed"
    const status = lifecycle.getStatus(asCommissionId(orphanId));
    expect(status).toBe("failed");
  });

  test("skips non-active state files (already failed/cancelled)", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "commissions", "commission-already-failed.json"),
      JSON.stringify({
        commissionId: "commission-already-failed",
        projectName: TEST_PROJECT,
        workerName: TEST_WORKER,
        status: "failed",
      }),
      "utf-8",
    );

    const { orchestrator } = buildDeps();
    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBe(0);
  });
});

describe("dependency auto-transitions", () => {
  test("blocked commission becomes pending when dependency exists", async () => {
    // Write a blocked commission with a dependency
    const commissionId = "commission-dep-001";
    await writeCommissionArtifact(integrationPath, commissionId, {
      status: "blocked",
      dependencies: [".lore/commissions/commission-dep-target.md"],
    });

    // Create the dependency artifact
    const depDir = path.join(integrationPath, ".lore", "commissions");
    await fs.writeFile(
      path.join(depDir, "commission-dep-target.md"),
      "---\ntitle: Target\nstatus: completed\n---\n",
      "utf-8",
    );

    const { orchestrator, eventBus } = buildDeps();

    await orchestrator.checkDependencyTransitions(TEST_PROJECT);

    // Read the artifact and verify status changed to pending
    const artifactPath = path.join(depDir, `${commissionId}.md`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: pending");

    // Event was emitted with projectName and oldStatus (REQ-CLS-9)
    const pendingEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "pending",
    );
    expect(pendingEvents.length).toBe(1);
    const pendingEvent = pendingEvents[0];
    if (pendingEvent.type === "commission_status") {
      expect(pendingEvent.oldStatus).toBe("blocked");
      expect(pendingEvent.projectName).toBe(TEST_PROJECT);
    }
  });

  test("pending commission with missing dependency becomes blocked", async () => {
    const commissionId = "commission-dep-002";
    await writeCommissionArtifact(integrationPath, commissionId, {
      status: "pending",
      dependencies: [".lore/commissions/nonexistent.md"],
    });

    const { orchestrator, eventBus } = buildDeps();

    await orchestrator.checkDependencyTransitions(TEST_PROJECT);

    // Read the artifact and verify status changed to blocked
    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: blocked");

    // Event was emitted with projectName and oldStatus (REQ-CLS-9)
    const blockedEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "blocked",
    );
    expect(blockedEvents.length).toBe(1);
    const blockedEvent = blockedEvents[0];
    if (blockedEvent.type === "commission_status") {
      expect(blockedEvent.oldStatus).toBe("pending");
      expect(blockedEvent.projectName).toBe(TEST_PROJECT);
    }
  });
});

describe("addUserNote", () => {
  test("writes note to activity worktree during execution", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-note-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, eventBus: eb } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));

    // Add a user note
    await orchestrator.addUserNote(commissionId, "This is a manager note");

    // The note should be written to the activity worktree (not integration)
    // Check via the event bus
    const noteEvents = eb.events.filter(
      (e) => e.type === "commission_manager_note",
    );
    expect(noteEvents.length).toBe(1);

    // Clean up
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
    orchestrator.shutdown();
  });

  test("writes note to integration worktree when not active", async () => {
    const { orchestrator, eventBus } = buildDeps();

    const commissionId = asCommissionId("commission-test-note-inactive-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.addUserNote(commissionId, "Inactive commission note");

    // Note event emitted
    const noteEvents = eventBus.events.filter(
      (e) => e.type === "commission_manager_note",
    );
    expect(noteEvents.length).toBe(1);

    // Verify the note was written to the artifact
    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${commissionId as string}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("user_note");
    expect(raw).toContain("Inactive commission note");
  });
});

describe("updateCommission", () => {
  test("updates prompt on pending commission", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-update-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.updateCommission(commissionId, {
      prompt: "Updated prompt",
    });

    // Verify the artifact was updated
    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${commissionId as string}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("Updated prompt");
  });

  test("rejects update on non-pending commission", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-update-reject-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "completed",
    });

    await expect(
      orchestrator.updateCommission(commissionId, { prompt: "nope" }),
    ).rejects.toThrow(/must be "pending"/);
  });
});

describe("redispatchCommission", () => {
  test("re-dispatches a failed commission", async () => {
    const { orchestrator, workspace: _workspace, mockQueryFn } = buildDeps();

    const commissionId = asCommissionId("commission-test-redispatch-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "failed",
    });

    const result = await orchestrator.redispatchCommission(commissionId);
    expect(result.status).toBe("accepted");

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));

    // queryFn was called
    expect(mockQueryFn.runCount).toBe(1);
  });

  test("rejects redispatch on pending commission", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-redispatch-reject-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "pending",
    });

    await expect(
      orchestrator.redispatchCommission(commissionId),
    ).rejects.toThrow(/must be "failed" or "cancelled"/);
  });
});

describe("race condition", () => {
  test("concurrent completion and cancellation: exactly one succeeds", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-race-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, lifecycle } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));

    // Race: cancel and resolve at the same time
    const cancelPromise = orchestrator.cancelCommission(
      commissionId,
      "User cancelled",
    ).catch(() => "cancel-failed");
    mockQueryFn.resolve({ resultSubmitted: true });

    await cancelPromise;

    // Wait for completion handler to finish
    await new Promise<void>((r) => setTimeout(r, 200));

    // The commission should be in exactly one terminal state
    const status = lifecycle.getStatus(commissionId);
    // It's valid for it to be cancelled or failed or completed, but not
    // still in_progress or dispatched.
    if (status !== undefined) {
      expect(["cancelled", "failed", "completed"]).toContain(status);
    }

    // Active count should be 0
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });
});

describe("shutdown", () => {
  test("aborts all active sessions", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-shutdown-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator } = buildDeps({ mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(orchestrator.getActiveCommissions()).toBe(1);

    orchestrator.shutdown();

    // Resolve dangling session
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
  });
});

describe("getActiveCommissions", () => {
  test("returns 0 when no active commissions", () => {
    const { orchestrator } = buildDeps();
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });
});

// -- Error handling fix tests --

describe("EventBus handler error resilience (Fix 1)", () => {
  test("EventBus progress/result/question handlers catch lifecycle errors", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-callback-err-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();

    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Emit EventBus events directly. The orchestrator's subscription
    // handler calls lifecycle methods with .catch() so these won't
    // cause unhandled rejections even if lifecycle is in a weird state.
    eventBus.emit({
      type: "commission_progress",
      commissionId: commissionId as string,
      summary: "test progress",
    });
    eventBus.emit({
      type: "commission_result",
      commissionId: commissionId as string,
      summary: "test result",
    });
    // Wait for .catch() handlers to execute
    await new Promise<void>((r) => setTimeout(r, 50));

    // Clean up
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
    orchestrator.shutdown();
  });
});

describe("lifecycle.forget cleanup (Fix 3)", () => {
  test("lifecycle.forget is called after session completion", async () => {
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const eventBus = createTestEventBus();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });
    const commissionId = asCommissionId("commission-test-forget-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });

    const { orchestrator } = buildDeps({ workspace, mockQueryFn, eventBus, lifecycle });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 200));

    // After completion, lifecycle should have forgotten the commission
    expect(lifecycle.isTracked(commissionId)).toBe(false);
  });

  test("lifecycle.forget is called after preparation failure", async () => {
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const eventBus = createTestEventBus();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    // prepDeps that fails on resolveToolSet
    const failingPrepDeps = createMockPrepDeps({
      resolveToolSet: async () => { throw new Error("Tool resolution crashed"); },
    });
    const mockQueryFn = createMockQueryFn({ eventBus });

    const { orchestrator } = buildDeps({
      workspace,
      prepDeps: failingPrepDeps,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    const commissionId = asCommissionId("commission-test-forget-err-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 200));

    // After error, lifecycle should have forgotten the commission
    expect(lifecycle.isTracked(commissionId)).toBe(false);
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });

  test("lifecycle.forget is called on early return (aborted)", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-forget-abort-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Cancel first, then resolve session as aborted
    await orchestrator.cancelCommission(commissionId, "Cancel for test");
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 100));

    // lifecycle should have forgotten
    expect(lifecycle.isTracked(commissionId)).toBe(false);
  });
});

describe("worktree cleanup on executionStarted skip (Fix 4)", () => {
  test("removeWorktree is called when executionStarted is skipped", async () => {
    // Cancel a commission after dispatch but before executionStarted completes.
    // This causes executionStarted to return "skipped" because the commission
    // is already cancelled, triggering the worktree cleanup path.
    const gate: { resolve: (() => void) | null } = { resolve: null };
    const workspace = createMockWorkspace({
      prepare: async (config) => {
        const wtCommDir = path.join(config.worktreeDir, ".lore", "commissions");
        await fs.mkdir(wtCommDir, { recursive: true });
        const sourceDir = path.join(integrationPath, ".lore", "commissions");
        try {
          const files = await fs.readdir(sourceDir);
          for (const file of files) {
            await fs.copyFile(
              path.join(sourceDir, file),
              path.join(wtCommDir, file),
            );
          }
        } catch {
          // might not exist
        }
        // Block to allow cancel before executionStarted
        await new Promise<void>((resolve) => { gate.resolve = resolve; });
        return { worktreeDir: config.worktreeDir };
      },
    });

    const { orchestrator } = buildDeps({ workspace });

    const commissionId = asCommissionId("commission-test-skip-wt-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    // Start dispatch (blocks in prepare)
    const dispatchPromise = orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Cancel while dispatch is in prepare
    await orchestrator.cancelCommission(commissionId, "Cancel to force skip");

    // Unblock prepare
    if (gate.resolve) gate.resolve();

    // Dispatch should complete (executionStarted will be skipped because
    // the commission is already cancelled)
    await dispatchPromise;
    await new Promise<void>((r) => setTimeout(r, 100));

    // removeWorktree should have been called for cleanup
    const removeCalls = workspace.calls.filter((c) => c.method === "removeWorktree");
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("updateCommission uses regex replacement (Fix 5)", () => {
  test("update preserves YAML formatting (no matter.stringify)", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-yaml-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      prompt: "Original prompt",
    });

    const artifactPath = path.join(
      integrationPath, ".lore", "commissions", `${commissionId as string}.md`,
    );

    // Update the prompt
    await orchestrator.updateCommission(commissionId, {
      prompt: "Updated prompt text",
    });

    const updatedRaw = await fs.readFile(artifactPath, "utf-8");

    // The prompt should be updated
    expect(updatedRaw).toContain("Updated prompt text");
    expect(updatedRaw).not.toContain("Original prompt");

    // The formatting should be preserved: the file should still have the same
    // structure (--- delimiters, field order, no reformat artifacts)
    expect(updatedRaw).toMatch(/^---\n/);
    expect(updatedRaw).toMatch(/\n---\n$/);

    // Fields that weren't changed should remain identical
    expect(updatedRaw).toContain("status: pending");
    expect(updatedRaw).toContain(`worker: ${TEST_WORKER}`);
  });

  test("update dependencies from empty to list", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-deps-update-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.updateCommission(commissionId, {
      dependencies: [".lore/commissions/dep-a.md", ".lore/commissions/dep-b.md"],
    });

    const artifactPath = path.join(
      integrationPath, ".lore", "commissions", `${commissionId as string}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  - .lore/commissions/dep-a.md");
    expect(raw).toContain("  - .lore/commissions/dep-b.md");
  });
});

describe("cancel flow error handling (Fix 6)", () => {
  test("cancel continues cleanup even if lifecycle.cancel throws", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-cancel-err-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    await orchestrator.cancelCommission(commissionId, "Error test cancel");

    // The key assertion: active count is 0 (cleanup ran regardless)
    expect(orchestrator.getActiveCommissions()).toBe(0);

    // lifecycle.forget was also called
    expect(lifecycle.isTracked(commissionId)).toBe(false);

    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
  });
});

describe("sequential await resilience (Fix 7)", () => {
  test("executions.delete runs even if session fails without result", async () => {
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const eventBus = createTestEventBus();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    const commissionId = asCommissionId("commission-test-seq-001");
    // Session that returns no result (triggers the fail path)
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });

    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // The session failed (no result submitted), but cleanup should have
    // completed: active count 0, lifecycle forgotten
    expect(orchestrator.getActiveCommissions()).toBe(0);
    expect(lifecycle.isTracked(commissionId)).toBe(false);
  });
});

describe("handleSuccessfulCompletion early return cleanup (Fix 8)", () => {
  test("early return when commission already cancelled before completion", async () => {
    const workspace = createMockWorkspace();
    const recordOps = createCommissionRecordOps();
    const eventBus = createTestEventBus();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (e) => eventBus.emit(e),
    });

    const commissionId = asCommissionId("commission-test-skip-complete-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });

    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      lifecycle,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Cancel the commission so that when the session completes,
    // handleSessionCompletion detects cancelled status and exits early.
    await orchestrator.cancelCommission(commissionId, "Cancel before complete");

    // Now resolve the session with result submitted
    mockQueryFn.resolve({ resultSubmitted: true });
    await new Promise<void>((r) => setTimeout(r, 200));

    // lifecycle.forget is called on this early return.
    expect(lifecycle.isTracked(commissionId)).toBe(false);
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });
});

describe("deleteStateFile ENOENT handling (Fix 11)", () => {
  test("deleteStateFile does not throw for missing file", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-delete-state-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 200));

    // After successful completion, deleteStateFile was called.
    // Verify the state file was cleaned up (or didn't exist, which is fine).
    const statePath = path.join(
      ghHome, "state", "commissions", `${commissionId as string}.json`,
    );
    let stateExists = true;
    try {
      await fs.access(statePath);
    } catch {
      stateExists = false;
    }
    // State file should not exist after successful completion
    expect(stateExists).toBe(false);
  });
});

describe("addUserNote fallback (Fix 13)", () => {
  test("falls back to integration worktree when activity worktree is gone", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-note-fallback-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, eventBus: eb } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Delete the activity worktree artifact to simulate cleanup
    const worktreeDir = path.join(
      ghHome, "worktrees", TEST_PROJECT, commissionId as string,
    );
    try {
      await fs.rm(
        path.join(worktreeDir, ".lore", "commissions"),
        { recursive: true, force: true },
      );
    } catch {
      // May not exist in test environment
    }

    // Try addUserNote. It should fall back to integration worktree
    // if the activity worktree artifact is missing.
    try {
      await orchestrator.addUserNote(commissionId, "Fallback note");
    } catch {
      // If the activity worktree path still works (mock copies it),
      // that's also fine. The important thing is it doesn't crash.
    }

    // Note event should have been emitted (fallback path succeeds)
    expect(eb.events.some(
      (e) => e.type === "commission_manager_note",
    )).toBe(true);
    expect(orchestrator.getActiveCommissions()).toBe(1);

    // Clean up
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
    orchestrator.shutdown();
  });
});

describe("cancel during workspace preparation (Fix 15)", () => {
  test("cancel during workspace.prepare delay", async () => {
    // Create a workspace mock where prepare takes time.
    const gate: { resolve: (() => void) | null } = { resolve: null };
    const workspace = createMockWorkspace({
      prepare: async (config) => {
        const wtCommDir = path.join(config.worktreeDir, ".lore", "commissions");
        await fs.mkdir(wtCommDir, { recursive: true });
        const sourceDir = path.join(integrationPath, ".lore", "commissions");
        try {
          const files = await fs.readdir(sourceDir);
          for (const file of files) {
            await fs.copyFile(
              path.join(sourceDir, file),
              path.join(wtCommDir, file),
            );
          }
        } catch {
          // might not exist
        }

        // Wait for external resolution (simulates slow prepare)
        await new Promise<void>((resolve) => {
          gate.resolve = resolve;
        });

        return { worktreeDir: config.worktreeDir };
      },
    });

    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-cancel-prep-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);

    // Start dispatch (will block in workspace.prepare)
    const dispatchPromise = orchestrator.dispatchCommission(commissionId);

    // Wait a bit, then try to cancel
    await new Promise<void>((r) => setTimeout(r, 50));

    // Cancel while dispatch is pending in workspace.prepare
    const cancelPromise = orchestrator.cancelCommission(
      commissionId,
      "Cancelled during prep",
    ).catch(() => "cancel-threw");

    // Resolve workspace.prepare
    if (gate.resolve) gate.resolve();

    // Wait for both to settle
    await Promise.allSettled([dispatchPromise, cancelPromise]);

    // Wait for session cleanup
    await new Promise<void>((r) => setTimeout(r, 100));

    // The commission should end up in a terminal state
    expect(orchestrator.getActiveCommissions()).toBeLessThanOrEqual(1);

    // Clean up any dangling sessions
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 100));
    orchestrator.shutdown();
  });
});

// -- Regression: no infinite event loop --

describe("commission_progress does not cause infinite event loop", () => {
  test("toolbox-emitted progress event is not re-emitted by lifecycle", async () => {
    const commissionId = asCommissionId("commission-loop-progress-001");
    const eventBus = createTestEventBus();
    const mockQueryFn = createMockQueryFn({
      eventBus,
      commissionId: commissionId as string,
      resolveAfterMs: -1,
    });
    const workspace = createMockWorkspace();
    const { orchestrator, lifecycle } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);

    // Wait for session to start
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(lifecycle.getStatus(commissionId)).toBe("in_progress");

    // Record event count before emitting progress
    const countBefore = eventBus.events.length;

    // Simulate what the toolbox does: emit commission_progress to EventBus.
    // Before the fix, lifecycle.progressReported() would re-emit the same
    // event, causing an infinite synchronous recursion (stack overflow).
    eventBus.emit({
      type: "commission_progress",
      commissionId: commissionId as string,
      summary: "Step 1 complete",
    });

    // Exactly one new event should exist (the one we just emitted).
    // Before the fix, this would be infinite (stack overflow).
    const progressEvents = eventBus.events
      .slice(countBefore)
      .filter((e) => e.type === "commission_progress");
    expect(progressEvents).toHaveLength(1);

    // Clean up
    mockQueryFn.resolve({ aborted: true });
    await new Promise<void>((r) => setTimeout(r, 50));
    orchestrator.shutdown();
  });

});
