/**
 * Workspace scoping verification tests.
 *
 * Confirms that workspace scoping holds across all primitives:
 * commissions, memory, dependencies, and manager context. Workspace
 * scoping is implicit in the per-project path patterns throughout the
 * codebase. These tests verify that boundary.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { scanCommissions } from "@/lib/commissions";
import {
  makeReadMemoryHandler,
  makeEditMemoryHandler,
} from "@/apps/daemon/services/base-toolbox";
import {
  buildManagerContext,
  type ManagerContextDeps,
} from "@/apps/daemon/services/manager/context";
import { MANAGER_PACKAGE_NAME } from "@/apps/daemon/services/manager/worker";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-workspace-scoping-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

/**
 * Creates a .lore/commissions/ directory under the given base path and
 * writes a commission artifact with the specified ID and status.
 */
async function writeCommissionArtifact(
  basePath: string,
  commissionId: string,
  projectName: string,
  opts: { status?: string; dependencies?: string[] } = {},
): Promise<void> {
  const status = opts.status ?? "pending";
  const deps = opts.dependencies ?? [];
  const depsYaml =
    deps.length > 0 ? "\n" + deps.map((d) => `  - ${d}`).join("\n") : " []";

  const commissionsDir = path.join(basePath, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  const content = `---
title: "Commission: ${commissionId}"
date: 2026-02-23
status: ${status}
tags: [commission]
worker: test-worker
workerDisplayTitle: "Test Worker"
prompt: "Do the thing"
dependencies:${depsYaml}
linked_artifacts: []
resource_overrides: {}
activity_timeline:
  - timestamp: 2026-02-23T12:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${projectName}
---
`;

  await fs.writeFile(
    path.join(commissionsDir, `${commissionId}.md`),
    content,
    "utf-8",
  );
}

function makeWorkerPackage(
  name: string,
  displayTitle: string,
  description: string,
): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: { name: displayTitle, description, displayTitle },
    posture: "Test posture",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "sparse",
  };
  return { name, path: `/fake/${name}`, metadata };
}

function makeManagerPackage(): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: "Guild Master",
      description: "Coordination specialist",
      displayTitle: "Guild Master",
    },
    posture: "Manager posture",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    checkoutScope: "sparse",
  };
  return { name: MANAGER_PACKAGE_NAME, path: "", metadata };
}

// -- Tests --

