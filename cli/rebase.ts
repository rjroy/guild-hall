import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readConfig } from "@/lib/config";
import { getGuildHallHome, integrationWorktreePath } from "@/lib/paths";
import { createGitOps, type GitOps } from "@/daemon/lib/git";

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
