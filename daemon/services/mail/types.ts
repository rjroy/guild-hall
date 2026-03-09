/**
 * Mail-specific types for worker-to-worker communication.
 *
 * Mail is a context type that lets a commission worker consult another
 * worker mid-execution. These types describe the mail lifecycle, the
 * pending mail state tracked in the commission state file, and the
 * sleeping commission shape.
 */

export type MailStatus = "sent" | "open" | "replied";

export type PendingMail = {
  mailFilePath: string;
  readerWorkerName: string;
  readerActive: boolean;
  /** The mail sequence number for this sleep cycle. Added after initial release;
   *  absent in state files written before this field existed. Recovery treats
   *  missing values as 1 for backwards compatibility. */
  mailSequence?: number;
};

export type SleepingCommissionState = {
  commissionId: string;
  projectName: string;
  workerName: string;
  status: "sleeping";
  worktreeDir: string;
  branchName: string;
  sessionId: string;
  sleepStartedAt: string;
  pendingMail: PendingMail;
};
