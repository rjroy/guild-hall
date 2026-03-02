/**
 * Meeting state machine handlers and transition graph configuration.
 *
 * Defines the meeting-specific graph, active/cleanup state sets, and
 * handler implementations for each enter/exit state. Handlers close over
 * deps from the factory, matching the pattern used by the ActivityMachine.
 *
 * Transition graph (REQ-ASM-23):
 *   requested -> open, declined
 *   open      -> closed
 *   closed    -> (terminal, no outgoing edges)
 *   declined  -> (terminal, no outgoing edges)
 */

import * as path from "node:path";
import type { MeetingId, MeetingStatus, SdkSessionId } from "@/daemon/types";
import type { CheckoutScope } from "@/lib/types";
import type {
  TransitionContext,
  EnterHandler,
  ExitHandler,
  EnterHandlerResult,
  ArtifactOps,
} from "@/daemon/lib/activity-state-machine";
import type { EventBus } from "./event-bus";
import type { GitOps } from "@/daemon/lib/git";
import {
  updateArtifactStatus as updateArtifactStatusImpl,
  appendMeetingLog as appendMeetingLogImpl,
} from "./meeting-artifact-helpers";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

// -- Type alias --

export type MeetingTransitionContext = TransitionContext<
  MeetingId,
  MeetingStatus,
  ActiveMeetingEntry
>;

/**
 * The entry type stored in the ActivityMachine's active Map and state tracker.
 *
 * Mirrors the fields from the existing ActiveMeeting type in meeting-session.ts,
 * structured for the machine's entry model. Fields populated during the open
 * enter handler are required (the handler sets them before the machine tracks
 * the entry as active).
 */
export type ActiveMeetingEntry = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  /** The discovered package name (e.g., "test-assistant"),
   *  used for getWorkerByName lookups during session renewal/recovery. */
  packageName: string;
  sdkSessionId: SdkSessionId | null;
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
  status: MeetingStatus;
};

// -- Transition graph (REQ-ASM-23) --

export const MEETING_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  requested: ["open", "declined"],
  open: ["closed"],
  closed: [],
  declined: [],
};

// -- Configuration constants --

export const MEETING_ACTIVE_STATES: MeetingStatus[] = ["open"];
export const MEETING_CLEANUP_STATES: MeetingStatus[] = ["closed", "declined"];

// -- Handler dependency types --

