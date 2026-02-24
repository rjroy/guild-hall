/**
 * Tests for commission crash recovery on daemon startup.
 *
 * Covers three recovery cases:
 *   1. State file exists, process dead -> transition to failed
 *   2. State file exists, process alive -> reattach monitoring
 *   3. Orphaned worktree (no state file) -> transition to failed
 * Plus the "nothing to recover" happy path.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionStatus } from "@/daemon/types";
import {
  createCommissionSession,
} from "@/daemon/services/commission-session";
import type {
  CommissionSessionDeps,
  CommissionSessionForRoutes,
} from "@/daemon/services/commission-session";
import {
  commissionArtifactPath,
  readCommissionStatus,
  readActivityTimeline,
} from "@/daemon/services/commission-artifact-helpers";
import { createEventBus } from "@/daemon/services/event-bus";
import type { EventBus, SystemEvent } from "@/daemon/services/event-bus";
import type { AppConfig, DiscoveredPackage } from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import {
  integrationWorktreePath,
  activityWorktreeRoot,
} from "@/lib/paths";

let tmpDir: string;
let projectPath: string;
let ghHome: string;
let integrationPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commission-recovery-"));
  projectPath = path.join(tmpDir, "test-project");
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");

  // Create the project and integration worktree directories
  await fs.mkdir(
    path.join(projectPath, ".lore", "commissions"),
    { recursive: true },
  );
  await fs.mkdir(
    path.join(integrationPath, ".lore", "commissions"),
    { recursive: true },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Test helpers --

function createMockWorkerPackage(): DiscoveredPackage {
  return {
    name: "guild-hall-sample-assistant",
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
      resourceDefaults: {
        maxTurns: 150,
        maxBudgetUsd: 1.0,
      },
    },
  };
}

function createMockGitOps(): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

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
  };
  /* eslint-enable @typescript-eslint/require-await */
}

function createTestConfig(): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: projectPath,
      },
    ],
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

/**
 * Writes a commission state file to the state directory.
 */
async function writeStateFile(
  commissionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const stateDir = path.join(ghHome, "state", "commissions");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, `${commissionId}.json`),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

/**
 * Writes a commission artifact to the integration worktree.
 */
