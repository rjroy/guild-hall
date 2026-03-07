/**
 * Mail orchestration: sleep flow, reader activation, and wake flow.
 *
 * Extracted from the commission orchestrator to keep mail-specific
 * coordination logic in one place. The commission orchestrator
 * delegates to functions in this module when a commission enters the
 * mail sleep/wake cycle.
 *
 * Dependencies flow in one direction: the commission orchestrator
 * calls these functions, passing the services they need. This module
 * does not import the commission orchestrator.
 */

import * as fs from "node:fs/promises";
import type { CommissionId } from "@/daemon/types";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { CommissionLifecycle } from "@/daemon/services/commission/lifecycle";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import { createMailRecordOps } from "@/daemon/services/mail/record";
import type { MailRecordOps, ParsedMailFile } from "@/daemon/services/mail/record";
import type { SleepingCommissionState, PendingMail } from "@/daemon/services/mail/types";
import type { SdkRunnerOutcome, SessionPrepSpec, SessionPrepDeps, SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner";
import { prepareSdkSession, runSdkSession, drainSdkSession } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { commissionArtifactPath } from "@/lib/paths";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { AppConfig, DiscoveredPackage } from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import { isMailReaderAtCapacity, DEFAULT_MAIL_READER_CAP } from "@/daemon/services/commission/capacity";

// -- Types --

export type MailOrchestratorDeps = {
  lifecycle: CommissionLifecycle;
  recordOps: CommissionRecordOps;
  prepDeps: SessionPrepDeps;
  queryFn: (params: { prompt: string; options: SdkQueryOptions }) => AsyncGenerator<SDKMessage>;
  eventBus: EventBus;
  config: AppConfig;
  packages: DiscoveredPackage[];
  guildHallHome: string;
  gitOps: GitOps;
  mailRecordOps?: MailRecordOps;
};

export type SleepContext = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  worktreeDir: string;
  branchName: string;
  targetWorker: string;
  mailSequence: number;
  mailPath: string;
  outcome: SdkRunnerOutcome;
};

export type PendingReaderActivation = {
  commissionId: CommissionId;
  projectName: string;
  workerName: string;
  worktreeDir: string;
  branchName: string;
  mailFilePath: string;
  readerWorkerName: string;
  mailSequence: number;
};

export type ReaderCompletionResult = {
  wakePrompt: string;
  replyReceived: boolean;
};

// -- Mail orchestrator factory --

export type MailOrchestrator = {
  /**
   * Executes the sleep path after send_mail is detected.
   * Returns true if the sleep transition succeeded, false on failure.
   */
  handleSleep(ctx: SleepContext): Promise<boolean>;

  /**
   * Activates a mail reader session (or queues it if at capacity).
   * Fire-and-forget: the reader runs asynchronously and triggers
   * the wake flow on completion.
   */
  activateMailReader(activation: PendingReaderActivation): void;

  /** Number of currently active mail reader sessions. */
  getActiveReaderCount(): number;

  /** Shut down all active mail readers. */
  shutdownReaders(): void;
};

export type MailOrchestratorCallbacks = {
  writeStateFile: (commissionId: CommissionId, data: Record<string, unknown>) => Promise<void>;
  commissionStatePath: (commissionId: CommissionId) => string;
  enqueueAutoDispatch: () => void;
  /**
   * Called when a resumed commission session completes (after wake).
   * The commission orchestrator uses this to run finalize/cleanup.
   */
  onResumeCompleted: (
    commissionId: CommissionId,
    projectName: string,
    workerName: string,
    worktreeDir: string,
    branchName: string,
    outcome: SdkRunnerOutcome,
    resultSubmitted: boolean,
  ) => Promise<void>;
};

