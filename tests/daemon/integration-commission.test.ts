/* eslint-disable @typescript-eslint/require-await */

/**
 * Commission lifecycle integration tests.
 *
 * Exercises the full path: HTTP request -> Hono route handler -> real
 * commission orchestrator (with mock workspace/queryFn) -> real lifecycle
 * + recordOps -> event bus -> SSE response.
 *
 * Unlike the unit tests in routes/commissions.test.ts (which mock the entire
 * commission session) and commission/orchestrator.test.ts (which test the
 * orchestrator in isolation), these tests wire real route handlers to a real
 * orchestrator, verifying that the layers compose correctly through HTTP.
 *
 * Limitations:
 * - The SDK queryFn is mocked; actual Claude Agent SDK behavior is not tested.
 * - WorkspaceOps (Layer 3) is mocked to avoid real git operations.
 * - Worker activation uses mock SessionPrepDeps.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createApp } from "@/daemon/app";
import { createCommissionOrchestrator } from "@/daemon/services/commission/orchestrator";
import { createCommissionLifecycle } from "@/daemon/services/commission/lifecycle";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import { createEventBus, type SystemEvent } from "@/daemon/lib/event-bus";
import type { WorkspaceOps, FinalizeResult } from "@/daemon/services/workspace";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { GitOps } from "@/daemon/lib/git";
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";

// -- Fixtures --

const TEST_PROJECT = "test-project";

const WORKER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "Test Worker",
    description: "A worker for integration tests.",
    displayTitle: "Test Worker Title",
  },
  posture: "You are a test worker.",
  domainToolboxes: [],
  builtInTools: ["Read"],
  checkoutScope: "full",
};

const WORKER_PKG: DiscoveredPackage = {
  name: "test-worker",
  path: "/tmp/fake-packages/test-worker",
  metadata: WORKER_META,
};

// -- Mock SDK messages --

function makeInitMessage(sessionId = "sdk-session-comm-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeResultSuccess(): SDKMessage {
  return {
    type: "result",
    subtype: "success",
  } as unknown as SDKMessage;
}

// -- Mock workspace --

function createMockWorkspace(overrides?: Partial<{
  finalize: WorkspaceOps["finalize"];
}>): WorkspaceOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async prepare(config) {
      calls.push({ method: "prepare", args: [config] });
      // Simulate worktree creation: copy commission artifacts so Layer 1
      // (real filesystem) can find them in the activity worktree.
      const wtCommDir = path.join(config.worktreeDir, ".lore", "commissions");
      await fs.mkdir(wtCommDir, { recursive: true });

      // Find the source integration path by walking up from worktreeDir
      // The integration path is determined by ghHomeDir + project name
      // We need to copy artifacts from there.
      // For this mock, we look at the baseBranch's artifacts directory.
      // The orchestrator commits to the integration worktree before prepare,
      // so we need to find those files.
      const sourceBase = config.worktreeDir.replace(
        /worktrees\/[^/]+\/commission-.*$/,
        `projects/${TEST_PROJECT}`,
      );
      try {
        const files = await fs.readdir(
          path.join(sourceBase, ".lore", "commissions"),
        );
        for (const file of files) {
          await fs.copyFile(
            path.join(sourceBase, ".lore", "commissions", file),
            path.join(wtCommDir, file),
          );
        }
      } catch {
        // Integration dir might not have commissions yet
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
    },
    async removeWorktree(worktreeDir, projectPath) {
      calls.push({ method: "removeWorktree", args: [worktreeDir, projectPath] });
    },
  };
}

// -- Mock GitOps --

function createMockGitOps(): GitOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createBranch: async () => { calls.push("createBranch"); },
    branchExists: async () => { calls.push("branchExists"); return false; },
    deleteBranch: async () => { calls.push("deleteBranch"); },
    createWorktree: async () => { calls.push("createWorktree"); },
    removeWorktree: async () => { calls.push("removeWorktree"); },
    configureSparseCheckout: async () => { calls.push("configureSparseCheckout"); },
    commitAll: async () => { calls.push("commitAll"); return false; },
    squashMerge: async () => { calls.push("squashMerge"); },
    hasUncommittedChanges: async () => { calls.push("hasUncommittedChanges"); return false; },
    rebase: async () => { calls.push("rebase"); },
    currentBranch: async () => { calls.push("currentBranch"); return "main"; },
    listWorktrees: async () => { calls.push("listWorktrees"); return []; },
    initClaudeBranch: async () => { calls.push("initClaudeBranch"); },
    detectDefaultBranch: async () => { calls.push("detectDefaultBranch"); return "main"; },
    fetch: async () => { calls.push("fetch"); },
    push: async () => { calls.push("push"); },
    resetHard: async () => { calls.push("resetHard"); },
    resetSoft: async () => { calls.push("resetSoft"); },
    createPullRequest: async () => { calls.push("createPullRequest"); return { url: "" }; },
    isAncestor: async () => { calls.push("isAncestor"); return false; },
    treesEqual: async () => { calls.push("treesEqual"); return false; },
    revParse: async () => { calls.push("revParse"); return "abc123"; },
    rebaseOnto: async () => { calls.push("rebaseOnto"); },
    merge: async () => { calls.push("merge"); },
    squashMergeNoCommit: async () => { calls.push("squashMergeNoCommit"); return true; },
    listConflictedFiles: async () => { calls.push("listConflictedFiles"); return []; },
    resolveConflictsTheirs: async () => { calls.push("resolveConflictsTheirs"); },
    mergeAbort: async () => { calls.push("mergeAbort"); },
    hasCommitsBeyond: async () => { calls.push("hasCommitsBeyond"); return false; },
  };
}

// -- Mock SessionPrepDeps --

function createMockPrepDeps(): SessionPrepDeps {
  return {
    resolveToolSet: async () => ({
      mcpServers: [],
      allowedTools: [],
    }),
    loadMemories: async () => ({
      memoryBlock: "",
      needsCompaction: false,
    }),
    activateWorker: async () => ({
      systemPrompt: "Test system prompt",
      tools: { mcpServers: [], allowedTools: [] },
      resourceBounds: { maxTurns: 10 },
    }),
  };
}

// -- SSE event reader --

/**
 * Reads SSE data lines from a response body stream.
 * Collects chunks until the expected number of data lines are found,
 * then returns the parsed JSON payloads. Times out after 2 seconds.
 */