async function writeCommissionArtifact(
  commissionId: string,
  status: CommissionStatus,
): Promise<void> {
  const content = `---
title: "Commission: Test commission"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Test prompt"
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;

  const artifactPath = commissionArtifactPath(
    integrationPath,
    asCommissionId(commissionId),
  );
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, content, "utf-8");
}

/**
 * Creates an activity worktree directory for a commission.
 */
async function createWorktreeDir(commissionId: string): Promise<string> {
  const worktreeDir = path.join(
    activityWorktreeRoot(ghHome, "test-project"),
    commissionId,
  );
  await fs.mkdir(
    path.join(worktreeDir, ".lore", "commissions"),
    { recursive: true },
  );
  return worktreeDir;
}

// -- Tests --

describe("recoverCommissions", () => {
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

  // -- Nothing to recover --

  test("returns 0 when state directory does not exist", async () => {
    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
  });

  test("returns 0 when state directory is empty", async () => {
    await fs.mkdir(path.join(ghHome, "state", "commissions"), { recursive: true });

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
  });

  test("skips terminal state files (completed, failed, cancelled)", async () => {
    const id = "commission-researcher-20260221-143000";
    await writeCommissionArtifact(id, "completed");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      status: "completed",
    });

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
    expect(session.getActiveCommissions()).toBe(0);
  });

  test("skips commissions referencing unknown projects", async () => {
    const id = "commission-researcher-20260221-143000";
    await writeStateFile(id, {
      commissionId: id,
      projectName: "nonexistent-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
    });

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
  });

  test("skips corrupt state files gracefully", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "corrupt-commission.json"),
      "not valid json {{{",
      "utf-8",
    );

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    // Should not throw
    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
  });

  // -- Case 1: Dead PID --

  test("dead PID transitions commission to failed", async () => {
    const id = "commission-researcher-20260221-143000";
    const cId = asCommissionId(id);
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        // PID 99999 is always dead
        isProcessAlive: () => false,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
    expect(session.getActiveCommissions()).toBe(0);

    // Artifact should be updated to failed in integration worktree
    const status = await readCommissionStatus(integrationPath, cId);
    expect(status).toBe("failed");

    // Timeline should include the recovery entry
    const timeline = await readActivityTimeline(integrationPath, cId);
    const recoveryEntry = timeline.find((e) => e.event === "status_failed");
    expect(recoveryEntry).toBeDefined();
    expect(recoveryEntry!.reason).toContain("process lost on restart");

    // Event bus should have emitted a failed status event
    const failedEvents = emittedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBe(1);
  });

  test("dead PID commits partial work before cleanup", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        isProcessAlive: () => false,
      }),
    );

    await session.recoverCommissions();

    // commitAll should have been called on the worktree
    const commitCalls = mockGitOps.calls.filter((c) => c.method === "commitAll");
    expect(commitCalls.length).toBeGreaterThanOrEqual(1);
    expect(commitCalls[0].args[0]).toBe(worktreeDir);
  });

  test("dead PID removes worktree but preserves branch", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        isProcessAlive: () => false,
      }),
    );

    await session.recoverCommissions();

    // removeWorktree should have been called
    const removeCalls = mockGitOps.calls.filter((c) => c.method === "removeWorktree");
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);

    // deleteBranch should NOT have been called (branch preserved for inspection)
    const deleteCalls = mockGitOps.calls.filter((c) => c.method === "deleteBranch");
    expect(deleteCalls.length).toBe(0);
  });

  test("dead PID updates state file to failed", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: () => false,
      }),
    );

    await session.recoverCommissions();

    // Read the updated state file
    const stateRaw = await fs.readFile(
      path.join(ghHome, "state", "commissions", `${id}.json`),
      "utf-8",
    );
    const state = JSON.parse(stateRaw) as Record<string, unknown>;
    expect(state.status).toBe("failed");
    expect(state.reason).toContain("process lost on restart");
  });

  test("dead PID with dispatched status also transitions to failed", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "dispatched");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "dispatched",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: () => false,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);

    const cId = asCommissionId(id);
    const status = await readCommissionStatus(integrationPath, cId);
    expect(status).toBe("failed");
  });

  test("state file with no PID transitions to failed", async () => {
    const id = "commission-researcher-20260221-143000";

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      status: "in_progress",
      // No pid field
    });

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);

    const cId = asCommissionId(id);
    const status = await readCommissionStatus(integrationPath, cId);
    expect(status).toBe("failed");
  });

  // -- Case 2: Live PID --

  test("live PID reattaches commission to active Map", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    // Write artifact to both integration and activity worktrees
    await writeCommissionArtifact(id, "in_progress");

    // Also create the artifact in the activity worktree for transition reads
    const activityArtifactPath = commissionArtifactPath(
      worktreeDir,
      asCommissionId(id),
    );
    const artifactContent = await fs.readFile(
      commissionArtifactPath(integrationPath, asCommissionId(id)),
      "utf-8",
    );
    await fs.writeFile(activityArtifactPath, artifactContent, "utf-8");

    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 12345,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
      configPath: path.join(ghHome, "state", "commissions", `${id}.config.json`),
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: (pid) => pid === 12345,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(1);
    expect(session.getActiveCommissions()).toBe(1);
  });

  test("live PID with dispatched status transitions to in_progress", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    // Write artifact as dispatched in both worktrees
    await writeCommissionArtifact(id, "dispatched");

    const activityArtifactPath = commissionArtifactPath(
      worktreeDir,
      asCommissionId(id),
    );
    const artifactContent = await fs.readFile(
      commissionArtifactPath(integrationPath, asCommissionId(id)),
      "utf-8",
    );
    await fs.writeFile(activityArtifactPath, artifactContent, "utf-8");

    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 12345,
      status: "dispatched",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: (pid) => pid === 12345,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(1);

    // The artifact in the activity worktree should now be in_progress
    const status = await readCommissionStatus(worktreeDir, asCommissionId(id));
    expect(status).toBe("in_progress");

    // Timeline should have the dispatched -> in_progress transition
    const timeline = await readActivityTimeline(worktreeDir, asCommissionId(id));
    const progressEntry = timeline.find((e) => e.event === "status_in_progress");
    expect(progressEntry).toBeDefined();
    expect(progressEntry!.reason).toContain("daemon restart");
  });

  test("live PID does not call removeWorktree or deleteBranch", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");

    const activityArtifactPath = commissionArtifactPath(
      worktreeDir,
      asCommissionId(id),
    );
    const artifactContent = await fs.readFile(
      commissionArtifactPath(integrationPath, asCommissionId(id)),
      "utf-8",
    );
    await fs.writeFile(activityArtifactPath, artifactContent, "utf-8");

    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 12345,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        isProcessAlive: (pid) => pid === 12345,
      }),
    );

    await session.recoverCommissions();

    const removeCalls = mockGitOps.calls.filter((c) => c.method === "removeWorktree");
    expect(removeCalls.length).toBe(0);

    const deleteCalls = mockGitOps.calls.filter((c) => c.method === "deleteBranch");
    expect(deleteCalls.length).toBe(0);
  });

  // -- Case 3: Orphaned worktree --

  test("orphaned worktree (no state file) transitions to failed", async () => {
    const id = "commission-researcher-20260221-143000";
    const cId = asCommissionId(id);

    // Create worktree directory but no state file
    await createWorktreeDir(id);

    // Write artifact in integration worktree (would exist from original dispatch)
    await writeCommissionArtifact(id, "in_progress");

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0); // Orphans don't count as "recovered"

    // Artifact should be updated to failed
    const status = await readCommissionStatus(integrationPath, cId);
    expect(status).toBe("failed");

    // Timeline should include "state lost" reason
    const timeline = await readActivityTimeline(integrationPath, cId);
    const recoveryEntry = timeline.find((e) => e.event === "status_failed");
    expect(recoveryEntry).toBeDefined();
    expect(recoveryEntry!.reason).toContain("state lost");
  });

  test("orphaned worktree commits partial work before cleanup", async () => {
    const id = "commission-researcher-20260221-143000";

    await createWorktreeDir(id);
    await writeCommissionArtifact(id, "in_progress");

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
      }),
    );

    await session.recoverCommissions();

    // commitAll should have been called on the orphaned worktree
    const commitCalls = mockGitOps.calls.filter((c) => c.method === "commitAll");
    expect(commitCalls.length).toBeGreaterThanOrEqual(1);
    const expectedWorktreeDir = path.join(
      activityWorktreeRoot(ghHome, "test-project"),
      id,
    );
    expect(commitCalls[0].args[0]).toBe(expectedWorktreeDir);
  });

  test("orphaned worktree removes worktree but preserves branch", async () => {
    const id = "commission-researcher-20260221-143000";

    await createWorktreeDir(id);
    await writeCommissionArtifact(id, "in_progress");

    const mockGitOps = createMockGitOps();
    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
      }),
    );

    await session.recoverCommissions();

    const removeCalls = mockGitOps.calls.filter((c) => c.method === "removeWorktree");
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);

    const deleteCalls = mockGitOps.calls.filter((c) => c.method === "deleteBranch");
    expect(deleteCalls.length).toBe(0);
  });

  test("orphaned worktree emits failed event", async () => {
    const id = "commission-researcher-20260221-143000";

    await createWorktreeDir(id);
    await writeCommissionArtifact(id, "in_progress");

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    await session.recoverCommissions();

    const failedEvents = emittedEvents.filter(
      (e) =>
        e.type === "commission_status" &&
        "status" in e &&
        e.status === "failed" &&
        "reason" in e &&
        typeof e.reason === "string" &&
        e.reason.includes("state lost"),
    );
    expect(failedEvents.length).toBe(1);
  });

  test("orphaned worktree skips non-commission directories", async () => {
    // Create a meeting worktree (should not be picked up)
    const meetingDir = path.join(
      activityWorktreeRoot(ghHome, "test-project"),
      "meeting-audience-test-20260221-143000",
    );
    await fs.mkdir(meetingDir, { recursive: true });

    // Create a random non-commission directory
    const randomDir = path.join(
      activityWorktreeRoot(ghHome, "test-project"),
      "something-else",
    );
    await fs.mkdir(randomDir, { recursive: true });

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
    expect(emittedEvents.length).toBe(0);
  });

  test("orphaned worktree with existing state file is not treated as orphan", async () => {
    const id = "commission-researcher-20260221-143000";

    // Create both worktree and state file (should be handled by state file scan)
    await createWorktreeDir(id);
    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir: path.join(activityWorktreeRoot(ghHome, "test-project"), id),
      branchName: `claude/commission/${id}`,
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: () => false,
      }),
    );

    await session.recoverCommissions();

    // Should have only one failed event (from the state file scan, not the orphan scan)
    const failedEvents = emittedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBe(1);
    // The reason should be about "process lost" (from state file scan),
    // not "state lost" (from orphan scan)
    const event = failedEvents[0];
    expect("reason" in event && typeof event.reason === "string" && event.reason.includes("process lost")).toBe(true);
  });

  // -- Mixed scenarios --

  test("handles mix of dead and live PIDs", async () => {
    const deadId = "commission-researcher-20260221-143000";
    const liveId = "commission-researcher-20260221-144000";

    // Dead commission
    const deadWorktreeDir = await createWorktreeDir(deadId);
    await writeCommissionArtifact(deadId, "in_progress");
    await writeStateFile(deadId, {
      commissionId: deadId,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir: deadWorktreeDir,
      branchName: `claude/commission/${deadId}`,
    });

    // Live commission
    const liveWorktreeDir = await createWorktreeDir(liveId);
    await writeCommissionArtifact(liveId, "in_progress");
    // Copy artifact to activity worktree for live commission
    const liveActivityArtifact = commissionArtifactPath(
      liveWorktreeDir,
      asCommissionId(liveId),
    );
    const liveArtifactContent = await fs.readFile(
      commissionArtifactPath(integrationPath, asCommissionId(liveId)),
      "utf-8",
    );
    await fs.writeFile(liveActivityArtifact, liveArtifactContent, "utf-8");

    await writeStateFile(liveId, {
      commissionId: liveId,
      projectName: "test-project",
      workerName: "researcher",
      pid: 12345,
      status: "in_progress",
      worktreeDir: liveWorktreeDir,
      branchName: `claude/commission/${liveId}`,
    });

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        isProcessAlive: (pid) => pid === 12345,
      }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(1); // Only the live one counts as recovered
    expect(session.getActiveCommissions()).toBe(1);

    // Dead commission should be failed
    const deadStatus = await readCommissionStatus(
      integrationPath,
      asCommissionId(deadId),
    );
    expect(deadStatus).toBe("failed");

    // Failed event emitted for dead commission
    const failedEvents = emittedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBe(1);
  });

  test("skips .config.json files (worker config, not state)", async () => {
    // Write a .config.json file (these are worker configs, not state files)
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-researcher-20260221-143000.config.json"),
      JSON.stringify({ commissionId: "test", workingDirectory: "/tmp" }),
      "utf-8",
    );

    session = createCommissionSession(
      createTestDeps({ eventBus }),
    );

    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);
    expect(emittedEvents.length).toBe(0);
  });

  // -- Error resilience --

  test("git commitAll failure does not prevent recovery from completing", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    mockGitOps.commitAll = () => Promise.reject(new Error("Git commit failed"));

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        isProcessAlive: () => false,
      }),
    );

    // Should not throw even though commitAll fails
    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);

    // Status should still be updated to failed
    const status = await readCommissionStatus(
      integrationPath,
      asCommissionId(id),
    );
    expect(status).toBe("failed");
  });

  test("removeWorktree failure does not prevent recovery from completing", async () => {
    const id = "commission-researcher-20260221-143000";
    const worktreeDir = await createWorktreeDir(id);

    await writeCommissionArtifact(id, "in_progress");
    await writeStateFile(id, {
      commissionId: id,
      projectName: "test-project",
      workerName: "researcher",
      pid: 99999,
      status: "in_progress",
      worktreeDir,
      branchName: `claude/commission/${id}`,
    });

    const mockGitOps = createMockGitOps();
    mockGitOps.removeWorktree = () => Promise.reject(new Error("Worktree removal failed"));

    session = createCommissionSession(
      createTestDeps({
        eventBus,
        gitOps: mockGitOps,
        isProcessAlive: () => false,
      }),
    );

    // Should not throw
    const recovered = await session.recoverCommissions();
    expect(recovered).toBe(0);

    // Failed event should still be emitted
    const failedEvents = emittedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBe(1);
  });
});
