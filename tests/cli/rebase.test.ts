/**
 * Tests for cli/rebase.ts: claude branch maintenance.
 *
 * Uses mock gitOps and temp directories with state files to verify:
 * - rebaseProject calls git.rebase with the integration worktree path
 * - Active activities (commissions/meetings) cause rebase to be skipped
 * - The rebase() CLI function handles single/all projects and errors
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  rebase,
  rebaseProject,
  hasActiveActivities,
} from "@/cli/rebase";
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
  };
}

let tmpDir: string;
let ghHome: string;
let mockGit: MockGitOps;
let savedGHHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-rebase-test-"));
  ghHome = path.join(tmpDir, "guild-hall");
  mockGit = createMockGitOps();

  await fs.mkdir(ghHome, { recursive: true });

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

describe("hasActiveActivities", () => {
  test("returns false when no state directory exists", async () => {
    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(false);
  });

  test("returns true when a dispatched commission exists", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "comm-1.json"),
      JSON.stringify({ projectName: "my-project", status: "dispatched" }),
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(true);
  });

  test("returns true when an in_progress commission exists", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "comm-2.json"),
      JSON.stringify({ projectName: "my-project", status: "in_progress" }),
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(true);
  });

  test("returns true when an open meeting exists", async () => {
    const stateDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "meet-1.json"),
      JSON.stringify({ projectName: "my-project", status: "open" }),
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(true);
  });

  test("returns false when only completed/closed activities exist", async () => {
    const commDir = path.join(ghHome, "state", "commissions");
    const meetDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(commDir, { recursive: true });
    await fs.mkdir(meetDir, { recursive: true });

    await fs.writeFile(
      path.join(commDir, "comm-done.json"),
      JSON.stringify({ projectName: "my-project", status: "completed" }),
    );
    await fs.writeFile(
      path.join(meetDir, "meet-done.json"),
      JSON.stringify({ projectName: "my-project", status: "closed" }),
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(false);
  });

  test("ignores activities for other projects", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "comm-other.json"),
      JSON.stringify({ projectName: "other-project", status: "dispatched" }),
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(false);
  });

  test("handles malformed JSON state files gracefully", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "bad.json"),
      "not valid json{{{",
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(false);
  });

  test("ignores non-json files in state directory", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "readme.txt"),
      "not a state file",
    );

    const result = await hasActiveActivities(ghHome, "my-project");
    expect(result).toBe(false);
  });
});

describe("rebaseProject", () => {
  test("calls git.rebase with integration worktree path and 'master'", async () => {
    const result = await rebaseProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
    );

    expect(result).toBe(true);
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);

    const expectedPath = integrationWorktreePath(ghHome, "my-project");
    expect(rebaseCalls[0].args).toEqual([expectedPath, "master"]);
  });

  test("skips when active commission exists", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "active.json"),
      JSON.stringify({ projectName: "busy-project", status: "dispatched" }),
    );

    const result = await rebaseProject(
      "/fake/project",
      "busy-project",
      ghHome,
      mockGit,
    );

    expect(result).toBe(false);
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
  });

  test("skips when active meeting exists", async () => {
    const stateDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "open-meeting.json"),
      JSON.stringify({ projectName: "busy-project", status: "open" }),
    );

    const result = await rebaseProject(
      "/fake/project",
      "busy-project",
      ghHome,
      mockGit,
    );

    expect(result).toBe(false);
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
  });

  test("proceeds when only closed/completed activities exist", async () => {
    const commDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(commDir, { recursive: true });
    await fs.writeFile(
      path.join(commDir, "done.json"),
      JSON.stringify({ projectName: "my-project", status: "completed" }),
    );

    const result = await rebaseProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
    );

    expect(result).toBe(true);
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
  });

  test("propagates rebase errors to caller", async () => {
    const failingGit = createMockGitOps();
    failingGit.rebase = () => Promise.reject(new Error("conflict detected"));

    await expect(
      rebaseProject("/fake/project", "my-project", ghHome, failingGit),
    ).rejects.toThrow("conflict detected");
  });
});

describe("rebase (CLI entry point)", () => {
  test("rebases only the specified project", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      {
        projects: [
          { name: "project-a", path: "/fake/a" },
          { name: "project-b", path: "/fake/b" },
        ],
      },
      configPath,
    );

    await rebase("project-a", ghHome, mockGit);

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);

    const expectedPath = integrationWorktreePath(ghHome, "project-a");
    expect(rebaseCalls[0].args[0]).toBe(expectedPath);
  });

  test("rebases all projects when no name given", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      {
        projects: [
          { name: "alpha", path: "/fake/alpha" },
          { name: "beta", path: "/fake/beta" },
          { name: "gamma", path: "/fake/gamma" },
        ],
      },
      configPath,
    );

    await rebase(undefined, ghHome, mockGit);

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(3);
  });

  test("continues to next project when one fails", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      {
        projects: [
          { name: "fails", path: "/fake/fails" },
          { name: "succeeds", path: "/fake/succeeds" },
        ],
      },
      configPath,
    );

    let callCount = 0;
    mockGit.rebase = (...args) => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("rebase conflict"));
      }
      mockGit.calls.push({ method: "rebase", args });
      return Promise.resolve();
    };

    // Should not throw even though first project fails
    await rebase(undefined, ghHome, mockGit);

    // Second project should still have been rebased
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
    const expectedPath = integrationWorktreePath(ghHome, "succeeds");
    expect(rebaseCalls[0].args[0]).toBe(expectedPath);
  });

  test("throws for unknown project name", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig(
      { projects: [{ name: "real", path: "/fake/real" }] },
      configPath,
    );

    await expect(rebase("nonexistent", ghHome, mockGit)).rejects.toThrow(
      'Project "nonexistent" not found in config',
    );
  });

  test("works with empty project list", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    // Should complete without error
    await rebase(undefined, ghHome, mockGit);

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
  });
});