async function readSSEEvents(
  body: ReadableStream<Uint8Array>,
  expectedCount: number,
): Promise<SystemEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: SystemEvent[] = [];
  let buffer = "";

  const timeout = setTimeout(() => {
    reader.cancel("Test timeout").catch(() => {});
  }, 2000);

  try {
    while (events.length < expectedCount) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        for (const line of trimmed.split("\n")) {
          if (line.startsWith("data:")) {
            const jsonStr = line.slice("data:".length).trim();
            if (jsonStr) {
              events.push(JSON.parse(jsonStr) as SystemEvent);
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.cancel("Done reading").catch(() => {});
  }

  return events;
}

// -- Test state --

let tmpDir: string;
let ghHome: string;
let projectPath: string;
let integrationPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-integration-"));
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

// -- Helpers --

function makeConfig(): AppConfig {
  return { projects: [{ name: TEST_PROJECT, path: projectPath }] };
}

/**
 * Builds a full Hono app with a real commission orchestrator wired to
 * real Layer 1 (record) + Layer 2 (lifecycle) and mock Layer 3+4.
 * The EventBus is real, connecting commission events to the SSE route.
 */
function makeFullApp(overrides?: {
  mockQueryFnOptions?: { resultSubmitted?: boolean; error?: string };
  workspaceOverrides?: Parameters<typeof createMockWorkspace>[0];
}) {
  const config = makeConfig();
  const eventBus = createEventBus();
  const recordOps = createCommissionRecordOps();
  const lifecycle = createCommissionLifecycle({
    recordOps,
    emitEvent: (event: SystemEvent) => eventBus.emit(event),
  });
  const workspace = createMockWorkspace(overrides?.workspaceOverrides);
  const prepDeps = createMockPrepDeps();
  const gitOps = createMockGitOps();

  // The queryFn needs the eventBus and commissionId to emit results,
  // but commissionId isn't known until createCommission is called.
  // We use a late-binding approach: the queryFn captures a mutable ref.
  const queryState = {
    commissionId: "",
    resultSubmitted: overrides?.mockQueryFnOptions?.resultSubmitted ?? true,
    error: overrides?.mockQueryFnOptions?.error,
    runCount: 0,
  };

  async function* mockQueryGenerator(): AsyncGenerator<SDKMessage> {
    yield makeInitMessage(`test-session-${queryState.runCount}`);

    if (queryState.resultSubmitted && queryState.commissionId) {
      eventBus.emit({
        type: "commission_result",
        commissionId: queryState.commissionId,
        summary: "Test result summary",
        artifacts: ["output.md"],
      });
    }

    if (queryState.error) {
      throw new Error(queryState.error);
    }

    yield makeResultSuccess();
  }

  function queryFn(_params: { prompt: string; options: Record<string, unknown> }): AsyncGenerator<SDKMessage> {
    queryState.runCount++;
    return mockQueryGenerator();
  }

  const commissionSession = createCommissionOrchestrator({
    lifecycle,
    workspace,
    prepDeps,
    queryFn,
    recordOps,
    eventBus,
    config,
    packages: [WORKER_PKG],
    guildHallHome: ghHome,
    gitOps,
  });

  const startTime = Date.now();
  const app = createApp({
    health: {
      getMeetingCount: () => 0,
      getCommissionCount: () => commissionSession.getActiveCommissions(),
      getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    },
    commissionSession,
    eventBus,
  });

  return {
    app,
    commissionSession,
    eventBus,
    workspace,
    gitOps,
    queryState,
  };
}

// -- HTTP helpers --

async function postCreateCommission(
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown> = {
    projectName: TEST_PROJECT,
    title: "Integration Test Commission",
    workerName: "test-worker",
    prompt: "Do integration test work",
  },
): Promise<Response> {
  return app.request("/commissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postDispatch(
  app: ReturnType<typeof createApp>,
  commissionId: string,
): Promise<Response> {
  return app.request(`/commissions/${commissionId}/dispatch`, {
    method: "POST",
  });
}

async function _deleteCommission(
  app: ReturnType<typeof createApp>,
  commissionId: string,
): Promise<Response> {
  return app.request(`/commissions/${commissionId}`, {
    method: "DELETE",
  });
}

// -- Tests --

describe("commission lifecycle integration", () => {
  test("POST /commissions creates artifact and returns 201", async () => {
    const { app } = makeFullApp();

    const res = await postCreateCommission(app);
    expect(res.status).toBe(201);

    const body = await res.json() as { commissionId: string };
    expect(body.commissionId).toMatch(/^commission-/);

    // Verify artifact written to integration worktree
    const artifactPath = path.join(
      integrationPath,
      ".lore",
      "commissions",
      `${body.commissionId}.md`,
    );
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: pending");
    expect(raw).toContain("Do integration test work");
    expect(raw).toContain("worker: Test Worker");
  });

  test("POST /commissions returns 400 for missing fields", async () => {
    const { app } = makeFullApp();

    const res = await postCreateCommission(app, {
      projectName: TEST_PROJECT,
      // Missing title, workerName, prompt
    });
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("Missing required fields");
  });

  test("create -> dispatch -> complete: full lifecycle through HTTP", async () => {
    const { app, queryState, workspace } = makeFullApp();

    // 1. Create commission
    const createRes = await postCreateCommission(app);
    expect(createRes.status).toBe(201);
    const { commissionId } = await createRes.json() as { commissionId: string };

    // Wire the queryFn to emit result for this specific commission
    queryState.commissionId = commissionId;

    // 2. Dispatch commission
    const dispatchRes = await postDispatch(app, commissionId);
    expect(dispatchRes.status).toBe(202);
    const dispatchBody = await dispatchRes.json() as { status: string };
    expect(dispatchBody.status).toBe("accepted");

    // 3. Wait for the fire-and-forget session to complete
    // The session runs asynchronously after dispatch returns.
    await new Promise((r) => setTimeout(r, 200));

    // 4. Verify workspace.prepare was called (workspace provisioned)
    const prepareCalls = workspace.calls.filter((c) => c.method === "prepare");
    expect(prepareCalls).toHaveLength(1);

    // 5. Verify workspace.finalize was called (merge happened)
    const finalizeCalls = workspace.calls.filter((c) => c.method === "finalize");
    expect(finalizeCalls).toHaveLength(1);

    // 6. Verify the queryFn was called
    expect(queryState.runCount).toBe(1);
  });

  test("health endpoint reflects active commission count", async () => {
    // Use a blocking queryFn so we can observe the commission while active
    let resolveSession: () => void;
    const sessionBlock = new Promise<void>((r) => { resolveSession = r; });

    const config = makeConfig();
    const eventBus = createEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const workspace = createMockWorkspace();
    const prepDeps = createMockPrepDeps();
    const gitOps = createMockGitOps();

    // Blocking queryFn: yields init, waits for resolveSession, then yields result
    function queryFn(_params: { prompt: string; options: Record<string, unknown> }): AsyncGenerator<SDKMessage> {
      async function* gen(): AsyncGenerator<SDKMessage> {
        yield makeInitMessage("blocking-session");
        await sessionBlock;
        yield makeResultSuccess();
      }
      return gen();
    }

    const commissionSession = createCommissionOrchestrator({
      lifecycle, workspace, prepDeps, queryFn, recordOps, eventBus,
      config, packages: [WORKER_PKG], guildHallHome: ghHome, gitOps,
    });

    const startTime = Date.now();
    const app = createApp({
      health: {
        getMeetingCount: () => 0,
        getCommissionCount: () => commissionSession.getActiveCommissions(),
        getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
      },
      commissionSession,
      eventBus,
    });

    // Before any commissions
    let healthRes = await app.request("/health");
    let healthBody = await healthRes.json() as { commissions: { running: number } };
    expect(healthBody.commissions.running).toBe(0);

    // Create and dispatch
    const createRes = await postCreateCommission(app);
    const { commissionId } = await createRes.json() as { commissionId: string };

    await postDispatch(app, commissionId);

    // Give the session a moment to start (fire-and-forget)
    await new Promise((r) => setTimeout(r, 50));

    // During execution, count should be 1
    healthRes = await app.request("/health");
    healthBody = await healthRes.json() as { commissions: { running: number } };
    expect(healthBody.commissions.running).toBe(1);

    // Unblock the session (no result submitted -> fails)
    resolveSession!();
    await new Promise((r) => setTimeout(r, 200));

    // After completion, count should be back to 0
    healthRes = await app.request("/health");
    healthBody = await healthRes.json() as { commissions: { running: number } };
    expect(healthBody.commissions.running).toBe(0);
  });

  test("commission events flow through SSE via EventBus", async () => {
    const { app, queryState } = makeFullApp();

    // Subscribe to SSE before creating the commission
    const ssePromise = app.request("/events");

    // Give the SSE stream a moment to set up
    await new Promise((r) => setTimeout(r, 20));

    // Create and dispatch
    const createRes = await postCreateCommission(app);
    const { commissionId } = await createRes.json() as { commissionId: string };
    queryState.commissionId = commissionId;

    await postDispatch(app, commissionId);

    // Wait for session completion
    await new Promise((r) => setTimeout(r, 300));

    const sseRes = await ssePromise;
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

    const body = sseRes.body;
    expect(body).not.toBeNull();

    // Read commission lifecycle events from the SSE stream.
    // The lifecycle emits: dispatched, in_progress, commission_result,
    // completed (from lifecycle + from finalize success).
    const events = await readSSEEvents(body!, 4);
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Verify we got commission status transitions
    const statusEvents = events.filter(
      (e) => e.type === "commission_status",
    ) as Array<{ type: "commission_status"; commissionId: string; status: string }>;

    const statuses = statusEvents.map((e) => e.status);
    expect(statuses).toContain("dispatched");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("completed");

    // All status events should reference the same commission
    for (const e of statusEvents) {
      expect(e.commissionId).toBe(commissionId);
    }

    // Verify commission_result event was emitted
    const resultEvents = events.filter(
      (e) => e.type === "commission_result",
    ) as Array<{ type: "commission_result"; commissionId: string; summary: string }>;
    expect(resultEvents.length).toBeGreaterThanOrEqual(1);
    expect(resultEvents[0].commissionId).toBe(commissionId);
    expect(resultEvents[0].summary).toBe("Test result summary");
  });

  test("dispatch returns 500 for unknown commission", async () => {
    const { app } = makeFullApp();

    const res = await postDispatch(app, "commission-nonexistent-12345");
    expect(res.status).toBe(500);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });

  test("session error results in failed status", async () => {
    const { app, queryState, eventBus } = makeFullApp({
      mockQueryFnOptions: { resultSubmitted: false, error: "SDK exploded" },
    });

    // Collect all events
    const collectedEvents: SystemEvent[] = [];
    eventBus.subscribe((e) => collectedEvents.push(e));

    const createRes = await postCreateCommission(app);
    const { commissionId } = await createRes.json() as { commissionId: string };
    queryState.commissionId = commissionId;

    await postDispatch(app, commissionId);

    // Wait for the erroring session to complete
    await new Promise((r) => setTimeout(r, 300));

    // Verify failure events were emitted
    const statusEvents = collectedEvents.filter(
      (e) => e.type === "commission_status",
    ) as Array<{ type: "commission_status"; status: string }>;

    const statuses = statusEvents.map((e) => e.status);
    expect(statuses).toContain("failed");
  });

  test("finalize merge conflict triggers failure", async () => {
    const { app, queryState, eventBus } = makeFullApp({
      workspaceOverrides: {
        finalize: async () => ({ merged: false, reason: "Conflict on src/main.ts" } as FinalizeResult),
      },
    });

    const collectedEvents: SystemEvent[] = [];
    eventBus.subscribe((e) => collectedEvents.push(e));

    const createRes = await postCreateCommission(app);
    const { commissionId } = await createRes.json() as { commissionId: string };
    queryState.commissionId = commissionId;

    await postDispatch(app, commissionId);
    await new Promise((r) => setTimeout(r, 300));

    const statusEvents = collectedEvents.filter(
      (e) => e.type === "commission_status",
    ) as Array<{ type: "commission_status"; status: string }>;

    const statuses = statusEvents.map((e) => e.status);
    // Should go through dispatched -> in_progress -> failed (merge conflict)
    expect(statuses).toContain("dispatched");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("failed");
  });


  test("POST /commissions returns 500 for unknown project", async () => {
    const { app } = makeFullApp();

    const res = await postCreateCommission(app, {
      projectName: "nonexistent-project",
      title: "Test",
      workerName: "test-worker",
      prompt: "do stuff",
    });
    expect(res.status).toBe(500);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });

  test("POST /commissions returns 500 for unknown worker", async () => {
    const { app } = makeFullApp();

    const res = await postCreateCommission(app, {
      projectName: TEST_PROJECT,
      title: "Test",
      workerName: "ghost-worker",
      prompt: "do stuff",
    });
    expect(res.status).toBe(500);

    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });
});
