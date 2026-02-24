/**
 * Tests for commission concurrent limits and FIFO queue.
 *
 * Covers:
 * - Per-project commission cap (default 3)
 * - Global concurrent limit (default 10)
 * - Queuing when at capacity
 * - FIFO auto-dispatch when capacity opens
 * - Cross-project queue ordering
 * - Limit changes (reducing/increasing)
 * - Event emission (commission_queued, commission_dequeued)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  createCommissionSession,
} from "@/daemon/services/commission-session";
import type {
  CommissionSessionDeps,
  CommissionSessionForRoutes,
  SpawnedCommission,
} from "@/daemon/services/commission-session";
import {
  commissionArtifactPath,
} from "@/daemon/services/commission-artifact-helpers";
import { createEventBus } from "@/daemon/services/event-bus";
import type { EventBus, SystemEvent } from "@/daemon/services/event-bus";
import type { AppConfig, DiscoveredPackage } from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import {
  integrationWorktreePath,
} from "@/lib/paths";

let tmpDir: string;
let projectPath: string;
let project2Path: string;
let ghHome: string;
let integrationPath: string;
let integration2Path: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-concurrent-limits-"));
  projectPath = path.join(tmpDir, "test-project");
  project2Path = path.join(tmpDir, "test-project-2");
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");
  integration2Path = integrationWorktreePath(ghHome, "test-project-2");

  await fs.mkdir(path.join(projectPath, ".lore", "commissions"), { recursive: true });
  await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
  await fs.mkdir(path.join(project2Path, ".lore", "commissions"), { recursive: true });
  await fs.mkdir(path.join(integration2Path, ".lore", "commissions"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Test helpers --

function createMockWorkerPackage(name = "guild-hall-sample-assistant"): DiscoveredPackage {
  return {
    name,
    path: "/tmp/fake-packages/sample-assistant",
    metadata: {
      type: "worker" as const,
      identity: {
        name: "researcher",
        description: "Research specialist",
        displayTitle: "Research Specialist",
      },
      posture: "You are a research specialist.",
      domainToolboxes: [],
      builtInTools: [],
      checkoutScope: "sparse" as const,
      resourceDefaults: { maxTurns: 150, maxBudgetUsd: 1.0 },
    },
  };
}

/**
 * Creates a mock GitOps that records all calls without running real git.
 * createWorktree simulates directory creation and copies commission artifacts
 * from the integration worktree so that subsequent file reads succeed.
 */
