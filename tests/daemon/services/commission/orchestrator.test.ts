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
    hasCommitsBeyond: async (...args) => { track("hasCommitsBeyond", ...args); return false; },
    lorePendingChanges: async (...args) => { track("lorePendingChanges", ...args); return { hasPendingChanges: false, fileCount: 0 }; },
    commitLore: async (...args) => { track("commitLore", ...args); return { committed: false }; },
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
      builtInTools: [],
      canUseToolRules: [],
    })),
    loadMemories: overrides?.loadMemories ?? (async () => ({
      memoryBlock: "",
      needsCompaction: false,
    })),
    activateWorker: overrides?.activateWorker ?? (async () => ({
      systemPrompt: "Test system prompt",
      tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
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
  config: AppConfig;
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
    config: overrides?.config ?? makeConfig(),
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

  test("successful completion does not write duplicate status_completed to integration", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-no-double-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator } = buildDeps({ workspace, mockQueryFn, eventBus });

    const artifactPath = await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 200));

    // Read the integration artifact and count status_completed timeline entries.
    // The mock finalize returns merged: true but doesn't actually squash-merge,
    // so the only way status_completed appears is via syncStatusToIntegration.
    // After the fix, it should not be called on the merged path.
    const content = await fs.readFile(artifactPath, "utf-8");
    const statusCompletedCount = (content.match(/event: status_completed/g) ?? []).length;
    expect(statusCompletedCount).toBe(0);
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
    // Write a blocked commission with a dependency (raw commission ID, not full path)
    const commissionId = "commission-dep-001";
    const depId = "commission-dep-target";
    await writeCommissionArtifact(integrationPath, commissionId, {
      status: "blocked",
      dependencies: [depId],
    });

    // Create the dependency artifact at the correct .lore/commissions/<id>.md path
    const depDir = path.join(integrationPath, ".lore", "commissions");
    await fs.writeFile(
      path.join(depDir, `${depId}.md`),
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
      dependencies: ["commission-nonexistent"],
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

  test("blocked commission stays blocked when dependency exists but is not completed", async () => {
    const commissionId = "commission-dep-003";
    const depId = "commission-dep-pending";
    await writeCommissionArtifact(integrationPath, commissionId, {
      status: "blocked",
      dependencies: [depId],
    });

    // Dependency artifact exists but has status "pending" (not completed)
    const depDir = path.join(integrationPath, ".lore", "commissions");
    await fs.writeFile(
      path.join(depDir, `${depId}.md`),
      "---\ntitle: Dep\nstatus: pending\n---\n",
      "utf-8",
    );

    const { orchestrator, eventBus } = buildDeps();

    await orchestrator.checkDependencyTransitions(TEST_PROJECT);

    // Commission should remain blocked (dep exists but not completed)
    const artifactPath = path.join(depDir, `${commissionId}.md`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: blocked");

    // No unblock events should have been emitted
    const pendingEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "pending",
    );
    expect(pendingEvents.length).toBe(0);
  });

  test("blocked commission unblocks when dependency status is abandoned", async () => {
    const commissionId = "commission-dep-004";
    const depId = "commission-dep-abandoned";
    await writeCommissionArtifact(integrationPath, commissionId, {
      status: "blocked",
      dependencies: [depId],
    });

    const depDir = path.join(integrationPath, ".lore", "commissions");
    await fs.writeFile(
      path.join(depDir, `${depId}.md`),
      "---\ntitle: Dep\nstatus: abandoned\n---\n",
      "utf-8",
    );

    const { orchestrator, eventBus } = buildDeps();

    await orchestrator.checkDependencyTransitions(TEST_PROJECT);

    const artifactPath = path.join(depDir, `${commissionId}.md`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: pending");

    const pendingEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "pending",
    );
    expect(pendingEvents.length).toBe(1);
  });
});

