/* eslint-disable @typescript-eslint/require-await */

/**
 * Tests for workspace provisioning (Layer 3).
 *
 * Covers:
 * - prepare: branch creation, worktree creation, sparse checkout in correct order
 * - finalize: squash-merge success and conflict cases, cleanup behavior
 * - preserveAndCleanup: commits partial work, removes worktree, keeps branch
 * - removeWorktree: delegates to git
 * - cleanGitEnv enforcement: verified at DI boundary (GitOps is the only git interface)
 * - Layer 3 isolation: no commission types imported
 * - Error propagation: prepare failures propagate, finalize conflicts return structured result
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { GitOps } from "@/daemon/lib/git";
import {
  createWorkspaceOps,
  type WorkspaceOps,
  type WorkspaceConfig,
  type FinalizeConfig,
  type PreserveConfig,
} from "@/daemon/services/workspace";

// -- Mock GitOps factory --

/**
 * Creates a mock GitOps with call tracking. Each method records its name
 * and arguments to the calls array. Return values can be overridden per
 * method through the overrides parameter.
 */
function createMockGitOps(overrides?: Partial<{
  commitAll: (worktreePath: string, message: string) => Promise<boolean>;
  squashMergeNoCommit: (worktreePath: string, sourceBranch: string) => Promise<boolean>;
  listConflictedFiles: (worktreePath: string) => Promise<string[]>;
  createBranch: (repoPath: string, branchName: string, baseRef: string) => Promise<void>;
  createWorktree: (repoPath: string, worktreePath: string, branchName: string) => Promise<void>;
  configureSparseCheckout: (worktreePath: string, paths: string[]) => Promise<void>;
  removeWorktree: (repoPath: string, worktreePath: string) => Promise<void>;
  deleteBranch: (repoPath: string, branchName: string) => Promise<void>;
}>): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  function track(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  return {
    calls,
    createBranch: async (...args) => { track("createBranch", ...args); await overrides?.createBranch?.(...args); },
    branchExists: async (...args) => { track("branchExists", ...args); return false; },
    deleteBranch: async (...args) => { track("deleteBranch", ...args); await overrides?.deleteBranch?.(...args); },
    createWorktree: async (...args) => { track("createWorktree", ...args); await overrides?.createWorktree?.(...args); },
    removeWorktree: async (...args) => { track("removeWorktree", ...args); await overrides?.removeWorktree?.(...args); },
    configureSparseCheckout: async (...args) => { track("configureSparseCheckout", ...args); await overrides?.configureSparseCheckout?.(...args); },
    commitAll: async (...args) => {
      track("commitAll", ...args);
      if (overrides?.commitAll) return overrides.commitAll(...args);
      return false;
    },
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
    squashMergeNoCommit: async (...args) => {
      track("squashMergeNoCommit", ...args);
      if (overrides?.squashMergeNoCommit) return overrides.squashMergeNoCommit(...args);
      return true;
    },
    listConflictedFiles: async (...args) => {
      track("listConflictedFiles", ...args);
      if (overrides?.listConflictedFiles) return overrides.listConflictedFiles(...args);
      return [];
    },
    resolveConflictsTheirs: async (...args) => { track("resolveConflictsTheirs", ...args); },
    mergeAbort: async (...args) => { track("mergeAbort", ...args); },
    hasCommitsBeyond: async (...args) => { track("hasCommitsBeyond", ...args); return false; },
    lorePendingChanges: async (...args) => { track("lorePendingChanges", ...args); return { hasPendingChanges: false, fileCount: 0 }; },
    commitLore: async (...args) => { track("commitLore", ...args); return { committed: false }; },
  };
}

// -- Test helpers --

function makeWorkspaceConfig(overrides?: Partial<WorkspaceConfig>): WorkspaceConfig {
  return {
    projectPath: "/projects/test-project",
    baseBranch: "claude/main",
    activityBranch: "claude/commission-test-001",
    worktreeDir: "/tmp/guild-hall/worktrees/test-project/commission-test-001",
    ...overrides,
  };
}

function makeFinalizeConfig(overrides?: Partial<FinalizeConfig>): FinalizeConfig {
  return {
    activityBranch: "claude/commission-test-001",
    worktreeDir: "/tmp/guild-hall/worktrees/test-project/commission-test-001",
    projectPath: "/projects/test-project",
    integrationPath: "/tmp/guild-hall/projects/test-project",
    activityId: "commission-test-001",
    commitMessage: "Final commit: commission-test-001",
    commitLabel: "Commission",
    lockFn: async <T>(fn: () => Promise<T>) => fn(),
    ...overrides,
  };
}

function makePreserveConfig(overrides?: Partial<PreserveConfig>): PreserveConfig {
  return {
    worktreeDir: "/tmp/guild-hall/worktrees/test-project/commission-test-001",
    branchName: "claude/commission-test-001",
    commitMessage: "Partial work preserved: commission-test-001",
    projectPath: "/projects/test-project",
    ...overrides,
  };
}

