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
