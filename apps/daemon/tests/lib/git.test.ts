import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { cleanGitEnv, createGitOps } from "@/apps/daemon/lib/git";

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-git-test-"));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Runs a git command directly (bypassing GitOps) for test setup and assertions.
 * Uses cleanGitEnv to avoid hook environment contamination.
 */
async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: cleanGitEnv(),
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`git ${args[0]} failed: ${stderr}`);
  return stdout.trim();
}

/**
 * Initializes a temporary git repo with an initial commit so HEAD exists.
 * Returns the repo path.
 */
async function initTestRepo(): Promise<string> {
  const repoPath = makeTmpDir();
  await git(repoPath, ["init"]);
  await git(repoPath, ["config", "user.email", "test@test.com"]);
  await git(repoPath, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "# Test Repo\n");
  await git(repoPath, ["add", "-A"]);
  await git(repoPath, ["commit", "-m", "Initial commit"]);
  return repoPath;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

const ops = createGitOps();

describe("cleanGitEnv", () => {
  test("strips GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE", () => {
    const original = process.env.GIT_DIR;
    const originalWt = process.env.GIT_WORK_TREE;
    const originalIdx = process.env.GIT_INDEX_FILE;

    try {
      process.env.GIT_DIR = "/fake/git/dir";
      process.env.GIT_WORK_TREE = "/fake/work/tree";
      process.env.GIT_INDEX_FILE = "/fake/index";

      const env = cleanGitEnv();

      expect(env.GIT_DIR).toBeUndefined();
      expect(env.GIT_WORK_TREE).toBeUndefined();
      expect(env.GIT_INDEX_FILE).toBeUndefined();
      // Other env vars should still be present (use PATH, which exists on all platforms)
      expect(env.PATH ?? env.Path).toBeDefined();
    } finally {
      // Restore original values
      if (original === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = original;
      if (originalWt === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = originalWt;
      if (originalIdx === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = originalIdx;
    }
  });

  test("isolation: git operation targets cwd, not GIT_DIR", async () => {
    const repoPath = await initTestRepo();
    const original = process.env.GIT_DIR;

    try {
      // Point GIT_DIR at a non-existent path. If cleanGitEnv fails to strip
      // it, the git operation would fail or target the wrong repo.
      process.env.GIT_DIR = "/tmp/this-does-not-exist";

      const branch = await ops.currentBranch(repoPath);
      // Should succeed and return the branch from our test repo, not error
      // about the fake GIT_DIR
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    } finally {
      if (original === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = original;
    }
  });
});

describe("createBranch", () => {
  test("creates branch from ref, visible in branch list", async () => {
    const repoPath = await initTestRepo();

    await ops.createBranch(repoPath, "feature-x", "HEAD");

    const branches = await git(repoPath, ["branch", "--list"]);
    expect(branches).toContain("feature-x");
  });
});

describe("branchExists", () => {
  test("returns true for existing branch", async () => {
    const repoPath = await initTestRepo();
    await git(repoPath, ["branch", "existing-branch", "HEAD"]);

    const exists = await ops.branchExists(repoPath, "existing-branch");
    expect(exists).toBe(true);
  });

  test("returns false for missing branch", async () => {
    const repoPath = await initTestRepo();

    const exists = await ops.branchExists(repoPath, "no-such-branch");
    expect(exists).toBe(false);
  });
});

describe("deleteBranch", () => {
  test("removes branch from list", async () => {
    const repoPath = await initTestRepo();
    await git(repoPath, ["branch", "to-delete", "HEAD"]);

    await ops.deleteBranch(repoPath, "to-delete");

    const branches = await git(repoPath, ["branch", "--list"]);
    expect(branches).not.toContain("to-delete");
  });
});

describe("createWorktree", () => {
  test("creates directory with correct branch checked out", async () => {
    const repoPath = await initTestRepo();
    const worktreePath = path.join(makeTmpDir(), "wt");
    await git(repoPath, ["branch", "wt-branch", "HEAD"]);

    await ops.createWorktree(repoPath, worktreePath, "wt-branch");

    expect(fs.existsSync(worktreePath)).toBe(true);
    const branch = await git(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(branch).toBe("wt-branch");
  });
});

describe("removeWorktree", () => {
  test("removes directory and worktree from list", async () => {
    const repoPath = await initTestRepo();
    const worktreePath = path.join(makeTmpDir(), "wt-remove");
    await git(repoPath, ["branch", "remove-branch", "HEAD"]);
    await git(repoPath, ["worktree", "add", worktreePath, "remove-branch"]);

    await ops.removeWorktree(repoPath, worktreePath);

    expect(fs.existsSync(worktreePath)).toBe(false);
    const list = await git(repoPath, ["worktree", "list", "--porcelain"]);
    expect(list).not.toContain(worktreePath);
  });
});

describe("configureSparseCheckout", () => {
  test("limits visible files to sparse paths", async () => {
    const repoPath = await initTestRepo();

    // Create directory structure with files in and outside sparse paths
    fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });
    fs.mkdirSync(path.join(repoPath, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repoPath, "src", "main.ts"), "export {};\n");
    fs.writeFileSync(path.join(repoPath, "docs", "guide.md"), "# Guide\n");
    fs.writeFileSync(path.join(repoPath, "extra.txt"), "extra\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Add files"]);

    // Create worktree
    const worktreePath = path.join(makeTmpDir(), "sparse-wt");
    await git(repoPath, ["branch", "sparse-branch", "HEAD"]);
    await git(repoPath, ["worktree", "add", worktreePath, "sparse-branch"]);

    // Configure sparse checkout to only include src/
    await ops.configureSparseCheckout(worktreePath, ["src"]);

    // src/ should be visible
    expect(fs.existsSync(path.join(worktreePath, "src", "main.ts"))).toBe(true);
    // docs/ directory should not be in the working tree
    expect(fs.existsSync(path.join(worktreePath, "docs", "guide.md"))).toBe(false);
    // Cone mode includes all root-level files (README.md, extra.txt), only
    // excluding files inside non-specified directories
    expect(fs.existsSync(path.join(worktreePath, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(worktreePath, "extra.txt"))).toBe(true);
  });
});

describe("hasCommitsBeyond", () => {
  test("returns true when branch has commits beyond base", async () => {
    const repoPath = await initTestRepo();

    // Create a branch from HEAD, then add a commit on it
    await git(repoPath, ["branch", "feature-branch", "HEAD"]);
    await git(repoPath, ["checkout", "feature-branch"]);
    fs.writeFileSync(path.join(repoPath, "feature.txt"), "feature work\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Feature commit"]);

    await git(repoPath, ["checkout", "master"]);

    const result = await ops.hasCommitsBeyond(repoPath, "master", "feature-branch");
    expect(result).toBe(true);
  });

  test("returns false when branch has no commits beyond base", async () => {
    const repoPath = await initTestRepo();

    // Create a branch at the same commit as master (no divergence)
    await git(repoPath, ["branch", "empty-branch", "HEAD"]);

    const result = await ops.hasCommitsBeyond(repoPath, "master", "empty-branch");
    expect(result).toBe(false);
  });

  test("returns false when branch points to the same commit as base", async () => {
    const repoPath = await initTestRepo();

    // Both branches at HEAD
    await git(repoPath, ["branch", "same-point", "HEAD"]);

    const result = await ops.hasCommitsBeyond(repoPath, "master", "same-point");
    expect(result).toBe(false);
  });

  test("returns true with multiple commits beyond base", async () => {
    const repoPath = await initTestRepo();

    await git(repoPath, ["branch", "multi-commit", "HEAD"]);
    await git(repoPath, ["checkout", "multi-commit"]);

    fs.writeFileSync(path.join(repoPath, "a.txt"), "a\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "First"]);

    fs.writeFileSync(path.join(repoPath, "b.txt"), "b\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Second"]);

    await git(repoPath, ["checkout", "master"]);

    const result = await ops.hasCommitsBeyond(repoPath, "master", "multi-commit");
    expect(result).toBe(true);
  });
});

describe("commitAll", () => {
  test("commits new file and returns true", async () => {
    const repoPath = await initTestRepo();
    fs.writeFileSync(path.join(repoPath, "new-file.txt"), "content\n");

    const result = await ops.commitAll(repoPath, "Add new file");

    expect(result).toBe(true);
    const log = await git(repoPath, ["log", "--oneline"]);
    expect(log).toContain("Add new file");
  });

  test("returns false when nothing to commit", async () => {
    const repoPath = await initTestRepo();

    const result = await ops.commitAll(repoPath, "No changes");

    expect(result).toBe(false);
  });
});

describe("squashMerge", () => {
  test("squash-merges multiple commits into one", async () => {
    const repoPath = await initTestRepo();

    // Create a feature branch with multiple commits
    await git(repoPath, ["checkout", "-b", "feature"]);
    fs.writeFileSync(path.join(repoPath, "a.txt"), "a\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Add a"]);
    fs.writeFileSync(path.join(repoPath, "b.txt"), "b\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Add b"]);

    // Switch back to main branch
    await git(repoPath, ["checkout", "master"]);

    // Squash merge
    await ops.squashMerge(repoPath, "feature", "Squashed feature");

    // Verify both files exist
    expect(fs.existsSync(path.join(repoPath, "a.txt"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "b.txt"))).toBe(true);

    // Verify single commit on master (initial + squashed = 2 total)
    const log = await git(repoPath, ["log", "--oneline"]);
    const lines = log.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBe(2);
    expect(log).toContain("Squashed feature");
  });

  test("throws on conflict", async () => {
    const repoPath = await initTestRepo();

    // Create conflicting changes on two branches
    fs.writeFileSync(path.join(repoPath, "conflict.txt"), "main content\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Main change"]);

    await git(repoPath, ["checkout", "-b", "conflict-branch", "HEAD~1"]);
    fs.writeFileSync(path.join(repoPath, "conflict.txt"), "branch content\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Branch change"]);

    await git(repoPath, ["checkout", "master"]);

    await expect(
      ops.squashMerge(repoPath, "conflict-branch", "Should fail")
    ).rejects.toThrow(/conflicts/i);
  });
});