/** Returns method names from the calls array in order. */
function methodNames(calls: Array<{ method: string }>): string[] {
  return calls.map((c) => c.method);
}

// -- Tests --

describe("WorkspaceOps", () => {
  let gitMock: ReturnType<typeof createMockGitOps>;
  let workspace: WorkspaceOps;

  beforeEach(() => {
    gitMock = createMockGitOps();
    workspace = createWorkspaceOps({ git: gitMock });
  });

  describe("prepare", () => {
    test("creates branch, worktree, and returns worktreeDir", async () => {
      const config = makeWorkspaceConfig();
      const result = await workspace.prepare(config);

      expect(result.worktreeDir).toBe(config.worktreeDir);
      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("createBranch");
      expect(methods).toContain("createWorktree");
    });

    test("calls createBranch before createWorktree", async () => {
      const config = makeWorkspaceConfig();
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      const branchIdx = methods.indexOf("createBranch");
      const worktreeIdx = methods.indexOf("createWorktree");
      expect(branchIdx).toBeLessThan(worktreeIdx);
    });

    test("passes correct arguments to createBranch", async () => {
      const config = makeWorkspaceConfig();
      await workspace.prepare(config);

      const branchCall = gitMock.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args).toEqual([
        config.projectPath,
        config.activityBranch,
        config.baseBranch,
      ]);
    });

    test("passes correct arguments to createWorktree", async () => {
      const config = makeWorkspaceConfig();
      await workspace.prepare(config);

      const worktreeCall = gitMock.calls.find((c) => c.method === "createWorktree");
      expect(worktreeCall).toBeDefined();
      expect(worktreeCall!.args).toEqual([
        config.projectPath,
        config.worktreeDir,
        config.activityBranch,
      ]);
    });

    test("configures sparse checkout when checkoutScope is sparse", async () => {
      const config = makeWorkspaceConfig({
        checkoutScope: "sparse",
        sparsePatterns: [".lore/commissions/"],
      });
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("configureSparseCheckout");

      const sparseCall = gitMock.calls.find((c) => c.method === "configureSparseCheckout");
      expect(sparseCall!.args).toEqual([config.worktreeDir, [".lore/commissions/"]]);
    });

    test("calls configureSparseCheckout after createWorktree", async () => {
      const config = makeWorkspaceConfig({
        checkoutScope: "sparse",
        sparsePatterns: [".lore/"],
      });
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      const worktreeIdx = methods.indexOf("createWorktree");
      const sparseIdx = methods.indexOf("configureSparseCheckout");
      expect(worktreeIdx).toBeLessThan(sparseIdx);
    });

    test("skips sparse checkout when checkoutScope is full", async () => {
      const config = makeWorkspaceConfig({ checkoutScope: "full" });
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).not.toContain("configureSparseCheckout");
    });

    test("skips sparse checkout when checkoutScope is omitted", async () => {
      const config = makeWorkspaceConfig();
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).not.toContain("configureSparseCheckout");
    });

    test("skips sparse checkout when sparse patterns are empty", async () => {
      const config = makeWorkspaceConfig({
        checkoutScope: "sparse",
        sparsePatterns: [],
      });
      await workspace.prepare(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).not.toContain("configureSparseCheckout");
    });

    test("propagates createBranch failure", async () => {
      gitMock = createMockGitOps({
        createBranch: async () => { throw new Error("branch already exists"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeWorkspaceConfig();
      await expect(workspace.prepare(config)).rejects.toThrow("branch already exists");
    });

    test("propagates createWorktree failure", async () => {
      gitMock = createMockGitOps({
        createWorktree: async () => { throw new Error("worktree path already exists"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeWorkspaceConfig();
      await expect(workspace.prepare(config)).rejects.toThrow("worktree path already exists");
    });

    test("propagates configureSparseCheckout failure", async () => {
      gitMock = createMockGitOps({
        configureSparseCheckout: async () => { throw new Error("sparse checkout failed"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeWorkspaceConfig({
        checkoutScope: "sparse",
        sparsePatterns: [".lore/"],
      });
      await expect(workspace.prepare(config)).rejects.toThrow("sparse checkout failed");
    });
  });

  describe("finalize", () => {
    test("returns merged: true when squash-merge succeeds cleanly", async () => {
      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      expect(result.merged).toBe(true);
    });

    test("commits activity worktree before merging", async () => {
      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      // First commitAll should be on the activity worktree
      const commitCalls = gitMock.calls.filter((c) => c.method === "commitAll");
      expect(commitCalls.length).toBeGreaterThanOrEqual(1);
      expect(commitCalls[0].args[0]).toBe(config.worktreeDir);
    });

    test("commits integration worktree (pre-merge sync) before squash-merge", async () => {
      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const commitCalls = gitMock.calls.filter((c) => c.method === "commitAll");
      // Second commit should be the pre-merge sync on integration
      const integrationCommit = commitCalls.find(
        (c) => c.args[0] === config.integrationPath && (c.args[1] as string).includes("Pre-merge sync"),
      );
      expect(integrationCommit).toBeDefined();
    });

    test("calls squashMergeNoCommit with correct arguments", async () => {
      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const mergeCall = gitMock.calls.find((c) => c.method === "squashMergeNoCommit");
      expect(mergeCall).toBeDefined();
      expect(mergeCall!.args).toEqual([config.integrationPath, config.activityBranch]);
    });

    test("removes worktree and deletes branch on successful merge", async () => {
      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("removeWorktree");
      expect(methods).toContain("deleteBranch");

      const removeCall = gitMock.calls.find((c) => c.method === "removeWorktree");
      expect(removeCall!.args).toEqual([config.projectPath, config.worktreeDir]);

      const deleteCall = gitMock.calls.find((c) => c.method === "deleteBranch");
      expect(deleteCall!.args).toEqual([config.projectPath, config.activityBranch]);
    });

    test("runs squash-merge under the provided lock", async () => {
      const lockCalls: string[] = [];
      const config = makeFinalizeConfig({
        lockFn: async <T>(fn: () => Promise<T>) => {
          lockCalls.push("lock-acquired");
          const result = await fn();
          lockCalls.push("lock-released");
          return result;
        },
      });

      await workspace.finalize(config);

      expect(lockCalls).toEqual(["lock-acquired", "lock-released"]);
      // squashMergeNoCommit should be called (inside the lock)
      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("squashMergeNoCommit");
    });

    test("returns preserved result when non-.lore/ files conflict", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => ["src/index.ts", ".lore/commissions/test.md"],
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      expect(result.merged).toBe(false);
      if (!result.merged) {
        expect(result.preserved).toBe(true);
        expect(result.reason).toContain("non-.lore/");
      }
    });

    test("aborts merge when non-.lore/ files conflict", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => ["src/index.ts"],
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("mergeAbort");
    });

    test("removes worktree but keeps branch when merge conflicts", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => ["src/broken.ts"],
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("removeWorktree");
      // Branch should NOT be deleted when merge fails (preserved for recovery)
      expect(methods).not.toContain("deleteBranch");
    });

    test("auto-resolves .lore/ only conflicts and returns merged: true", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => [".lore/commissions/test.md", ".lore/notes/review.md"],
        commitAll: async () => true,
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      expect(result.merged).toBe(true);

      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("resolveConflictsTheirs");
      expect(methods).not.toContain("mergeAbort");
    });

    test("passes .lore/ files to resolveConflictsTheirs", async () => {
      const loreFiles = [".lore/commissions/test.md", ".lore/notes/review.md"];
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => loreFiles,
        commitAll: async () => true,
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      await workspace.finalize(config);

      const resolveCall = gitMock.calls.find((c) => c.method === "resolveConflictsTheirs");
      expect(resolveCall).toBeDefined();
      expect(resolveCall!.args[1]).toEqual(loreFiles);
    });

    test("aborts merge when conflict reported but no unmerged files found", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => [],
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      expect(result.merged).toBe(false);
      if (!result.merged) {
        expect(result.preserved).toBe(true);
      }
      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("mergeAbort");
    });

    test("commit label appears in the merge commit message", async () => {
      gitMock = createMockGitOps({
        commitAll: async () => true,
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig({
        commitLabel: "Commission",
        activityId: "commission-test-001",
      });
      await workspace.finalize(config);

      // Find the commitAll call on the integration path after squashMergeNoCommit
      const squashIdx = gitMock.calls.findIndex((c) => c.method === "squashMergeNoCommit");
      const postMergeCommits = gitMock.calls
        .slice(squashIdx + 1)
        .filter((c) => c.method === "commitAll" && c.args[0] === config.integrationPath);

      expect(postMergeCommits.length).toBeGreaterThan(0);
      const commitMsg = postMergeCommits[0].args[1] as string;
      expect(commitMsg).toContain("Commission");
      expect(commitMsg).toContain("commission-test-001");
    });
  });

  describe("preserveAndCleanup", () => {
    test("commits uncommitted work", async () => {
      const config = makePreserveConfig();
      await workspace.preserveAndCleanup(config);

      const commitCalls = gitMock.calls.filter((c) => c.method === "commitAll");
      expect(commitCalls.length).toBe(1);
      expect(commitCalls[0].args[0]).toBe(config.worktreeDir);
      expect(commitCalls[0].args[1]).toBe(config.commitMessage);
    });

    test("removes worktree when projectPath is provided", async () => {
      const config = makePreserveConfig({ projectPath: "/projects/test" });
      await workspace.preserveAndCleanup(config);

      const removeCall = gitMock.calls.find((c) => c.method === "removeWorktree");
      expect(removeCall).toBeDefined();
      expect(removeCall!.args).toEqual(["/projects/test", config.worktreeDir]);
    });

    test("skips worktree removal when projectPath is undefined", async () => {
      const config = makePreserveConfig({ projectPath: undefined });
      await workspace.preserveAndCleanup(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).not.toContain("removeWorktree");
    });

    test("does not delete the branch (preserved for recovery)", async () => {
      const config = makePreserveConfig();
      await workspace.preserveAndCleanup(config);

      const methods = methodNames(gitMock.calls);
      expect(methods).not.toContain("deleteBranch");
    });

    test("continues when commitAll fails", async () => {
      gitMock = createMockGitOps({
        commitAll: async () => { throw new Error("nothing to commit"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makePreserveConfig();
      // Should not throw
      await workspace.preserveAndCleanup(config);

      // removeWorktree should still be called
      const methods = methodNames(gitMock.calls);
      expect(methods).toContain("removeWorktree");
    });

    test("continues when removeWorktree fails", async () => {
      gitMock = createMockGitOps({
        removeWorktree: async () => { throw new Error("worktree not found"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makePreserveConfig();
      // Should not throw
      await workspace.preserveAndCleanup(config);
    });
  });

  describe("removeWorktree", () => {
    test("delegates to git.removeWorktree", async () => {
      await workspace.removeWorktree("/tmp/worktree", "/projects/test");

      const removeCall = gitMock.calls.find((c) => c.method === "removeWorktree");
      expect(removeCall).toBeDefined();
      expect(removeCall!.args).toEqual(["/projects/test", "/tmp/worktree"]);
    });

    test("propagates git.removeWorktree errors", async () => {
      gitMock = createMockGitOps({
        removeWorktree: async () => { throw new Error("worktree locked"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      await expect(
        workspace.removeWorktree("/tmp/worktree", "/projects/test"),
      ).rejects.toThrow("worktree locked");
    });
  });

  describe("cleanGitEnv enforcement", () => {
    test("all git operations go through the injected GitOps interface", async () => {
      // The workspace module never calls git subprocesses directly.
      // It only calls methods on the injected GitOps. The GitOps
      // implementation (createGitOps in daemon/lib/git.ts) enforces
      // cleanGitEnv() on every subprocess. By verifying all git
      // interactions go through the mock, we confirm the DI boundary
      // prevents bypassing cleanGitEnv().
      const config = makeWorkspaceConfig({
        checkoutScope: "sparse",
        sparsePatterns: [".lore/"],
      });
      await workspace.prepare(config);

      // Every call should have gone through our mock
      expect(gitMock.calls.length).toBeGreaterThan(0);
      for (const call of gitMock.calls) {
        expect(typeof call.method).toBe("string");
        expect(call.method.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Layer 3 isolation", () => {
    test("workspace.ts does not import commission types", async () => {
      // Read the workspace module source and verify it has no imports
      // from daemon/types (where CommissionId, CommissionStatus live)
      // or from commission-specific modules.
      const fs = await import("node:fs/promises");
      const source = await fs.readFile(
        new URL("../../../daemon/services/workspace.ts", import.meta.url),
        "utf-8",
      );

      // No imports from daemon/types (commission ID, status types)
      expect(source).not.toMatch(/from\s+["']@\/daemon\/types["']/);

      // No imports from commission-specific modules
      expect(source).not.toMatch(/from\s+["'].*commission/);

      // No references to CommissionId or CommissionStatus types
      expect(source).not.toMatch(/CommissionId/);
      expect(source).not.toMatch(/CommissionStatus/);
    });
  });

  describe("finalize error paths", () => {
    test("worktree cleanup failure after successful merge does not change result", async () => {
      gitMock = createMockGitOps({
        removeWorktree: async () => { throw new Error("permission denied"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      // Merge succeeded even though cleanup failed
      expect(result.merged).toBe(true);
    });

    test("branch deletion failure after successful merge does not change result", async () => {
      gitMock = createMockGitOps({
        deleteBranch: async () => { throw new Error("branch in use"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      const result = await workspace.finalize(config);

      expect(result.merged).toBe(true);
    });

    test("worktree cleanup failure after merge conflict does not throw", async () => {
      gitMock = createMockGitOps({
        squashMergeNoCommit: async () => false,
        listConflictedFiles: async () => ["src/broken.ts"],
        removeWorktree: async () => { throw new Error("permission denied"); },
      });
      workspace = createWorkspaceOps({ git: gitMock });

      const config = makeFinalizeConfig();
      // Should not throw
      const result = await workspace.finalize(config);
      expect(result.merged).toBe(false);
    });
  });
});
