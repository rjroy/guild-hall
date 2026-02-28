/**
 * Tests for dependency auto-transitions.
 *
 * Covers:
 * - Blocked commission with all dependencies present: transitions to pending
 * - Pending commission with missing dependency: transitions to blocked
 * - Commission with no dependencies: never transitions
 * - Blocked-to-pending triggers FIFO auto-dispatch
 * - Multiple commissions with mixed dependency states
 * - Integration with event bus (commission_status events)
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
} from "@/daemon/services/commission-session";
import {
  commissionArtifactPath,
  readCommissionStatus,
  readCommissionDependencies,
} from "@/daemon/services/commission-artifact-helpers";
import { createEventBus } from "@/daemon/services/event-bus";
import type { EventBus, SystemEvent } from "@/daemon/services/event-bus";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AppConfig, DiscoveredPackage, ResolvedToolSet, WorkerMetadata } from "@/lib/types";
import type { ToolboxResolverContext } from "@/daemon/services/toolbox-resolver";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";

let tmpDir: string;
let projectPath: string;
let ghHome: string;
let integrationPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-dep-transitions-"));
  projectPath = path.join(tmpDir, "test-project");
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");

  await fs.mkdir(path.join(projectPath, ".lore", "commissions"), { recursive: true });
  await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
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
      // Copy commission artifacts from integration worktree
      const srcDir = path.join(integrationPath, ".lore", "commissions");
      const destDir = path.join(worktreePath, ".lore", "commissions");
      try {
        await fs.access(srcDir);
        await fs.mkdir(destDir, { recursive: true });
        const files = await fs.readdir(srcDir);
        for (const file of files) {
          const destFile = path.join(destDir, file);
          try {
            await fs.access(destFile);
          } catch {
            await fs.copyFile(path.join(srcDir, file), destFile);
          }
        }
      } catch {
        // Source may not exist
      }
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
 * Writes a commission artifact with optional dependencies.
 */
