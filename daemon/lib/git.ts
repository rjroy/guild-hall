/**
 * Git subprocess operations with environment isolation.
 *
 * Every git subprocess call strips GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE
 * from the environment. Without this, git operations spawned during pre-commit
 * hooks target the hook's repository instead of the intended one. This caused
 * data loss in Phase 5; see .lore/retros/phase-5-git-integration-data-loss.md.
 */

/**
 * Creates a copy of process.env with git-inherited variables removed.
 *
 * Pre-commit hooks set GIT_DIR, GIT_WORK_TREE, and GIT_INDEX_FILE. Any
 * subprocess that inherits these will operate on the hook's repo, not the
 * target repo. Stripping them forces git to discover the repo from cwd.
 */
/**
 * The integration branch name. Uses "claude/main" (not "claude") because git
 * refs are filesystem paths: a branch named "claude" creates refs/heads/claude
 * as a file, which blocks activity branches like refs/heads/claude/meeting/...
 * from being created (can't have a file and directory with the same name).
 */
export const CLAUDE_BRANCH = "claude/main";

export function cleanGitEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

/**
 * Runs a git command in the given directory with a clean environment.
 *
 * Both stdout and stderr are actively consumed via Response.text() to avoid
 * pipe buffer blocking (lesson from Phase 4 retro).
 */
async function runGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
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

  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`);
  }

  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export interface GitOps {
  createBranch(repoPath: string, branchName: string, baseRef: string): Promise<void>;
  branchExists(repoPath: string, branchName: string): Promise<boolean>;
  deleteBranch(repoPath: string, branchName: string): Promise<void>;
  createWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
  configureSparseCheckout(worktreePath: string, paths: string[]): Promise<void>;
  commitAll(worktreePath: string, message: string): Promise<boolean>;
  squashMerge(worktreePath: string, sourceBranch: string, message: string): Promise<void>;
  hasUncommittedChanges(worktreePath: string): Promise<boolean>;
  rebase(worktreePath: string, ontoRef: string): Promise<void>;
  currentBranch(worktreePath: string): Promise<string>;
  listWorktrees(repoPath: string): Promise<string[]>;
  initClaudeBranch(repoPath: string): Promise<void>;
}

export function createGitOps(): GitOps {
  return {
    async createBranch(repoPath, branchName, baseRef) {
      await runGit(repoPath, ["branch", branchName, baseRef]);
    },

    async branchExists(repoPath, branchName) {
      try {
        await runGit(repoPath, ["rev-parse", "--verify", `refs/heads/${branchName}`]);
        return true;
      } catch {
        return false;
      }
    },

    async deleteBranch(repoPath, branchName) {
      await runGit(repoPath, ["branch", "-D", branchName]);
    },

    async createWorktree(repoPath, worktreePath, branchName) {
      await runGit(repoPath, ["worktree", "add", worktreePath, branchName]);
    },

    async removeWorktree(repoPath, worktreePath) {
      await runGit(repoPath, ["worktree", "remove", worktreePath, "--force"]);
    },

    async configureSparseCheckout(worktreePath, paths) {
      await runGit(worktreePath, ["sparse-checkout", "init", "--cone"]);
      await runGit(worktreePath, ["sparse-checkout", "set", ...paths]);
    },

    async commitAll(worktreePath, message) {
      const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
      if (stdout === "") {
        return false;
      }
      await runGit(worktreePath, ["add", "-A"]);
      await runGit(worktreePath, ["commit", "-m", message]);
      return true;
    },

    async squashMerge(worktreePath, sourceBranch, message) {
      try {
        await runGit(worktreePath, ["merge", "--squash", sourceBranch]);
      } catch (err) {
        throw new Error(
          `Squash merge of ${sourceBranch} failed with conflicts: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await runGit(worktreePath, ["commit", "-m", message]);
    },

    async hasUncommittedChanges(worktreePath) {
      const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
      return stdout !== "";
    },

    async rebase(worktreePath, ontoRef) {
      try {
        await runGit(worktreePath, ["rebase", ontoRef]);
      } catch (err) {
        // Abort the failed rebase to leave the repo in a clean state
        try {
          await runGit(worktreePath, ["rebase", "--abort"]);
        } catch {
          // Abort itself may fail if rebase wasn't actually in progress
        }
        throw new Error(
          `Rebase onto ${ontoRef} failed with conflicts: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },

    async currentBranch(worktreePath) {
      const { stdout } = await runGit(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]);
      return stdout;
    },

    async listWorktrees(repoPath) {
      const { stdout } = await runGit(repoPath, ["worktree", "list", "--porcelain"]);
      if (stdout === "") {
        return [];
      }
      const lines = stdout.split("\n");
      const paths: string[] = [];
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          paths.push(line.slice("worktree ".length));
        }
      }
      return paths;
    },

    async initClaudeBranch(repoPath) {
      const exists = await this.branchExists(repoPath, CLAUDE_BRANCH);
      if (!exists) {
        await runGit(repoPath, ["branch", CLAUDE_BRANCH, "HEAD"]);
      }
    },
  };
}
