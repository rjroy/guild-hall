/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  recoverCommissions,
  type RecoveryDeps,
} from "@/daemon/services/commission-recovery";
import {
  commissionArtifactPath,
} from "@/daemon/services/commission-artifact-helpers";
import { integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
import { ActivityMachine } from "@/daemon/lib/activity-state-machine";
import type { ArtifactOps } from "@/daemon/lib/activity-state-machine";
import type { ActiveCommissionEntry } from "@/daemon/services/commission-handlers";
import {
  COMMISSION_TRANSITIONS,
  COMMISSION_ACTIVE_STATES,
  COMMISSION_CLEANUP_STATES,
} from "@/daemon/services/commission-handlers";

let tmpDir: string;
let ghHome: string;
let projectPath: string;
let integrationPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-recovery-"));
  ghHome = path.join(tmpDir, "guild-hall-home");
  projectPath = path.join(tmpDir, "test-project");
  integrationPath = integrationWorktreePath(ghHome, "test-project");

  await fs.mkdir(
    path.join(integrationPath, ".lore", "commissions"),
    { recursive: true },
  );
  await fs.mkdir(projectPath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeCommissionArtifact(
  basePath: string,
  commissionId: CommissionId,
  status: string,
): Promise<void> {
  const content = `---
title: "Commission: Test"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
prompt: "Do research"
dependencies: []
linked_artifacts: []
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Created"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;
  const artifactPath = commissionArtifactPath(basePath, commissionId);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- Machine test infrastructure --

type TransitionRecord = {
  id: string;
  from: CommissionStatus;
  to: CommissionStatus;
  reason: string;
};

/**
 * Creates a real ActivityMachine with no-op artifact ops and tracking enter
 * handlers that record transitions. The enter-failed handler is intentionally
 * a no-op because the real handler has filesystem side effects we don't want
 * in these tests. The point is to verify that recovery correctly calls
 * machine.register() and machine.transition().
 */
function createTestMachine(): {
  machine: ActivityMachine<CommissionStatus, CommissionId, ActiveCommissionEntry>;
  trackedEntries: Map<CommissionId, ActiveCommissionEntry>;
  transitions: TransitionRecord[];
} {
  const transitions: TransitionRecord[] = [];

  const artifactOps: ArtifactOps<CommissionId, CommissionStatus> = {
    writeStatusAndTimeline: async () => {},
    resolveBasePath: () => integrationPath,
  };

  const machine = new ActivityMachine<CommissionStatus, CommissionId, ActiveCommissionEntry>({
    activityType: "commission",
    transitions: COMMISSION_TRANSITIONS,
    cleanupStates: COMMISSION_CLEANUP_STATES,
    activeStates: COMMISSION_ACTIVE_STATES,
    handlers: {
      enter: {
        // Track transitions to failed via the enter handler
        failed: async (ctx) => {
          transitions.push({
            id: ctx.id as string,
            from: ctx.sourceState as CommissionStatus,
            to: ctx.targetState,
            reason: ctx.reason,
          });
          return undefined;
        },
      },
    },
    artifactOps,
    extractProjectName: (entry) => entry.projectName,
  });

  const trackedEntries = new Map<CommissionId, ActiveCommissionEntry>();

  return { machine, trackedEntries, transitions };
}

function createMockDeps(
  overrides: Partial<RecoveryDeps> = {},
): RecoveryDeps & {
  transitions: TransitionRecord[];
  trackedEntries: Map<CommissionId, ActiveCommissionEntry>;
} {
  const { machine, trackedEntries, transitions } = createTestMachine();

  return {
    ghHome,
    config: {
      projects: [{ name: "test-project", path: projectPath }],
    },
    machine,
    trackedEntries,
    transitions,
    ...overrides,
  };
}

describe("recoverCommissions", () => {
  test("returns 0 when no state files exist", async () => {
    const deps = createMockDeps();
    const result = await recoverCommissions(deps);
    expect(result).toBe(0);
  });

  test("recovers active commissions from state files via machine transition", async () => {
    const commissionId = "commission-researcher-20260221-143000";
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "researcher",
        status: "dispatched",
      }),
    );

    await writeCommissionArtifact(
      integrationPath,
      asCommissionId(commissionId),
      "dispatched",
    );

    const deps = createMockDeps();
    const result = await recoverCommissions(deps);

    expect(result).toBe(1);
    // Verify the machine was used: the enter-failed handler was called
    expect(deps.transitions).toHaveLength(1);
    expect(deps.transitions[0].from).toBe("dispatched");
    expect(deps.transitions[0].to).toBe("failed");
    expect(deps.transitions[0].reason).toContain("Recovery:");
  });

  test("registers entry in trackedEntries", async () => {
    const commissionId = "commission-researcher-20260221-143000";
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "researcher",
        status: "in_progress",
        worktreeDir: "/some/path",
        branchName: "branch-name",
      }),
    );

    await writeCommissionArtifact(
      integrationPath,
      asCommissionId(commissionId),
      "in_progress",
    );

    const deps = createMockDeps();
    await recoverCommissions(deps);

    const cId = asCommissionId(commissionId);
    expect(deps.trackedEntries.has(cId)).toBe(true);
    const entry = deps.trackedEntries.get(cId)!;
    expect(entry.projectName).toBe("test-project");
    expect(entry.workerName).toBe("researcher");
    expect(entry.worktreeDir).toBe("/some/path");
    expect(entry.branchName).toBe("branch-name");
  });

  test("skips non-active commissions", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-old.json"),
      JSON.stringify({
        commissionId: "commission-old",
        projectName: "test-project",
        workerName: "researcher",
        status: "completed",
      }),
    );

    const deps = createMockDeps();
    await recoverCommissions(deps);

    expect(deps.transitions).toHaveLength(0);
  });

  test("skips commissions for unknown projects", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-ghost.json"),
      JSON.stringify({
        commissionId: "commission-ghost",
        projectName: "nonexistent",
        workerName: "researcher",
        status: "in_progress",
      }),
    );

    const deps = createMockDeps();
    await recoverCommissions(deps);

    expect(deps.transitions).toHaveLength(0);
  });

  test("skips commissions already tracked by machine", async () => {
    const commissionId = "commission-active";
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "researcher",
        status: "dispatched",
      }),
    );

    const deps = createMockDeps();

    // Pre-register the entry in the machine so it appears tracked
    const cId = asCommissionId(commissionId);
    const existingEntry: ActiveCommissionEntry = {
      commissionId: cId,
      projectName: "test-project",
      workerName: "researcher",
      startTime: new Date(),
      lastActivity: new Date(),
      status: "dispatched",
      resultSubmitted: false,
    };
    deps.machine.register(cId, existingEntry, "dispatched");

    await recoverCommissions(deps);

    // No transitions should have occurred for the already-tracked entry
    expect(deps.transitions).toHaveLength(0);
  });

  test("recovers in_progress commissions and transitions to failed", async () => {
    const commissionId = "commission-researcher-20260221-150000";
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "researcher",
        status: "in_progress",
      }),
    );

    await writeCommissionArtifact(
      integrationPath,
      asCommissionId(commissionId),
      "in_progress",
    );

    const deps = createMockDeps();
    const result = await recoverCommissions(deps);

    expect(result).toBe(1);
    expect(deps.transitions).toHaveLength(1);
    expect(deps.transitions[0].from).toBe("in_progress");
    expect(deps.transitions[0].to).toBe("failed");
  });

  test("handles orphaned worktrees (no state file)", async () => {
    // Create an orphaned worktree directory with commission naming pattern
    const commissionId = "commission-orphan-20260221-160000";
    const worktreeRoot = activityWorktreeRoot(ghHome, "test-project");
    const orphanDir = path.join(worktreeRoot, commissionId);
    await fs.mkdir(orphanDir, { recursive: true });

    await writeCommissionArtifact(
      integrationPath,
      asCommissionId(commissionId),
      "in_progress",
    );

    const deps = createMockDeps();
    const result = await recoverCommissions(deps);

    expect(result).toBe(1);
    expect(deps.transitions).toHaveLength(1);
    expect(deps.transitions[0].from).toBe("in_progress");
    expect(deps.transitions[0].to).toBe("failed");
    expect(deps.transitions[0].reason).toContain("state lost");

    // Verify the orphaned entry is tracked
    const cId = asCommissionId(commissionId);
    expect(deps.trackedEntries.has(cId)).toBe(true);
    const entry = deps.trackedEntries.get(cId)!;
    expect(entry.workerName).toBe("unknown");
    expect(entry.worktreeDir).toBe(orphanDir);
  });

  test("skips orphaned worktrees with state files", async () => {
    // Create a state file AND a worktree directory. The worktree should
    // be handled by the state file path, not the orphan scanner.
    const commissionId = "commission-researcher-20260221-170000";
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, `${commissionId}.json`),
      JSON.stringify({
        commissionId,
        projectName: "test-project",
        workerName: "researcher",
        status: "in_progress",
      }),
    );

    const worktreeRoot = activityWorktreeRoot(ghHome, "test-project");
    await fs.mkdir(path.join(worktreeRoot, commissionId), { recursive: true });

    await writeCommissionArtifact(
      integrationPath,
      asCommissionId(commissionId),
      "in_progress",
    );

    const deps = createMockDeps();
    const result = await recoverCommissions(deps);

    // Should recover exactly once (via state file path), not twice
    expect(result).toBe(1);
    expect(deps.transitions).toHaveLength(1);
  });

  test("skips corrupt state files", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-corrupt.json"),
      "not valid json{{{",
    );

    const deps = createMockDeps();
    const result = await recoverCommissions(deps);

    expect(result).toBe(0);
    expect(deps.transitions).toHaveLength(0);
  });
});
