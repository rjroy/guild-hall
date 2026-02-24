import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { register } from "@/cli/register";
import { readConfig } from "@/lib/config";
import { getConfigPath, integrationWorktreePath, activityWorktreeRoot } from "@/lib/paths";
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
let fakeHome: string;
let projectDir: string;
let mockGit: ReturnType<typeof createMockGitOps>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-register-test-"));
  fakeHome = path.join(tmpDir, "home");
  projectDir = path.join(tmpDir, "project");
  mockGit = createMockGitOps();

  // Create a valid project directory with .git/ and .lore/
  await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("register", () => {
  test("registers a valid project", async () => {
    await register("my-project", projectDir, fakeHome, mockGit);

    const config = await readConfig(getConfigPath(fakeHome));
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("my-project");
    expect(config.projects[0].path).toBe(projectDir);
  });

  test("creates config directory and file when they don't exist", async () => {
    await register("new-project", projectDir, fakeHome, mockGit);

    const configFile = getConfigPath(fakeHome);
    const stat = await fs.stat(configFile);
    expect(stat.isFile()).toBe(true);
  });

  test("appends to existing config", async () => {
    // Register first project
    await register("project-a", projectDir, fakeHome, mockGit);

    // Create a second valid project directory
    const projectDir2 = path.join(tmpDir, "project2");
    await fs.mkdir(path.join(projectDir2, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir2, ".lore"), { recursive: true });

    await register("project-b", projectDir2, fakeHome, mockGit);

    const config = await readConfig(getConfigPath(fakeHome));
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].name).toBe("project-a");
    expect(config.projects[1].name).toBe("project-b");
  });

  test("rejects duplicate project name", async () => {
    await register("my-project", projectDir, fakeHome, mockGit);

    await expect(
      register("my-project", projectDir, fakeHome, mockGit)
    ).rejects.toThrow("already registered");
  });

  test("rejects path that does not exist", async () => {
    const bogus = path.join(tmpDir, "nonexistent");
    await expect(register("bad", bogus, fakeHome)).rejects.toThrow(
      "does not exist"
    );
  });

  test("rejects path missing .git/", async () => {
    const noGit = path.join(tmpDir, "no-git");
    await fs.mkdir(path.join(noGit, ".lore"), { recursive: true });

    await expect(register("bad", noGit, fakeHome)).rejects.toThrow(
      "does not contain a .git/ directory"
    );
  });

  test("rejects path missing .lore/", async () => {
    const noLore = path.join(tmpDir, "no-lore");
    await fs.mkdir(path.join(noLore, ".git"), { recursive: true });

    await expect(register("bad", noLore, fakeHome)).rejects.toThrow(
      "does not contain a .lore/ directory"
    );
  });

  test("rejects path that is a file, not a directory", async () => {
    const filePath = path.join(tmpDir, "a-file");
    await fs.writeFile(filePath, "not a directory", "utf-8");

    await expect(register("bad", filePath, fakeHome)).rejects.toThrow(
      "is not a directory"
    );
  });

  test("resolves relative paths", async () => {
    // Create a project in cwd-relative location
    const relativeDir = path.relative(process.cwd(), projectDir);
    await register("relative", relativeDir, fakeHome, mockGit);

    const config = await readConfig(getConfigPath(fakeHome));
    // Stored path should be absolute
    expect(path.isAbsolute(config.projects[0].path)).toBe(true);
    expect(config.projects[0].path).toBe(projectDir);
  });
});

describe("register git integration", () => {
  test("calls detectDefaultBranch, initClaudeBranch, and createWorktree", async () => {
    await register("git-project", projectDir, fakeHome, mockGit);

    expect(mockGit.calls).toContain("detectDefaultBranch");
    expect(mockGit.calls).toContain("initClaudeBranch");
    expect(mockGit.calls).toContain("createWorktree");
    // detectDefaultBranch should come before initClaudeBranch
    const detectIdx = mockGit.calls.indexOf("detectDefaultBranch");
    const initIdx = mockGit.calls.indexOf("initClaudeBranch");
    const worktreeIdx = mockGit.calls.indexOf("createWorktree");
    expect(detectIdx).toBeLessThan(initIdx);
    expect(initIdx).toBeLessThan(worktreeIdx);
  });

  test("stores detected defaultBranch in config", async () => {
    await register("branch-project", projectDir, fakeHome, mockGit);

    const config = await readConfig(getConfigPath(fakeHome));
    expect(config.projects[0].defaultBranch).toBe("main");
  });

  test("creates integration worktree and activity worktree directories", async () => {
    await register("dir-project", projectDir, fakeHome, mockGit);

    const ghHome = path.join(fakeHome, ".guild-hall");
    const integrationParent = path.dirname(integrationWorktreePath(ghHome, "dir-project"));
    const worktreeRoot = activityWorktreeRoot(ghHome, "dir-project");

    // Both directories should exist on disk
    const integrationStat = await fs.stat(integrationParent);
    expect(integrationStat.isDirectory()).toBe(true);

    const worktreeStat = await fs.stat(worktreeRoot);
    expect(worktreeStat.isDirectory()).toBe(true);
  });

  test("git failure prevents config write", async () => {
    const failingGit = createMockGitOps();
    failingGit.initClaudeBranch = () => {
      return Promise.reject(new Error("git branch creation failed"));
    };

    await expect(
      register("fail-project", projectDir, fakeHome, failingGit)
    ).rejects.toThrow("git branch creation failed");

    // Config should not have been written
    const configPath = getConfigPath(fakeHome);
    try {
      const config = await readConfig(configPath);
      // If the file exists (from directory creation), it should have no projects
      expect(config.projects).toHaveLength(0);
    } catch {
      // Config file doesn't exist at all, which is also correct
    }
  });
});