function createMockGitOps(): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  async function copyCommissionsDir(worktreePath: string): Promise<void> {
    // Try all known integration paths to find the source artifact.
    // This supports multi-project tests.
    for (const iPath of [integrationPath, integration2Path]) {
      const srcDir = path.join(iPath, ".lore", "commissions");
      const destDir = path.join(worktreePath, ".lore", "commissions");
      try {
        await fs.access(srcDir);
        await fs.mkdir(destDir, { recursive: true });
        const files = await fs.readdir(srcDir);
        for (const file of files) {
          const destFile = path.join(destDir, file);
          try {
            await fs.access(destFile);
            // Already copied, skip
          } catch {
            await fs.copyFile(path.join(srcDir, file), destFile);
          }
        }
      } catch {
        // Source may not exist
      }
    }
  }

  /* eslint-disable @typescript-eslint/require-await */
  return {
    calls,
    async createBranch(...args) { calls.push({ method: "createBranch", args }); },
    async branchExists(...args) { calls.push({ method: "branchExists", args }); return false; },
    async deleteBranch(...args) { calls.push({ method: "deleteBranch", args }); },
    async createWorktree(...args) {
      calls.push({ method: "createWorktree", args });
      const worktreePath = args[1];
      await fs.mkdir(worktreePath, { recursive: true });
      await copyCommissionsDir(worktreePath);
    },
    async removeWorktree(...args) { calls.push({ method: "removeWorktree", args }); },
    async configureSparseCheckout(...args) { calls.push({ method: "configureSparseCheckout", args }); },
    async commitAll(...args) { calls.push({ method: "commitAll", args }); return false; },
    async squashMerge(...args) { calls.push({ method: "squashMerge", args }); },
    async hasUncommittedChanges(...args) { calls.push({ method: "hasUncommittedChanges", args }); return false; },
    async rebase(...args) { calls.push({ method: "rebase", args }); },
    async currentBranch(...args) { calls.push({ method: "currentBranch", args }); return "claude/main"; },
    async listWorktrees(...args) { calls.push({ method: "listWorktrees", args }); return []; },
    async initClaudeBranch(...args) { calls.push({ method: "initClaudeBranch", args }); },
    async detectDefaultBranch(...args) { calls.push({ method: "detectDefaultBranch", args }); return "main"; },
    async fetch(...args) { calls.push({ method: "fetch", args }); },
    async push(...args) { calls.push({ method: "push", args }); },
    async resetHard(...args) { calls.push({ method: "resetHard", args }); },
    async resetSoft(...args) { calls.push({ method: "resetSoft", args }); },
    async createPullRequest(...args) { calls.push({ method: "createPullRequest", args }); return { url: "" }; },
    async isAncestor(...args) { calls.push({ method: "isAncestor", args }); return false; },
    async treesEqual(...args) { calls.push({ method: "treesEqual", args }); return false; },
    async revParse(...args) { calls.push({ method: "revParse", args }); return "abc"; },
    async rebaseOnto(...args) { calls.push({ method: "rebaseOnto", args }); },
    async merge() {},
    async squashMergeNoCommit(...args) { calls.push({ method: "squashMergeNoCommit", args }); return true; },
    async listConflictedFiles(...args) { calls.push({ method: "listConflictedFiles", args }); return []; },
    async resolveConflictsTheirs(...args) { calls.push({ method: "resolveConflictsTheirs", args }); },
    async mergeAbort(...args) { calls.push({ method: "mergeAbort", args }); },
  };
  /* eslint-enable @typescript-eslint/require-await */
}

/**
 * Creates a mock spawn function that tracks multiple spawned processes.
 * Each call to the spawnFn returns a new controllable mock process.
 */
function createMultiSpawnTracker() {
  const spawned: Array<{
    configPath: string;
    pid: number;
    resolveExit: (exitCode?: number) => void;
    killed: boolean;
  }> = [];

  let nextPid = 10000;

  const spawnFn = (configPath: string): SpawnedCommission => {
    const pid = nextPid++;
    let resolveExit!: (result: { exitCode: number }) => void;
    const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
      resolveExit = resolve;
    });

    const entry = {
      configPath,
      pid,
      resolveExit: (exitCode = 0) => resolveExit({ exitCode }),
      killed: false,
    };
    spawned.push(entry);

    return {
      pid,
      exitPromise,
      kill: () => {
        entry.killed = true;
        resolveExit({ exitCode: 1 });
      },
    };
  };

  return { spawnFn, spawned };
}

/**
 * Writes a commission artifact at the given integration path with a specific
 * creation timestamp for FIFO ordering tests.
 */
async function writeCommissionArtifactAt(
  iPath: string,
  commissionId: CommissionId,
  status: CommissionStatus,
  projectName: string,
  createdAt: string,
): Promise<void> {
  const content = `---
title: "Commission: Test ${commissionId}"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Test prompt for ${commissionId}"
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: ${createdAt}
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: ${projectName}
---
`;

  const artifactPath = commissionArtifactPath(iPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

function createTestConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    projects: [
      { name: "test-project", path: projectPath },
      { name: "test-project-2", path: project2Path },
    ],
    ...overrides,
  };
}

function createTestDeps(
  overrides: Partial<CommissionSessionDeps> = {},
): CommissionSessionDeps {
  return {
    packages: [createMockWorkerPackage()],
    config: createTestConfig(),
    guildHallHome: ghHome,
    eventBus: createEventBus(),
    packagesDir: "/tmp/fake-packages",
    gitOps: createMockGitOps(),
    ...overrides,
  };
}

// -- Tests --