describe("hasUncommittedChanges", () => {
  test("returns true with uncommitted changes", async () => {
    const repoPath = await initTestRepo();
    fs.writeFileSync(path.join(repoPath, "dirty.txt"), "dirty\n");

    const result = await ops.hasUncommittedChanges(repoPath);
    expect(result).toBe(true);
  });

  test("returns false when clean", async () => {
    const repoPath = await initTestRepo();

    const result = await ops.hasUncommittedChanges(repoPath);
    expect(result).toBe(false);
  });
});

describe("rebase", () => {
  test("rebases branch onto target, producing linear history", async () => {
    const repoPath = await initTestRepo();

    // Create diverged history:
    // master: Initial -> Main change
    // feature: Initial -> Feature change
    await git(repoPath, ["checkout", "-b", "rebase-feature"]);
    fs.writeFileSync(path.join(repoPath, "feature.txt"), "feature\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Feature change"]);

    await git(repoPath, ["checkout", "master"]);
    fs.writeFileSync(path.join(repoPath, "main.txt"), "main\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Main change"]);

    await git(repoPath, ["checkout", "rebase-feature"]);

    await ops.rebase(repoPath, "master");

    // Verify linear history: feature commit should be on top of main change
    const log = await git(repoPath, ["log", "--oneline"]);
    const lines = log.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBe(3); // Initial + Main change + Feature change
    expect(lines[0]).toContain("Feature change");
    expect(lines[1]).toContain("Main change");
  });

  test("throws on conflict and aborts rebase", async () => {
    const repoPath = await initTestRepo();

    // Create conflicting changes
    await git(repoPath, ["checkout", "-b", "rebase-conflict"]);
    fs.writeFileSync(path.join(repoPath, "README.md"), "branch version\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Branch README"]);

    await git(repoPath, ["checkout", "master"]);
    fs.writeFileSync(path.join(repoPath, "README.md"), "master version\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Master README"]);

    await git(repoPath, ["checkout", "rebase-conflict"]);

    await expect(ops.rebase(repoPath, "master")).rejects.toThrow(/conflicts/i);

    // Verify rebase was aborted (not in a rebase state)
    const status = await git(repoPath, ["status"]);
    expect(status).not.toContain("rebase in progress");
  });
});

