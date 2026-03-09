/**
 * Tests for daemon startup sync behavior.
 *
 * Verifies that createProductionApp calls syncProject for projects during
 * startup, skips projects with active activities, and handles failures
 * without crashing. The startup sequence now uses smart sync (fetch + detect
 * merged PR + reset or rebase) instead of unconditional rebase.
 *
 * Uses the same test infrastructure as app.test.ts: GUILD_HALL_HOME override,
 * temp directories, mock gitOps.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createProductionApp } from "@/daemon/app";
import { writeConfig } from "@/lib/config";
import { integrationWorktreePath } from "@/lib/paths";
import type { GitOps } from "@/daemon/lib/git";

interface MockGitOps extends GitOps {
  calls: Array<{ method: string; args: unknown[] }>;
}

function createMockGitOps(): MockGitOps {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    createBranch: (...args) => {
      calls.push({ method: "createBranch", args });
      return Promise.resolve();
    },
    branchExists: (...args) => {
      calls.push({ method: "branchExists", args });
      return Promise.resolve(false);
    },
    deleteBranch: (...args) => {
      calls.push({ method: "deleteBranch", args });
      return Promise.resolve();
    },
    createWorktree: (...args) => {
      calls.push({ method: "createWorktree", args });
      return Promise.resolve();
    },
    removeWorktree: (...args) => {
      calls.push({ method: "removeWorktree", args });
      return Promise.resolve();
    },
    configureSparseCheckout: (...args) => {
      calls.push({ method: "configureSparseCheckout", args });
      return Promise.resolve();
    },
    commitAll: (...args) => {
      calls.push({ method: "commitAll", args });
      return Promise.resolve(false);
    },
    squashMerge: (...args) => {
      calls.push({ method: "squashMerge", args });
      return Promise.resolve();
    },
    hasUncommittedChanges: (...args) => {
      calls.push({ method: "hasUncommittedChanges", args });
      return Promise.resolve(false);
    },
    rebase: (...args) => {
      calls.push({ method: "rebase", args });
      return Promise.resolve();
    },
    currentBranch: (...args) => {
      calls.push({ method: "currentBranch", args });
      return Promise.resolve("claude/main");
    },
    listWorktrees: (...args) => {
      calls.push({ method: "listWorktrees", args });
      return Promise.resolve([]);
    },
    initClaudeBranch: (...args) => {
      calls.push({ method: "initClaudeBranch", args });
      return Promise.resolve();
    },
    detectDefaultBranch: (...args) => {
      calls.push({ method: "detectDefaultBranch", args });
      return Promise.resolve("main");
    },
    fetch: (...args) => {
      calls.push({ method: "fetch", args });
      return Promise.resolve();
    },
    push: (...args) => {
      calls.push({ method: "push", args });
      return Promise.resolve();
    },
    resetHard: (...args) => {
      calls.push({ method: "resetHard", args });
      return Promise.resolve();
    },
    resetSoft: (...args) => {
      calls.push({ method: "resetSoft", args });
      return Promise.resolve();
    },
    createPullRequest: (...args) => {
      calls.push({ method: "createPullRequest", args });
      return Promise.resolve({ url: "https://github.com/test/repo/pull/1" });
    },
    isAncestor: (...args) => {
      calls.push({ method: "isAncestor", args });
      // Default: not ancestor (will fall through to diverged case, attempt merge)
      return Promise.resolve(false);
    },
    treesEqual: (...args) => {
      calls.push({ method: "treesEqual", args });
      return Promise.resolve(false);
    },
    revParse: (...args) => {
      calls.push({ method: "revParse", args });
      return Promise.resolve("aaa111bbb222ccc333ddd444eee555fff666aaa1");
    },
    rebaseOnto: (...args) => {
      calls.push({ method: "rebaseOnto", args });
      return Promise.resolve();
    },
    merge: (...args) => {
      calls.push({ method: "merge", args });
      return Promise.resolve();
    },
    squashMergeNoCommit: (...args) => {
      calls.push({ method: "squashMergeNoCommit", args });
      return Promise.resolve(true);
    },
    listConflictedFiles: (...args) => {
      calls.push({ method: "listConflictedFiles", args });
      return Promise.resolve([]);
    },
    resolveConflictsTheirs: (...args) => {
      calls.push({ method: "resolveConflictsTheirs", args });
      return Promise.resolve();
    },
    mergeAbort: (...args) => {
      calls.push({ method: "mergeAbort", args });
      return Promise.resolve();
    },
    hasCommitsBeyond: (...args) => {
      calls.push({ method: "hasCommitsBeyond", args });
      return Promise.resolve(false);
    },
  };
}

let tmpDir: string;
let ghHome: string;
let packagesDir: string;
let savedGHHome: string | undefined;
let shutdownFn: (() => void) | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-daemon-rebase-"));
  ghHome = path.join(tmpDir, "guild-hall");
  packagesDir = path.join(tmpDir, "packages");

  await fs.mkdir(ghHome, { recursive: true });
  await fs.mkdir(packagesDir, { recursive: true });

  savedGHHome = process.env.GUILD_HALL_HOME;
  process.env.GUILD_HALL_HOME = ghHome;
});

afterEach(async () => {
  shutdownFn?.();
  shutdownFn = undefined;
  if (savedGHHome !== undefined) {
    process.env.GUILD_HALL_HOME = savedGHHome;
  } else {
    delete process.env.GUILD_HALL_HOME;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createProductionApp startup sync", () => {
  test("calls sync for projects with no active activities", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "test-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree so it doesn't trigger recreation
    const iPath = integrationWorktreePath(ghHome, "test-project");
    await fs.mkdir(iPath, { recursive: true });

    const mockGit = createMockGitOps();
    ({ shutdown: shutdownFn } = await createProductionApp({ packagesDir, gitOps: mockGit }));

    // syncProject fetches from origin first
    const fetchCalls = mockGit.calls.filter((c) => c.method === "fetch");
    expect(fetchCalls).toHaveLength(1);

    // Default mock: isAncestor returns false for both checks, so it
    // falls through to the diverged case and merges (not rebase, which
    // conflicts after squash-merge).
    const mergeCalls = mockGit.calls.filter((c) => c.method === "merge");
    expect(mergeCalls).toHaveLength(1);
    expect(mergeCalls[0].args[0]).toBe(iPath);
  });

  test("skips sync for projects with active activities", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "busy-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree
    const iPath = integrationWorktreePath(ghHome, "busy-project");
    await fs.mkdir(iPath, { recursive: true });

    // Create an active commission state file
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "active-comm.json"),
      JSON.stringify({ projectName: "busy-project", status: "in_progress" }),
    );

    const mockGit = createMockGitOps();
    ({ shutdown: shutdownFn } = await createProductionApp({ packagesDir, gitOps: mockGit }));

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(resetCalls).toHaveLength(0);
  });

  test("sync failure at startup does not crash daemon", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "conflict-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree
    const iPath = integrationWorktreePath(ghHome, "conflict-project");
    await fs.mkdir(iPath, { recursive: true });

    const mockGit = createMockGitOps();
    mockGit.merge = () => Promise.reject(new Error("merge conflict"));

    // Capture warnings
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const result = await createProductionApp({ packagesDir, gitOps: mockGit });
      shutdownFn = result.shutdown;
      expect(result.app).toBeDefined();

      const syncWarning = warnings.find(
        (w) =>
          w.includes("Sync failed") && w.includes("conflict-project"),
      );
      expect(syncWarning).toBeDefined();
    } finally {
      console.warn = originalWarn;
    }
  });

  test("syncs multiple projects at startup", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      {
        projects: [
          { name: "alpha", path: "/fake/alpha" },
          { name: "beta", path: "/fake/beta" },
        ],
      },
      configPath,
    );

    // Pre-create both integration worktrees
    for (const name of ["alpha", "beta"]) {
      const iPath = integrationWorktreePath(ghHome, name);
      await fs.mkdir(iPath, { recursive: true });
    }

    const mockGit = createMockGitOps();
    ({ shutdown: shutdownFn } = await createProductionApp({ packagesDir, gitOps: mockGit }));

    // fetch should be called for each project
    const fetchCalls = mockGit.calls.filter((c) => c.method === "fetch");
    expect(fetchCalls).toHaveLength(2);
  });
});