describe("dispatch dependency gate", () => {
  test("dispatch with unsatisfied dependencies blocks instead of dispatching", async () => {
    const depId = "commission-dep-unsatisfied";
    const commissionId = asCommissionId("commission-test-dep-block-001");

    // Create the dependency artifact with status "pending" (not completed)
    await writeCommissionArtifact(integrationPath, depId, {
      status: "pending",
    });

    // Create the dependent commission
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      dependencies: [depId],
    });

    const { orchestrator, workspace, eventBus } = buildDeps();

    const result = await orchestrator.dispatchCommission(commissionId);

    // Should return "queued", not "accepted"
    expect(result.status).toBe("queued");

    // workspace.prepare should NOT have been called
    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls.length).toBe(0);

    // The commission should have been blocked (queued event emitted)
    const queuedEvents = eventBus.events.filter((e) => e.type === "commission_queued");
    expect(queuedEvents.length).toBe(1);

    // The artifact should now have status "blocked"
    const artifactPath = path.join(
      integrationPath, ".lore", "commissions", `${commissionId as string}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: blocked");
  });

  test("dispatch with satisfied dependencies proceeds normally", async () => {
    const depId = "commission-dep-satisfied";
    const commissionId = asCommissionId("commission-test-dep-ok-001");

    // Create the dependency artifact with status "completed"
    await writeCommissionArtifact(integrationPath, depId, {
      status: "completed",
    });

    // Create the dependent commission
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      dependencies: [depId],
    });

    const eventBus = createTestEventBus();
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator } = buildDeps({ workspace, mockQueryFn, eventBus });

    const result = await orchestrator.dispatchCommission(commissionId);

    // Should dispatch normally
    expect(result.status).toBe("accepted");

    // workspace.prepare should have been called
    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls.length).toBe(1);

    // Wait for session to settle
    await new Promise<void>((r) => setTimeout(r, 200));
  });

  test("dispatch with missing dependency artifact blocks the commission", async () => {
    const commissionId = asCommissionId("commission-test-dep-missing-001");

    // Create dependent commission with a dependency that doesn't exist
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      dependencies: ["commission-does-not-exist"],
    });

    const { orchestrator, workspace } = buildDeps();

    const result = await orchestrator.dispatchCommission(commissionId);

    expect(result.status).toBe("queued");

    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls.length).toBe(0);
  });

  test("dispatch with no dependencies proceeds normally", async () => {
    const commissionId = asCommissionId("commission-test-no-deps-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    const { orchestrator, workspace, mockQueryFn } = buildDeps();

    const result = await orchestrator.dispatchCommission(commissionId);
    expect(result.status).toBe("accepted");

    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls.length).toBe(1);

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(mockQueryFn.runCount).toBe(1);
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

describe("abandonCommission", () => {
  test("abandons a pending commission (never dispatched)", async () => {
    const { orchestrator, eventBus } = buildDeps();

    const commissionId = asCommissionId("commission-test-abandon-pending-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "pending",
    });

    await orchestrator.abandonCommission(commissionId, "Work done elsewhere");

    // Abandoned event emitted
    const abandonedEvents = eventBus.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "abandoned",
    );
    expect(abandonedEvents.length).toBeGreaterThanOrEqual(1);
    const ev = abandonedEvents[0];
    if (ev.type === "commission_status") {
      expect(ev.oldStatus).toBe("pending");
      expect(ev.reason).toBe("Work done elsewhere");
    }
  });

  test("abandons a failed commission", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-abandon-failed-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "failed",
    });

    await orchestrator.abandonCommission(commissionId, "Not worth retrying");

    // No active commissions
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });

  test("abandons a cancelled commission", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-abandon-cancelled-001");
    await writeCommissionArtifact(integrationPath, commissionId as string, {
      status: "cancelled",
    });

    await orchestrator.abandonCommission(commissionId, "No longer relevant");
  });

  test("rejects abandon when commission has active execution context", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-abandon-active-001");
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
      commissionId: commissionId as string,
    });
    const workspace = createMockWorkspace();
    const { orchestrator } = buildDeps({ workspace, mockQueryFn, eventBus });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 50));

    await expect(
      orchestrator.abandonCommission(commissionId, "Trying to abandon active"),
    ).rejects.toThrow(/Cannot abandon.*active session/);

    // Clean up
    await orchestrator.cancelCommission(commissionId);
    mockQueryFn.resolve({ aborted: true });
  });

  test("rejects abandon when commission not found", async () => {
    const { orchestrator } = buildDeps();

    await expect(
      orchestrator.abandonCommission(
        asCommissionId("nonexistent-commission"),
        "Test",
      ),
    ).rejects.toThrow(/not found/);
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

// -- Model selection tests --

describe("createCommission with model override", () => {
  test("writes model to resource_overrides in artifact YAML", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Model Test Commission",
      "test-worker",
      "Do the work",
      [],
      { model: "haiku" },
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("resource_overrides:");
    expect(raw).toContain("model: haiku");
  });

  test("writes model alongside maxTurns in resource_overrides", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Model and Turns",
      "test-worker",
      "Do the work",
      [],
      { model: "sonnet", maxTurns: 5 },
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("resource_overrides:");
    expect(raw).toContain("model: sonnet");
    expect(raw).toContain("maxTurns: 5");
  });

  test("omits resource_overrides when no overrides provided", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "No Overrides",
      "test-worker",
      "Do the work",
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).not.toContain("resource_overrides:");
  });
});

describe("dispatchCommission with model override", () => {
  test("dispatches successfully with valid model in resource_overrides", async () => {
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-model-dispatch-001");

    // Write artifact with model in resource_overrides
    const now = new Date();
    const content = `---
title: "Commission: Model Test"
date: ${now.toISOString().split("T")[0]}
status: pending
tags: [commission]
worker: ${TEST_WORKER}
workerDisplayTitle: "Test Worker Title"
prompt: "Do model work"
dependencies: []
linked_artifacts: []
resource_overrides:
  model: haiku
activity_timeline:
  - timestamp: ${now.toISOString()}
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${TEST_PROJECT}
---
`;
    const dir = path.join(integrationPath, ".lore", "commissions");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${commissionId as string}.md`), content, "utf-8");

    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator } = buildDeps({ mockQueryFn, eventBus });

    const result = await orchestrator.dispatchCommission(commissionId);
    expect(result.status).toBe("accepted");

    // Wait for session to complete
    await new Promise<void>((r) => setTimeout(r, 200));

    // Commission completed successfully (model was valid, no error thrown)
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });

  test("rejects invalid model in resource_overrides", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-bad-model-001");

    // Write artifact with invalid model
    const now = new Date();
    const content = `---
title: "Commission: Bad Model"
date: ${now.toISOString().split("T")[0]}
status: pending
tags: [commission]
worker: ${TEST_WORKER}
workerDisplayTitle: "Test Worker Title"
prompt: "Do work"
dependencies: []
linked_artifacts: []
resource_overrides:
  model: gpt4
activity_timeline:
  - timestamp: ${now.toISOString()}
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${TEST_PROJECT}
---
`;
    const dir = path.join(integrationPath, ".lore", "commissions");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${commissionId as string}.md`), content, "utf-8");

    await expect(
      orchestrator.dispatchCommission(commissionId),
    ).rejects.toThrow(/Invalid model "gpt4"/);
  });

  test("accepts configured local model name in resource_overrides", async () => {
    const localModelConfig: AppConfig = {
      ...makeConfig(),
      models: [
        { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
      ],
    };
    const { orchestrator } = buildDeps({ config: localModelConfig });

    const commissionId = asCommissionId("commission-test-local-model-001");

    const now = new Date();
    const content = `---
title: "Commission: Local Model"
date: ${now.toISOString().split("T")[0]}
status: pending
tags: [commission]
worker: ${TEST_WORKER}
workerDisplayTitle: "Test Worker Title"
prompt: "Do work"
dependencies: []
linked_artifacts: []
resource_overrides:
  model: llama3
activity_timeline:
  - timestamp: ${now.toISOString()}
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${TEST_PROJECT}
---
`;
    const dir = path.join(integrationPath, ".lore", "commissions");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${commissionId as string}.md`), content, "utf-8");

    // Should not throw (local model name is valid when config has the definition)
    await expect(
      orchestrator.dispatchCommission(commissionId),
    ).resolves.toBeDefined();
  });
});