describe("currentBranch", () => {
  test("returns correct branch name", async () => {
    const repoPath = await initTestRepo();
    await git(repoPath, ["checkout", "-b", "my-branch"]);

    const branch = await ops.currentBranch(repoPath);
    expect(branch).toBe("my-branch");
  });
});

describe("listWorktrees", () => {
  test("lists paths of worktrees", async () => {
    const repoPath = await initTestRepo();
    const wt1 = path.join(makeTmpDir(), "wt1");
    const wt2 = path.join(makeTmpDir(), "wt2");
    await git(repoPath, ["branch", "wt1-branch", "HEAD"]);
    await git(repoPath, ["branch", "wt2-branch", "HEAD"]);
    await git(repoPath, ["worktree", "add", wt1, "wt1-branch"]);
    await git(repoPath, ["worktree", "add", wt2, "wt2-branch"]);

    const worktrees = await ops.listWorktrees(repoPath);

    // Normalize paths for comparison: git returns long-form paths with forward
    // slashes on Windows, while mkdtemp may return 8.3 short names with backslashes.
    const normalize = (p: string) => fs.realpathSync.native(p).replaceAll("\\", "/");
    const normalizedWorktrees = worktrees.map(normalize);

    // Should include the main repo and both worktrees
    expect(normalizedWorktrees).toContain(normalize(repoPath));
    expect(normalizedWorktrees).toContain(normalize(wt1));
    expect(normalizedWorktrees).toContain(normalize(wt2));
    expect(worktrees.length).toBe(3);
  });
});

