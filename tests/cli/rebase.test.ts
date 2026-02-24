/**
 * Tests for cli/rebase.ts: claude branch maintenance and post-merge sync.
 *
 * Uses mock gitOps and temp directories with state files to verify:
 * - rebaseProject calls git.rebase with the integration worktree path
 * - Active activities (commissions/meetings) cause rebase to be skipped
 * - The rebase() CLI function handles single/all projects and errors
 * - syncProject detects merged PRs (via marker), resets or rebases
 * - syncProject skips when activities are active
 * - syncProject is a noop when claude/main is already current
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  rebase,
  rebaseProject,
  syncProject,
  readPrMarker,
  removePrMarker,
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
    rebaseOnto: (...args) => {
      calls.push({ method: "rebaseOnto", args });
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
  test("calls git.rebase with integration worktree path and provided defaultBranch", async () => {
    const result = await rebaseProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result).toBe(true);
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);

    const expectedPath = integrationWorktreePath(ghHome, "my-project");
    expect(rebaseCalls[0].args).toEqual([expectedPath, "main"]);
  });

  test("detects default branch when not provided", async () => {
    const result = await rebaseProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
    );

    expect(result).toBe(true);
    // Should call detectDefaultBranch since no defaultBranch was passed
    const detectCalls = mockGit.calls.filter((c) => c.method === "detectDefaultBranch");
    expect(detectCalls).toHaveLength(1);
    expect(detectCalls[0].args).toEqual(["/fake/project"]);

    // Rebase should use the detected branch ("main" from mock)
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
    const expectedPath = integrationWorktreePath(ghHome, "my-project");
    expect(rebaseCalls[0].args).toEqual([expectedPath, "main"]);
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

// -- PR marker helpers --

describe("readPrMarker / removePrMarker", () => {
  test("readPrMarker returns null when no marker exists", async () => {
    const result = await readPrMarker(ghHome, "my-project");
    expect(result).toBeNull();
  });

  test("readPrMarker returns marker data when file exists", async () => {
    const markerDir = path.join(ghHome, "state", "pr-pending");
    await fs.mkdir(markerDir, { recursive: true });
    await fs.writeFile(
      path.join(markerDir, "my-project.json"),
      JSON.stringify({
        claudeMainTip: "abc123",
        createdAt: "2026-02-23T12:00:00.000Z",
        prUrl: "https://github.com/test/repo/pull/1",
      }),
    );

    const result = await readPrMarker(ghHome, "my-project");
    expect(result).not.toBeNull();
    expect(result!.claudeMainTip).toBe("abc123");
    expect(result!.prUrl).toBe("https://github.com/test/repo/pull/1");
  });

  test("removePrMarker deletes the marker file", async () => {
    const markerDir = path.join(ghHome, "state", "pr-pending");
    await fs.mkdir(markerDir, { recursive: true });
    const markerPath = path.join(markerDir, "my-project.json");
    await fs.writeFile(markerPath, "{}");

    await removePrMarker(ghHome, "my-project");

    // File should be gone
    await expect(fs.access(markerPath)).rejects.toThrow();
  });

  test("removePrMarker is no-op when file does not exist", async () => {
    // Should not throw
    await removePrMarker(ghHome, "nonexistent");
  });
});

// -- syncProject --

describe("syncProject", () => {
  test("skips when active activities exist", async () => {
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "active.json"),
      JSON.stringify({ projectName: "my-project", status: "in_progress" }),
    );

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("skip");
    expect(result.reason).toContain("active activities");

    // fetch should still be called (happens before activity check)
    const fetchCalls = mockGit.calls.filter((c) => c.method === "fetch");
    expect(fetchCalls).toHaveLength(1);

    // No rebase or reset should be called
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(rebaseCalls).toHaveLength(0);
    expect(resetCalls).toHaveLength(0);
  });

  test("noop when claude/main is already at the same commit as origin", async () => {
    const sameSha = "abc111abc222abc333abc444abc555abc666abc77";

    // claude/main is ancestor of origin/main (they're equal)
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(true);
    };
    // Both revParse calls return the same SHA
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      return Promise.resolve(sameSha);
    };

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("noop");
    expect(result.reason).toBe("already current");
  });

  test("resets when PR marker matches claude/main tip", async () => {
    const claudeTip = "aaa111bbb222ccc333ddd444eee555fff666aaa1";

    // Write PR marker with matching tip
    const markerDir = path.join(ghHome, "state", "pr-pending");
    await fs.mkdir(markerDir, { recursive: true });
    await fs.writeFile(
      path.join(markerDir, "my-project.json"),
      JSON.stringify({
        claudeMainTip: claudeTip,
        createdAt: "2026-02-23T12:00:00.000Z",
        prUrl: "https://github.com/test/repo/pull/1",
      }),
    );

    // claude/main is ancestor of origin/main
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(true);
    };
    // revParse returns different SHAs for claude/main vs origin/main
    let revParseCallCount = 0;
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      revParseCallCount++;
      // First call is for claude/main, second for origin/main
      return Promise.resolve(
        revParseCallCount === 1 ? claudeTip : "bbb222ccc333ddd444eee555fff666aaa1bbb222",
      );
    };

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("reset");
    expect(result.reason).toBe("PR marker matched");

    // resetHard should have been called
    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(resetCalls).toHaveLength(1);

    // PR marker should be removed
    const marker = await readPrMarker(ghHome, "my-project");
    expect(marker).toBeNull();
  });

  test("resets via tree comparison when marker is missing but trees are equal", async () => {
    // claude/main is ancestor of origin/main
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(true);
    };
    // Different SHAs (not noop)
    let revParseCallCount = 0;
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      revParseCallCount++;
      return Promise.resolve(
        revParseCallCount === 1
          ? "aaa111aaa111aaa111aaa111aaa111aaa111aaa1"
          : "bbb222bbb222bbb222bbb222bbb222bbb222bbb2",
      );
    };
    // No PR marker (it's missing)
    // Trees are equal
    mockGit.treesEqual = (...args) => {
      mockGit.calls.push({ method: "treesEqual", args });
      return Promise.resolve(true);
    };

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("reset");
    expect(result.reason).toContain("trees equal");
    expect(result.reason).toContain("marker missing");

    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(resetCalls).toHaveLength(1);
  });

  test("rebases when master is ahead with different content", async () => {
    // claude/main is ancestor of origin/main
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(true);
    };
    // Different SHAs
    let revParseCallCount = 0;
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      revParseCallCount++;
      return Promise.resolve(
        revParseCallCount === 1
          ? "aaa111aaa111aaa111aaa111aaa111aaa111aaa1"
          : "bbb222bbb222bbb222bbb222bbb222bbb222bbb2",
      );
    };
    // Trees are different
    mockGit.treesEqual = (...args) => {
      mockGit.calls.push({ method: "treesEqual", args });
      return Promise.resolve(false);
    };

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("rebase");
    expect(result.reason).toContain("different content");

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
  });

  test("noop when claude/main is ahead of origin", async () => {
    // First isAncestor call: claude is NOT ancestor of origin (false)
    // Second isAncestor call: origin IS ancestor of claude (true)
    let isAncestorCallCount = 0;
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      isAncestorCallCount++;
      return Promise.resolve(isAncestorCallCount === 2);
    };

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("noop");
    expect(result.reason).toContain("ahead");
  });

  test("falls back to local rebase when fetch fails (no remote)", async () => {
    mockGit.fetch = () => Promise.reject(new Error("fatal: no remote"));

    const result = await syncProject(
      "/fake/project",
      "my-project",
      ghHome,
      mockGit,
      "main",
    );

    expect(result.action).toBe("rebase");
    expect(result.reason).toContain("no remote");

    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(1);
  });

  test("diverged: resets when PR marker matches (squash-merge scenario)", async () => {
    // After squash-merge, neither branch is ancestor of the other.
    // Both isAncestor calls return false.
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(false);
    };
    // revParse returns the claude tip that matches the marker
    const claudeTip = "aaa111bbb222ccc333ddd444eee555fff666aaa1";
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      return Promise.resolve(claudeTip);
    };

    // Write PR marker with matching tip
    const markerDir = path.join(ghHome, "state", "pr-pending");
    await fs.mkdir(markerDir, { recursive: true });
    await fs.writeFile(
      path.join(markerDir, "my-project.json"),
      JSON.stringify({ claudeMainTip: claudeTip, prUrl: "https://github.com/test/pr/1", createdAt: new Date().toISOString() }),
    );

    const result = await syncProject("/fake/project", "my-project", ghHome, mockGit, "main");

    expect(result.action).toBe("reset");
    expect(result.reason).toContain("marker");
    expect(result.reason).toContain("diverged");
    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(resetCalls).toHaveLength(1);
    // Marker should be removed
    const markerAfter = await readPrMarker(ghHome, "my-project");
    expect(markerAfter).toBeNull();
  });

  test("diverged: rebaseOnto when marker exists but tip advanced (post-PR meeting close)", async () => {
    // claude/main advanced after PR was created (e.g., meeting closed)
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(false);
    };
    const markerTip = "aaa111bbb222ccc333ddd444eee555fff666aaa1";
    const currentTip = "fff999eee888ddd777ccc666bbb555aaa444333";
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      return Promise.resolve(currentTip); // Different from marker
    };
    mockGit.rebaseOnto = (...args) => {
      mockGit.calls.push({ method: "rebaseOnto", args });
      return Promise.resolve();
    };

    // Write PR marker with the OLD tip
    const markerDir = path.join(ghHome, "state", "pr-pending");
    await fs.mkdir(markerDir, { recursive: true });
    await fs.writeFile(
      path.join(markerDir, "my-project.json"),
      JSON.stringify({ claudeMainTip: markerTip, prUrl: "https://github.com/test/pr/1", createdAt: new Date().toISOString() }),
    );

    const result = await syncProject("/fake/project", "my-project", ghHome, mockGit, "main");

    expect(result.action).toBe("rebase");
    expect(result.reason).toContain("rebaseOnto");
    const rebaseOntoCalls = mockGit.calls.filter((c) => c.method === "rebaseOnto");
    expect(rebaseOntoCalls).toHaveLength(1);
    // Should rebase --onto origin/main <marker-tip>
    expect(rebaseOntoCalls[0].args[1]).toBe("origin/main");
    expect(rebaseOntoCalls[0].args[2]).toBe(markerTip);
    // Marker should be removed after successful rebase
    const markerAfter = await readPrMarker(ghHome, "my-project");
    expect(markerAfter).toBeNull();
  });

  test("diverged: resets when trees are equal (squash-merge, no marker)", async () => {
    // After squash-merge, neither branch is ancestor of the other.
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(false);
    };
    mockGit.revParse = (...args) => {
      mockGit.calls.push({ method: "revParse", args });
      return Promise.resolve("some-sha");
    };
    mockGit.treesEqual = (...args) => {
      mockGit.calls.push({ method: "treesEqual", args });
      return Promise.resolve(true);
    };

    const result = await syncProject("/fake/project", "my-project", ghHome, mockGit, "main");

    expect(result.action).toBe("reset");
    expect(result.reason).toContain("trees equal");
    expect(result.reason).toContain("diverged");
    const resetCalls = mockGit.calls.filter((c) => c.method === "resetHard");
    expect(resetCalls).toHaveLength(1);
  });

  test("diverged: merge + compact when no marker and trees differ (post-squash-merge fallback)", async () => {
    // Both isAncestor calls return false (diverged after squash-merge)
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      return Promise.resolve(false);
    };
    // Trees are different (claude/main has post-PR commits)
    mockGit.treesEqual = (...args) => {
      mockGit.calls.push({ method: "treesEqual", args });
      return Promise.resolve(false);
    };
    // commitAll returns true (there are staged changes after soft reset)
    mockGit.commitAll = (...args) => {
      mockGit.calls.push({ method: "commitAll", args });
      return Promise.resolve(true);
    };
    // No PR marker file exists

    const result = await syncProject("/fake/project", "my-project", ghHome, mockGit, "main");

    expect(result.action).toBe("merge");
    expect(result.reason).toContain("compacted");
    // Merge, then soft reset, then commit
    const mergeCalls = mockGit.calls.filter((c) => c.method === "merge");
    expect(mergeCalls).toHaveLength(1);
    const resetSoftCalls = mockGit.calls.filter((c) => c.method === "resetSoft");
    expect(resetSoftCalls).toHaveLength(1);
    const commitCalls = mockGit.calls.filter((c) => c.method === "commitAll");
    expect(commitCalls).toHaveLength(1);
    // Should not have attempted rebase
    const rebaseCalls = mockGit.calls.filter((c) => c.method === "rebase");
    expect(rebaseCalls).toHaveLength(0);
  });

  test("calls fetch with origin", async () => {
    // Make sync a noop to focus on fetch call
    mockGit.isAncestor = () => Promise.resolve(false);
    // Both calls return false, so it tries merge in diverged case
    // Let's make it: origin is ancestor of claude (noop)
    let isAncestorCallCount = 0;
    mockGit.isAncestor = (...args) => {
      mockGit.calls.push({ method: "isAncestor", args });
      isAncestorCallCount++;
      return Promise.resolve(isAncestorCallCount === 2);
    };

    await syncProject("/fake/project", "my-project", ghHome, mockGit, "main");

    const fetchCalls = mockGit.calls.filter((c) => c.method === "fetch");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].args).toEqual(["/fake/project", "origin"]);
  });
});