export interface MeetingHandlerDeps {
  eventBus: Pick<EventBus, "emit">;
  git: GitOps;
  /** Writes a machine-local state file for crash recovery. */
  writeStateFile: (id: MeetingId, data: Record<string, unknown>) => Promise<void>;
  /** Deletes the machine-local state file. */
  deleteStateFile: (id: MeetingId) => Promise<void>;
  /** Squash-merges the activity branch into claude/main under a project lock. */
  finalizeActivity: (opts: {
    activityId: string;
    worktreeDir: string;
    branchName: string;
    projectName: string;
  }) => Promise<{ merged: boolean; preserved: boolean }>;
  /** Creates a Guild Master meeting request for merge conflict escalation. */
  createMeetingRequest?: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  /** The manager worker package name for escalation. */
  managerPackageName: string;
  /** Resolves the project's real path from config. Returns undefined if not found. */
  findProjectPath: (projectName: string) => string | undefined;
  /** Checks whether a file exists on disk. */
  fileExists: (filePath: string) => Promise<boolean>;
  /** Resolves the integration worktree path for a project. */
  integrationWorktreePath: (projectName: string) => string;
  /** Resolves the meeting worktree path for an activity. */
  meetingWorktreePath: (projectName: string, meetingId: string) => string;
  /** Resolves the meeting branch name. */
  meetingBranchName: (meetingId: string) => string;
  /** Ensures a directory exists (recursive). Injected for testability. */
  ensureDir: (dirPath: string) => Promise<void>;
  /** Resolves the worker's declared checkout scope (REQ-MTG-26). Defaults to "full". */
  resolveCheckoutScope: (workerName: string) => CheckoutScope;
  /** Updates the status field in a meeting artifact. Defaults to meeting-artifact-helpers. */
  updateArtifactStatus?: (
    projectPath: string,
    meetingId: MeetingId,
    newStatus: MeetingStatus,
  ) => Promise<void>;
  /** Appends a log entry to a meeting artifact. Defaults to meeting-artifact-helpers. */
  appendMeetingLog?: (
    projectPath: string,
    meetingId: MeetingId,
    event: string,
    reason: string,
  ) => Promise<void>;
  /** The claude/main branch name constant. */
  claudeBranch: string;
  /** Creates a transcript for a new meeting. */
  createTranscript: (
    meetingId: MeetingId,
    workerName: string,
    projectName: string,
  ) => Promise<void>;
  /** Records the initial user turn in a transcript. */
  appendUserTurn: (meetingId: MeetingId, message: string) => Promise<void>;
  /** Reads the full transcript content for notes generation. */
  readTranscript: (meetingId: MeetingId) => Promise<string>;
  /** Removes the transcript file. */
  removeTranscript: (meetingId: MeetingId) => Promise<void>;
  /** Generates meeting notes from transcript and artifact context. */
  generateMeetingNotes: (
    meetingId: MeetingId,
    worktreeDir: string,
    workerName: string,
  ) => Promise<{ success: true; notes: string } | { success: false; reason: string }>;
  /** Writes notes_summary to the meeting artifact. */
  writeNotesToArtifact: (
    projectPath: string,
    meetingId: MeetingId,
    notes: string,
  ) => Promise<void>;
  /**
   * Starts the SDK session for a meeting. Called by the enter-open handler
   * after all git/artifact setup is complete. The session management
   * (queryFn, activation, event translation) is handled externally by
   * meeting-session.ts because it requires full session deps that handlers
   * don't have access to.
   */
  startSdkSession?: (meeting: ActiveMeetingEntry, prompt: string) => Promise<void>;
  /** Writes a meeting artifact to the activity worktree (for inject/direct creation). */
  writeMeetingArtifact?: (
    projectPath: string,
    meetingId: MeetingId,
    workerName: string,
    prompt: string,
    status: MeetingStatus,
  ) => Promise<void>;
  /**
   * Checks dependency satisfaction and triggers auto-dispatch after a
   * successful squash-merge. Optional because not all setups wire this.
   */
  checkDependencyTransitions?: (projectName: string) => Promise<void>;
}

// -- Handler implementations --

/**
 * Exit handler for the "open" state.
 *
 * Signals the running SDK session to stop via the AbortController. This
 * ensures the agent process terminates before the enter handler for the
 * target state (closed) runs cleanup (notes generation, squash-merge, etc.).
 */
export function createExitOpen(
  _deps: MeetingHandlerDeps,
): ExitHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> {
  // ExitHandler contract requires Promise<void>; abort() is synchronous.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (ctx: MeetingTransitionContext): Promise<void> => {
    if (ctx.entry.abortController) {
      ctx.entry.abortController.abort();
    }
  };
}

/**
 * Enter handler for the "open" state (REQ-ASM-24 / REQ-ASM-25).
 *
 * Two paths depending on sourceState:
 * - From "requested" (ctx.sourceState === "requested"): Accept meeting request.
 *   Read artifact from integration worktree. Create activity branch from claude
 *   and worktree. Configure sparse checkout. Write state file. Create transcript,
 *   record initial user turn. Start SDK session.
 * - Direct creation (ctx.sourceState === null, inject): Create artifact with
 *   status "open" in the activity worktree. Otherwise identical setup.
 *
 * Note: git ops use cleanGitEnv() internally (Phase 5 retro lesson).
 */
