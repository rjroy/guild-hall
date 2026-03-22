/**
 * Type for the halted commission state file.
 *
 * When a commission is halted without submitting a result, the
 * orchestrator persists this state to disk. The state file enables
 * crash recovery and continuation (REQ-COM-37).
 */

export type HaltedCommissionState = {
  commissionId: string;
  projectName: string;
  workerName: string;
  status: "halted";
  worktreeDir: string;
  branchName: string;
  sessionId: string;
  haltedAt: string;
  turnsUsed: number;
  lastProgress: string;
};
