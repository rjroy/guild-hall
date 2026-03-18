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
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";

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
  args: string[],
  opts?: { allowNonZero?: boolean },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

  if (exitCode !== 0 && !opts?.allowNonZero) {
    throw new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`);
  }

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Runs a non-git command (e.g., gh) in the given directory with a clean
 * git environment. Same buffer-drain pattern as runGit.
 *
 * Throws if the executable is not found (Bun.spawn throws synchronously
 * when the binary doesn't exist in PATH).
 */
async function runCmd(
  cwd: string,
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let proc;
  try {
    proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: cleanGitEnv(),
    });
  } catch (err) {
    // Bun.spawn throws synchronously when the executable is not found
    throw new Error(
      `Executable not found: ${cmd[0]} (${errorMessage(err)})`,
    );
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export interface GitOps {
  createBranch(repoPath: string, branchName: string, baseRef: string): Promise<void>;
  branchExists(repoPath: string, branchName: string): Promise<boolean>;
  deleteBranch(repoPath: string, branchName: string): Promise<void>;

  /** Returns true if branch has commits not reachable from baseBranch. */
  hasCommitsBeyond(repoPath: string, baseBranch: string, branch: string): Promise<boolean>;

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
  detectDefaultBranch(repoPath: string): Promise<string>;

  /** Fetch from a remote. Defaults to "origin". */
  fetch(repoPath: string, remote?: string): Promise<void>;

  /** Push a branch to a remote. Defaults to "origin". */
  push(repoPath: string, branchName: string, remote?: string): Promise<void>;

  /** Hard-reset the current branch in a worktree to a ref. */
  resetHard(worktreePath: string, ref: string): Promise<void>;

  /** Soft-reset the current branch to a ref (moves HEAD, keeps index and working tree). */
  resetSoft(worktreePath: string, ref: string): Promise<void>;

  /**
   * Create a PR using gh CLI. Returns the PR URL.
   * Throws with a clear message if gh is not installed.
   */
  createPullRequest(
    repoPath: string,
    baseBranch: string,
    headBranch: string,
    title: string,
    body: string,
  ): Promise<{ url: string }>;

  /** Returns true if potentialAncestor is an ancestor of ref. */
  isAncestor(repoPath: string, potentialAncestor: string, ref: string): Promise<boolean>;

  /** Returns true if two refs have identical tree content. */
  treesEqual(repoPath: string, ref1: string, ref2: string): Promise<boolean>;

  /** Resolves a ref to its full SHA. */
  revParse(repoPath: string, ref: string): Promise<string>;

  /**
   * Rebase commits after `afterRef` onto `ontoRef`.
   * Equivalent to: git rebase --onto <ontoRef> <afterRef>
   * Used after squash-merge to replay only post-PR commits.
   */
  rebaseOnto(worktreePath: string, ontoRef: string, afterRef: string): Promise<void>;

  /**
   * Merge a ref into the current branch. Used instead of rebase when
   * branches have diverged after a squash-merge (rebase would try to
   * replay already-applied commits and conflict).
   */
  merge(worktreePath: string, ref: string, message: string): Promise<void>;

  /**
   * Performs `git merge --squash` without committing. Returns true if the
   * merge completed cleanly, false if there were conflicts. Does NOT throw
   * on conflict (unlike squashMerge), so the caller can inspect and resolve.
   */
  squashMergeNoCommit(worktreePath: string, sourceBranch: string): Promise<boolean>;

  /**
   * Lists files with unresolved merge conflicts (unmerged paths).
   * Returns relative paths from the worktree root.
   */
  listConflictedFiles(worktreePath: string): Promise<string[]>;

  /**
   * Resolves merge conflicts for specified files by accepting the incoming
   * (theirs) version, then stages the resolved files.
   *
   * In a squash-merge context (the primary use case), --theirs refers to the
   * activity branch (the commission's or meeting's work), not the integration
   * branch. This is because `git merge --squash <activity-branch>` runs in
   * the integration worktree, making the integration branch "ours" and the
   * activity branch "theirs".
   */
  resolveConflictsTheirs(worktreePath: string, files: string[]): Promise<void>;

  /**
   * Aborts a merge in progress, restoring the worktree to its pre-merge state.
   */
  mergeAbort(worktreePath: string): Promise<void>;

  /** Returns the count of uncommitted .lore/ changes in the worktree. */
  lorePendingChanges(worktreePath: string): Promise<{ hasPendingChanges: boolean; fileCount: number }>;

  /**
   * Stages .lore/ changes and commits with the given message.
   * Uses `git add -- .lore/` (not `git add -A`) and `--no-verify`.
   * Returns committed: false if there is nothing to stage in .lore/.
   */
  commitLore(worktreePath: string, message: string): Promise<{ committed: boolean }>;
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

    async hasCommitsBeyond(repoPath, baseBranch, branch) {
      const { stdout } = await runGit(repoPath, [
        "log", "--oneline", `${baseBranch}..${branch}`,
      ]);
      return stdout !== "";
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
      // --no-verify: activity worktrees use sparse checkout (.lore/ only),
      // so project pre-commit hooks (linters, tests) will fail on the
      // incomplete repo. These are internal Guild Hall commits, not user commits.
      await runGit(worktreePath, ["commit", "--no-verify", "-m", message]);
      return true;
    },

    async squashMerge(worktreePath, sourceBranch, message) {
      try {
        await runGit(worktreePath, ["merge", "--squash", sourceBranch]);
      } catch (err) {
        throw new Error(
          `Squash merge of ${sourceBranch} failed with conflicts: ${errorMessage(err)}`
        );
      }
      // --no-verify: same rationale as commitAll; integration worktrees
      // share the project's hook config but aren't full working copies.
      await runGit(worktreePath, ["commit", "--no-verify", "-m", message]);
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
          `Rebase onto ${ontoRef} failed with conflicts: ${errorMessage(err)}`
        );
      }
    },

    async rebaseOnto(worktreePath, ontoRef, afterRef) {
      try {
        await runGit(worktreePath, ["rebase", "--onto", ontoRef, afterRef]);
      } catch (err) {
        try {
          await runGit(worktreePath, ["rebase", "--abort"]);
        } catch {
          // Abort itself may fail if rebase wasn't actually in progress
        }
        throw new Error(
          `Rebase --onto ${ontoRef} ${afterRef} failed: ${errorMessage(err)}`
        );
      }
    },

    async merge(worktreePath, ref, message) {
      try {
        await runGit(worktreePath, ["merge", ref, "-m", message]);
      } catch (err) {
        // Abort the failed merge to leave the repo clean
        try {
          await runGit(worktreePath, ["merge", "--abort"]);
        } catch {
          // Abort may fail if merge wasn't actually in progress
        }
        throw new Error(
          `Merge of ${ref} failed: ${errorMessage(err)}`
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

    async detectDefaultBranch(repoPath) {
      // 1. Try remote HEAD (most reliable for repos with a remote)
      try {
        const { stdout } = await runGit(repoPath, [
          "symbolic-ref", "refs/remotes/origin/HEAD",
        ]);
        // Output: "refs/remotes/origin/main" → extract "main"
        const parts = stdout.split("/");
        if (parts.length > 0) {
          return parts[parts.length - 1];
        }
      } catch {
        // No remote or remote HEAD not set
      }

      // 2. Check common branch names
      for (const candidate of ["main", "master"]) {
        if (await this.branchExists(repoPath, candidate)) {
          return candidate;
        }
      }

      // 3. Fall back to current HEAD branch
      const { stdout } = await runGit(repoPath, [
        "rev-parse", "--abbrev-ref", "HEAD",
      ]);
      return stdout;
    },

    async fetch(repoPath, remote = "origin") {
      await runGit(repoPath, ["fetch", remote]);
    },

    async push(repoPath, branchName, remote = "origin") {
      await runGit(repoPath, ["push", remote, branchName]);
    },

    async resetHard(worktreePath, ref) {
      await runGit(worktreePath, ["reset", "--hard", ref]);
    },

    async resetSoft(worktreePath, ref) {
      await runGit(worktreePath, ["reset", "--soft", ref]);
    },

    async createPullRequest(repoPath, baseBranch, headBranch, title, body) {
      // Check if gh is available before attempting. Uses gh --version
      // rather than `which` because `which` may not exist on all systems.
      try {
        await runCmd(repoPath, ["gh", "--version"]);
      } catch {
        throw new Error(
          "GitHub CLI (gh) is not installed or not in PATH. " +
          "Install it from https://cli.github.com/ and run 'gh auth login' to authenticate.",
        );
      }

      const result = await runCmd(repoPath, [
        "gh", "pr", "create",
        "--base", baseBranch,
        "--head", headBranch,
        "--title", title,
        "--body", body,
      ]);

      if (result.exitCode !== 0) {
        throw new Error(`gh pr create failed (exit ${result.exitCode}): ${result.stderr}`);
      }

      // gh pr create prints the PR URL to stdout
      const url = result.stdout.trim();
      if (!url) {
        throw new Error("gh pr create succeeded but returned no URL");
      }

      return { url };
    },

    async isAncestor(repoPath, potentialAncestor, ref) {
      const { exitCode } = await runGit(
        repoPath,
        ["merge-base", "--is-ancestor", potentialAncestor, ref],
        { allowNonZero: true },
      );
      return exitCode === 0;
    },

    async treesEqual(repoPath, ref1, ref2) {
      const { exitCode } = await runGit(
        repoPath,
        ["diff", "--quiet", ref1, ref2],
        { allowNonZero: true },
      );
      return exitCode === 0;
    },

    async revParse(repoPath, ref) {
      const { stdout } = await runGit(repoPath, ["rev-parse", ref]);
      return stdout;
    },

    async squashMergeNoCommit(worktreePath, sourceBranch) {
      const { exitCode } = await runGit(
        worktreePath,
        ["merge", "--squash", sourceBranch],
        { allowNonZero: true },
      );
      return exitCode === 0;
    },

    async listConflictedFiles(worktreePath) {
      // git diff --name-only --diff-filter=U lists files with unresolved
      // merge conflicts (unmerged entries in the index).
      const { stdout } = await runGit(
        worktreePath,
        ["diff", "--name-only", "--diff-filter=U"],
      );
      if (stdout === "") return [];
      return stdout.split("\n").filter((line) => line.length > 0);
    },

    async resolveConflictsTheirs(worktreePath, files) {
      if (files.length === 0) return;
      // Accept the incoming (theirs) version for each conflicted file
      await runGit(worktreePath, ["checkout", "--theirs", "--", ...files]);
      // Stage the resolved files
      await runGit(worktreePath, ["add", "--", ...files]);
    },

    async mergeAbort(worktreePath) {
      try {
        await runGit(worktreePath, ["merge", "--abort"]);
      } catch {
        // merge --abort may fail if no merge is in progress
      }
    },

    async lorePendingChanges(worktreePath) {
      const { stdout } = await runGit(worktreePath, ["status", "--porcelain", "--", ".lore/"]);
      if (stdout === "") {
        return { hasPendingChanges: false, fileCount: 0 };
      }
      const fileCount = stdout.split("\n").filter(Boolean).length;
      return { hasPendingChanges: true, fileCount };
    },

    async commitLore(worktreePath, message) {
      const { stdout } = await runGit(worktreePath, ["status", "--porcelain", "--", ".lore/"]);
      if (stdout === "") {
        return { committed: false };
      }
      await runGit(worktreePath, ["add", "--", ".lore/"]);
      // --no-verify: consistent with commitAll and squashMerge.
      // Integration worktrees share the project's hook config but aren't
      // full working copies; pre-commit hooks (linters, tests) will fail.
      await runGit(worktreePath, ["commit", "--no-verify", "-m", message]);
      return { committed: true };
    },
  };
}

export interface FinalizeActivityResult {
  /** True if squash-merge succeeded and worktree+branch were cleaned up. */
  merged: boolean;
  /** True if the branch was preserved for manual resolution (merge failed). */
  preserved: boolean;
}

/**
 * Commits work in an activity worktree, squash-merges it into the
 * integration worktree (under a project lock), then cleans up on success
 * or preserves the branch on failure.
 *
 * Caller-specific concerns (events, status transitions, escalation,
 * state files) are NOT handled here. Callers inspect the result and
 * do their own post-processing.
 */
export async function finalizeActivity(
  git: GitOps,
  opts: {
    activityId: string;
    worktreeDir: string;
    branchName: string;
    projectPath: string;
    integrationPath: string;
    commitMessage: string;
    logPrefix: string;
    commitLabel: string;
    lockFn: <T>(fn: () => Promise<T>) => Promise<T>;
  },
  log: Log = nullLog("git"),
): Promise<FinalizeActivityResult> {
  await git.commitAll(opts.worktreeDir, opts.commitMessage);

  const merged = await opts.lockFn(async () => {
    await git.commitAll(opts.integrationPath, `Pre-merge sync: ${opts.activityId}`);
    return await resolveSquashMerge(git, opts.integrationPath, opts.branchName, {
      logPrefix: opts.logPrefix,
      commitLabel: opts.commitLabel,
      activityId: opts.activityId,
    }, log);
  });

  if (merged) {
    try {
      await git.removeWorktree(opts.projectPath, opts.worktreeDir);
      await git.deleteBranch(opts.projectPath, opts.branchName);
    } catch (err: unknown) {
      log.warn(
        `${opts.logPrefix}: Worktree/branch cleanup failed for "${opts.activityId}":`,
        errorMessage(err),
      );
    }
    return { merged: true, preserved: false };
  }

  try {
    await git.removeWorktree(opts.projectPath, opts.worktreeDir);
  } catch (err: unknown) {
    log.warn(
      `${opts.logPrefix}: Failed to remove worktree for "${opts.activityId}":`,
      errorMessage(err),
    );
  }
  return { merged: false, preserved: true };
}

/**
 * Attempts a squash-merge from sourceBranch into integrationPath,
 * auto-resolving .lore/ conflicts with --theirs (the activity branch's
 * version). Non-.lore/ conflicts cause the merge to abort.
 *
 * Used by both commission orchestrator and meeting orchestrator to merge activity
 * branches back to the integration worktree.
 */
export async function resolveSquashMerge(
  git: GitOps,
  integrationPath: string,
  sourceBranch: string,
  opts: { logPrefix: string; commitLabel: string; activityId: string },
  log: Log = nullLog("git"),
): Promise<boolean> {
  const { logPrefix, commitLabel, activityId } = opts;
  const clean = await git.squashMergeNoCommit(integrationPath, sourceBranch);

  if (clean) {
    await git.commitAll(integrationPath, `${commitLabel}: ${activityId}`);
    return true;
  }

  const conflictedFiles = await git.listConflictedFiles(integrationPath);

  if (conflictedFiles.length === 0) {
    log.warn(
      `${logPrefix}: "${activityId}" squash-merge reported conflict but no unmerged files found. Aborting.`,
    );
    await git.mergeAbort(integrationPath);
    return false;
  }

  const loreFiles = conflictedFiles.filter((f) => f.startsWith(".lore/"));
  const nonLoreFiles = conflictedFiles.filter((f) => !f.startsWith(".lore/"));

  if (nonLoreFiles.length > 0) {
    log.warn(
      `${logPrefix}: "${activityId}" squash-merge has non-.lore/ conflicts: ${nonLoreFiles.join(", ")}. Aborting merge.`,
    );
    await git.mergeAbort(integrationPath);
    return false;
  }

  log.info(
    `${logPrefix}: "${activityId}" auto-resolving ${loreFiles.length} .lore/ conflict(s): ${loreFiles.join(", ")}`,
  );
  await git.resolveConflictsTheirs(integrationPath, loreFiles);
  await git.commitAll(
    integrationPath,
    `${commitLabel}: ${activityId} (auto-resolved .lore/ conflicts)`,
  );

  return true;
}