describe("updateCommission with model override", () => {
  test("adds model to existing resource_overrides", async () => {
    const { orchestrator } = buildDeps();

    // Create a commission with maxTurns but no model
    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Update Model Test",
      "test-worker",
      "Do the work",
      [],
      { maxTurns: 10 },
    );

    const commissionId = asCommissionId(result.commissionId);

    // Update to add model
    await orchestrator.updateCommission(commissionId, {
      resourceOverrides: { model: "haiku" },
    });

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("model: haiku");
    // Existing maxTurns should be preserved
    expect(raw).toContain("maxTurns: 10");
  });

  test("sets model on commission with no existing resource_overrides", async () => {
    const { orchestrator } = buildDeps();

    const commissionId = asCommissionId("commission-test-update-model-new-001");
    await writeCommissionArtifact(integrationPath, commissionId as string);

    await orchestrator.updateCommission(commissionId, {
      resourceOverrides: { model: "opus" },
    });

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${commissionId as string}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("resource_overrides:");
    expect(raw).toContain("model: opus");
  });

  test("preserves existing model when updating other overrides", async () => {
    const { orchestrator } = buildDeps();

    // Create with model
    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Preserve Model",
      "test-worker",
      "Do the work",
      [],
      { model: "sonnet" },
    );

    const commissionId = asCommissionId(result.commissionId);

    // Update maxTurns only (model should be preserved)
    await orchestrator.updateCommission(commissionId, {
      resourceOverrides: { maxTurns: 20 },
    });

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("model: sonnet");
    expect(raw).toContain("maxTurns: 20");
  });

  test("preserves hyphenated model name when updating other overrides", async () => {
    const { orchestrator } = buildDeps();

    // Create with a hyphenated model name (e.g., a local model)
    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Hyphenated Model",
      "test-worker",
      "Do the work",
      [],
      { model: "mistral-local" },
    );

    const commissionId = asCommissionId(result.commissionId);

    // Update maxTurns only; the hyphenated model name should be preserved
    await orchestrator.updateCommission(commissionId, {
      resourceOverrides: { maxTurns: 30 },
    });

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("model: mistral-local");
    expect(raw).toContain("maxTurns: 30");
  });
});

