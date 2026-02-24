/**
 * Tests for createProductionApp() worktree verification at startup.
 *
 * These tests exercise the git integration added in Phase 5: on startup, the
 * daemon verifies that integration worktrees exist for all registered projects.
 * Missing worktrees are recreated; failures log warnings but don't crash.
 *
 * The tests set GUILD_HALL_HOME to a temp directory, write a minimal config,
 * and inject a mock gitOps to avoid real git operations.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createProductionApp } from "@/daemon/app";
import { writeConfig } from "@/lib/config";
import { integrationWorktreePath } from "@/lib/paths";
import type { GitOps } from "@/daemon/lib/git";

function createMockGitOps(): GitOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createBranch: () => { calls.push("createBranch"); return Promise.resolve(); },
    branchExists: () => { calls.push("branchExists"); return Promise.resolve(false); },
    deleteBranch: () => { calls.push("deleteBranch"); return Promise.resolve(); },
    createWorktree: () => { calls.push("createWorktree"); return Promise.resolve(); },
    removeWorktree: () => { calls.push("removeWorktree"); return Promise.resolve(); },
    configureSparseCheckout: () => { calls.push("configureSparseCheckout"); return Promise.resolve(); },
    commitAll: () => { calls.push("commitAll"); return Promise.resolve(false); },
    squashMerge: () => { calls.push("squashMerge"); return Promise.resolve(); },
    hasUncommittedChanges: () => { calls.push("hasUncommittedChanges"); return Promise.resolve(false); },
    rebase: () => { calls.push("rebase"); return Promise.resolve(); },
    currentBranch: () => { calls.push("currentBranch"); return Promise.resolve("main"); },
    listWorktrees: () => { calls.push("listWorktrees"); return Promise.resolve([]); },
    initClaudeBranch: () => { calls.push("initClaudeBranch"); return Promise.resolve(); },
    detectDefaultBranch: () => { calls.push("detectDefaultBranch"); return Promise.resolve("main"); },
    fetch: () => { calls.push("fetch"); return Promise.resolve(); },
    push: () => { calls.push("push"); return Promise.resolve(); },
    resetHard: () => { calls.push("resetHard"); return Promise.resolve(); },
    resetSoft: () => { calls.push("resetSoft"); return Promise.resolve(); },
    createPullRequest: () => { calls.push("createPullRequest"); return Promise.resolve({ url: "" }); },
    isAncestor: () => { calls.push("isAncestor"); return Promise.resolve(false); },
    treesEqual: () => { calls.push("treesEqual"); return Promise.resolve(false); },
    revParse: () => { calls.push("revParse"); return Promise.resolve("abc"); },
    rebaseOnto: () => { calls.push("rebaseOnto"); return Promise.resolve(); },
    merge: async () => {},
    squashMergeNoCommit: () => { calls.push("squashMergeNoCommit"); return Promise.resolve(true); },
    listConflictedFiles: () => { calls.push("listConflictedFiles"); return Promise.resolve([]); },
    resolveConflictsTheirs: () => { calls.push("resolveConflictsTheirs"); return Promise.resolve(); },
    mergeAbort: () => { calls.push("mergeAbort"); return Promise.resolve(); },
  };
}

let tmpDir: string;
let ghHome: string;
let packagesDir: string;
let savedGHHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-app-test-"));
  ghHome = path.join(tmpDir, "guild-hall");
  packagesDir = path.join(tmpDir, "packages");

  await fs.mkdir(ghHome, { recursive: true });
  await fs.mkdir(packagesDir, { recursive: true });

  // Save and override GUILD_HALL_HOME so createProductionApp reads our config
  savedGHHome = process.env.GUILD_HALL_HOME;
  process.env.GUILD_HALL_HOME = ghHome;
});

afterEach(async () => {
  if (savedGHHome !== undefined) {
    process.env.GUILD_HALL_HOME = savedGHHome;
  } else {
    delete process.env.GUILD_HALL_HOME;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createProductionApp worktree verification", () => {
  test("recreates missing integration worktree at startup", async () => {
    // Write config with a project whose integration worktree doesn't exist
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "test-project", path: "/fake/path" }] },
      configPath,
    );

    const mockGit = createMockGitOps();
    await createProductionApp({ packagesDir, gitOps: mockGit });

    // Should have called initClaudeBranch and createWorktree
    expect(mockGit.calls).toContain("initClaudeBranch");
    expect(mockGit.calls).toContain("createWorktree");
  });

  test("skips git calls when integration worktree already exists", async () => {
    // Write config with a project
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "existing-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree directory
    const iPath = integrationWorktreePath(ghHome, "existing-project");
    await fs.mkdir(iPath, { recursive: true });

    const mockGit = createMockGitOps();
    await createProductionApp({ packagesDir, gitOps: mockGit });

    // No git calls should have been made for this project
    expect(mockGit.calls).not.toContain("initClaudeBranch");
    expect(mockGit.calls).not.toContain("createWorktree");
  });

  test("logs warning and continues when worktree recreation fails", async () => {
    // Write config with a project
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "broken-project", path: "/fake/path" }] },
      configPath,
    );

    const mockGit = createMockGitOps();
    mockGit.initClaudeBranch = () => {
      return Promise.reject(new Error("git init failed"));
    };

    // Capture console.warn output
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      // Should not throw, daemon stays up
      const app = await createProductionApp({ packagesDir, gitOps: mockGit });
      expect(app).toBeDefined();

      // Should have logged a warning about the failure
      const worktreeWarning = warnings.find((w) =>
        w.includes("Failed to recreate worktree") && w.includes("broken-project"),
      );
      expect(worktreeWarning).toBeDefined();
    } finally {
      console.warn = originalWarn;
    }
  });
});