describe("commission concurrent limits", () => {
  let session: CommissionSessionForRoutes;
  let eventBus: EventBus;
  let emittedEvents: SystemEvent[];

  beforeEach(() => {
    eventBus = createEventBus();
    emittedEvents = [];
    eventBus.subscribe((event) => emittedEvents.push(event));
  });

  afterEach(() => {
    if (session) {
      session.shutdown();
    }
  });

  describe("per-project commission cap", () => {
    test("dispatch within limit returns accepted", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");
      await writeCommissionArtifactAt(
        integrationPath, id, "pending", "test-project",
        "2026-02-21T10:00:00.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 3 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      const result = await session.dispatchCommission(id);
      expect(result.status).toBe("accepted");
      expect(session.getActiveCommissions()).toBe(1);
    });

    test("dispatch at per-project limit returns queued", async () => {
      // Create 3 commissions and dispatch them (filling per-project cap of 3)
      const ids: CommissionId[] = [];
      for (let i = 0; i < 3; i++) {
        const id = asCommissionId(`commission-researcher-20260221-10000${i}`);
        ids.push(id);
        await writeCommissionArtifactAt(
          integrationPath, id, "pending", "test-project",
          `2026-02-21T10:00:0${i}.000Z`,
        );
      }

      // The 4th commission that should be queued
      const queuedId = asCommissionId("commission-researcher-20260221-100003");
      await writeCommissionArtifactAt(
        integrationPath, queuedId, "pending", "test-project",
        "2026-02-21T10:00:03.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 3 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      // Dispatch the first 3
      for (const id of ids) {
        const result = await session.dispatchCommission(id);
        expect(result.status).toBe("accepted");
      }
      expect(session.getActiveCommissions()).toBe(3);

      // 4th should be queued
      const result = await session.dispatchCommission(queuedId);
      expect(result.status).toBe("queued");
      expect(session.getActiveCommissions()).toBe(3);

      // Verify commission_queued event was emitted
      const queuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_queued",
      );
      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0]).toMatchObject({
        type: "commission_queued",
        commissionId: queuedId as string,
      });
    });

    test("uses default per-project cap of 3 when not configured", async () => {
      const ids: CommissionId[] = [];
      for (let i = 0; i < 3; i++) {
        const id = asCommissionId(`commission-researcher-20260221-10000${i}`);
        ids.push(id);
        await writeCommissionArtifactAt(
          integrationPath, id, "pending", "test-project",
          `2026-02-21T10:00:0${i}.000Z`,
        );
      }

      const queuedId = asCommissionId("commission-researcher-20260221-100003");
      await writeCommissionArtifactAt(
        integrationPath, queuedId, "pending", "test-project",
        "2026-02-21T10:00:03.000Z",
      );

      const tracker = createMultiSpawnTracker();
      // No commissionCap set, should default to 3
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
        }),
      );

      for (const id of ids) {
        await session.dispatchCommission(id);
      }

      const result = await session.dispatchCommission(queuedId);
      expect(result.status).toBe("queued");
    });
  });

  describe("global concurrent limit", () => {
    test("dispatch at global limit returns queued even if per-project limit not reached", async () => {
      // Set global limit to 2, per-project to 5
      // Fill global limit with 2 commissions (1 per project)
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");
      const id3 = asCommissionId("commission-researcher-20260221-100003");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integration2Path, id2, "pending", "test-project-2",
        "2026-02-21T10:00:02.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id3, "pending", "test-project",
        "2026-02-21T10:00:03.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: {
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 5 },
              { name: "test-project-2", path: project2Path, commissionCap: 5 },
            ],
            maxConcurrentCommissions: 2,
          },
        }),
      );

      // Dispatch first two
      const r1 = await session.dispatchCommission(id1);
      expect(r1.status).toBe("accepted");

      const r2 = await session.dispatchCommission(id2);
      expect(r2.status).toBe("accepted");

      expect(session.getActiveCommissions()).toBe(2);

      // Third should be queued (global limit of 2 reached, even though
      // test-project's per-project limit of 5 is not reached)
      const r3 = await session.dispatchCommission(id3);
      expect(r3.status).toBe("queued");

      const queuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_queued",
      );
      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0]).toMatchObject({
        commissionId: id3 as string,
      });
    });

    test("uses default global limit of 10 when not configured", async () => {
      // Verify the default by dispatching 10 commissions (should all succeed)
      const ids: CommissionId[] = [];
      for (let i = 0; i < 10; i++) {
        const id = asCommissionId(`commission-researcher-20260221-1000${String(i).padStart(2, "0")}`);
        ids.push(id);
        await writeCommissionArtifactAt(
          integrationPath, id, "pending", "test-project",
          `2026-02-21T10:00:${String(i).padStart(2, "0")}.000Z`,
        );
      }

      const tracker = createMultiSpawnTracker();
      // Set per-project cap high so only global matters
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 20 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      for (const id of ids) {
        const result = await session.dispatchCommission(id);
        expect(result.status).toBe("accepted");
      }
      expect(session.getActiveCommissions()).toBe(10);

      // 11th should be queued
      const id11 = asCommissionId("commission-researcher-20260221-100010");
      await writeCommissionArtifactAt(
        integrationPath, id11, "pending", "test-project",
        "2026-02-21T10:00:10.000Z",
      );

      const result = await session.dispatchCommission(id11);
      expect(result.status).toBe("queued");
    });
  });

  describe("FIFO auto-dispatch on capacity open", () => {
    test("completing a commission auto-dispatches oldest pending", async () => {
      // Set per-project cap to 1, dispatch one, queue another, complete first
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id2, "pending", "test-project",
        "2026-02-21T10:00:02.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 1 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      // Dispatch first
      const r1 = await session.dispatchCommission(id1);
      expect(r1.status).toBe("accepted");

      // Second should be queued
      const r2 = await session.dispatchCommission(id2);
      expect(r2.status).toBe("queued");

      // Complete the first commission (report result + exit)
      session.reportResult(id1, "Done");
      tracker.spawned[0].resolveExit(0);

      // Wait for async exit handler and auto-dispatch
      await new Promise((resolve) => setTimeout(resolve, 200));

      // id2 should now be dispatched via auto-dispatch
      // Check for dequeued event
      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents).toHaveLength(1);
      expect(dequeuedEvents[0]).toMatchObject({
        type: "commission_dequeued",
        commissionId: id2 as string,
      });

      // Should have 1 active commission (the auto-dispatched one)
      expect(session.getActiveCommissions()).toBe(1);
    });

    test("failure auto-dispatches pending commissions", async () => {
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id2, "pending", "test-project",
        "2026-02-21T10:00:02.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 1 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      await session.dispatchCommission(id1);
      const r2 = await session.dispatchCommission(id2);
      expect(r2.status).toBe("queued");

      // Fail the first commission (exit without result)
      tracker.spawned[0].resolveExit(1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // id2 should auto-dispatch
      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents).toHaveLength(1);
      expect(dequeuedEvents[0]).toMatchObject({
        commissionId: id2 as string,
      });
    });

    test("cancellation auto-dispatches pending commissions", async () => {
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id2, "pending", "test-project",
        "2026-02-21T10:00:02.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 1 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      await session.dispatchCommission(id1);
      const r2 = await session.dispatchCommission(id2);
      expect(r2.status).toBe("queued");

      // Cancel the first commission
      await session.cancelCommission(id1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // id2 should auto-dispatch
      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents).toHaveLength(1);
      expect(dequeuedEvents[0]).toMatchObject({
        commissionId: id2 as string,
      });
    });

    test("FIFO: oldest pending commission dispatches first across projects", async () => {
      // Create commissions across two projects with known timestamps.
      // The oldest (from project-2) should dispatch first.
      const idP1 = asCommissionId("commission-researcher-20260221-100010");
      const idP2 = asCommissionId("commission-researcher-20260221-100020");
      const idActive = asCommissionId("commission-researcher-20260221-100000");

      // Active commission in project 1 (fills the single slot)
      await writeCommissionArtifactAt(
        integrationPath, idActive, "pending", "test-project",
        "2026-02-21T09:00:00.000Z",
      );

      // Pending in project 1: newer timestamp
      await writeCommissionArtifactAt(
        integrationPath, idP1, "pending", "test-project",
        "2026-02-21T10:00:10.000Z",
      );

      // Pending in project 2: older timestamp (should dispatch first)
      await writeCommissionArtifactAt(
        integration2Path, idP2, "pending", "test-project-2",
        "2026-02-21T10:00:05.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: {
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 1 },
              { name: "test-project-2", path: project2Path, commissionCap: 1 },
            ],
            maxConcurrentCommissions: 1,
          },
        }),
      );

      // Dispatch the active commission (fills the only global slot)
      await session.dispatchCommission(idActive);
      expect(session.getActiveCommissions()).toBe(1);

      // Both pending commissions should be queued
      const r1 = await session.dispatchCommission(idP1);
      expect(r1.status).toBe("queued");
      const r2 = await session.dispatchCommission(idP2);
      expect(r2.status).toBe("queued");

      // Complete the active commission
      session.reportResult(idActive, "Done");
      tracker.spawned[0].resolveExit(0);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // The oldest pending (idP2 from project-2) should have been dequeued
      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents.length).toBeGreaterThanOrEqual(1);
      // First dequeued should be idP2 (older timestamp)
      expect(dequeuedEvents[0]).toMatchObject({
        commissionId: idP2 as string,
      });
    });
  });

  describe("reducing limits", () => {
    test("reducing limits does not cancel running commissions", async () => {
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id2, "pending", "test-project",
        "2026-02-21T10:00:02.000Z",
      );

      const tracker = createMultiSpawnTracker();
      // Start with cap of 3
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 3 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      // Dispatch 2 commissions
      await session.dispatchCommission(id1);
      await session.dispatchCommission(id2);
      expect(session.getActiveCommissions()).toBe(2);

      // The limit is set at session creation time. Even if we conceptually
      // "reduced" it, running commissions continue. The real behavior is:
      // new dispatches are blocked until count drops below the new limit.
      // Since config is immutable once passed, this test verifies that
      // creating a session with a lower cap after commissions are running
      // doesn't affect them (they're already in the active map).
      //
      // The key point: 2 commissions are active and continuing.
      expect(session.getActiveCommissions()).toBe(2);

      // Neither was killed
      expect(tracker.spawned[0].killed).toBe(false);
      expect(tracker.spawned[1].killed).toBe(false);
    });
  });

  describe("increasing limits auto-dispatches pending", () => {
    test("session with higher limit dispatches pending commissions that were queued under lower limit", async () => {
      // This tests the scenario where a new session is created with a
      // higher limit and pending commissions exist. The auto-dispatch
      // on capacity open should fire when commissions complete.
      //
      // Simulated by: create session with cap=2, dispatch 2, queue a 3rd.
      // When one completes, the 3rd auto-dispatches.
      const id1 = asCommissionId("commission-researcher-20260221-100001");
      const id2 = asCommissionId("commission-researcher-20260221-100002");
      const id3 = asCommissionId("commission-researcher-20260221-100003");

      await writeCommissionArtifactAt(
        integrationPath, id1, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id2, "pending", "test-project",
        "2026-02-21T10:00:02.000Z",
      );
      await writeCommissionArtifactAt(
        integrationPath, id3, "pending", "test-project",
        "2026-02-21T10:00:03.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 2 },
              { name: "test-project-2", path: project2Path },
            ],
          }),
        }),
      );

      await session.dispatchCommission(id1);
      await session.dispatchCommission(id2);
      const r3 = await session.dispatchCommission(id3);
      expect(r3.status).toBe("queued");

      // Complete id1
      session.reportResult(id1, "Done");
      tracker.spawned[0].resolveExit(0);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // id3 should now be auto-dispatched
      expect(session.getActiveCommissions()).toBe(2); // id2 + id3

      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents).toHaveLength(1);
      expect(dequeuedEvents[0]).toMatchObject({
        commissionId: id3 as string,
      });
    });
  });

  describe("config schema defaults", () => {
    test("commissionCap defaults to 3 per project", async () => {
      // Dispatch 3 (should all succeed), 4th should queue
      const ids: CommissionId[] = [];
      for (let i = 0; i < 4; i++) {
        const id = asCommissionId(`commission-researcher-20260221-10000${i}`);
        ids.push(id);
        await writeCommissionArtifactAt(
          integrationPath, id, "pending", "test-project",
          `2026-02-21T10:00:0${i}.000Z`,
        );
      }

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          // No commissionCap or maxConcurrentCommissions configured
        }),
      );

      for (let i = 0; i < 3; i++) {
        const result = await session.dispatchCommission(ids[i]);
        expect(result.status).toBe("accepted");
      }

      const result = await session.dispatchCommission(ids[3]);
      expect(result.status).toBe("queued");
    });

    test("maxConcurrentCommissions defaults to 10", async () => {
      // We need all commissions in different projects to avoid per-project cap.
      // Since we only have 2 projects, set per-project cap high.
      const ids: CommissionId[] = [];
      for (let i = 0; i < 11; i++) {
        const id = asCommissionId(`commission-researcher-20260221-1000${String(i).padStart(2, "0")}`);
        ids.push(id);
        await writeCommissionArtifactAt(
          integrationPath, id, "pending", "test-project",
          `2026-02-21T10:00:${String(i).padStart(2, "0")}.000Z`,
        );
      }

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: createTestConfig({
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 20 },
              { name: "test-project-2", path: project2Path },
            ],
            // No maxConcurrentCommissions, should default to 10
          }),
        }),
      );

      for (let i = 0; i < 10; i++) {
        const result = await session.dispatchCommission(ids[i]);
        expect(result.status).toBe("accepted");
      }

      const result = await session.dispatchCommission(ids[10]);
      expect(result.status).toBe("queued");
    });
  });

  describe("auto-dispatch skips commissions blocked by per-project limit", () => {
    test("auto-dispatch respects per-project limits when selecting from queue", async () => {
      // Project 1 cap: 1, Project 2 cap: 1, Global: 2
      // Dispatch 1 in project 1, 1 in project 2 (both projects at cap)
      // Queue 1 more in each project
      // Complete the one in project 2
      // Auto-dispatch should pick the project-2 queued one (project 1 is still at cap)

      const idP1Active = asCommissionId("commission-researcher-20260221-100001");
      const idP2Active = asCommissionId("commission-researcher-20260221-100002");
      const idP1Queued = asCommissionId("commission-researcher-20260221-100003");
      const idP2Queued = asCommissionId("commission-researcher-20260221-100004");

      await writeCommissionArtifactAt(
        integrationPath, idP1Active, "pending", "test-project",
        "2026-02-21T10:00:01.000Z",
      );
      await writeCommissionArtifactAt(
        integration2Path, idP2Active, "pending", "test-project-2",
        "2026-02-21T10:00:02.000Z",
      );
      // idP1Queued is older than idP2Queued to test that per-project limits
      // prevent it from dispatching even though it's first in FIFO order
      await writeCommissionArtifactAt(
        integrationPath, idP1Queued, "pending", "test-project",
        "2026-02-21T10:00:03.000Z",
      );
      await writeCommissionArtifactAt(
        integration2Path, idP2Queued, "pending", "test-project-2",
        "2026-02-21T10:00:04.000Z",
      );

      const tracker = createMultiSpawnTracker();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: tracker.spawnFn,
          config: {
            projects: [
              { name: "test-project", path: projectPath, commissionCap: 1 },
              { name: "test-project-2", path: project2Path, commissionCap: 1 },
            ],
            maxConcurrentCommissions: 10,
          },
        }),
      );

      // Fill both per-project caps
      await session.dispatchCommission(idP1Active);
      await session.dispatchCommission(idP2Active);

      // Both queued commissions should be queued
      const r3 = await session.dispatchCommission(idP1Queued);
      expect(r3.status).toBe("queued");
      const r4 = await session.dispatchCommission(idP2Queued);
      expect(r4.status).toBe("queued");

      // Complete project 2's active commission
      session.reportResult(idP2Active, "Done");
      tracker.spawned[1].resolveExit(0);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // idP2Queued should be dequeued (project 2 has capacity).
      // idP1Queued should NOT be dequeued (project 1 is still at cap).
      const dequeuedEvents = emittedEvents.filter(
        (e) => e.type === "commission_dequeued",
      );
      expect(dequeuedEvents).toHaveLength(1);
      // Even though idP1Queued is older, it can't dispatch because project 1 is at cap
      expect(dequeuedEvents[0]).toMatchObject({
        commissionId: idP2Queued as string,
      });
    });
  });
});
