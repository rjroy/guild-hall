import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig } from "@/lib/config";
import { getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { withProjectLock } from "@/daemon/lib/project-lock";
import type { PrMarker } from "@/daemon/services/manager-toolbox";

/**
 * Checks whether a project has active commissions or meetings by scanning
 * state files. Returns true if any activity is currently running.
 */
export async function hasActiveActivities(
  ghHome: string,
  projectName: string,
): Promise<boolean> {
  // Check commission state files
  const commissionStateDir = path.join(ghHome, "state", "commissions");
  try {
    const files = await fs.readdir(commissionStateDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(
          path.join(commissionStateDir, file),
          "utf-8",
        );
        const state = JSON.parse(raw) as {
          projectName?: string;
          status?: string;
        };
        if (
          state.projectName === projectName &&
          (state.status === "dispatched" || state.status === "in_progress")
        ) {
          return true;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // No state directory = no active commissions
  }

  // Check meeting state files
  const meetingStateDir = path.join(ghHome, "state", "meetings");
  try {
    const files = await fs.readdir(meetingStateDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(
          path.join(meetingStateDir, file),
          "utf-8",
        );
        const state = JSON.parse(raw) as {
          projectName?: string;
          status?: string;
        };
        if (state.projectName === projectName && state.status === "open") {
          return true;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // No state directory = no active meetings
  }

  return false;
}

/**
 * Rebases the claude branch onto the project's default branch.
 * Skips if the project has active activities.
 * Returns true if rebase was performed, false if skipped.
 * Throws on rebase conflict (caller decides how to handle).
 *
 * The defaultBranch parameter comes from the project config. If not set
 * (pre-existing registrations), falls back to detecting it from the repo.
 */
export async function rebaseProject(
  projectPath: string,
  projectName: string,
  ghHome?: string,
  gitOps?: GitOps,
  defaultBranch?: string,
): Promise<boolean> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();

  if (await hasActiveActivities(home, projectName)) {
    console.log(
      `[rebase] Skipping "${projectName}": active activities found`,
    );
    return false;
  }

  const targetBranch = defaultBranch ?? await git.detectDefaultBranch(projectPath);
  const iPath = integrationWorktreePath(home, projectName);
  await git.rebase(iPath, targetBranch);
  console.log(`[rebase] Rebased claude onto ${targetBranch} for "${projectName}"`);
  return true;
}

/**
 * CLI entry point: rebases claude onto master for one or all projects.
 */
export async function rebase(
  projectName?: string,
  ghHome?: string,
  gitOps?: GitOps,
): Promise<void> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();
  const config = await readConfig();

  if (projectName) {
    const project = config.projects.find((p) => p.name === projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found in config`);
    }
    await rebaseProject(project.path, projectName, home, git, project.defaultBranch);
  } else {
    for (const project of config.projects) {
      try {
        await rebaseProject(project.path, project.name, home, git, project.defaultBranch);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(
          `[rebase] Failed to rebase "${project.name}": ${reason}`,
        );
      }
    }
  }
}

// -- Post-merge sync --

/**
 * Reads the PR marker file for a project, if it exists.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export async function readPrMarker(
  ghHome: string,
  projectName: string,
): Promise<PrMarker | null> {
  const markerPath = path.join(ghHome, "state", "pr-pending", `${projectName}.json`);
  try {
    const raw = await fs.readFile(markerPath, "utf-8");
    return JSON.parse(raw) as PrMarker;
  } catch {
    return null;
  }
}

/**
 * Removes the PR marker file for a project.
 */
export async function removePrMarker(
  ghHome: string,
  projectName: string,
): Promise<void> {
  const markerPath = path.join(ghHome, "state", "pr-pending", `${projectName}.json`);
  try {
    await fs.unlink(markerPath);
  } catch {
    // Already gone or never existed
  }
}

export type SyncResult =
  | { action: "reset"; reason: string }
  | { action: "rebase"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "noop"; reason: string };

/**
 * Smart sync for a single project: fetch from origin, then decide whether
 * to reset (post-PR-merge) or rebase (user pushed independent changes).
 *
 * This replaces the unconditional rebase in the daemon startup sequence.
 * See .lore/design/pr-strategy.md for the full design rationale.
 *
 * Returns a SyncResult describing what happened.
 */
export async function syncProject(
  projectPath: string,
  projectName: string,
  ghHome?: string,
  gitOps?: GitOps,
  defaultBranch?: string,
): Promise<SyncResult> {
  return withProjectLock(projectName, async () => {
    const home = ghHome ?? getGuildHallHome();
    const git = gitOps ?? createGitOps();

    // 1. Fetch from origin. If fetch fails (no remote, offline), fall back
    //    to local rebase (existing behavior for local-only repos).
    let fetchSucceeded = false;
    try {
      await git.fetch(projectPath, "origin");
      fetchSucceeded = true;
    } catch {
      // No remote or offline. Fall through to local rebase.
    }

    // 2. Check for active activities
    if (await hasActiveActivities(home, projectName)) {
      console.log(
        `[sync] Skipping "${projectName}": active activities found`,
      );
      return { action: "skip" as const, reason: "active activities" };
    }

    const targetBranch = defaultBranch ?? await git.detectDefaultBranch(projectPath);
    const iPath = integrationWorktreePath(home, projectName);

    // If fetch failed, do a local rebase (backward compat with no-remote repos)
    if (!fetchSucceeded) {
      try {
        await git.rebase(iPath, targetBranch);
        console.log(`[sync] Rebased ${CLAUDE_BRANCH} onto ${targetBranch} for "${projectName}" (no remote)`);
        return { action: "rebase" as const, reason: "no remote, local rebase" };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Rebase onto ${targetBranch} failed: ${reason}`);
      }
    }

    // 3. Compare ancestry between claude/main and origin/<defaultBranch>
    const remoteRef = `origin/${targetBranch}`;

    const claudeIsAncestor = await git.isAncestor(iPath, CLAUDE_BRANCH, remoteRef);

    if (claudeIsAncestor) {
      // claude/main is behind or equal to origin/<default>. Master has moved ahead.
      // Check if this is a post-PR-merge scenario.

      // First check: are they already at the same commit? (noop)
      const claudeTip = await git.revParse(iPath, CLAUDE_BRANCH);
      const remoteTip = await git.revParse(iPath, remoteRef);
      if (claudeTip === remoteTip) {
        console.log(`[sync] ${CLAUDE_BRANCH} is current with ${remoteRef} for "${projectName}"`);
        return { action: "noop" as const, reason: "already current" };
      }

      // Check PR marker
      const marker = await readPrMarker(home, projectName);
      if (marker && marker.claudeMainTip === claudeTip) {
        // Confirmed post-PR-merge: the PR we created was merged
        await git.resetHard(iPath, remoteRef);
        await removePrMarker(home, projectName);
        console.log(`[sync] Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge (via marker)`);
        return { action: "reset" as const, reason: "PR marker matched" };
      }

      // Fallback heuristic: compare tree content
      if (await git.treesEqual(iPath, CLAUDE_BRANCH, remoteRef)) {
        // Trees match but no marker. Likely a PR merge where the daemon was
        // down during create_pr, or the user pushed matching content.
        await git.resetHard(iPath, remoteRef);
        await removePrMarker(home, projectName);
        console.log(
          `[sync] Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge ` +
          "(marker missing, detected via tree comparison)",
        );
        return { action: "reset" as const, reason: "trees equal, marker missing" };
      }

      // User pushed independent changes to master. Rebase (existing behavior).
      await git.rebase(iPath, remoteRef);
      console.log(`[sync] Rebased ${CLAUDE_BRANCH} onto ${remoteRef} for "${projectName}"`);
      return { action: "rebase" as const, reason: "master advanced with different content" };
    }

    // Check if origin/<default> is ancestor of claude/main
    const remoteIsAncestor = await git.isAncestor(iPath, remoteRef, CLAUDE_BRANCH);

    if (remoteIsAncestor) {
      // claude/main is ahead of origin/<default>. PR not yet merged.
      console.log(`[sync] ${CLAUDE_BRANCH} is ahead of ${remoteRef} for "${projectName}", no sync needed`);
      return { action: "noop" as const, reason: "claude/main ahead" };
    }

    // Diverged: neither is ancestor of the other. This is the typical
    // post-squash-merge state (squash creates a new commit, breaking the
    // ancestry chain between claude/main and origin/<default>).
    const claudeTipDiverged = await git.revParse(iPath, CLAUDE_BRANCH);
    const markerDiverged = await readPrMarker(home, projectName);

    if (markerDiverged) {
      if (markerDiverged.claudeMainTip === claudeTipDiverged) {
        // Exact match: claude/main hasn't moved since the PR was created.
        // Safe to hard reset.
        await git.resetHard(iPath, remoteRef);
        await removePrMarker(home, projectName);
        console.log(`[sync] Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge (via marker, diverged)`);
        return { action: "reset" as const, reason: "PR marker matched (diverged)" };
      }

      // Marker exists but tip advanced (e.g., meeting closed after PR was
      // created). Rebase only the new commits onto the merged origin.
      // git rebase --onto origin/main <marker-tip> claude/main
      try {
        await git.rebaseOnto(iPath, remoteRef, markerDiverged.claudeMainTip);
        await removePrMarker(home, projectName);
        console.log(
          `[sync] Rebased post-PR commits onto ${remoteRef} for "${projectName}" ` +
          `(marker tip: ${markerDiverged.claudeMainTip.slice(0, 8)}, current: ${claudeTipDiverged.slice(0, 8)})`,
        );
        return { action: "rebase" as const, reason: "PR marker + new commits, rebaseOnto" };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Post-PR rebase --onto failed for "${projectName}": ${reason}. Manual resolution required.`,
        );
      }
    }

    if (await git.treesEqual(iPath, CLAUDE_BRANCH, remoteRef)) {
      await git.resetHard(iPath, remoteRef);
      await removePrMarker(home, projectName);
      console.log(
        `[sync] Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge ` +
        "(marker missing, detected via tree comparison, diverged)",
      );
      return { action: "reset" as const, reason: "trees equal (diverged)" };
    }

    // Neither marker nor tree match. Attempt rebase as last resort.
    console.warn(
      `[sync] ${CLAUDE_BRANCH} and ${remoteRef} have diverged for "${projectName}". Attempting rebase.`,
    );
    try {
      await git.rebase(iPath, remoteRef);
      console.log(`[sync] Rebased ${CLAUDE_BRANCH} onto ${remoteRef} for "${projectName}" (diverged)`);
      return { action: "rebase" as const, reason: "diverged, rebased" };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${CLAUDE_BRANCH} and ${remoteRef} have diverged for "${projectName}" ` +
        `and rebase failed: ${reason}. Manual resolution required.`,
      );
    }
  });
}

/**
 * CLI entry point: smart sync (fetch + detect merged PR + reset or rebase)
 * for one or all projects.
 */
export async function sync(
  projectName?: string,
  ghHome?: string,
  gitOps?: GitOps,
): Promise<void> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();
  const config = await readConfig();

  if (projectName) {
    const project = config.projects.find((p) => p.name === projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found in config`);
    }
    await syncProject(project.path, projectName, home, git, project.defaultBranch);
  } else {
    for (const project of config.projects) {
      try {
        await syncProject(project.path, project.name, home, git, project.defaultBranch);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(
          `[sync] Failed to sync "${project.name}": ${reason}`,
        );
      }
    }
  }
}