// -- Commission type and source_schedule tests --

describe("createCommission with type options", () => {
  test("writes type: one-shot when no options provided", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Default Type Commission",
      "test-worker",
      "Do the work",
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: one-shot");
    expect(raw).not.toContain("source_schedule:");
  });

  test("writes type: scheduled when options.type is scheduled", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Scheduled Commission",
      "test-worker",
      "Do the work",
      [],
      undefined,
      { type: "scheduled" },
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: scheduled");
  });

  test("writes source_schedule when provided", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "Scheduled with Source",
      "test-worker",
      "Do the work",
      [],
      undefined,
      { type: "scheduled", sourceSchedule: "schedule-nightly-20260309" },
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: scheduled");
    expect(raw).toContain("source_schedule: schedule-nightly-20260309");
  });

  test("does not write source_schedule when not provided", async () => {
    const { orchestrator } = buildDeps();

    const result = await orchestrator.createCommission(
      TEST_PROJECT,
      "No Source Schedule",
      "test-worker",
      "Do the work",
      [],
      undefined,
      { type: "one-shot" },
    );

    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${result.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: one-shot");
    expect(raw).not.toContain("source_schedule:");
  });
});

// -- Phase 2: Halt entry path tests --

describe("halt entry (maxTurns without result)", () => {
  test("maxTurns without result transitions to halted, preserves worktree", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-halt-001");
    // No result submitted, maxTurns: 1 triggers reason: "maxTurns"
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });
    const { orchestrator, eventBus: eb } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);

    // Wait for session completion
    await new Promise<void>((r) => setTimeout(r, 300));

    // Commission should be halted, not failed
    const haltedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "halted",
    );
    expect(haltedEvents.length).toBeGreaterThanOrEqual(1);

    // preserveAndCleanup should NOT have been called (worktree preserved)
    const preserveCalls = workspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(0);

    // State file should exist and contain halted state
    const stateFilePath = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const stateData = JSON.parse(stateRaw) as Record<string, unknown>;
    expect(stateData.status).toBe("halted");
    expect(stateData.commissionId).toBe(commissionId as string);
    expect(stateData.sessionId).toBeTruthy();
    expect(stateData.turnsUsed).toBe(1);
    expect(stateData.haltedAt).toBeTruthy();
    expect(stateData.worktreeDir).toBeTruthy();
    expect(stateData.branchName).toBeTruthy();
  });

  test("maxTurns with result submitted: normal completion (result wins)", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-halt-result-001");
    // Result IS submitted, even though maxTurns: 1
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: true,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });
    const { orchestrator, eventBus: eb } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // Should have completed, not halted
    const completedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "completed",
    );
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);

    const haltedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "halted",
    );
    expect(haltedEvents.length).toBe(0);
  });

  test("halt_count is incremented in the artifact", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-haltcount-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });
    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // Read the activity worktree artifact to check halt_count.
    // The mock workspace copies artifacts from integration to activity worktree.
    // The halt path writes to the activity worktree artifact.
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, commissionId as string);
    const artifactPath = path.join(worktreeDir, ".lore", "commissions", `${commissionId}.md`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("halt_count: 1");
  });

  test("timeline records status_halted event with turnsUsed", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-halttimeline-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });
    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // Check timeline in the activity worktree artifact
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, commissionId as string);
    const artifactPath = path.join(worktreeDir, ".lore", "commissions", `${commissionId}.md`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("event: status_halted");
    expect(raw).toContain("turnsUsed: \"1\"");
  });

  test("halted commission is removed from executions (does not count against capacity)", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-haltcap-001");
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });
    const { orchestrator } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // After halting, getActiveCommissions should be 0 (removed from executions)
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });

  test("non-maxTurns failure without result still transitions to failed", async () => {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const commissionId = asCommissionId("commission-test-nonhalt-001");
    // Session error, not maxTurns
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      error: "Something went wrong",
      resolveAfterMs: 10,
      eventBus,
      commissionId: commissionId as string,
    });
    const { orchestrator, eventBus: eb } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
    });

    await writeCommissionArtifact(integrationPath, commissionId as string);
    await orchestrator.dispatchCommission(commissionId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // Should have failed, not halted
    const failedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);

    const haltedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "halted",
    );
    expect(haltedEvents.length).toBe(0);
  });
});

