/**
 * Git administration operations that the daemon owns.
 *
 * Contains syncProject(), hasActiveActivities(), rebaseProject(), and
 * PR marker I/O. These were originally in cli/rebase.ts but belong in the
 * daemon since they operate on daemon-owned state (worktrees, state files,
 * project locks) and are consumed by daemon routes and the manager toolbox.
 *
 * Phase 4 of the Daemon Application Boundary migration extracted this code
 * so the daemon no longer imports from @/apps/cli/.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig } from "@/lib/config";
import type { AppConfig } from "@/lib/types";
import { getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/apps/daemon/lib/git";
import { withProjectLock } from "@/apps/daemon/lib/project-lock";
import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";
import type { PrMarker } from "@/apps/daemon/services/manager/toolbox";

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
          scope?: string;
        };
        if (
          state.projectName === projectName &&
          state.status === "open" &&
          state.scope !== "project"
        ) {
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
  log: Log = nullLog("git-admin"),
): Promise<boolean> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();

  if (await hasActiveActivities(home, projectName)) {
    log.info(
      `Skipping rebase for "${projectName}": active activities found`,
    );
    return false;
  }

  const targetBranch = defaultBranch ?? await git.detectDefaultBranch(projectPath);
  const iPath = integrationWorktreePath(home, projectName);
  await git.rebase(iPath, targetBranch);
  log.info(`Rebased claude onto ${targetBranch} for "${projectName}"`);
  return true;
}

// -- PR marker I/O --

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
  | { action: "merge"; reason: string }
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
  log: Log = nullLog("git-admin"),
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
      log.info(
        `Skipping sync for "${projectName}": active activities found`,
      );
      return { action: "skip" as const, reason: "active activities" };
    }

    const targetBranch = defaultBranch ?? await git.detectDefaultBranch(projectPath);
    const iPath = integrationWorktreePath(home, projectName);

    // If fetch failed, do a local rebase (backward compat with no-remote repos)
    if (!fetchSucceeded) {
      try {
        await git.rebase(iPath, targetBranch);
        log.info(`Rebased ${CLAUDE_BRANCH} onto ${targetBranch} for "${projectName}" (no remote)`);
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
        log.info(`${CLAUDE_BRANCH} is current with ${remoteRef} for "${projectName}"`);
        return { action: "noop" as const, reason: "already current" };
      }

      // Check PR marker
      const marker = await readPrMarker(home, projectName);
      if (marker && marker.claudeMainTip === claudeTip) {
        // Confirmed post-PR-merge: the PR we created was merged
        await git.resetHard(iPath, remoteRef);
        await removePrMarker(home, projectName);
        log.info(`Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge (via marker)`);
        return { action: "reset" as const, reason: "PR marker matched" };
      }

      // Fallback heuristic: compare tree content
      if (await git.treesEqual(iPath, CLAUDE_BRANCH, remoteRef)) {
        // Trees match but no marker. Likely a PR merge where the daemon was
        // down during create_pr, or the user pushed matching content.
        await git.resetHard(iPath, remoteRef);
        await removePrMarker(home, projectName);
        log.info(
          `Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge ` +
          "(marker missing, detected via tree comparison)",
        );
        return { action: "reset" as const, reason: "trees equal, marker missing" };
      }

      // User pushed independent changes to master. Rebase (existing behavior).
      await git.rebase(iPath, remoteRef);
      log.info(`Rebased ${CLAUDE_BRANCH} onto ${remoteRef} for "${projectName}"`);
      return { action: "rebase" as const, reason: "master advanced with different content" };
    }

    // Check if origin/<default> is ancestor of claude/main
    const remoteIsAncestor = await git.isAncestor(iPath, remoteRef, CLAUDE_BRANCH);

    if (remoteIsAncestor) {
      // claude/main is ahead of origin/<default>. PR not yet merged.
      log.info(`${CLAUDE_BRANCH} is ahead of ${remoteRef} for "${projectName}", no sync needed`);
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
        log.info(`Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge (via marker, diverged)`);
        return { action: "reset" as const, reason: "PR marker matched (diverged)" };
      }

      // Marker exists but tip advanced (e.g., meeting closed after PR was
      // created). Rebase only the new commits onto the merged origin.
      // git rebase --onto origin/main <marker-tip> claude/main
      try {
        await git.rebaseOnto(iPath, remoteRef, markerDiverged.claudeMainTip);
        await removePrMarker(home, projectName);
        log.info(
          `Rebased post-PR commits onto ${remoteRef} for "${projectName}" ` +
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
      log.info(
        `Reset ${CLAUDE_BRANCH} to ${remoteRef} for "${projectName}" after PR merge ` +
        "(marker missing, detected via tree comparison, diverged)",
      );
      return { action: "reset" as const, reason: "trees equal (diverged)" };
    }

    // Neither marker nor tree match. Merge + compact: merge origin into
    // claude/main, then soft-reset to origin/main and recommit. This
    // produces a single clean commit on top of origin/main containing all
    // of claude/main's unique work. Rebase would try to replay already-
    // squash-merged commits and conflict. The merge resolves content
    // correctly, and the compact keeps claude/main linear and minimal.
    try {
      await git.merge(iPath, remoteRef, `Merge ${remoteRef} into ${CLAUDE_BRANCH}`);
      await git.resetSoft(iPath, remoteRef);
      const hadChanges = await git.commitAll(iPath, `Sync ${CLAUDE_BRANCH} with ${remoteRef}`);
      if (hadChanges) {
        log.info(`Merged and compacted ${CLAUDE_BRANCH} onto ${remoteRef} for "${projectName}"`);
      } else {
        log.info(`Merged ${remoteRef} into ${CLAUDE_BRANCH} for "${projectName}" (no unique work remaining)`);
      }
      return { action: "merge" as const, reason: "diverged, merged and compacted" };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${CLAUDE_BRANCH} and ${remoteRef} have diverged for "${projectName}" ` +
        `and merge failed: ${reason}. Manual resolution required.`,
      );
    }
  });
}

/**
 * Rebase all projects or a single named project.
 * Used by the daemon's POST /admin/rebase route.
 *
 * Accepts config directly so callers (daemon routes) don't need to worry
 * about config path resolution. Falls back to readConfig() for CLI usage.
 */