async function writeCommissionArtifact(
  iPath: string,
  commissionId: CommissionId,
  status: CommissionStatus,
  projectName: string,
  dependencies: string[] = [],
  createdAt = "2026-02-21T10:00:00.000Z",
): Promise<void> {
  const depsYaml = dependencies.length > 0
    ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
    : " []";

  const content = `---
title: "Commission: Test ${commissionId}"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Test prompt for ${commissionId}"
dependencies:${depsYaml}
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
    projects: [{ name: "test-project", path: projectPath }],
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

describe("dependency auto-transitions", () => {
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

  describe("blocked -> pending transitions", () => {
    test("transitions blocked commission to pending when all dependencies exist", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // Write a blocked commission that depends on an artifact
      await writeCommissionArtifact(
        integrationPath, id, "blocked", "test-project",
        [".lore/specs/feature-spec.md"],
      );

      // Create the dependency file in the integration worktree
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "feature-spec.md"), "# Spec", "utf-8");

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Verify status changed to pending
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("pending");

      // Verify event was emitted
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status" && "commissionId" in e && e.commissionId === (id as string),
      );
      expect(statusEvents.length).toBe(1);
      expect(statusEvents[0]).toMatchObject({
        type: "commission_status",
        commissionId: id as string,
        status: "pending",
        reason: "All dependency artifacts now exist",
      });
    });

    test("stays blocked when not all dependencies exist", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // Depends on two artifacts, only one exists
      await writeCommissionArtifact(
        integrationPath, id, "blocked", "test-project",
        [".lore/specs/feature-spec.md", ".lore/specs/api-spec.md"],
      );

      // Create only one dependency
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "feature-spec.md"), "# Spec", "utf-8");

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Verify status is still blocked
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("blocked");

      // No status events emitted
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });

    test("transitions multiple blocked commissions when all their deps are satisfied", async () => {
      const id1 = asCommissionId("commission-researcher-20260221-100000");
      const id2 = asCommissionId("commission-researcher-20260221-100100");

      await writeCommissionArtifact(
        integrationPath, id1, "blocked", "test-project",
        [".lore/specs/spec-a.md"],
      );
      await writeCommissionArtifact(
        integrationPath, id2, "blocked", "test-project",
        [".lore/specs/spec-b.md"],
      );

      // Create both dependency files
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "spec-a.md"), "# A", "utf-8");
      await fs.writeFile(path.join(depPath, "spec-b.md"), "# B", "utf-8");

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Both should be pending
      const status1 = await readCommissionStatus(integrationPath, id1);
      const status2 = await readCommissionStatus(integrationPath, id2);
      expect(status1).toBe("pending");
      expect(status2).toBe("pending");

      // Two events emitted
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(2);
    });
  });

  describe("pending -> blocked transitions", () => {
    test("transitions pending commission to blocked when dependency is missing", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // Pending commission with a dependency that doesn't exist
      await writeCommissionArtifact(
        integrationPath, id, "pending", "test-project",
        [".lore/specs/missing-spec.md"],
      );

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Verify status changed to blocked
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("blocked");

      // Verify event was emitted
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status" && "commissionId" in e && e.commissionId === (id as string),
      );
      expect(statusEvents.length).toBe(1);
      expect(statusEvents[0]).toMatchObject({
        type: "commission_status",
        commissionId: id as string,
        status: "blocked",
        reason: "Dependency artifact missing",
      });
    });

    test("stays pending when all dependencies exist", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      await writeCommissionArtifact(
        integrationPath, id, "pending", "test-project",
        [".lore/specs/present-spec.md"],
      );

      // Create the dependency
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "present-spec.md"), "# Spec", "utf-8");

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Still pending
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("pending");

      // No events
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });
  });

  describe("no-dependencies case", () => {
    test("pending commission without dependencies stays pending", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // No dependencies
      await writeCommissionArtifact(
        integrationPath, id, "pending", "test-project",
        [],
      );

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("pending");

      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });

    test("blocked commission without dependencies stays blocked (no auto-fix)", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // Blocked but no dependencies (unusual state, manually set)
      await writeCommissionArtifact(
        integrationPath, id, "blocked", "test-project",
        [],
      );

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Still blocked (function only checks commissions with dependencies)
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("blocked");

      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });
  });

  describe("FIFO auto-dispatch trigger", () => {
    test("blocked -> pending triggers auto-dispatch for the newly pending commission", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      await writeCommissionArtifact(
        integrationPath, id, "blocked", "test-project",
        [".lore/specs/feature-spec.md"],
        "2026-02-21T10:00:00.000Z",
      );

      // Create the dependency file
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "feature-spec.md"), "# Spec", "utf-8");

      // Track dispatches via queryFn to verify auto-dispatch
      let queryCallCount = 0;
      const queryFn = (_params: { prompt: string; options: Record<string, unknown> }) => {
        queryCallCount++;
        return (async function* (): AsyncGenerator<SDKMessage> {
          yield { type: "system", subtype: "init", session_id: "test-session" } as unknown as SDKMessage;
          await new Promise(() => {}); // Never resolves
        })();
      };
      // eslint-disable-next-line @typescript-eslint/require-await
      const activateFn = async (_pkg: DiscoveredPackage, _ctx: unknown) => ({
        systemPrompt: "Test", tools: { mcpServers: [] as never[], allowedTools: [] as string[] }, resourceBounds: {},
      });
      const resolveToolSetFn = (_w: WorkerMetadata, _p: DiscoveredPackage[], _ctx: ToolboxResolverContext): ResolvedToolSet => ({
        mcpServers: [], allowedTools: [],
      });

      session = createCommissionSession(createTestDeps({
        eventBus,
        queryFn,
        activateFn,
        resolveToolSetFn,
      }));

      await session.checkDependencyTransitions("test-project");

      // Give auto-dispatch chain a tick to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The commission should have been auto-dispatched
      expect(queryCallCount).toBe(1);

      // Verify the commission is now in an active state (dispatched or in_progress)
      const activeCount = session.getActiveCommissions();
      expect(activeCount).toBe(1);
    });
  });

  describe("non-target statuses are ignored", () => {
    test("completed commissions are not checked", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      await writeCommissionArtifact(
        integrationPath, id, "completed", "test-project",
        [".lore/specs/missing.md"],
      );

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      // Status unchanged
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("completed");

      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });

    test("failed commissions are not checked", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      await writeCommissionArtifact(
        integrationPath, id, "failed", "test-project",
        [".lore/specs/existing.md"],
      );

      // Even though dependency exists, failed commissions are not touched
      const depPath = path.join(integrationPath, ".lore", "specs");
      await fs.mkdir(depPath, { recursive: true });
      await fs.writeFile(path.join(depPath, "existing.md"), "# Exists", "utf-8");

      session = createCommissionSession(createTestDeps({ eventBus }));

      await session.checkDependencyTransitions("test-project");

      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("failed");

      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });
  });

  describe("active commissions are skipped", () => {
    test("active in_progress commission is not checked for dependency transitions", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      // Write a pending commission with a missing dependency
      await writeCommissionArtifact(
        integrationPath, id, "pending", "test-project",
        [".lore/specs/missing.md"],
        "2026-02-21T09:00:00.000Z",
      );

      // Dispatch the target commission first so it becomes active.
      const queryFn = (_params: { prompt: string; options: Record<string, unknown> }) => {
        return (async function* (): AsyncGenerator<SDKMessage> {
          yield { type: "system", subtype: "init", session_id: "test-session" } as unknown as SDKMessage;
          await new Promise(() => {}); // Never resolves
        })();
      };
      // eslint-disable-next-line @typescript-eslint/require-await
      const activateFn = async (_pkg: DiscoveredPackage, _ctx: unknown) => ({
        systemPrompt: "Test", tools: { mcpServers: [] as never[], allowedTools: [] as string[] }, resourceBounds: {},
      });
      const resolveToolSetFn = (_w: WorkerMetadata, _p: DiscoveredPackage[], _ctx: ToolboxResolverContext): ResolvedToolSet => ({
        mcpServers: [], allowedTools: [],
      });

      session = createCommissionSession(createTestDeps({
        eventBus,
        queryFn,
        activateFn,
        resolveToolSetFn,
      }));

      // Dispatch first to make it active
      await session.dispatchCommission(id);

      // Clear events from dispatch
      emittedEvents.length = 0;

      // Now check dependencies. The commission is active (in_progress),
      // so it should be skipped even though its dep is missing.
      await session.checkDependencyTransitions("test-project");

      // No transition events
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });
  });

  describe("fileExists DI seam", () => {
    test("uses injected fileExists for dependency checking", async () => {
      const id = asCommissionId("commission-researcher-20260221-100000");

      await writeCommissionArtifact(
        integrationPath, id, "blocked", "test-project",
        [".lore/specs/virtual-file.md"],
      );

      // The file doesn't actually exist on disk, but our mock says it does
      const checkedPaths: string[] = [];
      const mockFileExists = (filePath: string): Promise<boolean> => {
        checkedPaths.push(filePath);
        return Promise.resolve(true);
      };

      session = createCommissionSession(createTestDeps({
        eventBus,
        fileExists: mockFileExists,
      }));

      await session.checkDependencyTransitions("test-project");

      // Should have checked the dependency path
      expect(checkedPaths.length).toBe(1);
      expect(checkedPaths[0]).toBe(
        path.join(integrationPath, ".lore", "specs", "virtual-file.md"),
      );

      // And transitioned to pending
      const status = await readCommissionStatus(integrationPath, id);
      expect(status).toBe("pending");
    });
  });

  describe("missing commissions directory", () => {
    test("handles missing commissions directory gracefully", async () => {
      session = createCommissionSession(createTestDeps({ eventBus }));

      // Remove the commissions directory
      await fs.rm(path.join(integrationPath, ".lore", "commissions"), { recursive: true });

      // Should not throw
      await session.checkDependencyTransitions("test-project");

      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents.length).toBe(0);
    });
  });
});

describe("readCommissionDependencies", () => {
  test("reads dependencies from commission artifact", async () => {
    const id = asCommissionId("commission-researcher-20260221-100000");
    await writeCommissionArtifact(
      integrationPath, id, "pending", "test-project",
      [".lore/specs/feature.md", ".lore/design/arch.md"],
    );

    const deps = await readCommissionDependencies(integrationPath, id);
    expect(deps).toEqual([".lore/specs/feature.md", ".lore/design/arch.md"]);
  });

  test("returns empty array for no dependencies", async () => {
    const id = asCommissionId("commission-researcher-20260221-100000");
    await writeCommissionArtifact(
      integrationPath, id, "pending", "test-project",
      [],
    );

    const deps = await readCommissionDependencies(integrationPath, id);
    expect(deps).toEqual([]);
  });
});