// -- Phase 3: Continue action tests --

describe("continueCommission", () => {
  /**
   * Helper: writes a halted state file and a commission artifact directly,
   * then registers the commission as halted in the lifecycle. Returns deps
   * for the continue tests. The queryFn can be configured to submit a
   * result or not on each run.
   */
  async function setupHaltedCommission(opts: {
    commissionId: string;
    capacityConfig?: AppConfig;
    /** If true, the continued session submits a result. */
    submitResultOnContinue?: boolean;
  }) {
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const cId = asCommissionId(opts.commissionId);

    const mockQueryFn = createMockQueryFn({
      resultSubmitted: opts.submitResultOnContinue ?? false,
      resolveAfterMs: 10,
      eventBus,
      commissionId: opts.commissionId,
    });

    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });

    const { orchestrator, lifecycle, eventBus: eb, gitOps } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
      config: opts.capacityConfig,
    });

    // Write the commission artifact to integration worktree
    await writeCommissionArtifact(integrationPath, opts.commissionId);

    // Create the activity worktree directory with the artifact
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, opts.commissionId);
    const wtCommDir = path.join(worktreeDir, ".lore", "commissions");
    await fs.mkdir(wtCommDir, { recursive: true });
    await fs.copyFile(
      path.join(integrationPath, ".lore", "commissions", `${opts.commissionId}.md`),
      path.join(wtCommDir, `${opts.commissionId}.md`),
    );

    // Write the halted state file
    const stateFilePath = path.join(ghHome, "state", "commissions", `${opts.commissionId}.json`);
    const stateData = {
      commissionId: opts.commissionId,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "halted",
      worktreeDir,
      branchName: `claude/commission/${opts.commissionId}`,
      sessionId: "test-session-halted",
      haltedAt: new Date().toISOString(),
      turnsUsed: 50,
      lastProgress: "Made progress on the task",
    };
    await fs.writeFile(stateFilePath, JSON.stringify(stateData, null, 2), "utf-8");

    // Register in lifecycle as halted
    const artifactPath = path.join(integrationPath, ".lore", "commissions", `${opts.commissionId}.md`);
    lifecycle.register(cId, TEST_PROJECT, "halted", artifactPath);

    return { orchestrator, lifecycle, eventBus: eb, workspace, gitOps, cId, worktreeDir };
  }

  test("continues a halted commission: session launched with continuation prompt", async () => {
    const commissionId = "commission-test-continue-001";
    const { orchestrator, eventBus: eb, cId, worktreeDir } = await setupHaltedCommission({
      commissionId,
      submitResultOnContinue: true,
    });

    // Continue the halted commission
    const result = await orchestrator.continueCommission(cId);
    expect(result.status).toBe("accepted");

    // Wait for the continued session to complete
    await new Promise<void>((r) => setTimeout(r, 300));

    // Timeline should contain "Continued from halted state"
    const artifactPath = path.join(worktreeDir, ".lore", "commissions", `${commissionId}.md`);
    try {
      const raw = await fs.readFile(artifactPath, "utf-8");
      expect(raw).toContain("Continued from halted state");
    } catch {
      // Worktree may have been cleaned up after completion. Check integration.
      const iArtifactPath = path.join(integrationPath, ".lore", "commissions", `${commissionId}.md`);
      const raw = await fs.readFile(iArtifactPath, "utf-8");
      expect(raw).toContain("Continued from halted state");
    }
  });

  test("continue with missing worktree transitions to failed", async () => {
    const commissionId = "commission-test-continue-missing-wt-001";
    const { orchestrator, eventBus: eb, cId } = await setupHaltedCommission({
      commissionId,
    });

    // Point the state file at a non-existent worktree
    const stateFilePath = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const stateData = JSON.parse(stateRaw) as Record<string, unknown>;
    stateData.worktreeDir = "/tmp/nonexistent-worktree-path";
    await fs.writeFile(stateFilePath, JSON.stringify(stateData, null, 2), "utf-8");

    // Attempt to continue should throw (worktree not found)
    try {
      await orchestrator.continueCommission(cId);
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as Error).message).toContain("worktree not found");
    }

    // Commission should have been transitioned to failed
    const failedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("continue at capacity returns capacity_error, commission stays halted", async () => {
    const commissionId = "commission-test-continue-cap-001";
    const cId = asCommissionId(commissionId);
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();

    // Use manual-mode query so dispatched commissions stay active
    const mockQueryFn = createMockQueryFn({
      resolveAfterMs: -1,
      eventBus,
    });

    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 10 },
      }),
    });

    const capacityConfig: AppConfig = {
      projects: [{ name: TEST_PROJECT, path: projectPath, commissionCap: 1 }],
      maxConcurrentCommissions: 1,
    };

    const { orchestrator, lifecycle } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
      config: capacityConfig,
    });

    // Write the halted commission's artifact and state file
    await writeCommissionArtifact(integrationPath, commissionId);
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, commissionId);
    const wtCommDir = path.join(worktreeDir, ".lore", "commissions");
    await fs.mkdir(wtCommDir, { recursive: true });
    await fs.copyFile(
      path.join(integrationPath, ".lore", "commissions", `${commissionId}.md`),
      path.join(wtCommDir, `${commissionId}.md`),
    );
    const stateFilePath = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId, projectName: TEST_PROJECT, workerName: TEST_WORKER,
      status: "halted", worktreeDir, branchName: `claude/commission/${commissionId}`,
      sessionId: "test-session-halted", haltedAt: new Date().toISOString(),
      turnsUsed: 50, lastProgress: "Made progress",
    }, null, 2), "utf-8");
    const artifactPath = path.join(integrationPath, ".lore", "commissions", `${commissionId}.md`);
    lifecycle.register(cId, TEST_PROJECT, "halted", artifactPath);

    // Dispatch another commission to fill the capacity (blocks in manual mode)
    const otherCId = asCommissionId("commission-other-active-001");
    await writeCommissionArtifact(integrationPath, otherCId as string);
    await orchestrator.dispatchCommission(otherCId);
    await new Promise<void>((r) => setTimeout(r, 50));

    // Attempt to continue the halted commission
    const result = await orchestrator.continueCommission(cId);
    expect(result.status).toBe("capacity_error");

    // Commission should still be halted (status unchanged)
    const status = lifecycle.getStatus(cId);
    expect(status).toBe("halted");

    // Clean up: resolve the blocking session
    mockQueryFn.resolve({ resultSubmitted: true });
    await new Promise<void>((r) => setTimeout(r, 100));
  });

  test("multi-continuation: halt -> continue -> halt -> continue with incrementing halt_count", async () => {
    const commissionId = "commission-test-multi-cont-001";
    const workspace = createMockWorkspace();
    const eventBus = createTestEventBus();
    const cId = asCommissionId(commissionId);

    // Never submit result: always halt
    const mockQueryFn = createMockQueryFn({
      resultSubmitted: false,
      resolveAfterMs: 10,
      eventBus,
      commissionId,
    });

    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
        resourceBounds: { maxTurns: 1 },
      }),
    });

    const { orchestrator, eventBus: eb } = buildDeps({
      workspace,
      mockQueryFn,
      eventBus,
      prepDeps,
    });

    // Dispatch -> halt (halt #1)
    await writeCommissionArtifact(integrationPath, commissionId);
    await orchestrator.dispatchCommission(cId);
    await new Promise<void>((r) => setTimeout(r, 300));

    // Verify halt #1
    const stateFilePath = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
    let stateRaw = await fs.readFile(stateFilePath, "utf-8");
    let stateData = JSON.parse(stateRaw) as Record<string, unknown>;
    expect(stateData.status).toBe("halted");

    // Check halt_count = 1
    const worktreeDir = stateData.worktreeDir as string;
    const artifactPath = path.join(worktreeDir, ".lore", "commissions", `${commissionId}.md`);
    let raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("halt_count: 1");

    // Continue -> halt again (halt #2)
    const result1 = await orchestrator.continueCommission(cId);
    expect(result1.status).toBe("accepted");
    await new Promise<void>((r) => setTimeout(r, 300));

    // Verify halt #2
    stateRaw = await fs.readFile(stateFilePath, "utf-8");
    stateData = JSON.parse(stateRaw) as Record<string, unknown>;
    expect(stateData.status).toBe("halted");

    // Check halt_count = 2
    raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("halt_count: 2");

    // Count halted events in EventBus
    const haltedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "halted",
    );
    expect(haltedEvents.length).toBeGreaterThanOrEqual(2);
  });

  test("continued session completes with result: normal completion", async () => {
    const commissionId = "commission-test-continue-complete-001";
    const { orchestrator, eventBus: eb, cId } = await setupHaltedCommission({
      commissionId,
      submitResultOnContinue: true,
    });

    // Continue the commission
    const result = await orchestrator.continueCommission(cId);
    expect(result.status).toBe("accepted");

    // Wait for completion
    await new Promise<void>((r) => setTimeout(r, 300));

    // Should have completed
    const completedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "completed",
    );
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("continued session hits maxTurns again: re-halts", async () => {
    const commissionId = "commission-test-continue-rehalt-001";
    const { orchestrator, eventBus: eb, cId } = await setupHaltedCommission({
      commissionId,
      // Don't submit result: will halt again
    });

    // Continue the commission
    const result = await orchestrator.continueCommission(cId);
    expect(result.status).toBe("accepted");

    // Wait for re-halt
    await new Promise<void>((r) => setTimeout(r, 300));

    // Should have halted again
    const haltedEvents = eb.events.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "halted",
    );
    expect(haltedEvents.length).toBeGreaterThanOrEqual(1);

    // State should be halted
    const stateFilePath = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const stateData = JSON.parse(stateRaw) as Record<string, unknown>;
    expect(stateData.status).toBe("halted");
  });
});
