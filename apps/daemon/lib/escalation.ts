/**
 * Shared merge conflict escalation.
 *
 * When a squash-merge fails due to non-.lore/ conflicts, both commissions
 * and meetings need to escalate to the Guild Master via a meeting request.
 * This module extracts that pattern so callers don't duplicate the reason
 * string construction and error handling.
 */

import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";

export interface EscalationOpts {
  activityType: "commission" | "meeting";
  activityId: string;
  branchName: string;
  projectName: string;
  createMeetingRequest: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  managerPackageName: string;
  log?: Log;
}

/**
 * Escalates a merge conflict to the Guild Master by creating a meeting request.
 *
 * Builds a reason string that includes the activity type, ID, and branch name
 * with instructions for manual resolution. Catches and logs errors from the
 * meeting request creation without rethrowing, since escalation failure should
 * not block the caller's cleanup flow.
 */
export async function escalateMergeConflict(opts: EscalationOpts): Promise<void> {
  const { activityType, activityId, branchName, projectName, createMeetingRequest, managerPackageName, log: logOpt } = opts;
  const log = logOpt ?? nullLog("escalation");

  const activityLabel = activityType === "commission" ? "Commission" : "Meeting";
  const reason =
    `${activityLabel} ${activityId} (branch ${branchName}) completed but ` +
    `could not merge: non-.lore/ conflicts detected. ` +
    `The activity branch has been preserved. ` +
    `Please resolve conflicts manually and merge ${branchName} into the integration branch.`;

  try {
    await createMeetingRequest({
      projectName,
      workerName: managerPackageName,
      reason,
    });
  } catch (err: unknown) {
    log.error(
      `Failed to escalate merge conflict for ${activityType} "${activityId}":`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
