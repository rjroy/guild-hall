/**
 * Commission crash recovery.
 *
 * Handles two recovery scenarios on daemon startup:
 *   1. State file exists for an active commission (dispatched/in_progress):
 *      register at the stored status, then transition to failed via the
 *      machine. The enter-failed handler runs all side effects (commit
 *      partial work, clean up worktree, sync status, write state file,
 *      emit event, fire cleanup hooks).
 *   2. Orphaned worktree (worktree exists with commission naming pattern
 *      but no corresponding state file): build a synthetic entry,
 *      register at in_progress, transition to failed through the machine.
 *
 * In-process sessions don't survive daemon restarts, so all active
 * commissions are treated as dead on recovery.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { asCommissionId } from "@/daemon/types";
import type { AppConfig } from "@/lib/types";
import { isNodeError } from "@/lib/types";
import {
  activityWorktreeRoot,
  commissionBranchName,
} from "@/lib/paths";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { ActivityMachine } from "@/daemon/lib/activity-state-machine";
import type { ActiveCommissionEntry } from "./commission-handlers";
import { COMMISSION_TRANSITIONS } from "./commission-handlers";

export interface RecoveryDeps {
  ghHome: string;
  config: Pick<AppConfig, "projects">;
  machine: ActivityMachine<CommissionStatus, CommissionId, ActiveCommissionEntry>;
  trackedEntries: Map<CommissionId, ActiveCommissionEntry>;
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
  let recovered = 0;

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

    const cId = asCommissionId(state.commissionId);

    // Skip commissions already tracked by the machine (defensive guard)
    if (deps.machine.isTracked(cId)) {
      continue;
    }

    const worktreeDir = state.worktreeDir ?? "";
    const branchName = state.branchName ?? "";

    // Validate status against the transition graph before casting
    if (!(state.status in COMMISSION_TRANSITIONS)) {
      console.warn(
        `[commission-recovery] Commission "${state.commissionId}" has unknown status "${state.status}", skipping.`,
      );
      continue;
    }
    const recoveredStatus = state.status as CommissionStatus;

    // Build an ActiveCommissionEntry from state file data
    const now = new Date();
    const entry: ActiveCommissionEntry = {
      commissionId: cId,
      projectName: state.projectName,
      workerName: state.workerName,
      startTime: now,
      lastActivity: now,
      status: recoveredStatus,
      resultSubmitted: false,
      worktreeDir: worktreeDir || undefined,
      branchName: branchName || undefined,
    };

    // In-process sessions don't survive daemon restarts. Any commission
    // that was dispatched or in_progress when the daemon stopped is dead.
    console.log(
      `[commission-recovery] Commission "${state.commissionId}" was ${state.status} when daemon stopped, transitioning to failed.`,
    );

    // Register at the stored status, then transition to failed.
    // The enter-failed handler handles all side effects: commit partial
    // work, remove worktree, sync status to integration, write state
    // file, emit event. Cleanup hooks fire after (enabling auto-dispatch).
    deps.trackedEntries.set(cId, entry);
    deps.machine.register(cId, entry, recoveredStatus);

    try {
      const result = await deps.machine.transition(
        cId,
        recoveredStatus,
        "failed",
        `Recovery: process lost on restart`,
      );
      if (result.outcome === "skipped") {
        console.warn(
          `[commission-recovery] Transition skipped for "${state.commissionId}": ${result.reason}`,
        );
      }
    } catch (err: unknown) {
      console.error(
        `[commission-recovery] Failed to transition "${state.commissionId}" to failed:`,
        errorMessage(err),
      );
      // Clean up phantom entry to prevent permanently invisible commission
      deps.trackedEntries.delete(cId);
      deps.machine.forget(cId);
    }

    recovered++;
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

    for (const dirEntry of entries) {
      // Commission worktrees start with "commission-"
      if (!dirEntry.startsWith("commission-")) continue;

      // The entry name IS the commission ID (commissionWorktreePath uses
      // the raw commissionId which already has the "commission-" prefix).
      const commissionId = dirEntry;

      // Skip if there's a state file (already handled above)
      if (stateFileCommissionIds.has(commissionId)) continue;

      const cId = asCommissionId(commissionId);

      // Skip if already tracked by the machine
      if (deps.machine.isTracked(cId)) continue;

      const orphanWorktreeDir = path.join(worktreeRoot, dirEntry);

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

      const branchName = commissionBranchName(commissionId);

      // Build a synthetic entry for the orphaned worktree
      const now = new Date();
      const entry: ActiveCommissionEntry = {
        commissionId: cId,
        projectName: project.name,
        workerName: "unknown",
        startTime: now,
        lastActivity: now,
        status: "in_progress",
        resultSubmitted: false,
        worktreeDir: orphanWorktreeDir,
        branchName,
      };

      // Register at in_progress and transition to failed.
      // The enter-failed handler's worktree-missing guard handles
      // both present and absent worktrees.
      deps.trackedEntries.set(cId, entry);
      deps.machine.register(cId, entry, "in_progress");

      try {
        const result = await deps.machine.transition(
          cId,
          "in_progress",
          "failed",
          "Recovery: state lost",
        );
        if (result.outcome === "skipped") {
          console.warn(
            `[commission-recovery] Transition skipped for orphan "${commissionId}": ${result.reason}`,
          );
        }
      } catch (err: unknown) {
        console.error(
          `[commission-recovery] Failed to transition orphan "${commissionId}" to failed:`,
          errorMessage(err),
        );
        // Clean up phantom entry to prevent permanently invisible commission
        deps.trackedEntries.delete(cId);
        deps.machine.forget(cId);
      }

      recovered++;
    }
  }

  if (recovered === 0) {
    console.log("[commission-recovery] No commissions to recover.");
  }

  return recovered;
}
