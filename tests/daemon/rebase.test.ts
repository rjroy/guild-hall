/**
 * Tests for daemon startup rebase behavior.
 *
 * Verifies that createProductionApp calls rebase for projects during
 * startup, skips projects with active activities, and handles failures
 * without crashing.
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
      return Promise.resolve("claude");
    },
    listWorktrees: (...args) => {
      calls.push({ method: "listWorktrees", args });
      return Promise.resolve([]);
    },
    initClaudeBranch: (...args) => {
      calls.push({ method: "initClaudeBranch", args });
      return Promise.resolve();
    },
  };
}

let tmpDir: string;
let ghHome: string;
let packagesDir: string;
let savedGHHome: string | undefined;

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
  if (savedGHHome !== undefined) {
    process.env.GUILD_HALL_HOME = savedGHHome;
  } else {
    delete process.env.GUILD_HALL_HOME;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createProductionApp startup rebase", () => {
  test("calls rebase for projects with no active activities", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "test-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree so it doesn't trigger recreation
    const iPath = integrationWorktreePath(ghHome, "test-project");
    await fs.mkdir(iPath, { recursive: true });

    const mockGit = createMockGitOps();
    await createProductionApp({ packagesDir, gitOps: mockGit });

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
    expect(rebaseCalls[0].args).toEqual([iPath, "master"]);
  });

  test("skips rebase for projects with active activities", async () => {
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
    await createProductionApp({ packagesDir, gitOps: mockGit });

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
  });

  test("rebase failure at startup does not crash daemon", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "conflict-project", path: "/fake/path" }] },
      configPath,
    );

    // Pre-create the integration worktree
    const iPath = integrationWorktreePath(ghHome, "conflict-project");
    await fs.mkdir(iPath, { recursive: true });

    const mockGit = createMockGitOps();
    mockGit.rebase = () => Promise.reject(new Error("rebase conflict"));

    // Capture warnings
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const app = await createProductionApp({ packagesDir, gitOps: mockGit });
      expect(app).toBeDefined();

      const rebaseWarning = warnings.find(
        (w) =>
          w.includes("Rebase failed") && w.includes("conflict-project"),
      );
      expect(rebaseWarning).toBeDefined();
    } finally {
      console.warn = originalWarn;
    }
  });

  test("rebases multiple projects at startup", async () => {
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
    await createProductionApp({ packagesDir, gitOps: mockGit });

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(2);
  });
});
