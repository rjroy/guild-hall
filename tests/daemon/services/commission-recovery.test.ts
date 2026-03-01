import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId } from "@/daemon/types";
import {
  recoverDeadCommission,
  recoverCommissions,
  type RecoveryDeps,
} from "@/daemon/services/commission-recovery";
import {
  commissionArtifactPath,
  readCommissionStatus,
  readActivityTimeline,
} from "@/daemon/services/commission-artifact-helpers";
import { integrationWorktreePath } from "@/lib/paths";
import type { SystemEvent } from "@/daemon/services/event-bus";

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

function createMockDeps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps & {
  emitted: SystemEvent[];
  gitCalls: Array<{ method: string; args: unknown[] }>;
  stateWrites: Array<{ id: string; data: Record<string, unknown> }>;
} {
  const emitted: SystemEvent[] = [];
  const gitCalls: Array<{ method: string; args: unknown[] }> = [];
  const stateWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

  return {
    ghHome,
    git: {
      /* eslint-disable @typescript-eslint/require-await */
      async commitAll(...args) {
        gitCalls.push({ method: "commitAll", args });
        return false;
      },
      async removeWorktree(...args) {
        gitCalls.push({ method: "removeWorktree", args });
      },
      /* eslint-enable @typescript-eslint/require-await */
    },
    config: {
      projects: [{ name: "test-project", path: projectPath }],
    },
    eventBus: {
      emit(event: SystemEvent) { emitted.push(event); },
    },
    activeCommissions: new Map(),
    // eslint-disable-next-line @typescript-eslint/require-await
    writeStateFile: async (id, data) => {
      stateWrites.push({ id: id as string, data });
    },
    emitted,
    gitCalls,
    stateWrites,
    ...overrides,
  };
}

describe("recoverDeadCommission", () => {
  const commissionId = asCommissionId("commission-researcher-20260221-143000");

  test("transitions commission to failed in integration worktree", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "in_progress");
    const deps = createMockDeps();

    await recoverDeadCommission(
      deps, commissionId, "test-project", "", "", projectPath,
    );

    const status = await readCommissionStatus(integrationPath, commissionId);
    expect(status).toBe("failed");

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    const last = timeline[timeline.length - 1];
    expect(last.event).toBe("status_failed");
    expect(last.reason).toContain("Recovery:");
  });

  test("emits commission_status event", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "dispatched");
    const deps = createMockDeps();

    await recoverDeadCommission(
      deps, commissionId, "test-project", "", "", projectPath,
    );

    expect(deps.emitted).toHaveLength(1);
    expect(deps.emitted[0].type).toBe("commission_status");
  });

  test("writes state file with failed status", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "dispatched");
    const deps = createMockDeps();

    await recoverDeadCommission(
      deps, commissionId, "test-project", "", "", projectPath,
    );

    expect(deps.stateWrites).toHaveLength(1);
    expect(deps.stateWrites[0].data.status).toBe("failed");
  });

  test("commits partial work when worktree exists", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "in_progress");
    const worktreeDir = path.join(tmpDir, "worktree");
    await fs.mkdir(worktreeDir, { recursive: true });

    const deps = createMockDeps();
    await recoverDeadCommission(
      deps, commissionId, "test-project", worktreeDir, "branch-name", projectPath,
    );

    const commitCall = deps.gitCalls.find((c) => c.method === "commitAll");
    expect(commitCall).toBeDefined();
    expect(commitCall!.args[0]).toBe(worktreeDir);
  });

  test("removes worktree when it exists", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "in_progress");
    const worktreeDir = path.join(tmpDir, "worktree");
    await fs.mkdir(worktreeDir, { recursive: true });

    const deps = createMockDeps();
    await recoverDeadCommission(
      deps, commissionId, "test-project", worktreeDir, "branch-name", projectPath,
    );

    const removeCall = deps.gitCalls.find((c) => c.method === "removeWorktree");
    expect(removeCall).toBeDefined();
  });

  test("skips worktree operations when worktreeDir is empty", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "dispatched");
    const deps = createMockDeps();

    await recoverDeadCommission(
      deps, commissionId, "test-project", "", "", projectPath,
    );

    expect(deps.gitCalls).toHaveLength(0);
  });

  test("uses custom reason", async () => {
    await writeCommissionArtifact(integrationPath, commissionId, "in_progress");
    const deps = createMockDeps();

    await recoverDeadCommission(
      deps, commissionId, "test-project", "", "", projectPath, "state lost",
    );

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    const last = timeline[timeline.length - 1];
    expect(last.reason).toContain("state lost");
  });
});

describe("recoverCommissions", () => {
  test("returns 0 when no state files exist", async () => {
    const deps = createMockDeps();
    const result = await recoverCommissions(deps);
    expect(result).toBe(0);
  });

  test("recovers active commissions from state files", async () => {
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
    await recoverCommissions(deps);

    expect(deps.emitted).toHaveLength(1);
    expect(deps.emitted[0].type).toBe("commission_status");
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

    expect(deps.emitted).toHaveLength(0);
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

    expect(deps.emitted).toHaveLength(0);
  });

  test("skips commissions already in active map", async () => {
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

    const activeMap = new Map<string, unknown>();
    activeMap.set(commissionId, {});

    const deps = createMockDeps({ activeCommissions: activeMap });
    await recoverCommissions(deps);

    expect(deps.emitted).toHaveLength(0);
  });
});
