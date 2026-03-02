/**
 * Commission-agnostic workspace provisioning (Layer 3).
 *
 * Provides git branch, worktree, sparse checkout, squash-merge, and cleanup
 * operations. Receives workspace configuration and returns results. No
 * commission types, state machines, or signals in scope (REQ-CLS-19, CLS-21).
 *
 * All git subprocess invocations go through the injected GitOps interface,
 * which enforces cleanGitEnv() to strip inherited GIT_DIR, GIT_WORK_TREE,
 * and GIT_INDEX_FILE (REQ-CLS-20). See daemon/lib/git.ts for details and
 * .lore/_archive/retros/phase-5-git-integration-data-loss.md for the lesson.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GitOps } from "@/daemon/lib/git";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

// -- Public types --

export type WorkspaceConfig = {
  /** Path to the project's main repository. */
  projectPath: string;
  /** Branch to fork from (e.g., "claude/main"). */
  baseBranch: string;
  /** Name for the new activity branch. */
  activityBranch: string;
  /** Where to create the worktree on disk. */
  worktreeDir: string;
  /** Checkout scope. When "sparse", sparsePatterns are applied. */
  checkoutScope?: "full" | "sparse";
  /** Sparse checkout patterns (e.g., [".lore/commissions/"]). Ignored unless checkoutScope is "sparse". */
  sparsePatterns?: string[];
};

