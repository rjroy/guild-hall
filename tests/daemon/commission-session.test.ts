import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  validateTransition,
  transitionCommission,
  createCommissionSession,
} from "@/daemon/services/commission-session";
import type {
  CommissionSessionDeps,
  CommissionSessionForRoutes,
  SpawnedCommission,
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
  commissionWorktreePath,
  commissionBranchName,
} from "@/lib/paths";

let tmpDir: string;
let projectPath: string;
let ghHome: string;
let integrationPath: string;
let commissionId: CommissionId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commission-session-"));
  projectPath = path.join(tmpDir, "test-project");
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  // Create both the project directory and the integration worktree directory
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

/**
 * Writes a test commission artifact with a given initial status.
 * Artifacts are written to the integration worktree (where they live
 * before dispatch and after completion).
 */
async function writeCommissionArtifact(status: CommissionStatus): Promise<void> {
  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;

  const artifactPath = commissionArtifactPath(integrationPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

/**
 * Writes a test commission artifact with a custom timeline.
 * Used to simulate post-dispatch/failure states where the integration
 * worktree has accumulated timeline entries from syncStatusToIntegration.
 */
async function writeCommissionArtifactWithTimeline(
  status: CommissionStatus,
  timeline: Array<{ event: string; reason: string }>,
): Promise<void> {
  const timelineYaml = timeline
    .map(
      (entry) =>
        `  - timestamp: 2026-02-21T14:30:00.000Z\n    event: ${entry.event}\n    reason: "${entry.reason}"`,
    )
    .join("\n");

  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
${timelineYaml}
current_progress: ""
result_summary: ""
projectName: test-project
---
`;

  const artifactPath = commissionArtifactPath(integrationPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- validateTransition --

describe("validateTransition", () => {
  describe("valid transitions", () => {
    const validEdges: [CommissionStatus, CommissionStatus][] = [
      ["pending", "dispatched"],
      ["pending", "blocked"],
      ["pending", "cancelled"],
      ["blocked", "pending"],
      ["blocked", "cancelled"],
      ["dispatched", "in_progress"],
      ["dispatched", "failed"],
      ["in_progress", "completed"],
      ["in_progress", "failed"],
      ["in_progress", "cancelled"],
    ];

    for (const [from, to] of validEdges) {
      test(`${from} -> ${to} succeeds`, () => {
        expect(() => validateTransition(from, to)).not.toThrow();
      });
    }
  });

  describe("invalid transitions", () => {
    const invalidEdges: [CommissionStatus, CommissionStatus][] = [
      ["completed", "pending"],
      ["completed", "in_progress"],
      ["failed", "in_progress"],
      ["failed", "pending"],
      ["cancelled", "dispatched"],
      ["cancelled", "pending"],
      ["pending", "in_progress"],
      ["pending", "completed"],
      ["dispatched", "completed"],
      ["dispatched", "cancelled"],
    ];

    for (const [from, to] of invalidEdges) {
      test(`${from} -> ${to} throws`, () => {
        expect(() => validateTransition(from, to)).toThrow(
          `Invalid commission transition: "${from}" -> "${to}"`,
        );
      });
    }
  });

  describe("terminal states have no outgoing transitions", () => {
    const terminalStates: CommissionStatus[] = [
      "completed",
      "failed",
      "cancelled",
    ];
    const allStatuses: CommissionStatus[] = [
      "pending",
      "blocked",
      "dispatched",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
    ];

    for (const terminal of terminalStates) {
      test(`${terminal} rejects all transitions`, () => {
        for (const target of allStatuses) {
          expect(() => validateTransition(terminal, target)).toThrow(
            "(none, terminal state)",
          );
        }
      });
    }
  });

  test("error message includes valid transitions for non-terminal states", () => {
    expect(() => validateTransition("pending", "completed")).toThrow(
      "dispatched, blocked, cancelled",
    );
  });
});

// -- transitionCommission --

describe("transitionCommission", () => {
  describe("valid transitions update status and timeline", () => {
    const validEdges: [CommissionStatus, CommissionStatus][] = [
      ["pending", "dispatched"],
      ["pending", "blocked"],
      ["pending", "cancelled"],
      ["blocked", "pending"],
      ["blocked", "cancelled"],
      ["dispatched", "in_progress"],
      ["dispatched", "failed"],
      ["in_progress", "completed"],
      ["in_progress", "failed"],
      ["in_progress", "cancelled"],
    ];

    for (const [from, to] of validEdges) {
      test(`${from} -> ${to} updates status and appends timeline`, async () => {
        await writeCommissionArtifact(from);

        await transitionCommission(
          integrationPath,
          commissionId,
          from,
          to,
          `Transitioning from ${from} to ${to}`,
        );

        const status = await readCommissionStatus(integrationPath, commissionId);
        expect(status).toBe(to);

        const timeline = await readActivityTimeline(integrationPath, commissionId);
        expect(timeline).toHaveLength(2);

        const entry = timeline[1];
        expect(entry.event).toBe(`status_${to}`);
        expect(entry.reason).toBe(`Transitioning from ${from} to ${to}`);
        expect(entry.from).toBe(from);
        expect(entry.to).toBe(to);
        expect(entry.timestamp).toBeDefined();
      });
    }
  });

  test("invalid transition rejects without modifying artifact", async () => {
    await writeCommissionArtifact("completed");

    await expect(
      transitionCommission(
        integrationPath,
        commissionId,
        "completed",
        "pending",
        "Should not happen",
      ),
    ).rejects.toThrow('Invalid commission transition: "completed" -> "pending"');

    // Status should remain unchanged
    const status = await readCommissionStatus(integrationPath, commissionId);
    expect(status).toBe("completed");

    // Timeline should have only the original entry
    const timeline = await readActivityTimeline(integrationPath, commissionId);
    expect(timeline).toHaveLength(1);
  });

  test("transition reason is preserved in timeline entry", async () => {
    await writeCommissionArtifact("pending");
    const reason = "Worker pool selected researcher for dispatch";

    await transitionCommission(
      integrationPath,
      commissionId,
      "pending",
      "dispatched",
      reason,
    );

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    const entry = timeline[1];
    expect(entry.reason).toBe(reason);
  });

  test("multiple transitions accumulate timeline entries", async () => {
    await writeCommissionArtifact("pending");

    await transitionCommission(
      integrationPath,
      commissionId,
      "pending",
      "dispatched",
      "Dispatching to worker",
    );
    await transitionCommission(
      integrationPath,
      commissionId,
      "dispatched",
      "in_progress",
      "Worker started processing",
    );
    await transitionCommission(
      integrationPath,
      commissionId,
      "in_progress",
      "completed",
      "Work finished successfully",
    );

    const status = await readCommissionStatus(integrationPath, commissionId);
    expect(status).toBe("completed");

    const timeline = await readActivityTimeline(integrationPath, commissionId);
    expect(timeline).toHaveLength(4); // created + 3 transitions
    expect(timeline[1].event).toBe("status_dispatched");
    expect(timeline[2].event).toBe("status_in_progress");
    expect(timeline[3].event).toBe("status_completed");
  });
});

// -- createCommissionSession --

// Test helpers for session management

/** Mock worker package that matches the expected DiscoveredPackage shape */
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
      resourceDefaults: {
        maxTurns: 150,
        maxBudgetUsd: 1.0,
      },
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
    // The integration path is the source for commission artifacts.
    // Copy .lore/commissions/ so dispatch can read the artifact.
    const srcDir = path.join(integrationPath, ".lore", "commissions");
    const destDir = path.join(worktreePath, ".lore", "commissions");
    try {
      await fs.access(srcDir);
      await fs.mkdir(destDir, { recursive: true });
      const files = await fs.readdir(srcDir);
      for (const file of files) {
        await fs.copyFile(path.join(srcDir, file), path.join(destDir, file));
      }
    } catch {
      // Source may not exist in some tests, just create the directory
      await fs.mkdir(destDir, { recursive: true });
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
  };
  /* eslint-enable @typescript-eslint/require-await */
}

/** Creates a mock spawn function for testing without real processes */
function createMockSpawn(options?: {
  exitCode?: number;
  exitDelay?: number;
}) {
  let resolveExit!: (result: { exitCode: number }) => void;
  let killCalled = false;
  let killSignal: string | undefined;

  const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
    resolveExit = resolve;
  });

  if (options?.exitDelay) {
    setTimeout(
      () => resolveExit({ exitCode: options.exitCode ?? 0 }),
      options.exitDelay,
    );
  }

  const pid = Math.floor(Math.random() * 100000) + 1000;

  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    spawnFn: (_configPath: string): SpawnedCommission => ({
      pid,
      exitPromise,
      kill: (signal?: string) => {
        killCalled = true;
        killSignal = signal;
        resolveExit({ exitCode: options?.exitCode ?? 1 });
      },
    }),
    resolveExit: (exitCode = 0) => resolveExit({ exitCode }),
    get killCalled() {
      return killCalled;
    },
    get killSignal() {
      return killSignal;
    },
    pid,
  };
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

describe("createCommissionSession", () => {
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

  // -- createCommission --

  describe("createCommission", () => {
    test("writes artifact with correct frontmatter and returns ID", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Research OAuth patterns",
        "guild-hall-sample-assistant",
        "Research OAuth 2.0 patterns for CLI tools",
        ["dep1.md", "dep2.md"],
        { maxTurns: 200, maxBudgetUsd: 2.5 },
      );

      expect(result.commissionId).toMatch(/^commission-researcher-\d{8}-\d{6}$/);

      // Read the artifact from integration worktree and verify its contents
      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain('title: "Commission: Research OAuth patterns"');
      expect(raw).toContain("status: pending");
      expect(raw).toContain("tags: [commission]");
      expect(raw).toContain("worker: researcher");
      expect(raw).toContain('workerDisplayTitle: "Research Specialist"');
      expect(raw).toContain('prompt: "Research OAuth 2.0 patterns for CLI tools"');
      expect(raw).toContain("  - dep1.md");
      expect(raw).toContain("  - dep2.md");
      expect(raw).toContain("  maxTurns: 200");
      expect(raw).toContain("  maxBudgetUsd: 2.5");
      expect(raw).toContain("event: created");
      expect(raw).toContain('reason: "Commission created"');
      expect(raw).toContain('current_progress: ""');
      expect(raw).toContain('result_summary: ""');
      expect(raw).toContain("projectName: test-project");
    });

    test("rejects unknown project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.createCommission(
          "nonexistent-project",
          "Title",
          "guild-hall-sample-assistant",
          "prompt",
        ),
      ).rejects.toThrow('Project "nonexistent-project" not found');
    });

    test("rejects unknown worker", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.createCommission(
          "test-project",
          "Title",
          "nonexistent-worker",
          "prompt",
        ),
      ).rejects.toThrow(
        'Worker "nonexistent-worker" not found in discovered packages',
      );
    });

    test("creates commissions directory if it does not exist", async () => {
      // Remove the commissions directory from integration worktree
      await fs.rm(path.join(integrationPath, ".lore", "commissions"), {
        recursive: true,
        force: true,
      });

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
      );

      expect(result.commissionId).toBeTruthy();
    });

    test("uses default resource overrides when none provided", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
      );

      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain("  maxTurns: 150");
      expect(raw).toContain("  maxBudgetUsd: 1.00");
    });

    test("writes empty dependencies as YAML empty array", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
        [],
      );

      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain("dependencies: []");
    });
  });

  // -- updateCommission --

  describe("updateCommission", () => {
    test("updates prompt on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        prompt: "Updated prompt text",
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain('prompt: "Updated prompt text"');
    });

    test("updates dependencies on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        dependencies: ["new-dep1.md", "new-dep2.md"],
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain("  - new-dep1.md");
      expect(raw).toContain("  - new-dep2.md");
    });

    test("updates resource overrides on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        resourceOverrides: { maxTurns: 300, maxBudgetUsd: 5.0 },
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain("  maxTurns: 300");
      expect(raw).toContain("  maxBudgetUsd: 5");
    });

    test("rejects non-pending commission", async () => {
      await writeCommissionArtifact("in_progress");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.updateCommission(commissionId, {
          prompt: "Should fail",
        }),
      ).rejects.toThrow('status is "in_progress", must be "pending"');
    });

    test("rejects commission not found in any project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const fakeId = asCommissionId("commission-fake-20260101-000000");
      await expect(
        session.updateCommission(fakeId, { prompt: "fail" }),
      ).rejects.toThrow("not found in any project");
    });
  });

  // -- dispatchCommission --

  describe("dispatchCommission", () => {
    test("transitions pending -> dispatched -> in_progress and records in Map", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      const result = await session.dispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // The artifact in the activity worktree should now be in_progress
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const status = await readCommissionStatus(activityDir, commissionId);
      expect(status).toBe("in_progress");

      // Timeline should have: created, dispatched, in_progress
      const timeline = await readActivityTimeline(activityDir, commissionId);
      expect(timeline).toHaveLength(3);
      expect(timeline[1].event).toBe("status_dispatched");
      expect(timeline[2].event).toBe("status_in_progress");

      // Event bus should have received commission_status event
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0]).toMatchObject({
        type: "commission_status",
        commissionId: commissionId as string,
        status: "in_progress",
      });

      // Clean up (exit the mock)
      mockSpawn.resolveExit(0);
    });

    test("rejects non-pending commissions", async () => {
      await writeCommissionArtifact("in_progress");

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
        }),
      );

      await expect(
        session.dispatchCommission(commissionId),
      ).rejects.toThrow('status is "in_progress", must be "pending"');
    });

    test("writes state file with commission details", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const stateFilePath = path.join(
        ghHome,
        "state",
        "commissions",
        `${commissionId}.json`,
      );
      const stateRaw = await fs.readFile(stateFilePath, "utf-8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;

      expect(state.commissionId).toBe(commissionId as string);
      expect(state.projectName).toBe("test-project");
      expect(state.workerName).toBe("researcher");
      expect(state.pid).toBe(mockSpawn.pid);
      expect(state.branchName).toBe(commissionBranchName(commissionId as string));
      expect(state.worktreeDir).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );

      mockSpawn.resolveExit(0);
    });
  });

  // -- Exit handling --

  describe("exit handling", () => {
    test("clean exit (code 0) with submit_result transitions to completed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      // Report result before exit
      session.reportResult(commissionId, "Research complete", ["report.md"]);

      // Exit cleanly
      mockSpawn.resolveExit(0);

      // Wait for async exit handler to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("clean exit (code 0) without submit_result transitions to failed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Exit without reporting result
      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("crash exit (non-zero) with submit_result transitions to completed (anomaly)", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Report result, then crash
      session.reportResult(commissionId, "Partial result saved");
      mockSpawn.resolveExit(1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("crash exit (non-zero) without submit_result transitions to failed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Crash without result
      mockSpawn.resolveExit(2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -- cancelCommission --

  describe("cancelCommission", () => {
    test("kills process and transitions to cancelled", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      await session.cancelCommission(commissionId);

      expect(session.getActiveCommissions()).toBe(0);

      // Should have emitted cancelled status
      const cancelEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "cancelled",
      );
      expect(cancelEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("rejects commission not in active map", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.cancelCommission(commissionId),
      ).rejects.toThrow("not found in active commissions");
    });
  });

  // -- redispatchCommission --

  describe("redispatchCommission", () => {
    test("resets to pending and dispatches fresh", async () => {
      await writeCommissionArtifact("failed");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      const result = await session.redispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // Status should be in_progress in the activity worktree after redispatch
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const status = await readCommissionStatus(activityDir, commissionId);
      expect(status).toBe("in_progress");

      mockSpawn.resolveExit(0);
    });

    test("works for cancelled commissions", async () => {
      await writeCommissionArtifact("cancelled");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      const result = await session.redispatchCommission(commissionId);
      expect(result).toEqual({ status: "accepted" });

      mockSpawn.resolveExit(0);
    });

    test("rejects non-failed/cancelled commissions", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.redispatchCommission(commissionId),
      ).rejects.toThrow('must be "failed" or "cancelled"');
    });

    test("rejects in_progress commissions", async () => {
      await writeCommissionArtifact("in_progress");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.redispatchCommission(commissionId),
      ).rejects.toThrow('must be "failed" or "cancelled"');
    });

    // -- Redispatch git branch naming --

    test("redispatch creates branch with attempt suffix after first failure", async () => {
      // Simulate a commission that was dispatched once and failed.
      // The integration worktree has the terminal status_failed entry
      // that syncStatusToIntegration would have written.
      await writeCommissionArtifactWithTimeline("failed", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed with exit code 1" },
      ]);

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // The createBranch call should use the attempt-2 suffixed branch name
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 2));

      mockSpawn.resolveExit(0);
    });

    test("multiple redispatches increment the attempt suffix", async () => {
      // Simulate a commission that failed twice (two terminal entries).
      // First dispatch failed, first redispatch also failed.
      await writeCommissionArtifactWithTimeline("failed", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed with exit code 1" },
        { event: "status_pending", reason: "Commission reset for redispatch" },
        { event: "status_failed", reason: "Worker crashed again" },
      ]);

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // Two previous failures, so this is attempt 3
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 3));

      mockSpawn.resolveExit(0);
    });

    test("redispatch from cancelled status uses correct attempt suffix", async () => {
      // Simulate a commission that was dispatched and cancelled.
      await writeCommissionArtifactWithTimeline("cancelled", [
        { event: "created", reason: "Commission created" },
        { event: "status_cancelled", reason: "Commission cancelled by user" },
      ]);

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // One previous cancellation, so attempt 2
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 2));

      mockSpawn.resolveExit(0);
    });

    test("mixed failed and cancelled attempts count correctly", async () => {
      // One failure + one cancellation = 2 previous attempts, next is attempt 3
      await writeCommissionArtifactWithTimeline("cancelled", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed" },
        { event: "status_pending", reason: "Commission reset for redispatch" },
        { event: "status_cancelled", reason: "Commission cancelled by user" },
      ]);

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 3));

      mockSpawn.resolveExit(0);
    });

    test("first dispatch (no previous failures) uses unsuffixed branch name", async () => {
      // Fresh commission with no terminal entries. This tests the default
      // dispatch path (no attempt parameter).
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      // No attempt suffix for first dispatch
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string));
      expect(branchCall!.args[1]).toBe(`claude/commission/${commissionId}`);

      mockSpawn.resolveExit(0);
    });
  });

  // -- reportProgress --

  describe("reportProgress", () => {
    test("updates lastHeartbeat and emits event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      session.reportProgress(commissionId, "50% complete");

      const progressEvents = emittedEvents.filter(
        (e) => e.type === "commission_progress",
      );
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0]).toMatchObject({
        type: "commission_progress",
        commissionId: commissionId as string,
        summary: "50% complete",
      });

      mockSpawn.resolveExit(0);
    });

    test("silently ignores unknown commission ID", () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      // Should not throw
      session.reportProgress(
        asCommissionId("commission-unknown-20260101-000000"),
        "progress",
      );

      expect(emittedEvents).toHaveLength(0);
    });
  });

  // -- reportResult --

  describe("reportResult", () => {
    test("sets resultSubmitted flag and emits event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      session.reportResult(commissionId, "Research complete", [
        "report.md",
        "findings.md",
      ]);

      const resultEvents = emittedEvents.filter(
        (e) => e.type === "commission_result",
      );
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0]).toMatchObject({
        type: "commission_result",
        commissionId: commissionId as string,
        summary: "Research complete",
        artifacts: ["report.md", "findings.md"],
      });

      // Verify it affects exit handling (exit 0 should complete, not fail)
      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -- reportQuestion --

  describe("reportQuestion", () => {
    test("emits commission_question event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      session.reportQuestion(
        commissionId,
        "Which OAuth flow should I focus on?",
      );

      const questionEvents = emittedEvents.filter(
        (e) => e.type === "commission_question",
      );
      expect(questionEvents).toHaveLength(1);
      expect(questionEvents[0]).toMatchObject({
        type: "commission_question",
        commissionId: commissionId as string,
        question: "Which OAuth flow should I focus on?",
      });

      mockSpawn.resolveExit(0);
    });
  });

  // -- addUserNote --

  describe("addUserNote", () => {
    test("appends user_note timeline entry", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.addUserNote(commissionId, "Focus on PKCE flow");

      const timeline = await readActivityTimeline(integrationPath, commissionId);
      expect(timeline).toHaveLength(2);

      const noteEntry = timeline[1];
      expect(noteEntry.event).toBe("user_note");
      expect(noteEntry.reason).toBe("Focus on PKCE flow");
      expect(noteEntry.timestamp).toBeDefined();
    });

    test("rejects commission not found in any project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const fakeId = asCommissionId("commission-fake-20260101-000000");
      await expect(
        session.addUserNote(fakeId, "note"),
      ).rejects.toThrow("not found in any project");
    });
  });

  // -- getActiveCommissions --

  describe("getActiveCommissions", () => {
    test("returns count of active commissions", () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      expect(session.getActiveCommissions()).toBe(0);
    });

    test("increments when commission is dispatched", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      mockSpawn.resolveExit(0);
    });

    test("decrements when commission exits", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);
    });
  });

  // -- shutdown --

  describe("shutdown", () => {
    test("clears heartbeat interval", () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      // Should not throw
      session.shutdown();
    });
  });

  // -- Git integration --

  describe("git integration", () => {
    test("dispatchCommission calls createBranch with correct branch name", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[0]).toBe(projectPath); // repo path
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string));
      expect(branchCall!.args[2]).toBe("claude/main"); // base ref

      mockSpawn.resolveExit(0);
    });

    test("dispatchCommission calls createWorktree with correct path", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const worktreeCall = mockGitOps.calls.find((c) => c.method === "createWorktree");
      expect(worktreeCall).toBeDefined();
      expect(worktreeCall!.args[0]).toBe(projectPath); // repo path
      expect(worktreeCall!.args[1]).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );
      expect(worktreeCall!.args[2]).toBe(commissionBranchName(commissionId as string));

      mockSpawn.resolveExit(0);
    });

    test("dispatchCommission configures sparse checkout for sparse-scope workers", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      // Default worker package has checkoutScope: "sparse"
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const sparseCall = mockGitOps.calls.find((c) => c.method === "configureSparseCheckout");
      expect(sparseCall).toBeDefined();
      const expectedWorktree = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      expect(sparseCall!.args[0]).toBe(expectedWorktree);
      expect(sparseCall!.args[1]).toEqual([".lore/"]);

      mockSpawn.resolveExit(0);
    });

    test("dispatchCommission does not configure sparse checkout for full-scope workers", async () => {
      await writeCommissionArtifact("pending");

      // Create a worker with checkoutScope: "full" (no sparse checkout)
      const fullScopeWorker: DiscoveredPackage = {
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
          checkoutScope: "full" as const,
          resourceDefaults: {
            maxTurns: 150,
            maxBudgetUsd: 1.0,
          },
        },
      };

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          packages: [fullScopeWorker],
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const sparseCall = mockGitOps.calls.find((c) => c.method === "configureSparseCheckout");
      expect(sparseCall).toBeUndefined();

      mockSpawn.resolveExit(0);
    });

    test("createCommission writes artifact to integration worktree", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Test Commission",
        "guild-hall-sample-assistant",
        "Test prompt",
      );

      const id = asCommissionId(result.commissionId);

      // Artifact should exist in integration worktree
      const iArtifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(iArtifactPath, "utf-8");
      expect(raw).toContain("status: pending");

      // Artifact should NOT exist in the real project path
      const pArtifactPath = commissionArtifactPath(projectPath, id);
      await expect(fs.access(pArtifactPath)).rejects.toThrow();
    });

    test("worker config receives worktreeDir as workingDirectory", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      let capturedConfigPath = "";
      const capturingSpawn = (configPath: string): SpawnedCommission => {
        capturedConfigPath = configPath;
        return mockSpawn.spawnFn(configPath);
      };

      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: capturingSpawn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Read the worker config to verify workingDirectory
      const configRaw = await fs.readFile(capturedConfigPath, "utf-8");
      const config = JSON.parse(configRaw) as Record<string, unknown>;
      const expectedWorktree = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      expect(config.workingDirectory).toBe(expectedWorktree);

      mockSpawn.resolveExit(0);
    });

    test("state file contains worktreeDir and branchName", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const stateFilePath = path.join(
        ghHome,
        "state",
        "commissions",
        `${commissionId}.json`,
      );
      const stateRaw = await fs.readFile(stateFilePath, "utf-8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;

      expect(state.worktreeDir).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );
      expect(state.branchName).toBe(commissionBranchName(commissionId as string));

      mockSpawn.resolveExit(0);
    });

    // -- Exit/cleanup git operations --

    test("completion calls commitAll, squashMerge, removeWorktree, deleteBranch in order", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear calls from dispatch to isolate exit-path calls
      const dispatchCallCount = mockGitOps.calls.length;

      // Report result so exit classifies as completed
      session.reportResult(commissionId, "Research complete", ["report.md"]);
      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
      const exitMethods = exitCalls.map((c) => c.method);

      expect(exitMethods).toContain("commitAll");
      expect(exitMethods).toContain("squashMerge");
      expect(exitMethods).toContain("removeWorktree");
      expect(exitMethods).toContain("deleteBranch");

      // Verify ordering: commitAll before squashMerge before removeWorktree before deleteBranch
      const commitIdx = exitMethods.indexOf("commitAll");
      const squashIdx = exitMethods.indexOf("squashMerge");
      const removeIdx = exitMethods.indexOf("removeWorktree");
      const deleteIdx = exitMethods.indexOf("deleteBranch");

      expect(commitIdx).toBeLessThan(squashIdx);
      expect(squashIdx).toBeLessThan(removeIdx);
      expect(removeIdx).toBeLessThan(deleteIdx);

      // Verify squashMerge targets integration worktree with the activity branch
      const squashCall = exitCalls.find((c) => c.method === "squashMerge");
      expect(squashCall!.args[0]).toBe(integrationWorktreePath(ghHome, "test-project"));
      expect(squashCall!.args[1]).toBe(commissionBranchName(commissionId as string));

      // Verify deleteBranch targets the activity branch
      const deleteCall = exitCalls.find((c) => c.method === "deleteBranch");
      expect(deleteCall!.args[0]).toBe(projectPath);
      expect(deleteCall!.args[1]).toBe(commissionBranchName(commissionId as string));
    });

    test("failure preserves branch (commitAll + removeWorktree, no deleteBranch)", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const dispatchCallCount = mockGitOps.calls.length;

      // Exit without result -> failure
      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
      const exitMethods = exitCalls.map((c) => c.method);

      expect(exitMethods).toContain("commitAll");
      expect(exitMethods).toContain("removeWorktree");
      expect(exitMethods).not.toContain("squashMerge");
      expect(exitMethods).not.toContain("deleteBranch");
    });

    test("cancellation preserves branch (commitAll + removeWorktree, no deleteBranch)", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const dispatchCallCount = mockGitOps.calls.length;

      await session.cancelCommission(commissionId);

      const cancelCalls = mockGitOps.calls.slice(dispatchCallCount);
      const cancelMethods = cancelCalls.map((c) => c.method);

      expect(cancelMethods).toContain("commitAll");
      expect(cancelMethods).toContain("removeWorktree");
      expect(cancelMethods).not.toContain("squashMerge");
      expect(cancelMethods).not.toContain("deleteBranch");
    });

    test("git cleanup failure does not prevent commission from completing", async () => {
      await writeCommissionArtifact("pending");

      // Create a mock that throws on squashMerge
      const mockGitOps = createMockGitOps();
      const originalSquashMerge = mockGitOps.squashMerge.bind(mockGitOps);
      void originalSquashMerge; // suppress unused
      mockGitOps.squashMerge = () => {
        return Promise.reject(new Error("Merge conflict"));
      };

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Report result so exit classifies as completed
      session.reportResult(commissionId, "Research complete");
      mockSpawn.resolveExit(0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Commission should still have been removed from active map
      expect(session.getActiveCommissions()).toBe(0);

      // Status event should still have been emitted as completed
      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("commitAll returning false (nothing to commit) continues normally", async () => {
      await writeCommissionArtifact("pending");

      // Default mock commitAll already returns false. Verify the flow
      // completes without error for the failure path.
      const mockGitOps = createMockGitOps();
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Exit without result -> failure path, commitAll returns false
      mockSpawn.resolveExit(1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(session.getActiveCommissions()).toBe(0);

      // removeWorktree should still be called even when nothing to commit
      const exitCalls = mockGitOps.calls.filter((c) => c.method === "removeWorktree");
      expect(exitCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