export async function rebaseAll(
  projectName?: string,
  ghHome?: string,
  gitOps?: GitOps,
  config?: AppConfig,
): Promise<{ results: Array<{ project: string; rebased: boolean; error?: string }> }> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();
  const cfg = config ?? await readConfig();
  const results: Array<{ project: string; rebased: boolean; error?: string }> = [];

  const projects = projectName
    ? cfg.projects.filter((p) => p.name === projectName)
    : cfg.projects;

  if (projectName && projects.length === 0) {
    throw new Error(`Project "${projectName}" not found in config`);
  }

  for (const project of projects) {
    try {
      const rebased = await rebaseProject(project.path, project.name, home, git, project.defaultBranch);
      results.push({ project: project.name, rebased });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({ project: project.name, rebased: false, error: reason });
    }
  }

  return { results };
}

/**
 * Sync all projects or a single named project.
 * Used by the daemon's POST /admin/sync route.
 *
 * Accepts config directly so callers (daemon routes) don't need to worry
 * about config path resolution. Falls back to readConfig() for CLI usage.
 */
export async function syncAll(
  projectName?: string,
  ghHome?: string,
  gitOps?: GitOps,
  config?: AppConfig,
): Promise<{ results: Array<{ project: string; action: string; reason: string; error?: string }> }> {
  const home = ghHome ?? getGuildHallHome();
  const git = gitOps ?? createGitOps();
  const cfg = config ?? await readConfig();
  const results: Array<{ project: string; action: string; reason: string; error?: string }> = [];

  const projects = projectName
    ? cfg.projects.filter((p) => p.name === projectName)
    : cfg.projects;

  if (projectName && projects.length === 0) {
    throw new Error(`Project "${projectName}" not found in config`);
  }

  for (const project of projects) {
    try {
      const result = await syncProject(project.path, project.name, home, git, project.defaultBranch);
      results.push({ project: project.name, action: result.action, reason: result.reason });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({ project: project.name, action: "error", reason, error: reason });
    }
  }

  return { results };
}
