import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { CommissionId } from "@/daemon/types";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { GitOps } from "@/daemon/lib/git";
import type { ManagerToolboxDeps } from "@/daemon/services/manager/toolbox";
import type { EventBus, SystemEvent } from "@/daemon/services/event-bus";
import type { ProjectConfig } from "@/lib/types";
import { makeSyncProjectHandler } from "@/daemon/services/manager/toolbox";
import { clearProjectLocks } from "@/daemon/lib/project-lock";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-sync-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  await fs.mkdir(path.join(guildHallHome, "projects", "test-project", ".lore"), { recursive: true });
});

afterEach(async () => {
  clearProjectLocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Mock factories --

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

function makeMockCommissionSession(): CommissionSessionForRoutes {
  return {
    async createCommission() {
      return { commissionId: "mock" };
    },
    async dispatchCommission(cid: CommissionId) {
      return { status: "accepted" as const };
    },
    async updateCommission() {},
    async cancelCommission() {},
    async redispatchCommission() {
      return { status: "accepted" as const };
    },
    async addUserNote() {},
    async checkDependencyTransitions() {},
    async recoverCommissions() { return 0; },
    getActiveCommissions() { return 0; },
    shutdown() {},
  };
}

function makeMockGitOps(overrides?: Partial<GitOps>): GitOps {
  return {
    async createBranch() {},
    async branchExists() { return false; },
    async deleteBranch() {},
    async createWorktree() {},
    async removeWorktree() {},
    async configureSparseCheckout() {},
    async commitAll() { return false; },
    async squashMerge() {},
    async hasUncommittedChanges() { return false; },
    async rebase() {},
    async currentBranch() { return "claude/main"; },
    async listWorktrees() { return []; },
    async initClaudeBranch() {},
    async detectDefaultBranch() { return "main"; },
    async fetch() {},
    async push() {},
    async resetHard() {},
    async resetSoft() {},
    async createPullRequest() { return { url: "https://github.com/test/repo/pull/42" }; },
    async isAncestor() { return false; },
    async treesEqual() { return false; },
    async revParse() { return "abc123def456789012345678901234567890abcd"; },
    async rebaseOnto() {},
    async merge() {},
    async squashMergeNoCommit() { return true; },
    async listConflictedFiles() { return []; },
    async resolveConflictsTheirs() {},
    async mergeAbort() {},
    ...overrides,
  };
}

function makeMockEventBus(): EventBus {
  return {
    emit(event: SystemEvent) {},
    subscribe() {
      return () => {};
    },
  };
}

/* eslint-enable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

const testProjectConfig: ProjectConfig = {
  name: "test-project",
  path: "/fake/project/path",
  defaultBranch: "main",
};

function makeDeps(
  overrides?: Partial<ManagerToolboxDeps>,
): ManagerToolboxDeps {
  return {
    projectName: "test-project",
    guildHallHome,
    commissionSession: makeMockCommissionSession(),
    eventBus: makeMockEventBus(),
    gitOps: makeMockGitOps(),
    getProjectConfig(name: string) {
      if (name === "test-project") return Promise.resolve(testProjectConfig);
      return Promise.resolve(undefined);
    },
    ...overrides,
  };
}

/**
 * Writes a PR marker file that syncProject uses to detect merged PRs.
 */
async function writePrMarker(
  ghHome: string,
  projectName: string,
  claudeMainTip: string,
): Promise<void> {
  const markerDir = path.join(ghHome, "state", "pr-pending");
  await fs.mkdir(markerDir, { recursive: true });
  await fs.writeFile(
    path.join(markerDir, `${projectName}.json`),
    JSON.stringify({
      claudeMainTip,
      createdAt: new Date().toISOString(),
      prUrl: "https://github.com/test/repo/pull/42",
    }),
    "utf-8",
  );
}

describe("sync_project", () => {
  test("returns error for unregistered project", async () => {
    const deps = makeDeps();
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nonexistent");
    expect(result.content[0].text).toContain("not registered");
  });

  test("detects merged PR and returns reset summary", async () => {
    const claudeTip = "aaa111aaa111aaa111aaa111aaa111aaa111aaa1";
    const remoteTip = "bbb222bbb222bbb222bbb222bbb222bbb222bbb2";

    // Write a PR marker that matches the claude tip
    await writePrMarker(guildHallHome, "test-project", claudeTip);

    // Configure git mocks so syncProject takes the "reset via marker" path:
    // fetch succeeds, no active activities, claude is ancestor of remote,
    // claude tip !== remote tip, marker matches claude tip
    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
      isAncestor(_repoPath: string, potentialAncestor: string) {
        // claude/main is ancestor of origin/main
        return Promise.resolve(potentialAncestor === "claude/main");
      },
      revParse(_repoPath: string, ref: string) {
        if (ref === "claude/main") return Promise.resolve(claudeTip);
        if (ref === "origin/main") return Promise.resolve(remoteTip);
        return Promise.resolve("unknown");
      },
      resetHard() { return Promise.resolve(); },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      action?: string;
      summary?: string;
    };
    expect(parsed.action).toBe("reset");
    expect(parsed.summary).toContain("Merged PR detected");
    expect(parsed.summary).toContain("test-project");

    // Verify the PR marker was removed
    const markerPath = path.join(
      guildHallHome, "state", "pr-pending", "test-project.json",
    );
    await expect(fs.access(markerPath)).rejects.toThrow();
  });

  test("returns noop when already current", async () => {
    const sameTip = "ccc333ccc333ccc333ccc333ccc333ccc333ccc3";

    // Both refs resolve to the same SHA
    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
      isAncestor(_repoPath: string, potentialAncestor: string) {
        return Promise.resolve(potentialAncestor === "claude/main");
      },
      revParse() {
        return Promise.resolve(sameTip);
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      action?: string;
      summary?: string;
    };
    expect(parsed.action).toBe("noop");
    expect(parsed.summary).toContain("No sync needed");
  });

  test("returns noop when claude is ahead", async () => {
    // claude/main is NOT ancestor of origin/main, but origin/main IS ancestor of claude/main
    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
      isAncestor(_repoPath: string, potentialAncestor: string) {
        // Only "origin/main is ancestor of claude/main" is true
        return Promise.resolve(potentialAncestor === "origin/main");
      },
      revParse(_repoPath: string, ref: string) {
        if (ref === "claude/main") return Promise.resolve("ahead111");
        return Promise.resolve("behind222");
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      action?: string;
      summary?: string;
    };
    expect(parsed.action).toBe("noop");
    expect(parsed.summary).toContain("claude/main ahead");
  });

  test("skips when active activities exist", async () => {
    // Write an active commission state file
    const stateDir = path.join(guildHallHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-active.json"),
      JSON.stringify({ projectName: "test-project", status: "in_progress" }),
    );

    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      action?: string;
      summary?: string;
    };
    expect(parsed.action).toBe("skip");
    expect(parsed.summary).toContain("active commissions or meetings");
  });

  test("rebases when default branch advanced independently", async () => {
    const claudeTip = "ddd444ddd444ddd444ddd444ddd444ddd444ddd4";
    const remoteTip = "eee555eee555eee555eee555eee555eee555eee5";

    // No PR marker, no tree equality, claude is behind remote
    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
      isAncestor(_repoPath: string, potentialAncestor: string) {
        return Promise.resolve(potentialAncestor === "claude/main");
      },
      revParse(_repoPath: string, ref: string) {
        if (ref === "claude/main") return Promise.resolve(claudeTip);
        return Promise.resolve(remoteTip);
      },
      treesEqual() { return Promise.resolve(false); },
      rebase() { return Promise.resolve(); },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      action?: string;
      summary?: string;
    };
    expect(parsed.action).toBe("rebase");
    expect(parsed.summary).toContain("rebased");
  });

  test("returns error when syncProject throws", async () => {
    const mockGit = makeMockGitOps({
      fetch() { return Promise.resolve(); },
      isAncestor() { return Promise.resolve(false); },
      treesEqual() { return Promise.resolve(false); },
      revParse() { return Promise.resolve("abc123"); },
      merge() {
        return Promise.reject(new Error("Merge conflict: manual resolution required"));
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("diverged");
  });

  test("uses getProjectConfig when provided instead of readConfig", async () => {
    let getProjectConfigCalled = false;

    const deps = makeDeps({
      getProjectConfig(name: string) {
        getProjectConfigCalled = true;
        if (name === "custom-project") {
          return Promise.resolve({
            name: "custom-project",
            path: "/custom/path",
            defaultBranch: "develop",
          } as ProjectConfig);
        }
        return Promise.resolve(undefined);
      },
      gitOps: makeMockGitOps({
        fetch() { return Promise.resolve(); },
        isAncestor(_repoPath: string, potentialAncestor: string) {
          return Promise.resolve(potentialAncestor === "claude/main");
        },
        revParse() { return Promise.resolve("same-tip"); },
      }),
    });

    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "custom-project" });

    expect(getProjectConfigCalled).toBe(true);
    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as { action?: string };
    expect(parsed.action).toBe("noop");
  });
});