export type FinalizeConfig = {
  /** The activity branch to merge from. */
  activityBranch: string;
  /** The activity worktree directory. */
  worktreeDir: string;
  /** Path to the project's main repository (for branch cleanup). */
  projectPath: string;
  /** Path to the integration worktree (merge target). */
  integrationPath: string;
  /** Identifier for the activity (used in commit messages and logs). */
  activityId: string;
  /** Commit message for the activity worktree before merging. */
  commitMessage: string;
  /** Label for the merge commit (e.g., "Commission", "Meeting"). */
  commitLabel: string;
  /** Serialization lock for the integration worktree. */
  lockFn: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type PreserveConfig = {
  /** The activity worktree directory. */
  worktreeDir: string;
  /** The activity branch name (preserved for recovery). */
  branchName: string;
  /** Commit message for preserving uncommitted work. */
  commitMessage: string;
  /** Path to the project's main repository (for worktree removal). */
  projectPath?: string;
};

export type FinalizeResult =
  | { merged: true }
  | { merged: false; preserved: true; reason: string };

// -- Interface --

export interface WorkspaceOps {
  /**
   * Provisions a workspace: creates an activity branch from baseBranch,
   * creates a worktree, and optionally configures sparse checkout.
   *
   * The parent directory of worktreeDir is created if it doesn't exist.
   * Git's createWorktree requires the target path to NOT exist.
   */
  prepare(config: WorkspaceConfig): Promise<{ worktreeDir: string }>;

  /**
   * Squash-merges the activity branch into the integration worktree.
   *
   * Runs under the caller-provided lock to serialize integration worktree
   * writes. Auto-resolves .lore/ file conflicts (accepts the activity branch
   * version). Aborts and returns a preserved result when non-.lore/ files
   * conflict. On success, removes the worktree and deletes the branch.
   */
  finalize(config: FinalizeConfig): Promise<FinalizeResult>;

  /**
   * Commits any uncommitted work to preserve partial results, then removes
   * the activity worktree. The branch is always kept for recovery or
   * inspection.
   */
  preserveAndCleanup(config: PreserveConfig): Promise<void>;

  /**
   * Removes a worktree without branch cleanup. Used when the worktree
   * needs to go but the branch was already handled (e.g., by finalize).
   */
  removeWorktree(worktreeDir: string, projectPath: string): Promise<void>;
}

// -- Factory --

export interface WorkspaceDeps {
  git: GitOps;
}

export function createWorkspaceOps(deps: WorkspaceDeps): WorkspaceOps {
  const { git } = deps;

  return {
    async prepare(config) {
      const {
        projectPath,
        baseBranch,
        activityBranch,
        worktreeDir,
        checkoutScope,
        sparsePatterns,
      } = config;

      // 1. Create the activity branch from the base branch
      await git.createBranch(projectPath, activityBranch, baseBranch);

      // 2. Ensure parent directory exists (git worktree add needs the
      //    target path to NOT exist, but the parent must)
      await fs.mkdir(path.dirname(worktreeDir), { recursive: true });

      // 3. Create the worktree
      await git.createWorktree(projectPath, worktreeDir, activityBranch);

      // 4. Configure sparse checkout if requested
      if (checkoutScope === "sparse" && sparsePatterns && sparsePatterns.length > 0) {
        await git.configureSparseCheckout(worktreeDir, sparsePatterns);
      }

      return { worktreeDir };
    },

    async finalize(config) {
      const {
        activityBranch,
        worktreeDir,
        projectPath,
        integrationPath,
        activityId,
        commitMessage,
        commitLabel,
        lockFn,
      } = config;

      // Commit any uncommitted work in the activity worktree
      await git.commitAll(worktreeDir, commitMessage);

      // Squash-merge under the integration lock
      const merged = await lockFn(async () => {
        // Sync any uncommitted changes in integration worktree first
        await git.commitAll(integrationPath, `Pre-merge sync: ${activityId}`);

        return await resolveSquashMerge(
          git,
          integrationPath,
          activityBranch,
          activityId,
          commitLabel,
        );
      });

      if (merged) {
        // Clean merge: remove worktree and delete branch
        try {
          await git.removeWorktree(projectPath, worktreeDir);
          await git.deleteBranch(projectPath, activityBranch);
        } catch (err: unknown) {
          console.warn(
            `[workspace] Worktree/branch cleanup failed for "${activityId}":`,
            errorMessage(err),
          );
        }
        return { merged: true };
      }

      // Merge failed (non-.lore/ conflicts). Remove worktree but keep
      // the branch for manual resolution.
      try {
        await git.removeWorktree(projectPath, worktreeDir);
      } catch (err: unknown) {
        console.warn(
          `[workspace] Failed to remove worktree for "${activityId}":`,
          errorMessage(err),
        );
      }

      return {
        merged: false,
        preserved: true,
        reason: "Squash-merge conflict on non-.lore/ files",
      };
    },

    async preserveAndCleanup(config) {
      const { worktreeDir, branchName, commitMessage, projectPath } = config;

      // Commit uncommitted work to preserve partial results
      try {
        const hadChanges = await git.commitAll(worktreeDir, commitMessage);
        if (hadChanges) {
          console.log(
            `[workspace] Partial results committed to ${branchName}`,
          );
        }
      } catch (err: unknown) {
        console.warn(
          `[workspace] Failed to commit partial results:`,
          errorMessage(err),
        );
      }

      // Remove worktree (branch is preserved for recovery)
      if (projectPath) {
        try {
          await git.removeWorktree(projectPath, worktreeDir);
        } catch (err: unknown) {
          console.warn(
            `[workspace] Failed to remove worktree:`,
            errorMessage(err),
          );
        }
      }
    },

    async removeWorktree(worktreeDir, projectPath) {
      await git.removeWorktree(projectPath, worktreeDir);
    },
  };
}

// -- Internal helpers --

/**
 * Attempts a squash-merge with .lore/ conflict auto-resolution.
 *
 * Mirrors the logic from daemon/lib/git.ts resolveSquashMerge() but
 * without the logging prefix / activityId coupling to commission types.
 * In a squash-merge context, --theirs refers to the activity branch
 * (the incoming work), not the integration branch.
 *
 * Returns true if the merge completed (clean or with auto-resolved
 * .lore/ conflicts). Returns false if non-.lore/ files conflict.
 */
async function resolveSquashMerge(
  git: GitOps,
  integrationPath: string,
  sourceBranch: string,
  activityId: string,
  commitLabel: string,
): Promise<boolean> {
  const clean = await git.squashMergeNoCommit(integrationPath, sourceBranch);

  if (clean) {
    await git.commitAll(integrationPath, `${commitLabel}: ${activityId}`);
    return true;
  }

  const conflictedFiles = await git.listConflictedFiles(integrationPath);

  if (conflictedFiles.length === 0) {
    // Squash-merge reported conflict but no unmerged files. Unexpected state.
    console.warn(
      `[workspace] "${activityId}" squash-merge reported conflict but no unmerged files found. Aborting.`,
    );
    await git.mergeAbort(integrationPath);
    return false;
  }

  const loreFiles = conflictedFiles.filter((f) => f.startsWith(".lore/"));
  const nonLoreFiles = conflictedFiles.filter((f) => !f.startsWith(".lore/"));

  if (nonLoreFiles.length > 0) {
    console.warn(
      `[workspace] "${activityId}" squash-merge has non-.lore/ conflicts: ${nonLoreFiles.join(", ")}. Aborting merge.`,
    );
    await git.mergeAbort(integrationPath);
    return false;
  }

  // All conflicts are in .lore/ files. Auto-resolve with --theirs
  // (the activity branch's version).
  console.log(
    `[workspace] "${activityId}" auto-resolving ${loreFiles.length} .lore/ conflict(s): ${loreFiles.join(", ")}`,
  );
  await git.resolveConflictsTheirs(integrationPath, loreFiles);
  await git.commitAll(
    integrationPath,
    `${commitLabel}: ${activityId} (auto-resolved .lore/ conflicts)`,
  );

  return true;
}
