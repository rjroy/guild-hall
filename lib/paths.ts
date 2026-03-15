import * as fs from "node:fs/promises";
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
 * The commission ID already includes the "commission-" prefix
 * (e.g., "commission-Assistant-20260222-185636").
 */
export function commissionWorktreePath(
  ghHome: string,
  projectName: string,
  commissionId: string,
): string {
  return path.join(ghHome, "worktrees", projectName, commissionId);
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
 * Returns the filesystem path for a commission artifact within a project
 * or worktree root. The commissionId is a plain string here (not the
 * branded CommissionId type from daemon/types.ts) because this module
 * lives in the shared layer.
 */
export function commissionArtifactPath(
  projectPath: string,
  commissionId: string,
): string {
  return path.join(projectPath, ".lore", "commissions", `${commissionId}.md`);
}

/**
 * Returns the git branch name for a commission activity.
 * Follows the same `claude/<type>/<id>` pattern as meetings.
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

/**
 * Returns the file path for a project's cached briefing.
 * Stored at `<ghHome>/state/briefings/<projectName>.json`.
 */
export function briefingCachePath(ghHome: string, projectName: string): string {
  return path.join(ghHome, "state", "briefings", `${projectName}.json`);
}

/**
 * Returns the file path for the all-projects composite briefing cache.
 * Stored at `<ghHome>/state/briefings/_all.json`.
 */
export function allProjectsBriefingCachePath(ghHome: string): string {
  return path.join(ghHome, "state", "briefings", "_all.json");
}

/**
 * Resolves the base path for reading a commission's artifacts.
 *
 * Active commissions (dispatched/in_progress) have their own activity worktree
 * where the worker is writing. We read from there so the UI shows live progress.
 * All other commissions are read from the integration worktree on the claude branch.
 */
export async function resolveCommissionBasePath(
  ghHome: string,
  projectName: string,
  commissionId: string,
): Promise<string> {
  const stateFile = path.join(ghHome, "state", "commissions", `${commissionId}.json`);
  try {
    const raw = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(raw) as { status?: string; worktreeDir?: string };
    if ((state.status === "dispatched" || state.status === "in_progress") && state.worktreeDir) {
      return state.worktreeDir;
    }
  } catch {
    // No state file or can't parse it; fall through to integration worktree
  }
  return integrationWorktreePath(ghHome, projectName);
}

/**
 * Resolves the base path for reading a meeting's artifacts.
 *
 * Open meetings have their own activity worktree where the worker is writing.
 * We read from there so the UI shows live changes. All other meetings are read
 * from the integration worktree on the claude branch.
 */
export async function resolveMeetingBasePath(
  ghHome: string,
  projectName: string,
  meetingId: string,
): Promise<string> {
  const stateFile = path.join(ghHome, "state", "meetings", `${meetingId}.json`);
  try {
    const raw = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(raw) as { status?: string; worktreeDir?: string };
    if (state.status === "open" && state.worktreeDir) {
      return state.worktreeDir;
    }
  } catch {
    // No state file or can't parse it; fall through to integration worktree
  }
  return integrationWorktreePath(ghHome, projectName);
}