export function createMailOrchestrator(
  deps: MailOrchestratorDeps,
  callbacks: MailOrchestratorCallbacks,
): MailOrchestrator {
  const {
    lifecycle,
    recordOps,
    prepDeps,
    queryFn,
    eventBus,
    config,
    packages,
    guildHallHome,
    gitOps,
  } = deps;

  const mailRecordOps = deps.mailRecordOps ?? createMailRecordOps();

  // -- Internal state --

  /** Active mail reader sessions, keyed by contextId (mail-<cid>-<seq>). */
  const activeReaders = new Map<string, { abortController: AbortController; commissionId: CommissionId }>();

  /** Queue for pending reader activations when at capacity. */
  const readerQueue: PendingReaderActivation[] = [];

  // -- Helpers --

  function mailReaderCap(): number {
    return config.maxConcurrentMailReaders ?? DEFAULT_MAIL_READER_CAP;
  }

  async function readStateFile(commissionId: CommissionId, statePath: string): Promise<SleepingCommissionState | null> {
    try {
      const raw = await fs.readFile(statePath, "utf-8");
      return JSON.parse(raw) as SleepingCommissionState;
    } catch {
      return null;
    }
  }

  async function updateStateFilePendingMail(
    commissionId: CommissionId,
    statePath: string,
    update: Partial<PendingMail>,
  ): Promise<void> {
    const state = await readStateFile(commissionId, statePath);
    if (!state) return;
    state.pendingMail = { ...state.pendingMail, ...update };
    await callbacks.writeStateFile(commissionId, state as unknown as Record<string, unknown>);
  }

  // -- Sleep flow --

  async function handleSleep(ctx: SleepContext): Promise<boolean> {
    const { commissionId, projectName, workerName, worktreeDir, branchName, targetWorker, mailSequence, mailPath, outcome } = ctx;

    // 1. Commit pending changes to commission branch (--no-verify intermediate checkpoint)
    try {
      await gitOps.commitAll(worktreeDir, `Mail sent to ${targetWorker}: ${commissionId as string}`);
    } catch (err: unknown) {
      console.warn(`[mail-orchestrator] pre-sleep commit failed for "${commissionId as string}":`, errorMessage(err));
    }

    // 2. Extract sessionId. If null, fail the commission.
    if (!outcome.sessionId) {
      console.error(`[mail-orchestrator] sleep failed for "${commissionId as string}": no session ID available`);
      try {
        await lifecycle.executionFailed(commissionId, "Sleep failed: no session ID available for resume");
      } catch (err: unknown) {
        console.error(`[mail-orchestrator] executionFailed threw:`, errorMessage(err));
      }
      return false;
    }

    // 3. Transition in_progress -> sleeping
    const sleepResult = await lifecycle.sleep(
      commissionId,
      `Waiting for mail reply from ${targetWorker}`,
    );
    if (sleepResult.outcome === "skipped") {
      console.error(`[mail-orchestrator] sleep transition skipped for "${commissionId as string}": ${sleepResult.reason}`);
      return false;
    }

    // 4. Write sleeping state file
    const pendingMail: PendingMail = {
      mailFilePath: mailPath,
      readerWorkerName: targetWorker,
      readerActive: false,
    };

    await callbacks.writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName,
      workerName,
      status: "sleeping",
      worktreeDir,
      branchName,
      sessionId: outcome.sessionId,
      sleepStartedAt: new Date().toISOString(),
      pendingMail,
    });

    // 5. Append timeline events
    const artifactPath = commissionArtifactPath(worktreeDir, commissionId);
    try {
      await recordOps.appendTimeline(artifactPath, "mail_sent", `Mail sent to ${targetWorker}`, {
        targetWorker,
        mailSequence: String(mailSequence),
        mailPath,
      });
    } catch (err: unknown) {
      console.warn(`[mail-orchestrator] failed to append mail_sent timeline:`, errorMessage(err));
    }

    console.log(`[mail-orchestrator] "${commissionId as string}" entered sleeping state, waiting for reply from ${targetWorker}`);

    // 6. Trigger mail reader activation
    activateMailReader({
      commissionId,
      projectName,
      workerName,
      worktreeDir,
      branchName,
      mailFilePath: mailPath,
      readerWorkerName: targetWorker,
      mailSequence,
    });

    return true;
  }

  // -- Reader activation --

  function activateMailReader(activation: PendingReaderActivation): void {
    if (isMailReaderAtCapacity(activeReaders.size, config)) {
      console.log(`[mail-orchestrator] mail reader at capacity (${activeReaders.size}/${mailReaderCap()}), queuing activation for "${activation.commissionId as string}"`);
      readerQueue.push(activation);
      return;
    }

    void runMailReaderSession(activation);
  }

  async function runMailReaderSession(activation: PendingReaderActivation): Promise<void> {
    const {
      commissionId,
      projectName,
      workerName: _senderName,
      worktreeDir,
      branchName: _branchName,
      mailFilePath,
      readerWorkerName,
      mailSequence,
    } = activation;

    const contextId = `mail-${commissionId as string}-${String(mailSequence).padStart(3, "0")}`;
    const abortController = new AbortController();
    activeReaders.set(contextId, { abortController, commissionId });

    let replyReceived = false;

    try {
      // 1. Update mail status: sent -> open
      await mailRecordOps.updateMailStatus(mailFilePath, "open");

      // 2. Update state file: readerActive = true
      const statePath = callbacks.commissionStatePath(commissionId);
      await updateStateFilePendingMail(commissionId, statePath, { readerActive: true });

      // 3. Read the mail file for activation prompt content
      const mailData = await mailRecordOps.readMailFile(mailFilePath);

      // 4. Read commission title from artifact
      const commissionTitle = await readCommissionTitle(worktreeDir, commissionId);

      // 5. Find the reader's project
      const project = config.projects.find((p) => p.name === projectName);
      if (!project) {
        throw new Error(`Project "${projectName}" not found`);
      }

      // 6. Subscribe to EventBus for mail_reply_received
      const unsubscribe = eventBus.subscribe((event) => {
        if (event.type === "mail_reply_received" && "contextId" in event && event.contextId === contextId) {
          replyReceived = true;
        }
      });

      try {
        // 7. Prepare SDK session for the reader
        const prepSpec: SessionPrepSpec = {
          workerName: readerWorkerName,
          packages,
          config,
          guildHallHome,
          projectName,
          projectPath: project.path,
          workspaceDir: worktreeDir,
          contextId,
          contextType: "mail",
          eventBus,
          activationExtras: {
            mailContext: {
              subject: mailData.subject,
              message: mailData.message,
              commissionTitle,
            },
          },
          abortController,
        };

        const prepResult = await prepareSdkSession(prepSpec, prepDeps);
        if (!prepResult.ok) {
          throw new Error(prepResult.error);
        }

        // 8. Build the activation prompt (REQ-MAIL-25)
        const activationPrompt = buildReaderPrompt(mailData, commissionTitle, activation.workerName);

        // 9. Run and drain the SDK session
        const { options } = prepResult.result;
        const outcome = await drainSdkSession(runSdkSession(queryFn, activationPrompt, options));

        // 10. Handle reader completion
        await handleReaderCompletion(activation, contextId, outcome, replyReceived, mailData);
      } finally {
        unsubscribe();
      }
    } catch (err: unknown) {
      console.error(`[mail-orchestrator] mail reader error for "${commissionId as string}":`, errorMessage(err));
      // Wake the commission with error context
      await wakeCommission(activation, buildErrorWakePrompt(readerWorkerName, errorMessage(err)));
    } finally {
      activeReaders.delete(contextId);

      // Update state file: readerActive = false
      const statePath = callbacks.commissionStatePath(commissionId);
      await updateStateFilePendingMail(commissionId, statePath, { readerActive: false });

      // Dequeue next pending activation
      dequeueNextReader();
    }
  }

  function dequeueNextReader(): void {
    if (readerQueue.length === 0) return;
    if (isMailReaderAtCapacity(activeReaders.size, config)) return;

    const next = readerQueue.shift();
    if (next) {
      console.log(`[mail-orchestrator] dequeuing mail reader for "${next.commissionId as string}"`);
      void runMailReaderSession(next);
    }
  }

  // -- Reader completion --

  async function handleReaderCompletion(
    activation: PendingReaderActivation,
    _contextId: string,
    outcome: SdkRunnerOutcome,
    replyReceived: boolean,
    _mailData: ParsedMailFile,
  ): Promise<void> {
    const { commissionId, worktreeDir, readerWorkerName, mailFilePath } = activation;

    // 1. Commit reader's pending changes (--no-verify)
    try {
      await gitOps.commitAll(worktreeDir, `Mail reader ${readerWorkerName} work: ${commissionId as string}`);
    } catch (err: unknown) {
      console.warn(`[mail-orchestrator] post-reader commit failed:`, errorMessage(err));
    }

    // 2. Build the wake-up prompt based on outcome
    let wakePrompt: string;

    if (replyReceived) {
      // Re-read the mail file to get the reply content
      const updatedMail = await mailRecordOps.readMailFile(mailFilePath);
      wakePrompt = buildReplyWakePrompt(updatedMail, readerWorkerName, mailFilePath);
    } else if (outcome.error) {
      wakePrompt = buildErrorWakePrompt(readerWorkerName, outcome.error);
    } else if (outcome.aborted) {
      // maxTurns exhaustion presents as aborted in some SDK versions;
      // but normally it ends without abort. Use the "no reply" prompt.
      wakePrompt = buildNoReplyWakePrompt(readerWorkerName, "completed without sending a reply");
    } else {
      // Normal end without reply: could be maxTurns or voluntary
      // Check if the session had an error indicating maxTurns
      wakePrompt = buildNoReplyWakePrompt(readerWorkerName, "completed without sending a reply");
    }

    // 3. Append timeline event
    const artifactPath = commissionArtifactPath(worktreeDir, commissionId);
    try {
      if (replyReceived) {
        const updatedMail = await mailRecordOps.readMailFile(mailFilePath);
        const truncatedSummary = (updatedMail.reply?.summary ?? "").slice(0, 200);
        await recordOps.appendTimeline(artifactPath, "mail_reply_received", truncatedSummary, {
          readerWorker: readerWorkerName,
        });
      }
    } catch (err: unknown) {
      console.warn(`[mail-orchestrator] failed to append timeline event:`, errorMessage(err));
    }

    // 4. Wake the commission
    await wakeCommission(activation, wakePrompt);
  }

  // -- Wake flow --

  async function wakeCommission(
    activation: PendingReaderActivation,
    wakePrompt: string,
  ): Promise<void> {
    const { commissionId, projectName, workerName, worktreeDir, branchName } = activation;

    // 1. Read sleeping state to get sessionId
    const statePath = callbacks.commissionStatePath(commissionId);
    const state = await readStateFile(commissionId, statePath);
    if (!state || state.status !== "sleeping") {
      console.warn(`[mail-orchestrator] cannot wake "${commissionId as string}": state is not sleeping`);
      return;
    }

    // 2. Transition sleeping -> in_progress
    const wakeResult = await lifecycle.wake(commissionId, `Mail reply received`);
    if (wakeResult.outcome === "skipped") {
      console.warn(`[mail-orchestrator] wake transition skipped for "${commissionId as string}": ${wakeResult.reason}`);
      return;
    }

    // 3. Append timeline event
    const artifactPath = commissionArtifactPath(worktreeDir, commissionId);
    try {
      await recordOps.appendTimeline(artifactPath, "status_in_progress", "Woke from sleep: mail reply received");
    } catch (err: unknown) {
      console.warn(`[mail-orchestrator] failed to append wake timeline:`, errorMessage(err));
    }

    // 4. Update state file: back to in_progress, clear pendingMail
    await callbacks.writeStateFile(commissionId, {
      commissionId: commissionId as string,
      projectName,
      workerName,
      status: "in_progress",
      worktreeDir,
      branchName,
    });

    // 5. Resume the commission session with the wake prompt
    const project = config.projects.find((p) => p.name === projectName);
    if (!project) {
      console.error(`[mail-orchestrator] project "${projectName}" not found during wake`);
      return;
    }

    console.log(`[mail-orchestrator] waking "${commissionId as string}" with resume session ${state.sessionId}`);

    // Notify the commission orchestrator to resume this commission
    // by calling back into the orchestrator's resume flow
    callbacks.enqueueAutoDispatch();

    // Fire-and-forget: resume the commission session
    void resumeCommissionSession(
      commissionId,
      projectName,
      workerName,
      worktreeDir,
      branchName,
      state.sessionId,
      wakePrompt,
      project.path,
    );
  }

  async function resumeCommissionSession(
    commissionId: CommissionId,
    projectName: string,
    workerName: string,
    worktreeDir: string,
    branchName: string,
    sessionId: string,
    wakePrompt: string,
    projectPath: string,
  ): Promise<void> {
    // These flags are mutated by EventBus callbacks. TypeScript can't narrow
    // closure-mutated variables, so we use an object to avoid the narrowing issue.
    const flags = {
      resultSubmitted: false,
      mailSent: false,
      mailSentData: null as { targetWorker: string; mailSequence: number; mailPath: string } | null,
    };

    // Subscribe to EventBus for tool events
    const unsubscribe = eventBus.subscribe((event) => {
      if (!("commissionId" in event) || event.commissionId !== (commissionId as string)) return;

      if (event.type === "commission_result") {
        flags.resultSubmitted = true;
        const e = event as typeof event & { summary: string; artifacts?: string[] };
        lifecycle.resultSubmitted(commissionId, e.summary, e.artifacts).catch((err: unknown) => {
          console.warn(`[mail-orchestrator] resultSubmitted failed:`, errorMessage(err));
        });
      } else if (event.type === "commission_progress") {
        const e = event as typeof event & { summary: string };
        lifecycle.progressReported(commissionId, e.summary).catch((err: unknown) => {
          console.warn(`[mail-orchestrator] progressReported failed:`, errorMessage(err));
        });
      } else if (event.type === "commission_mail_sent") {
        flags.mailSent = true;
        const e = event as typeof event & { targetWorker: string; mailSequence: number; mailPath: string };
        flags.mailSentData = { targetWorker: e.targetWorker, mailSequence: e.mailSequence, mailPath: e.mailPath };
      }
    });

    const abortController = new AbortController();

    try {
      const prepSpec: SessionPrepSpec = {
        workerName,
        packages,
        config,
        guildHallHome,
        projectName,
        projectPath,
        workspaceDir: worktreeDir,
        contextId: commissionId as string,
        contextType: "commission",
        eventBus,
        activationExtras: {
          commissionContext: {
            commissionId: commissionId as string,
            prompt: wakePrompt,
            dependencies: [],
          },
        },
        abortController,
        resume: sessionId,
      };

      const prepResult = await prepareSdkSession(prepSpec, prepDeps);
      if (!prepResult.ok) {
        console.error(`[mail-orchestrator] resume prep failed for "${commissionId as string}": ${prepResult.error}`);
        try {
          await lifecycle.executionFailed(commissionId, `Resume failed: ${prepResult.error}`);
        } catch (err: unknown) {
          console.error(`[mail-orchestrator] executionFailed threw:`, errorMessage(err));
        }
        lifecycle.forget(commissionId);
        return;
      }

      // If mailSent detected during session, abort to trigger sleep
      const mailSentUnsubscribe = eventBus.subscribe((event) => {
        if (event.type === "commission_mail_sent" && "commissionId" in event && event.commissionId === (commissionId as string)) {
          abortController.abort();
        }
      });

      const { options } = prepResult.result;
      const outcome = await drainSdkSession(runSdkSession(queryFn, wakePrompt, options));

      mailSentUnsubscribe();

      // Handle outcome
      if (flags.mailSent && flags.mailSentData) {
        // Another sleep cycle
        const sleepSuccess = await handleSleep({
          commissionId,
          projectName,
          workerName,
          worktreeDir,
          branchName,
          targetWorker: flags.mailSentData.targetWorker,
          mailSequence: flags.mailSentData.mailSequence,
          mailPath: flags.mailSentData.mailPath,
          outcome,
        });

        if (!sleepSuccess) {
          lifecycle.forget(commissionId);
        }
      } else {
        // Normal completion: delegate to the commission orchestrator
        // for finalize/cleanup via the callback.
        await callbacks.onResumeCompleted(
          commissionId,
          projectName,
          workerName,
          worktreeDir,
          branchName,
          outcome,
          flags.resultSubmitted,
        );
      }
    } catch (err: unknown) {
      console.error(`[mail-orchestrator] resume session error for "${commissionId as string}":`, errorMessage(err));
      try {
        await lifecycle.executionFailed(commissionId, `Resume error: ${errorMessage(err)}`);
      } catch (innerErr: unknown) {
        console.error(`[mail-orchestrator] executionFailed threw:`, errorMessage(innerErr));
      }
      lifecycle.forget(commissionId);
    } finally {
      unsubscribe();
    }
  }

  // -- Prompt builders --

  function buildReaderPrompt(
    mailData: ParsedMailFile,
    commissionTitle: string,
    senderName: string,
  ): string {
    return [
      `You have received a mail consultation request.`,
      ``,
      `**From:** ${mailData.from}`,
      `**Subject:** ${mailData.subject}`,
      `**Commission:** ${commissionTitle}`,
      ``,
      `## Message`,
      ``,
      mailData.message,
      ``,
      `---`,
      ``,
      `Read the message, do the work requested, and call the \`reply\` tool with your findings. You are working in ${senderName}'s worktree for this commission.`,
    ].join("\n");
  }

  function buildReplyWakePrompt(
    mailData: ParsedMailFile,
    readerName: string,
    mailFilePath: string,
  ): string {
    const lines = [
      `Mail reply received from ${readerName}:`,
      ``,
      mailData.reply?.summary ?? "(no summary)",
      ``,
    ];

    const filesModified = mailData.reply?.filesModified;
    if (filesModified && filesModified.length > 0) {
      lines.push(`Files modified by ${readerName}:`);
      for (const f of filesModified) {
        lines.push(`- ${f}`);
      }
      lines.push(``);
    }

    lines.push(`The full reply with details is at ${mailFilePath}`);

    return lines.join("\n");
  }

  function buildNoReplyWakePrompt(readerName: string, reason: string): string {
    return `Mail to ${readerName} was delivered but ${readerName} ${reason}. You may re-send the mail or proceed without a response.`;
  }

  function buildErrorWakePrompt(readerName: string, error: string): string {
    return `Mail to ${readerName} was delivered but the mail session encountered an error: ${error}. You may re-send the mail or proceed without a response.`;
  }

  // -- Helpers --

  async function readCommissionTitle(worktreeDir: string, commissionId: CommissionId): Promise<string> {
    const artifactPath = commissionArtifactPath(worktreeDir, commissionId);
    try {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const titleMatch = raw.match(/^title: "?(.+?)"?$/m);
      return titleMatch ? titleMatch[1] : commissionId as string;
    } catch {
      return commissionId as string;
    }
  }

  // -- Public API --

  return {
    handleSleep,
    activateMailReader,
    getActiveReaderCount: () => activeReaders.size,
    shutdownReaders() {
      for (const [, reader] of activeReaders) {
        reader.abortController.abort();
      }
    },
  };
}
