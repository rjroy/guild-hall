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

let tmpDir: string;
let projectPath: string;
let commissionId: CommissionId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commission-session-"));
  projectPath = path.join(tmpDir, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  await fs.mkdir(
    path.join(projectPath, ".lore", "commissions"),
    { recursive: true },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test commission artifact with a given initial status.
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

  const artifactPath = commissionArtifactPath(projectPath, commissionId);
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
          projectPath,
          commissionId,
          from,
          to,
          `Transitioning from ${from} to ${to}`,
        );

        const status = await readCommissionStatus(projectPath, commissionId);
        expect(status).toBe(to);

        const timeline = await readActivityTimeline(projectPath, commissionId);
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
        projectPath,
        commissionId,
        "completed",
        "pending",
        "Should not happen",
      ),
    ).rejects.toThrow('Invalid commission transition: "completed" -> "pending"');

    // Status should remain unchanged
    const status = await readCommissionStatus(projectPath, commissionId);
    expect(status).toBe("completed");

    // Timeline should have only the original entry
    const timeline = await readActivityTimeline(projectPath, commissionId);
    expect(timeline).toHaveLength(1);
  });

  test("transition reason is preserved in timeline entry", async () => {
    await writeCommissionArtifact("pending");
    const reason = "Worker pool selected researcher for dispatch";

    await transitionCommission(
      projectPath,
      commissionId,
      "pending",
      "dispatched",
      reason,
    );

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const entry = timeline[1];
    expect(entry.reason).toBe(reason);
  });

  test("multiple transitions accumulate timeline entries", async () => {
    await writeCommissionArtifact("pending");

    await transitionCommission(
      projectPath,
      commissionId,
      "pending",
      "dispatched",
      "Dispatching to worker",
    );
    await transitionCommission(
      projectPath,
      commissionId,
      "dispatched",
      "in_progress",
      "Worker started processing",
    );
    await transitionCommission(
      projectPath,
      commissionId,
      "in_progress",
      "completed",
      "Work finished successfully",
    );

    const status = await readCommissionStatus(projectPath, commissionId);
    expect(status).toBe("completed");

    const timeline = await readActivityTimeline(projectPath, commissionId);
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
    guildHallHome: path.join(tmpDir, "guild-hall-home"),
    eventBus: createEventBus(),
    packagesDir: "/tmp/fake-packages",
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

      // Read the artifact and verify its contents
      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(projectPath, id);
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
      // Remove the commissions directory
      await fs.rm(path.join(projectPath, ".lore", "commissions"), {
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
      const artifactPath = commissionArtifactPath(projectPath, id);
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
      const artifactPath = commissionArtifactPath(projectPath, id);
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

      const artifactPath = commissionArtifactPath(projectPath, commissionId);
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

      const artifactPath = commissionArtifactPath(projectPath, commissionId);
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

      const artifactPath = commissionArtifactPath(projectPath, commissionId);
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
        }),
      );

      const result = await session.dispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // The artifact should now be in_progress
      const status = await readCommissionStatus(projectPath, commissionId);
      expect(status).toBe("in_progress");

      // Timeline should have: created, dispatched, in_progress
      const timeline = await readActivityTimeline(projectPath, commissionId);
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

      const ghHome = path.join(tmpDir, "guild-hall-home");
      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          guildHallHome: ghHome,
          spawnFn: mockSpawn.spawnFn,
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

      mockSpawn.resolveExit(0);
    });
  });

  // -- Exit handling --

  describe("exit handling", () => {
    test("clean exit (code 0) with submit_result transitions to completed", async () => {
      await writeCommissionArtifact("pending");

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
        }),
      );

      const result = await session.redispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // Status should be in_progress after redispatch
      const status = await readCommissionStatus(projectPath, commissionId);
      expect(status).toBe("in_progress");

      mockSpawn.resolveExit(0);
    });

    test("works for cancelled commissions", async () => {
      await writeCommissionArtifact("cancelled");

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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
  });

  // -- reportProgress --

  describe("reportProgress", () => {
    test("updates lastHeartbeat and emits event", async () => {
      await writeCommissionArtifact("pending");

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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

      const timeline = await readActivityTimeline(projectPath, commissionId);
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

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      mockSpawn.resolveExit(0);
    });

    test("decrements when commission exits", async () => {
      await writeCommissionArtifact("pending");

      const mockSpawn = createMockSpawn();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          spawnFn: mockSpawn.spawnFn,
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
});