describe("initClaudeBranch", () => {
  test("creates claude branch from HEAD", async () => {
    const repoPath = await initTestRepo();

    await ops.initClaudeBranch(repoPath);

    const exists = await ops.branchExists(repoPath, "claude/main");
    expect(exists).toBe(true);
  });

  test("second call is a no-op", async () => {
    const repoPath = await initTestRepo();

    await ops.initClaudeBranch(repoPath);
    // Get the ref for the claude/main branch
    const ref1 = await git(repoPath, ["rev-parse", "claude/main"]);

    // Create a new commit on master so HEAD moves
    fs.writeFileSync(path.join(repoPath, "new.txt"), "new\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Move HEAD"]);

    // Second call should be a no-op (branch stays at original ref)
    await ops.initClaudeBranch(repoPath);
    const ref2 = await git(repoPath, ["rev-parse", "claude/main"]);

    expect(ref1).toBe(ref2);
  });
});

describe("detectDefaultBranch", () => {
  test("detects 'main' when that is the current branch", async () => {
    const repoPath = await initTestRepo();
    // git init defaults to "main" or "master" depending on config.
    // The test repo's current branch is whatever init created.
    const currentBranch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    const detected = await ops.detectDefaultBranch(repoPath);
    // Should find the branch that exists (either main or master)
    expect(["main", "master"]).toContain(detected);
    // And it should match what the repo actually has
    expect(detected).toBe(currentBranch);
  });

  test("detects 'master' when repo has master branch", async () => {
    const repoPath = await initTestRepo();
    const currentBranch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    // If the current branch is already master, this is a direct check
    if (currentBranch === "master") {
      const detected = await ops.detectDefaultBranch(repoPath);
      expect(detected).toBe("master");
    }
    // If current branch is main, create master and verify main is preferred
    if (currentBranch === "main") {
      await git(repoPath, ["branch", "master"]);
      const detected = await ops.detectDefaultBranch(repoPath);
      // "main" comes first in the candidate list, so it wins
      expect(detected).toBe("main");
    }
  });

  test("falls back to HEAD when no standard branch names exist", async () => {
    const repoPath = await initTestRepo();
    const currentBranch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

    // Rename the default branch to something non-standard
    await git(repoPath, ["branch", "-m", currentBranch, "develop"]);

    const detected = await ops.detectDefaultBranch(repoPath);
    expect(detected).toBe("develop");
  });
});

describe("fetch", () => {
  test("fetches from a remote", async () => {
    // Create a "remote" repo and a "local" clone
    const remoteRepo = await initTestRepo();
    const localRepo = makeTmpDir();

    // Clone creates the remote relationship
    await git(localRepo, ["clone", remoteRepo, "."]);
    await git(localRepo, ["config", "user.email", "test@test.com"]);
    await git(localRepo, ["config", "user.name", "Test"]);

    // Add a commit to the remote
    fs.writeFileSync(path.join(remoteRepo, "remote-file.txt"), "remote\n");
    await git(remoteRepo, ["add", "-A"]);
    await git(remoteRepo, ["commit", "-m", "Remote commit"]);

    // Fetch should succeed
    await ops.fetch(localRepo, "origin");

    // The fetched commit should be visible
    const log = await git(localRepo, ["log", "--oneline", "origin/master"]);
    expect(log).toContain("Remote commit");
  });

  test("throws when remote does not exist", async () => {
    const repoPath = await initTestRepo();

    await expect(ops.fetch(repoPath, "nonexistent")).rejects.toThrow(
      /git fetch failed/
    );
  });
});

describe("push", () => {
  test("pushes branch to a remote", async () => {
    // Create a bare "remote" repo
    const bareRepo = makeTmpDir();
    await git(bareRepo, ["init", "--bare"]);

    // Create a local repo with the remote
    const localRepo = await initTestRepo();
    await git(localRepo, ["remote", "add", "origin", bareRepo]);

    // Push master to origin
    await ops.push(localRepo, "master", "origin");

    // Verify the bare repo now has the commit
    const log = await git(bareRepo, ["log", "--oneline"]);
    expect(log).toContain("Initial commit");
  });
});