export function createEnterOpen(
  deps: MeetingHandlerDeps,
): EnterHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> {
  return async (ctx: MeetingTransitionContext): Promise<EnterHandlerResult> => {
    const { entry, id } = ctx;
    const isAccept = ctx.sourceState === "requested";
    const isInject = ctx.sourceState === null;
    const updateStatus = deps.updateArtifactStatus ?? updateArtifactStatusImpl;
    const appendLog = deps.appendMeetingLog ?? appendMeetingLogImpl;

    const projectPath = deps.findProjectPath(entry.projectName);
    if (!projectPath) {
      throw new Error(`Project "${entry.projectName}" not found in config`);
    }

    // 1. Create activity branch from claude/main and worktree
    const branchName = deps.meetingBranchName(id as string);
    const worktreeDir = deps.meetingWorktreePath(entry.projectName, id as string);

    await deps.git.createBranch(projectPath, branchName, deps.claudeBranch);
    // Ensure parent directory exists (git createWorktree needs the target to NOT exist)
    await deps.ensureDir(path.dirname(worktreeDir));
    await deps.git.createWorktree(projectPath, worktreeDir, branchName);

    // 2. Configure checkout scope per worker declaration (REQ-MTG-26)
    const checkoutScope = deps.resolveCheckoutScope(entry.workerName);
    if (checkoutScope === "sparse") {
      await deps.git.configureSparseCheckout(worktreeDir, [".lore/"]);
    }

    // 3. Handle artifact operations based on path
    if (isAccept) {
      // Accepting a request: artifact already exists on integration worktree,
      // it was inherited when the branch forked from claude/main.
      // Update status to "open" on the activity worktree.
      await updateStatus(worktreeDir, id, "open");
      await appendLog(worktreeDir, id, "opened", "User accepted meeting request");
    } else if (isInject) {
      // Direct creation: write a new artifact with status "open"
      if (deps.writeMeetingArtifact) {
        await deps.writeMeetingArtifact(
          worktreeDir,
          id,
          entry.workerName,
          ctx.reason, // The reason doubles as the agenda for direct creation
          "open",
        );
      }
    }

    // 4. Populate entry fields
    entry.worktreeDir = worktreeDir;
    entry.branchName = branchName;
    entry.status = "open";

    // 5. Write machine-local state file
    await deps.writeStateFile(id, {
      meetingId: id as string,
      projectName: entry.projectName,
      workerName: entry.workerName,
      packageName: entry.packageName,
      sdkSessionId: null,
      worktreeDir,
      branchName,
      status: "open",
    });

    // 6. Create transcript and record initial user turn
    try {
      await deps.createTranscript(id, entry.workerName, entry.projectName);
      await deps.appendUserTurn(id, ctx.reason);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Failed to create transcript for "${id as string}":`,
        errorMessage(err),
      );
      // Non-fatal: transcript failure shouldn't block meeting creation
    }

    // 7. Start SDK session (handled externally by meeting-session.ts)
    if (deps.startSdkSession) {
      try {
        await deps.startSdkSession(entry, ctx.reason);
      } catch (err: unknown) {
        console.warn(
          `[meeting] SDK session start failed for "${id as string}":`,
          errorMessage(err),
        );
        // Non-fatal for the handler; session can be retried via sendMessage
      }
    }

    deps.eventBus.emit({
      type: "meeting_started",
      meetingId: id as string,
      worker: entry.workerName,
    });

    console.log(
      `[meeting] "${id as string}" open: branch="${branchName}", worktree="${worktreeDir}"`,
    );

    return undefined;
  };
}

/**
 * Enter handler for the "closed" state (REQ-ASM-26).
 *
 * 1. Abort any active SDK generation via AbortController (already done by exit-open).
 * 2. Generate meeting notes from transcript.
 * 3. Write notes to artifact.
 * 4. Call finalizeActivity() to squash-merge.
 * 5. On success: delete state file, return { mergeSucceeded: true }.
 * 6. On conflict: preserve branch, escalate to Guild Master meeting request.
 *
 * Removes transcript if notes generation succeeded. Machine handles Map removal.
 *
 * Exception handling follows Phase 3 silent-failure-hunter review:
 * - finalizeActivity exceptions are distinguished from merge conflicts
 * - Worktree cleanup operations are wrapped in try/catch
 * - Meeting escalation is awaited, not fire-and-forget
 */
export function createEnterClosed(
  deps: MeetingHandlerDeps,
): EnterHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> {
  return async (ctx: MeetingTransitionContext): Promise<EnterHandlerResult> => {
    const { entry, id } = ctx;
    entry.status = "closed";

    // 1. Generate notes from transcript
    let notesResult: { success: true; notes: string } | { success: false; reason: string };
    try {
      notesResult = await deps.generateMeetingNotes(
        id,
        entry.worktreeDir,
        entry.workerName,
      );
    } catch (err: unknown) {
      const errMsg = errorMessage(err);
      console.error(
        `[meeting] Notes generation threw for "${id as string}":`,
        errMsg,
      );
      notesResult = { success: false, reason: `Notes generation failed: ${errMsg}` };
    }

    const notesGenerationFailed = !notesResult.success;
    const notes = notesResult.success ? notesResult.notes : notesResult.reason;

    // 2. Write notes to artifact on the activity worktree
    try {
      await deps.writeNotesToArtifact(entry.worktreeDir, id, notes);
    } catch (err: unknown) {
      console.error(
        `[meeting] Failed to write notes to artifact for "${id as string}":`,
        errorMessage(err),
      );
    }

    // 3. Squash-merge activity branch into claude/main
    if (!entry.worktreeDir || !entry.branchName) {
      console.warn(
        `[meeting] "${id as string}" closed but missing worktree/branch info, skipping merge`,
      );
      deps.eventBus.emit({ type: "meeting_ended", meetingId: id as string });
      return { mergeSucceeded: false };
    }

    let mergeResult: { merged: boolean; preserved: boolean };
    try {
      mergeResult = await deps.finalizeActivity({
        activityId: id as string,
        worktreeDir: entry.worktreeDir,
        branchName: entry.branchName,
        projectName: entry.projectName,
      });
    } catch (err: unknown) {
      // Infrastructure failure (not a merge conflict). Log and return
      // mergeSucceeded: false. Unlike commissions, meetings don't re-entrant
      // transition to a different state on finalize failure.
      const errMsg = errorMessage(err);
      console.error(
        `[meeting] finalizeActivity threw for "${id as string}":`,
        errMsg,
      );
      deps.eventBus.emit({ type: "meeting_ended", meetingId: id as string });
      return { mergeSucceeded: false };
    }

    if (mergeResult.merged) {
      // Success: clean up state file, emit event
      try {
        await deps.deleteStateFile(id);
      } catch (err: unknown) {
        console.warn(
          `[meeting] Failed to delete state file for "${id as string}":`,
          errorMessage(err),
        );
      }

      deps.eventBus.emit({ type: "meeting_ended", meetingId: id as string });

      // After merge, new artifacts may satisfy blocked commission dependencies
      if (deps.checkDependencyTransitions) {
        try {
          await deps.checkDependencyTransitions(entry.projectName);
        } catch (err: unknown) {
          console.warn(
            `[meeting] Dependency transition check failed after merge for "${id as string}":`,
            errorMessage(err),
          );
        }
      }

      console.log(
        `[meeting] "${id as string}" squash-merged to claude and cleaned up`,
      );

      // Only remove transcript if notes generated successfully.
      // Preserve the transcript for manual review if notes failed.
      if (!notesGenerationFailed) {
        try {
          await deps.removeTranscript(id);
        } catch (err: unknown) {
          console.debug(
            `[meeting] Transcript removal skipped for "${id as string}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      return { mergeSucceeded: true };
    }

    // 4. Merge failed due to non-.lore/ conflicts. Escalate to Guild Master.
    if (deps.createMeetingRequest) {
      const escalationReason =
        `Meeting ${id as string} (branch ${entry.branchName}) completed but ` +
        `could not merge: non-.lore/ conflicts detected. ` +
        `The activity branch has been preserved. ` +
        `Please resolve conflicts manually and merge ${entry.branchName} into the integration branch.`;
      try {
        await deps.createMeetingRequest({
          projectName: entry.projectName,
          workerName: deps.managerPackageName,
          reason: escalationReason,
        });
      } catch (err: unknown) {
        console.error(
          `[meeting] Failed to escalate merge conflict for "${id as string}":`,
          errorMessage(err),
        );
      }
    }

    deps.eventBus.emit({ type: "meeting_ended", meetingId: id as string });

    console.log(
      `[meeting] "${id as string}" merge failed: non-.lore/ conflicts. Branch preserved.`,
    );

    // Remove transcript on successful notes even when merge fails
    if (!notesGenerationFailed) {
      try {
        await deps.removeTranscript(id);
      } catch (err: unknown) {
        console.debug(
          `[meeting] Transcript removal skipped for "${id as string}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return { mergeSucceeded: false };
  };
}

/**
 * Enter handler for the "declined" state (REQ-ASM-27).
 *
 * Fully implemented. Declined meetings have no worktree or branch.
 * The machine handles artifact status write and timeline append via
 * ArtifactOps. This handler only emits the meeting_ended event.
 */
export function createEnterDeclined(
  deps: MeetingHandlerDeps,
): EnterHandler<MeetingId, MeetingStatus, ActiveMeetingEntry> {
  // EnterHandler contract requires Promise; emit is synchronous.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (ctx: MeetingTransitionContext): Promise<EnterHandlerResult> => {
    ctx.entry.status = "declined";

    deps.eventBus.emit({
      type: "meeting_ended",
      meetingId: ctx.id as string,
    });

    console.log(
      `[meeting] "${ctx.id as string}" declined: ${ctx.reason}`,
    );

    return undefined;
  };
}

// -- ArtifactOps configuration --

/**
 * Creates the meeting-specific ArtifactOps for the ActivityMachine.
 *
 * resolveBasePath: uses the entry lookup to find worktreeDir for active
 * entries, falling back to the integration worktree for inactive ones.
 *
 * writeStatusAndTimeline: delegates to updateArtifactStatus +
 * appendMeetingLog from meeting-artifact-helpers.
 */
export function createMeetingArtifactOps(
  deps: Pick<MeetingHandlerDeps, "integrationWorktreePath">,
  entryLookup?: (id: MeetingId) => ActiveMeetingEntry | undefined,
): ArtifactOps<MeetingId, MeetingStatus> {
  return {
    writeStatusAndTimeline: async (
      id: MeetingId,
      basePath: string,
      toStatus: MeetingStatus,
      reason: string,
      _metadata?: { from?: MeetingStatus },
    ): Promise<void> => {
      await updateArtifactStatusImpl(basePath, id, toStatus);
      await appendMeetingLogImpl(basePath, id, toStatus, reason);
    },
    resolveBasePath: (id: MeetingId, isActive: boolean): string => {
      const entry = entryLookup?.(id);
      if (!entry) {
        // The machine always has the entry tracked, so reaching this
        // point indicates a wiring bug.
        throw new Error(
          `Cannot resolve artifact base path for meeting ${id as string}: entry not found in lookup.`,
        );
      }
      if (isActive && entry.worktreeDir) {
        return entry.worktreeDir;
      }
      return deps.integrationWorktreePath(entry.projectName);
    },
  };
}

// -- Factory function --

export interface MeetingHandlersResult {
  handlers: {
    enter: Partial<Record<MeetingStatus, EnterHandler<MeetingId, MeetingStatus, ActiveMeetingEntry>>>;
    exit: Partial<Record<MeetingStatus, ExitHandler<MeetingId, MeetingStatus, ActiveMeetingEntry>>>;
  };
  transitions: Record<MeetingStatus, MeetingStatus[]>;
  activeStates: MeetingStatus[];
  cleanupStates: MeetingStatus[];
  createArtifactOps: (
    entryLookup: (id: MeetingId) => ActiveMeetingEntry | undefined,
  ) => ArtifactOps<MeetingId, MeetingStatus>;
}

/**
 * Factory function that creates all meeting handlers, the transition
 * graph, and configuration constants for the ActivityMachine.
 *
 * The returned object provides createArtifactOps (a factory that accepts
 * an entry lookup function) instead of a static artifactOps. This allows
 * the ArtifactOps to resolve paths through the machine's state tracker.
 */
export function createMeetingHandlers(
  deps: MeetingHandlerDeps,
): MeetingHandlersResult {
  return {
    handlers: {
      enter: {
        open: createEnterOpen(deps),
        closed: createEnterClosed(deps),
        declined: createEnterDeclined(deps),
      },
      exit: {
        open: createExitOpen(deps),
      },
    },
    transitions: MEETING_TRANSITIONS,
    activeStates: MEETING_ACTIVE_STATES,
    cleanupStates: MEETING_CLEANUP_STATES,
    createArtifactOps: (entryLookup) => createMeetingArtifactOps(deps, entryLookup),
  };
}
