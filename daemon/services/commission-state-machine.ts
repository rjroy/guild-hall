/**
 * Commission status machine.
 *
 * The full transition graph:
 *   pending -> dispatched, blocked, cancelled
 *   blocked -> pending, cancelled
 *   dispatched -> in_progress, failed
 *   in_progress -> completed, failed, cancelled
 *   completed, failed, cancelled -> (terminal, no outgoing edges)
 *
 * Note: blocked <-> pending transitions are defined for completeness but not
 * exercised until Phase 7 (dependency auto-transitions).
 */

import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  updateCommissionStatus,
  appendTimelineEntry,
} from "./commission-artifact-helpers";

export const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled"],
  blocked: ["pending", "cancelled"],
  dispatched: ["in_progress", "failed"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** Returns true for terminal states (no outgoing transitions). */
export function isTerminalStatus(status: CommissionStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

/**
 * Validates that a status transition is allowed by the state machine.
 * Throws an error with a descriptive message if the transition is invalid.
 */
export function validateTransition(
  from: CommissionStatus,
  to: CommissionStatus,
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid commission transition: "${from}" -> "${to}". ` +
        `Valid transitions from "${from}": ${allowed.length > 0 ? allowed.join(", ") : "(none, terminal state)"}`,
    );
  }
}

/**
 * Executes a commission status transition: validates the transition, updates
 * the artifact's status field, and appends a timeline entry with the reason.
 */
export async function transitionCommission(
  projectPath: string,
  commissionId: CommissionId,
  from: CommissionStatus,
  to: CommissionStatus,
  reason: string,
): Promise<void> {
  validateTransition(from, to);
  await updateCommissionStatus(projectPath, commissionId, to);
  await appendTimelineEntry(projectPath, commissionId, `status_${to}`, reason, {
    from,
    to,
  });
}