describe("resetHard", () => {
  test("resets working tree and branch to a ref", async () => {
    const repoPath = await initTestRepo();

    // Add a commit, then reset back to the parent
    fs.writeFileSync(path.join(repoPath, "extra.txt"), "extra\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Extra commit"]);

    const headBefore = await git(repoPath, ["rev-parse", "HEAD"]);
    const parentSha = await git(repoPath, ["rev-parse", "HEAD~1"]);

    await ops.resetHard(repoPath, "HEAD~1");

    const headAfter = await git(repoPath, ["rev-parse", "HEAD"]);
    expect(headAfter).toBe(parentSha);
    expect(headAfter).not.toBe(headBefore);
    expect(fs.existsSync(path.join(repoPath, "extra.txt"))).toBe(false);
  });
});

describe("isAncestor", () => {
  test("returns true when ref is ancestor", async () => {
    const repoPath = await initTestRepo();
    const parentSha = await git(repoPath, ["rev-parse", "HEAD"]);

    // Add a commit so HEAD is ahead
    fs.writeFileSync(path.join(repoPath, "new.txt"), "new\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "New commit"]);

    const result = await ops.isAncestor(repoPath, parentSha, "HEAD");
    expect(result).toBe(true);
  });

  test("returns false when ref is not ancestor", async () => {
    const repoPath = await initTestRepo();

    // Create two diverged branches
    await git(repoPath, ["checkout", "-b", "branch-a"]);
    fs.writeFileSync(path.join(repoPath, "a.txt"), "a\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Branch A"]);
    const shaA = await git(repoPath, ["rev-parse", "HEAD"]);

    await git(repoPath, ["checkout", "master"]);
    await git(repoPath, ["checkout", "-b", "branch-b"]);
    fs.writeFileSync(path.join(repoPath, "b.txt"), "b\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Branch B"]);
    const shaB = await git(repoPath, ["rev-parse", "HEAD"]);

    // Neither is ancestor of the other
    const result1 = await ops.isAncestor(repoPath, shaA, shaB);
    expect(result1).toBe(false);
    const result2 = await ops.isAncestor(repoPath, shaB, shaA);
    expect(result2).toBe(false);
  });
});

describe("treesEqual", () => {
  test("returns true when trees match", async () => {
    const repoPath = await initTestRepo();

    // Create a branch at the same point
    await git(repoPath, ["branch", "same-content", "HEAD"]);

    const result = await ops.treesEqual(repoPath, "master", "same-content");
    expect(result).toBe(true);
  });

  test("returns false when trees differ", async () => {
    const repoPath = await initTestRepo();
    await git(repoPath, ["branch", "diff-content", "HEAD"]);

    // Add a file on master only
    fs.writeFileSync(path.join(repoPath, "new.txt"), "new\n");
    await git(repoPath, ["add", "-A"]);
    await git(repoPath, ["commit", "-m", "Master advance"]);

    const result = await ops.treesEqual(repoPath, "master", "diff-content");
    expect(result).toBe(false);
  });
});

describe("revParse", () => {
  test("resolves HEAD to a full SHA", async () => {
    const repoPath = await initTestRepo();

    const sha = await ops.revParse(repoPath, "HEAD");
    // Full SHA is 40 hex characters
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  test("resolves branch name to a SHA", async () => {
    const repoPath = await initTestRepo();
    await git(repoPath, ["branch", "test-ref", "HEAD"]);

    const sha = await ops.revParse(repoPath, "test-ref");
    const headSha = await git(repoPath, ["rev-parse", "HEAD"]);
    expect(sha).toBe(headSha);
  });
});

describe("createPullRequest", () => {
  test("throws clear error when gh is not installed", async () => {
    const repoPath = await initTestRepo();

    // Override PATH to exclude gh
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = "/nonexistent";
      await expect(
        ops.createPullRequest(repoPath, "main", "feature", "Test PR", "Body")
      ).rejects.toThrow(/GitHub CLI.*not installed/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  // Note: testing successful PR creation requires an authenticated gh CLI
  // and a real GitHub repo, which is not appropriate for unit tests.
  // Integration-level coverage of the full flow would go in a separate suite.
});

describe("runGit error handling", () => {
  test("throws with stderr on failure", async () => {
    const repoPath = await initTestRepo();

    // Attempt to delete a non-existent branch
    await expect(ops.deleteBranch(repoPath, "no-such-branch")).rejects.toThrow(
      /git branch failed/
    );
  });
});
