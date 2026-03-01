/**
 * Commission crash recovery.
 *
 * Handles two recovery scenarios on daemon startup:
 *   1. State file exists for an active commission (dispatched/in_progress):
 *      transition to failed, commit partial work, clean up worktree,
 *      preserve branch.
 *   2. Orphaned worktree (worktree exists with commission naming pattern
 *      but no corresponding state file): commit partial work, transition
 *      to failed via integration worktree, preserve branch.
 *
 * In-process sessions don't survive daemon restarts, so all active
 * commissions are treated as dead on recovery.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionId } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type { AppConfig } from "@/lib/types";
import { isNodeError } from "@/lib/types";
import {
  integrationWorktreePath,
  activityWorktreeRoot,
  commissionBranchName,
} from "@/lib/paths";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import {
  updateCommissionStatus,
  appendTimelineEntry,
} from "./commission-artifact-helpers";
import type { EventBus } from "./event-bus";

export interface RecoveryDeps {
  ghHome: string;
  git: {
    commitAll(worktreePath: string, message: string): Promise<boolean>;
    removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
  };
  config: Pick<AppConfig, "projects">;
  eventBus: Pick<EventBus, "emit">;
  activeCommissions: ReadonlyMap<string, unknown>;
  writeStateFile: (id: CommissionId, data: Record<string, unknown>) => Promise<void>;
}

export async function recoverCommissions(deps: RecoveryDeps): Promise<number> {
  const stateDir = path.join(deps.ghHome, "state", "commissions");

  // Track commission IDs with state files for orphan worktree detection
  const stateFileCommissionIds = new Set<string>();

  // -- Scan state files --
  let stateFiles: string[] = [];
  try {
    stateFiles = await fs.readdir(stateDir);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      console.log("[commission-recovery] No commissions state directory found, scanning for orphaned worktrees.");
    } else {
      throw err;
    }
  }

  const stateJsonFiles = stateFiles.filter((f) => f.endsWith(".json"));

  for (const file of stateJsonFiles) {
    let state: {
      commissionId: string;
      projectName: string;
      workerName: string;
      status: string;
      worktreeDir?: string;
      branchName?: string;
    };

    try {
      const raw = await fs.readFile(path.join(stateDir, file), "utf-8");
      state = JSON.parse(raw) as typeof state;
    } catch (err: unknown) {
      console.warn(
        `[commission-recovery] Corrupt state file "${file}", skipping:`,
        errorMessage(err),
      );
      continue;
    }

    stateFileCommissionIds.add(state.commissionId);

    // Only recover active commissions (dispatched or in_progress)
    if (state.status !== "dispatched" && state.status !== "in_progress") {
      continue;
    }

    // Verify the project still exists in config
    const project = deps.config.projects.find((p) => p.name === state.projectName);
    if (!project) {
      console.warn(
        `[commission-recovery] Commission "${state.commissionId}" references unknown project "${state.projectName}", skipping.`,
      );
      continue;
    }

    // Skip commissions already in the active Map (defensive guard)
    if (deps.activeCommissions.has(state.commissionId)) {
      continue;
    }

    const cId = asCommissionId(state.commissionId);
    const worktreeDir = state.worktreeDir ?? "";
    const branchName = state.branchName ?? "";

    // In-process sessions don't survive daemon restarts. Any commission
    // that was dispatched or in_progress when the daemon stopped is dead.
    console.log(
      `[commission-recovery] Commission "${state.commissionId}" was ${state.status} when daemon stopped, transitioning to failed.`,
    );
    await recoverDeadCommission(deps, cId, state.projectName, worktreeDir, branchName, project.path);
  }

  // -- Scan for orphaned worktrees --
  // An orphaned worktree has a commission naming pattern but no state file.
  for (const project of deps.config.projects) {
    const worktreeRoot = activityWorktreeRoot(deps.ghHome, project.name);
    let entries: string[];
    try {
      entries = await fs.readdir(worktreeRoot);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") continue;
      console.warn(
        `[commission-recovery] Failed to scan worktree root for "${project.name}":`,
        errorMessage(err),
      );
      continue;
    }

    for (const entry of entries) {
      // Commission worktrees start with "commission-"
      if (!entry.startsWith("commission-")) continue;

      // The entry name IS the commission ID (commissionWorktreePath uses
      // the raw commissionId which already has the "commission-" prefix).
      const commissionId = entry;

      // Skip if there's a state file (already handled above)
      if (stateFileCommissionIds.has(commissionId)) continue;

      // Skip if already in active Map
      if (deps.activeCommissions.has(commissionId)) continue;

      const orphanWorktreeDir = path.join(worktreeRoot, entry);

      // Verify it's a directory
      try {
        const stat = await fs.stat(orphanWorktreeDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      console.log(
        `[commission-recovery] Found orphaned worktree "${commissionId}" for project "${project.name}" (no state file), transitioning to failed.`,
      );

      const cId = asCommissionId(commissionId);
      const branchName = commissionBranchName(commissionId);

      await recoverDeadCommission(deps, cId, project.name, orphanWorktreeDir, branchName, project.path, "state lost");
    }
  }

  if (stateJsonFiles.length === 0) {
    console.log("[commission-recovery] No commissions to recover.");
  }

  return 0;
}

/**
 * Recovery helper for dead commissions (lost on restart or orphaned worktree).
 * Commits any uncommitted changes in the worktree, transitions the
 * commission to failed in the integration worktree, cleans up the
 * worktree, and preserves the branch.
 */
