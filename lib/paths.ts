import * as path from "node:path";

/**
 * Returns the Guild Hall home directory.
 *
 * Resolution order:
 * 1. Explicit homeOverride parameter (replaces HOME, appends .guild-hall)
 * 2. GUILD_HALL_HOME environment variable (direct path, no .guild-hall suffix)
 * 3. ~/.guild-hall/ (production default)
 */
export function getGuildHallHome(homeOverride?: string): string {
  if (homeOverride) return path.join(homeOverride, ".guild-hall");
  if (process.env.GUILD_HALL_HOME) return process.env.GUILD_HALL_HOME;
  const home = process.env.HOME;
  if (!home) {
    throw new Error(
      "Cannot determine home directory: HOME environment variable is not set"
    );
  }
  return path.join(home, ".guild-hall");
}

/**
 * Returns the path to config.yaml.
 * Defaults to ~/.guild-hall/config.yaml but accepts an override for testing.
 */
export function getConfigPath(homeOverride?: string): string {
  return path.join(getGuildHallHome(homeOverride), "config.yaml");
}

/**
 * Returns the .lore/ directory for a project.
 */
export function projectLorePath(projectPath: string): string {
  return path.join(projectPath, ".lore");
}

/**
 * Returns the integration worktree path for a project.
 * This is the Guild Hall-managed checkout on the `claude` branch.
 */
export function integrationWorktreePath(ghHome: string, projectName: string): string {
  return path.join(ghHome, "projects", projectName);
}

/**
 * Returns the root directory for activity worktrees of a project.
 */
export function activityWorktreeRoot(ghHome: string, projectName: string): string {
  return path.join(ghHome, "worktrees", projectName);
}

/**
 * Returns the activity worktree path for a commission.
 */
export function commissionWorktreePath(
  ghHome: string,
  projectName: string,
  commissionId: string,
): string {
  return path.join(ghHome, "worktrees", projectName, `commission-${commissionId}`);
}

/**
 * Returns the activity worktree path for a meeting.
 */
export function meetingWorktreePath(
  ghHome: string,
  projectName: string,
  meetingId: string,
): string {
  return path.join(ghHome, "worktrees", projectName, `meeting-${meetingId}`);
}

/**
 * Returns the git branch name for a commission activity.
 * For re-dispatches, append the attempt number.
 */
export function commissionBranchName(commissionId: string, attempt?: number): string {
  const base = `claude/commission/${commissionId}`;
  return attempt && attempt > 1 ? `${base}-${attempt}` : base;
}

/**
 * Returns the git branch name for a meeting activity.
 */
export function meetingBranchName(meetingId: string): string {
  return `claude/meeting/${meetingId}`;
}