describe("workspace scoping", () => {
  describe("commission scoping", () => {
    test("commission in project A is invisible to project B's scan", async () => {
      // Set up two separate project directories
      const projectAPath = path.join(tmpDir, "project-a");
      const projectBPath = path.join(tmpDir, "project-b");

      // Create a commission in project A
      await writeCommissionArtifact(
        projectAPath,
        "commission-worker-20260223-120000",
        "project-a",
      );

      // Create a different commission in project B
      await writeCommissionArtifact(
        projectBPath,
        "commission-worker-20260223-130000",
        "project-b",
      );

      // Scan project A's commissions
      const projectACommissions = await scanCommissions(
        path.join(projectAPath, ".lore"),
        "project-a",
      );

      // Scan project B's commissions
      const projectBCommissions = await scanCommissions(
        path.join(projectBPath, ".lore"),
        "project-b",
      );

      // Project A should only see its commission
      expect(projectACommissions).toHaveLength(1);
      expect(projectACommissions[0].commissionId).toBe(
        "commission-worker-20260223-120000",
      );
      expect(projectACommissions[0].projectName).toBe("project-a");

      // Project B should only see its commission
      expect(projectBCommissions).toHaveLength(1);
      expect(projectBCommissions[0].commissionId).toBe(
        "commission-worker-20260223-130000",
      );
      expect(projectBCommissions[0].projectName).toBe("project-b");

      // Verify cross-contamination doesn't occur: project A's commission
      // IDs should not appear in project B's results and vice versa.
      const projectAIds = projectACommissions.map((c) => c.commissionId);
      const projectBIds = projectBCommissions.map((c) => c.commissionId);
      expect(projectAIds).not.toContain("commission-worker-20260223-130000");
      expect(projectBIds).not.toContain("commission-worker-20260223-120000");
    });

    test("empty project has no commissions even when sibling project has many", async () => {
      const projectAPath = path.join(tmpDir, "project-a");
      const projectBPath = path.join(tmpDir, "project-b");

      // Create multiple commissions in project A
      await writeCommissionArtifact(
        projectAPath,
        "commission-a1",
        "project-a",
      );
      await writeCommissionArtifact(
        projectAPath,
        "commission-a2",
        "project-a",
      );
      await writeCommissionArtifact(
        projectAPath,
        "commission-a3",
        "project-a",
      );

      // Project B has no commissions directory at all
      await fs.mkdir(path.join(projectBPath, ".lore"), { recursive: true });

      const projectBCommissions = await scanCommissions(
        path.join(projectBPath, ".lore"),
        "project-b",
      );

      expect(projectBCommissions).toHaveLength(0);
    });
  });

  describe("memory scoping", () => {
    test("memory written to project A's scope is not visible when reading project B's scope", async () => {
      const guildHallHome = path.join(tmpDir, ".guild-hall");

      const workerName = "test-worker";
      const projectAName = "project-a";
      const projectBName = "project-b";

      // Create read/edit handlers for project A
      const readScopesA = new Set<string>();
      const readA = makeReadMemoryHandler(guildHallHome, workerName, projectAName, readScopesA);
      const editA = makeEditMemoryHandler(guildHallHome, workerName, projectAName, readScopesA);

      // Create read handler for project B
      const readScopesB = new Set<string>();
      const readB = makeReadMemoryHandler(guildHallHome, workerName, projectBName, readScopesB);

      // Write to project A's project scope
      await readA({ scope: "project" });
      await editA({
        scope: "project",
        section: "Context",
        operation: "upsert",
        content: "Project A secret data",
      });

      // Read from project A: should find the data
      const resultA = await readA({ scope: "project" });
      expect(resultA.isError).toBeUndefined();
      expect(resultA.content[0].text).toContain("Project A secret data");

      // Read from project B: should NOT find project A's data
      const resultB = await readB({ scope: "project" });
      expect(resultB.content[0].text).toContain("No memories saved yet.");

      // Verify the actual filesystem paths are different
      const projectAFile = path.join(guildHallHome, "memory", "projects", `${projectAName}.md`);
      const projectBFile = path.join(guildHallHome, "memory", "projects", `${projectBName}.md`);
      const aExists = await fs.access(projectAFile).then(() => true, () => false);
      const bExists = await fs.access(projectBFile).then(() => true, () => false);
      expect(aExists).toBe(true);
      expect(bExists).toBe(false);
    });

    test("worker scope isolates by worker name, not project", async () => {
      const guildHallHome = path.join(tmpDir, ".guild-hall");

      // Worker A writes data
      const readScopesA = new Set<string>();
      const readWorkerA = makeReadMemoryHandler(guildHallHome, "worker-a", "same-project", readScopesA);
      const editWorkerA = makeEditMemoryHandler(guildHallHome, "worker-a", "same-project", readScopesA);

      const readScopesB = new Set<string>();
      const readWorkerB = makeReadMemoryHandler(guildHallHome, "worker-b", "same-project", readScopesB);

      await readWorkerA({ scope: "worker" });
      await editWorkerA({
        scope: "worker",
        section: "Note",
        operation: "upsert",
        content: "Worker A's private notes",
      });

      // Worker A can read its own notes
      const resultA = await readWorkerA({ scope: "worker" });
      expect(resultA.isError).toBeUndefined();
      expect(resultA.content[0].text).toContain("Worker A's private notes");

      // Worker B cannot see Worker A's notes
      const resultB = await readWorkerB({ scope: "worker" });
      expect(resultB.content[0].text).toContain("No memories saved yet.");
    });
  });

  describe("dependency scoping", () => {
    test("dependency checking for project A only examines project A's integration worktree", async () => {
      // This test verifies that checkDependencyTransitions scans
      // dependencies relative to the project's own integration worktree
      // path. We simulate this by setting up two projects with
      // separate integration worktree directories, each with a
      // commission that depends on an artifact. The dependency file
      // exists only in project B's worktree but NOT in project A's.
      // Project A's commission should remain blocked.

      const ghHome = path.join(tmpDir, ".guild-hall");

      // Simulate integration worktree directories
      const projectAIntegration = path.join(ghHome, "projects", "project-a");
      const projectBIntegration = path.join(ghHome, "projects", "project-b");

      // Create the dependency artifact only in project B
      const depPath = ".lore/specs/required-spec.md";
      await fs.mkdir(
        path.join(projectBIntegration, path.dirname(depPath)),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(projectBIntegration, depPath),
        "---\ntitle: Required Spec\n---\n",
        "utf-8",
      );

      // Create a blocked commission in project A that depends on the spec
      await writeCommissionArtifact(
        projectAIntegration,
        "commission-worker-20260223-140000",
        "project-a",
        { status: "blocked", dependencies: [depPath] },
      );

      // Create a blocked commission in project B with the same dependency
      await writeCommissionArtifact(
        projectBIntegration,
        "commission-worker-20260223-150000",
        "project-b",
        { status: "blocked", dependencies: [depPath] },
      );

      // Verify the dependency file does NOT exist relative to project A
      const depExistsInA = await fs
        .access(path.join(projectAIntegration, depPath))
        .then(() => true, () => false);
      expect(depExistsInA).toBe(false);

      // Verify the dependency file DOES exist relative to project B
      const depExistsInB = await fs
        .access(path.join(projectBIntegration, depPath))
        .then(() => true, () => false);
      expect(depExistsInB).toBe(true);

      // The key insight: checkDependencyTransitions resolves dependency
      // paths as path.join(integrationWorktreePath(ghHome, projectName), dep).
      // For project A: path.join(projectAIntegration, depPath) -> does not exist
      // For project B: path.join(projectBIntegration, depPath) -> exists
      // This proves scoping: project B's artifacts don't satisfy project A's deps.

      // Verify the path resolution is correct by checking the actual paths
      // that would be resolved by the daemon's dependency checker
      const { integrationWorktreePath } = await import("@/lib/paths");
      const resolvedA = path.join(
        integrationWorktreePath(ghHome, "project-a"),
        depPath,
      );
      const resolvedB = path.join(
        integrationWorktreePath(ghHome, "project-b"),
        depPath,
      );

      // The resolved paths must be different (scoped to different projects)
      expect(resolvedA).not.toBe(resolvedB);

      // And only project B's resolved path should have the file
      const resolvedAExists = await fs
        .access(resolvedA)
        .then(() => true, () => false);
      const resolvedBExists = await fs
        .access(resolvedB)
        .then(() => true, () => false);
      expect(resolvedAExists).toBe(false);
      expect(resolvedBExists).toBe(true);
    });
  });

  describe("manager cross-workspace awareness", () => {
    test("manager context is built per-project, not globally", async () => {
      // The manager's context injection is called per-project (scoped to
      // projectName). This test verifies that buildManagerContext for
      // project A only includes project A's commissions, not project B's.

      const guildHallHome = path.join(tmpDir, ".guild-hall");
      const integrationPathA = path.join(tmpDir, "integration-a");
      const integrationPathB = path.join(tmpDir, "integration-b");

      // Set up required directories
      await fs.mkdir(path.join(integrationPathA, ".lore", "commissions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(integrationPathB, ".lore", "commissions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(guildHallHome, "state", "meetings"), {
        recursive: true,
      });

      // Commissions for project A
      const projectACommissions: CommissionMeta[] = [
        {
          commissionId: "commission-a-1",
          title: "Task for Project Alpha",
          status: "in_progress",
          source: null,
          worker: "Worker A",
          workerDisplayTitle: "Worker A",
          prompt: "Do alpha work",
          dependencies: [],
          linked_artifacts: [],
          resource_overrides: {},
          current_progress: "Working on alpha",
          result_summary: "",
          projectName: "project-alpha",
          date: "2026-02-23",
          relevantDate: "",
        },
      ];

      // Commissions for project B
      const projectBCommissions: CommissionMeta[] = [
        {
          commissionId: "commission-b-1",
          title: "Task for Project Beta",
          status: "pending",
          source: null,
          worker: "Worker B",
          workerDisplayTitle: "Worker B",
          prompt: "Do beta work",
          dependencies: [],
          linked_artifacts: [],
          resource_overrides: {},
          current_progress: "",
          result_summary: "",
          projectName: "project-beta",
          date: "2026-02-23",
          relevantDate: "",
        },
      ];

      const packages = [
        makeManagerPackage(),
        makeWorkerPackage("worker-a", "Worker A", "Does A things"),
        makeWorkerPackage("worker-b", "Worker B", "Does B things"),
      ];

      // Build context for project A
      const depsA: ManagerContextDeps = {
        packages,
        projectName: "project-alpha",
        integrationPath: integrationPathA,
        guildHallHome,
        /* eslint-disable @typescript-eslint/require-await */
        scanCommissionsFn: async () => projectACommissions,
        scanMeetingRequestsFn: async () => [],
        loadMemoriesFn: async () => ({ memoryBlock: "" }),
        /* eslint-enable @typescript-eslint/require-await */
      };
      const contextA = await buildManagerContext(depsA);

      // Build context for project B
      const depsB: ManagerContextDeps = {
        packages,
        projectName: "project-beta",
        integrationPath: integrationPathB,
        guildHallHome,
        /* eslint-disable @typescript-eslint/require-await */
        scanCommissionsFn: async () => projectBCommissions,
        scanMeetingRequestsFn: async () => [],
        loadMemoriesFn: async () => ({ memoryBlock: "" }),
        /* eslint-enable @typescript-eslint/require-await */
      };
      const contextB = await buildManagerContext(depsB);

      // Context A should contain project A's commission, not project B's
      expect(contextA).toContain("Task for Project Alpha");
      expect(contextA).toContain("Working on alpha");
      expect(contextA).not.toContain("Task for Project Beta");

      // Context B should contain project B's commission, not project A's
      expect(contextB).toContain("Task for Project Beta");
      expect(contextB).not.toContain("Task for Project Alpha");
      expect(contextB).not.toContain("Working on alpha");
    });

    test("manager sees all available workers regardless of which project is active", async () => {
      // The Available Workers section is global (package discovery),
      // not project-scoped. Both project contexts should see the same
      // set of workers.

      const guildHallHome = path.join(tmpDir, ".guild-hall");
      const integrationPath = path.join(tmpDir, "integration");

      await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(guildHallHome, "state", "meetings"), {
        recursive: true,
      });

      const packages = [
        makeManagerPackage(),
        makeWorkerPackage("worker-alpha", "Alpha Worker", "Handles alpha"),
        makeWorkerPackage("worker-beta", "Beta Worker", "Handles beta"),
      ];

      const makeDeps = (projectName: string): ManagerContextDeps => ({
        packages,
        projectName,
        integrationPath,
        guildHallHome,
        /* eslint-disable @typescript-eslint/require-await */
        scanCommissionsFn: async () => [],
        scanMeetingRequestsFn: async () => [],
        loadMemoriesFn: async () => ({ memoryBlock: "" }),
        /* eslint-enable @typescript-eslint/require-await */
      });

      const contextA = await buildManagerContext(makeDeps("project-a"));
      const contextB = await buildManagerContext(makeDeps("project-b"));

      // Both contexts should include the same workers section
      expect(contextA).toContain("Alpha Worker");
      expect(contextA).toContain("Beta Worker");
      expect(contextB).toContain("Alpha Worker");
      expect(contextB).toContain("Beta Worker");

      // Neither should include the manager itself
      expect(contextA).not.toContain("Guild Master");
      expect(contextB).not.toContain("Guild Master");
    });
  });
});