export async function recoverDeadCommission(
  deps: RecoveryDeps,
  commissionId: CommissionId,
  projectName: string,
  worktreeDir: string,
  branchName: string,
  projectPath: string,
  reason = "process lost on restart",
): Promise<void> {
  const iPath = integrationWorktreePath(deps.ghHome, projectName);

  // Commit any uncommitted changes to preserve partial results
  if (worktreeDir) {
    try {
      const worktreeExists = await fs.access(worktreeDir).then(() => true, () => false);
      if (worktreeExists) {
        const hadChanges = await deps.git.commitAll(
          worktreeDir,
          `Partial work preserved on recovery: ${commissionId}`,
        );
        if (hadChanges) {
          console.log(
            `[commission-recovery] Committed partial results for "${commissionId}" to branch "${branchName}".`,
          );
        } else {
          console.log(
            `[commission-recovery] No uncommitted changes for "${commissionId}".`,
          );
        }
      }
    } catch (err: unknown) {
      console.warn(
        `[commission-recovery] Failed to commit partial results for "${commissionId}":`,
        errorMessage(err),
      );
    }
  }

  // Transition to failed in the integration worktree
  try {
    await updateCommissionStatus(iPath, commissionId, "failed");
    await appendTimelineEntry(
      iPath,
      commissionId,
      "status_failed",
      `Recovery: ${reason}`,
    );
    console.log(
      `[commission-recovery] Transitioned "${commissionId}" to failed in integration worktree.`,
    );
  } catch (err: unknown) {
    console.warn(
      `[commission-recovery] Failed to update integration worktree for "${commissionId}":`,
      errorMessage(err),
    );
  }

  // Remove the activity worktree (branch is preserved)
  if (worktreeDir) {
    try {
      const worktreeExists = await fs.access(worktreeDir).then(() => true, () => false);
      if (worktreeExists) {
        await deps.git.removeWorktree(projectPath, worktreeDir);
        console.log(
          `[commission-recovery] Removed worktree for "${commissionId}".`,
        );
      }
    } catch (err: unknown) {
      console.warn(
        `[commission-recovery] Failed to remove worktree for "${commissionId}":`,
        errorMessage(err),
      );
    }
  }

  // Update state file to reflect the failed status
  try {
    await deps.writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName,
      status: "failed",
    });
  } catch (err: unknown) {
    console.warn(
      `[commission-recovery] Failed to update state file for "${commissionId}":`,
      errorMessage(err),
    );
  }

  deps.eventBus.emit({
    type: "commission_status",
    commissionId: commissionId as string,
    status: "failed",
    reason: `Recovery: ${reason}`,
  });
}
