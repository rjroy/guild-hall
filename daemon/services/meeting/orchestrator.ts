/**
 * Meeting session lifecycle management.
 *
 * Orchestration core: CRUD operations, SDK session runner, and session
 * renewal. Uses a MeetingRegistry for active entry tracking, WorkspaceOps
 * for git branch/worktree provisioning, meeting/record ops for artifact I/O,
 * and shared escalation for merge conflict handling.
 *
 * Two ID namespaces exist and must never be mixed:
 * - MeetingId: Guild Hall's own ID for a meeting (branded type)
 * - SdkSessionId: The SDK's session_id from the init message (branded type)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  CheckoutScope,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import { getWorkerByName } from "@/lib/packages";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import { noopEventBus, type EventBus } from "@/daemon/lib/event-bus";
import {
  MANAGER_PACKAGE_NAME,
  activateWorker as activateWorkerShared,
} from "@/daemon/services/manager/worker";
import { buildManagerContext } from "@/daemon/services/manager/context";
import {
  prepareSdkSession,
  runSdkSession,
  isSessionExpiryError,
  type SessionPrepSpec,
  type SessionPrepDeps,
  type SdkQueryOptions,
} from "@/daemon/services/sdk-runner";
import type { GuildHallEvent, MeetingId, MeetingStatus, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";
import {
  createTranscript,
  appendUserTurn,
  readTranscript,
  removeTranscript,
  truncateTranscript,
  appendAssistantTurnSafe,
  type ToolUseEntry,
} from "@/daemon/services/meeting/transcript";
import {
  getGuildHallHome,
  meetingWorktreePath as meetingWorktreePathFn,
  meetingBranchName as meetingBranchNameFn,
  integrationWorktreePath as integrationWorktreePathFn,
} from "@/lib/paths";
import matter from "gray-matter";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { errorMessage, formatTimestamp, sanitizeForGitRef } from "@/daemon/lib/toolbox-utils";
import { withProjectLock } from "@/daemon/lib/project-lock";
import {
  meetingArtifactPath,
  appendMeetingLog,
  closeArtifact,
  readArtifactStatus,
  updateArtifactStatus,
  readLinkedArtifacts,
  writeMeetingArtifact,
} from "@/daemon/services/meeting/record";
import {
  generateMeetingNotes,
} from "@/daemon/services/meeting/notes-generator";
import { isNodeError } from "@/lib/types";
import { loadMemories } from "@/daemon/services/memory-injector";
import { triggerCompaction } from "@/daemon/services/memory-compaction";
import { MeetingRegistry, type ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
import type { WorkspaceOps } from "@/daemon/services/workspace";
import { escalateMergeConflict } from "@/daemon/lib/escalation";

// -- Constants --

const DEFAULT_MEETING_CAP = 5;

// -- Re-exports for backward compatibility --
// QueryOptions re-exported so notes-generator, briefing-generator, and
// memory-compaction can keep importing from the meeting orchestrator without
// reaching into sdk-runner. Remove once those modules migrate (Task 008).

export type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
export type { SdkQueryOptions as QueryOptions } from "@/daemon/services/sdk-runner";

// -- Dependency types --

export type MeetingSessionDeps = {
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome?: string;
  /**
   * DI seam: tests pass a mock async generator, production passes the real
   * SDK query() function. The function takes { prompt, options } and returns
   * an async generator that yields SDKMessages.
   */
  queryFn?: (params: {
    prompt: string;
    options: SdkQueryOptions;
  }) => AsyncGenerator<SDKMessage>;
  /**
   * DI seam for notes generation. Same type signature as queryFn, but used
   * for the single-turn notes summary call at meeting close. If omitted,
   * notes generation returns placeholder text.
   */
  notesQueryFn?: (params: {
    prompt: string;
    options: SdkQueryOptions;
  }) => AsyncGenerator<SDKMessage>;
  /**
   * DI seam for worker activation. Tests can provide a mock that returns a
   * canned ActivationResult without touching the filesystem.
   * If omitted, the real dynamic import of the worker's index.ts is used.
   */
  activateFn?: (
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ) => Promise<ActivationResult>;
  /**
   * DI seam for git operations. Tests pass a mock to avoid real git calls.
   * If omitted, the real createGitOps() is used.
   */
  gitOps?: GitOps;
  /**
   * Commission session reference. Required for the manager worker's toolbox,
   * which needs to create and dispatch commissions. Optional because regular
   * workers don't use it.
   */
  commissionSession?: CommissionSessionForRoutes;
  /**
   * Event bus reference. Required for the manager worker's toolbox to emit
   * commission_manager_note events. Optional because regular workers don't
   * use it.
   */
  eventBus?: EventBus;
  /**
   * Optional callback invoked when a squash-merge fails due to non-.lore/
   * conflicts at meeting close. Creates a Guild Master meeting request to
   * surface the unmerged branch to the user. If absent, the conflict is
   * logged but not escalated. Meeting still closes with status "closed".
   */
  createMeetingRequestFn?: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  /**
   * Workspace operations for git branch/worktree provisioning and finalization.
   * If omitted, a default WorkspaceOps is created from gitOps.
   */
  workspace?: WorkspaceOps;
  /**
   * Active meeting registry. If omitted, a new registry is created.
   * Pass a shared instance when the daemon needs a single registry
   * across all consumers.
   */
  registry?: MeetingRegistry;
};

// -- Factory --

export function createMeetingSession(deps: MeetingSessionDeps) {
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  const git = deps.gitOps ?? createGitOps();
  const eventBus = deps.eventBus ?? noopEventBus;
  let meetingSeq = 0;

  // Registry tracks active meeting entries. Shared instance when provided,
  // otherwise local to this session.
  const registry = deps.registry ?? new MeetingRegistry();

  // Workspace ops for git provisioning. If not provided, create from gitOps.
  // Lazy-import createWorkspaceOps only when needed to avoid circular deps.
  let workspaceOps: WorkspaceOps | undefined = deps.workspace;

  async function getWorkspace(): Promise<WorkspaceOps> {
    if (workspaceOps) return workspaceOps;
    const { createWorkspaceOps } = await import("@/daemon/services/workspace");
    workspaceOps = createWorkspaceOps({ git });
    return workspaceOps;
  }

  // -- Helpers --

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  /** Serializes an ActiveMeetingEntry to the shape written to state files. */
  function serializeMeetingState(
    meeting: ActiveMeetingEntry,
    status: MeetingStatus = meeting.status,
  ): Record<string, unknown> {
    return {
      meetingId: meeting.meetingId,
      projectName: meeting.projectName,
      workerName: meeting.workerName,
      packageName: meeting.packageName,
      sdkSessionId: meeting.sdkSessionId,
      worktreeDir: meeting.worktreeDir,
      branchName: meeting.branchName,
      status,
    };
  }

  function formatMeetingId(workerName: string, now: Date): MeetingId {
    const ts = formatTimestamp(now);
    const seq = meetingSeq++;
    // Append sequence number only when needed to avoid collisions within
    // the same second. Sequence 0 is omitted for clean default IDs.
    const suffix = seq > 0 ? `-${seq}` : "";
    const safeName = sanitizeForGitRef(workerName);
    return asMeetingId(`audience-${safeName}-${ts}${suffix}`);
  }

  function statePath(meetingId: MeetingId): string {
    return path.join(ghHome, "state", "meetings", `${meetingId}.json`);
  }

  async function writeStateFile(
    meetingId: MeetingId,
    data: Record<string, unknown>,
  ): Promise<void> {
    const filePath = statePath(meetingId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async function deleteStateFile(meetingId: MeetingId): Promise<void> {
    try {
      await fs.unlink(statePath(meetingId));
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return;
      console.warn(
        `[meeting] Failed to delete state file for "${meetingId as string}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async function activateWorker(
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    return activateWorkerShared(workerPkg, context, deps.activateFn);
  }

  function resolveCheckoutScope(workerName: string): CheckoutScope {
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    if (workerPkg && "checkoutScope" in workerPkg.metadata) {
      return workerPkg.metadata.checkoutScope;
    }
    return "full";
  }

  // -- Open flow: shared between acceptMeetingRequest and createMeeting --

  /**
   * Provisions a workspace (branch + worktree + sparse checkout) for a meeting.
   * Populates the entry's worktreeDir and branchName fields.
   * On failure after partial setup, cleans up the workspace.
   */
  async function provisionWorkspace(
    entry: ActiveMeetingEntry,
    projectPath: string,
  ): Promise<void> {
    const workspace = await getWorkspace();
    const branchName = meetingBranchNameFn(entry.meetingId as string);
    const worktreeDir = meetingWorktreePathFn(ghHome, entry.projectName, entry.meetingId as string);
    const checkoutScope = resolveCheckoutScope(entry.workerName);

    await workspace.prepare({
      projectPath,
      baseBranch: CLAUDE_BRANCH,
      activityBranch: branchName,
      worktreeDir,
      checkoutScope,
      sparsePatterns: checkoutScope === "sparse" ? [".lore/"] : undefined,
    });

    entry.worktreeDir = worktreeDir;
    entry.branchName = branchName;
    entry.status = "open";
  }

  /**
   * Creates the transcript, writes the state file, and records the initial
   * user turn. Non-fatal failures are logged but don't block the meeting.
   */
  async function setupTranscriptAndState(
    entry: ActiveMeetingEntry,
    prompt: string,
  ): Promise<void> {
    // Write state file
    await writeStateFile(entry.meetingId, serializeMeetingState(entry));

    // Create transcript and record initial user turn
    try {
      await createTranscript(entry.meetingId, entry.workerName, entry.projectName, ghHome);
      await appendUserTurn(entry.meetingId, prompt, ghHome);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Failed to create transcript for "${entry.meetingId as string}":`,
        errorMessage(err),
      );
      // Non-fatal: transcript failure shouldn't block meeting creation
    }
  }

  /**
   * Cleans up a meeting entry that failed after registration. Deregisters
   * from the registry and attempts to remove the worktree if one was created.
   */
  async function cleanupFailedEntry(entry: ActiveMeetingEntry, projectPath: string): Promise<void> {
    registry.deregister(entry.meetingId);
    if (entry.worktreeDir) {
      try {
        const workspace = await getWorkspace();
        await workspace.removeWorktree(entry.worktreeDir, projectPath);
      } catch (err: unknown) {
        console.warn(
          `[meeting] Failed to clean up worktree for "${entry.meetingId as string}":`,
          errorMessage(err),
        );
      }
    }
  }

  // -- SDK session preparation --
  //
  // Constructs SessionPrepDeps from the meeting orchestrator's existing imports,
  // keeping the external DI surface (MeetingSessionDeps) unchanged.

  const prepDeps: SessionPrepDeps = {
    resolveToolSet,
    loadMemories: async (workerName, projectName, memDeps) => {
      // Meeting orchestrator treats memory load failure as non-fatal (warn and
      // continue with empty memory). Wrap to preserve that behavior since
      // prepareSdkSession would otherwise return ok:false on failure.
      try {
        return await loadMemories(workerName, projectName, memDeps);
      } catch (err: unknown) {
        console.warn(
          `[meeting] Failed to load memories for "${workerName}" (non-fatal):`,
          errorMessage(err),
        );
        return { memoryBlock: "", needsCompaction: false };
      }
    },
    activateWorker,
    triggerCompaction: deps.queryFn
      ? (workerName, projectName, opts) => {
          void triggerCompaction(workerName, projectName, {
            guildHallHome: opts.guildHallHome,
            compactFn: deps.queryFn!,
          });
        }
      : undefined,
  };

  /**
   * Builds a SessionPrepSpec for a meeting. The caller passes the meeting entry,
   * prompt (for meetingContext.agenda), and optional resume session ID.
   */
  async function buildMeetingPrepSpec(
    meeting: ActiveMeetingEntry,
    prompt: string,
    resumeSessionId?: SdkSessionId,
  ): Promise<{ ok: true; spec: SessionPrepSpec } | { ok: false; reason: string }> {
    const project = findProject(meeting.projectName);
    if (!project) {
      return { ok: false, reason: `Project "${meeting.projectName}" not found` };
    }

    // Determine if this is the manager worker for manager-specific context
    const workerPkg = getWorkerByName(deps.packages, meeting.packageName);
    const isManager = workerPkg?.name === MANAGER_PACKAGE_NAME;

    // Build activation extras (meeting context + optional manager context)
    const activationExtras: Partial<ActivationContext> = {
      meetingContext: {
        meetingId: meeting.meetingId,
        agenda: prompt,
        referencedArtifacts: [],
      },
    };

    if (isManager) {
      activationExtras.managerContext = await buildManagerContext({
        packages: deps.packages,
        projectName: meeting.projectName,
        integrationPath: integrationWorktreePathFn(ghHome, meeting.projectName),
        guildHallHome: ghHome,
        memoryLimit: project.memoryLimit,
      });
    }

    const spec: SessionPrepSpec = {
      workerName: meeting.workerName,
      packages: deps.packages,
      config: deps.config,
      guildHallHome: ghHome,
      projectName: meeting.projectName,
      projectPath: project.path,
      workspaceDir: meeting.worktreeDir,
      contextId: meeting.meetingId,
      contextType: "meeting",
      eventBus,
      services: isManager && deps.commissionSession
        ? { commissionSession: deps.commissionSession, gitOps: git }
        : undefined,
      activationExtras,
      abortController: meeting.abortController,
      includePartialMessages: true,
      ...(resumeSessionId ? { resume: resumeSessionId as string } : {}),
    };

    return { ok: true, spec };
  }

  // -- Session loop helper --
  //
  // Iterates runSdkSession, maps SdkRunnerEvent to GuildHallEvent, accumulates
  // transcript data, and appends the assistant turn after the loop completes.
  // suppressExpiryErrors: when true, session-expiry errors are tracked for
  // post-loop detection but withheld from SSE (sendMessage path).

  async function* iterateSession(
    meeting: ActiveMeetingEntry,
    prompt: string,
    options: SdkQueryOptions,
    suppressExpiryErrors: boolean,
  ): AsyncGenerator<GuildHallEvent, { lastError: string | null; hasExpiryError: boolean }> {
    if (!deps.queryFn) {
      yield { type: "error", reason: "No queryFn provided" };
      return { lastError: "No queryFn provided", hasExpiryError: false };
    }

    const textParts: string[] = [];
    const toolUses: ToolUseEntry[] = [];
    let pendingToolName: string | null = null;
    let lastError: string | null = null;
    let hasExpiryError = false;

    for await (const event of runSdkSession(deps.queryFn, prompt, options)) {
      // Capture session ID (guard against empty string from SDK init)
      if (event.type === "session") {
        if (event.sessionId) {
          meeting.sdkSessionId = asSdkSessionId(event.sessionId);
        } else {
          console.warn(
            `[meeting] SDK init message for "${meeting.meetingId as string}" had no session_id`,
          );
        }
      }

      // Accumulate text from streaming deltas only (not complete messages)
      // to avoid the double-data problem documented in event-translator.ts.
      if (event.type === "text_delta") textParts.push(event.text);

      // Track tool_use name for pairing with its result
      if (event.type === "tool_use") pendingToolName = event.name;

      // Pair tool_result with the most recent tool_use name
      if (event.type === "tool_result") {
        toolUses.push({
          toolName: pendingToolName ?? event.name,
          result: event.output,
        });
        pendingToolName = null;
      }

      // Map SdkRunnerEvent to GuildHallEvent and yield to SSE
      if (event.type === "session") {
        yield {
          type: "session",
          meetingId: meeting.meetingId as string,
          sessionId: event.sessionId,
          worker: meeting.workerName,
        };
      } else if (event.type === "aborted") {
        yield { type: "error", reason: "Turn interrupted" };
      } else if (event.type === "error") {
        // Track for post-loop session expiry detection
        lastError = event.reason;
        if (isSessionExpiryError(event.reason)) {
          hasExpiryError = true;
        }
        if (!suppressExpiryErrors || !isSessionExpiryError(event.reason)) {
          yield event;
        }
      } else {
        // text_delta, tool_use, tool_result, turn_end pass through
        yield event;
      }
    }

    // Append the assistant turn to the transcript (single post-loop call
    // handles all cases including abort/error with partial content).
    await appendAssistantTurnSafe(meeting.meetingId as string, textParts, toolUses, ghHome);

    return { lastError, hasExpiryError };
  }

  // -- Session creation helper --
  //
  // Shared by createMeeting (first turn) and sendMessage renewal (expired
  // session recovery). Resolves tools, activates the worker, calls queryFn,
  // captures the new session_id, updates the state file, and yields events.

  async function* startSession(
    meeting: ActiveMeetingEntry,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent> {
    if (!deps.queryFn) {
      yield { type: "error", reason: "No queryFn provided" };
      return;
    }

    const prepSpecResult = await buildMeetingPrepSpec(meeting, prompt);
    if (!prepSpecResult.ok) {
      yield { type: "error", reason: prepSpecResult.reason };
      return;
    }

    const prep = await prepareSdkSession(prepSpecResult.spec, prepDeps);
    if (!prep.ok) {
      yield { type: "error", reason: prep.error };
      return;
    }

    yield* iterateSession(meeting, prompt, prep.result.options, false);

    // Update state file with captured session ID
    try {
      await writeStateFile(meeting.meetingId, serializeMeetingState(meeting));
    } catch (err: unknown) {
      console.warn(
        `[meeting] Failed to update state file for "${meeting.meetingId as string}" after session start (non-fatal):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // -- Public API --

  async function* acceptMeetingRequest(
    meetingId: MeetingId,
    projectName: string,
    message?: string,
  ): AsyncGenerator<GuildHallEvent> {
    // The setup phase (cap check, artifact read, entry creation) runs
    // under withProjectLock to prevent the TOCTOU race where two
    // concurrent accepts both pass the cap check before either registers.
    type SetupResult =
      | { ok: true; entry: ActiveMeetingEntry; prompt: string }
      | { ok: false; errors: GuildHallEvent[] };

    const setup = await withProjectLock(projectName, async (): Promise<SetupResult> => {
      const errors: GuildHallEvent[] = [];

      // a. Verify project exists
      const project = findProject(projectName);
      if (!project) {
        errors.push({ type: "error", reason: `Project "${projectName}" not found` });
        return { ok: false, errors };
      }

      // b. Check concurrent meeting cap (atomic with registration under lock)
      const cap = project.meetingCap ?? DEFAULT_MEETING_CAP;
      const activeCount = registry.countForProject(projectName);
      if (activeCount >= cap) {
        errors.push({
          type: "error",
          reason: `Meeting cap reached for project "${projectName}" (${cap} concurrent meetings)`,
        });
        return { ok: false, errors };
      }

      // c. Read the meeting artifact from integration worktree and verify status
      const iPath = integrationWorktreePathFn(ghHome, projectName);
      let currentStatus: MeetingStatus | null;
      try {
        currentStatus = await readArtifactStatus(iPath, meetingId);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to read meeting artifact: ${reason}` });
        return { ok: false, errors };
      }

      if (!currentStatus) {
        errors.push({ type: "error", reason: `Could not read status for meeting "${meetingId}"` });
        return { ok: false, errors };
      }

      // d. Validate status is "requested"
      if (currentStatus !== "requested") {
        errors.push({
          type: "error",
          reason: `Invalid meeting status transition: ${currentStatus} -> open`,
        });
        return { ok: false, errors };
      }

      // e. Read the agenda and worker info from the meeting artifact (before branching)
      let agenda: string;
      let workerName: string;
      let linkedArtifacts: string[];
      try {
        const artifactFilePath = meetingArtifactPath(iPath, meetingId);
        const raw = await fs.readFile(artifactFilePath, "utf-8");
        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        agenda = typeof data.agenda === "string" ? data.agenda : "";
        workerName = typeof data.worker === "string" ? data.worker : "";
        linkedArtifacts = await readLinkedArtifacts(iPath, meetingId);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to read meeting artifact data: ${reason}` });
        return { ok: false, errors };
      }

      // f. Find the worker package by worker name (identity name)
      const workerPkg = deps.packages.find((p) => {
        if (!("identity" in p.metadata)) return false;
        return p.metadata.identity.name === workerName;
      });
      if (!workerPkg) {
        errors.push({ type: "error", reason: `Worker "${workerName}" not found in discovered packages` });
        return { ok: false, errors };
      }

      // g. Build initial prompt from agenda + optional user message + linked artifacts context
      let prompt = agenda;
      if (linkedArtifacts.length > 0) {
        prompt += `\n\nReferenced artifacts: ${linkedArtifacts.join(", ")}`;
      }
      if (message) {
        prompt += `\n\n${message}`;
      }

      // h. Create the entry and register with the registry. Registration
      // under lock ensures cap enforcement is atomic.
      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName,
        workerName,
        packageName: workerPkg.name,
        sdkSessionId: null,
        worktreeDir: "", // Populated by provisionWorkspace
        branchName: "",  // Populated by provisionWorkspace
        abortController: new AbortController(),
        status: "requested",
      };
      registry.register(meetingId, entry);

      return { ok: true, entry, prompt };
    });

    // Yield errors from the setup phase
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    const { entry, prompt } = setup;

    // Provision workspace, update artifact, create transcript (outside lock)
    const project = findProject(projectName);
    if (!project) {
      registry.deregister(meetingId);
      yield { type: "error", reason: `Project "${projectName}" not found` };
      return;
    }

    try {
      // 1. Provision workspace (creates branch + worktree + sparse checkout)
      await provisionWorkspace(entry, project.path);

      // 2. Update artifact: status to "open" + log entry (on the activity worktree)
      await updateArtifactStatus(entry.worktreeDir, meetingId, "open");
      await appendMeetingLog(entry.worktreeDir, meetingId, "opened", "User accepted meeting request");

      // 3. Set up transcript and state file
      await setupTranscriptAndState(entry, prompt);
    } catch (err: unknown) {
      await cleanupFailedEntry(entry, project.path);
      yield { type: "error", reason: errorMessage(err) };
      return;
    }

    // Emit event
    eventBus.emit({
      type: "meeting_started",
      meetingId: meetingId as string,
      worker: entry.workerName,
    });

    console.log(
      `[meeting] "${meetingId as string}" open: branch="${entry.branchName}", worktree="${entry.worktreeDir}"`,
    );

    // Start the SDK session (outside lock, streaming can take arbitrarily long)
    yield* startSession(entry, prompt);
  }

  async function* createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent> {
    // The setup phase (cap check, entry creation) runs under withProjectLock
    // to prevent the TOCTOU race where two concurrent creates both pass the
    // cap check before either registers.
    type SetupResult =
      | { ok: true; entry: ActiveMeetingEntry }
      | { ok: false; errors: GuildHallEvent[] };

    const setup = await withProjectLock(projectName, async (): Promise<SetupResult> => {
      const errors: GuildHallEvent[] = [];

      // a. Verify project exists
      const project = findProject(projectName);
      if (!project) {
        errors.push({ type: "error", reason: `Project "${projectName}" not found` });
        return { ok: false, errors };
      }

      // b. Check concurrent meeting cap (atomic with registration under lock)
      const cap = project.meetingCap ?? DEFAULT_MEETING_CAP;
      const activeCount = registry.countForProject(projectName);
      if (activeCount >= cap) {
        errors.push({
          type: "error",
          reason: `Meeting cap reached for project "${projectName}" (${cap} concurrent meetings)`,
        });
        return { ok: false, errors };
      }

      // Find the worker package
      const workerPkg = getWorkerByName(deps.packages, workerName);
      if (!workerPkg) {
        errors.push({
          type: "error",
          reason: `Worker "${workerName}" not found in discovered packages`,
        });
        return { ok: false, errors };
      }

      const workerMeta = workerPkg.metadata as WorkerMetadata;

      // c. Generate meeting ID
      const meetingId = formatMeetingId(workerMeta.identity.name, new Date());

      // d. Write the meeting artifact to the integration worktree. The
      // artifact must exist before workspace provisioning copies it to the
      // activity worktree via the branch fork.
      const iPath = integrationWorktreePathFn(ghHome, projectName);
      try {
        await writeMeetingArtifact(
          iPath,
          meetingId,
          workerMeta.identity.displayTitle,
          prompt,
          workerMeta.identity.name,
          "open",
        );
      } catch (err: unknown) {
        errors.push({ type: "error", reason: `Failed to write meeting artifact: ${errorMessage(err)}` });
        return { ok: false, errors };
      }

      // e. Create the entry and register with the registry.
      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
        packageName: workerName,
        sdkSessionId: null,
        worktreeDir: "", // Populated by provisionWorkspace
        branchName: "",  // Populated by provisionWorkspace
        abortController: new AbortController(),
        status: "open",
      };
      registry.register(meetingId, entry);

      return { ok: true, entry };
    });

    // Yield errors from the setup phase
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    const { entry } = setup;

    // Provision workspace, write artifact to activity worktree, set up transcript (outside lock)
    const project = findProject(projectName);
    if (!project) {
      registry.deregister(entry.meetingId);
      yield { type: "error", reason: `Project "${projectName}" not found` };
      return;
    }

    try {
      // 1. Provision workspace (creates branch + worktree + sparse checkout)
      await provisionWorkspace(entry, project.path);

      // 2. Write artifact to activity worktree (for direct creation)
      const workerPkg = getWorkerByName(deps.packages, workerName);
      if (workerPkg) {
        const wMeta = workerPkg.metadata as WorkerMetadata;
        await writeMeetingArtifact(
          entry.worktreeDir,
          entry.meetingId,
          wMeta.identity.displayTitle,
          prompt,
          wMeta.identity.name,
          "open",
        );
      }

      // 3. Set up transcript and state file
      await setupTranscriptAndState(entry, prompt);
    } catch (err: unknown) {
      await cleanupFailedEntry(entry, project.path);
      yield { type: "error", reason: errorMessage(err) };
      return;
    }

    // Emit event
    eventBus.emit({
      type: "meeting_started",
      meetingId: entry.meetingId as string,
      worker: entry.workerName,
    });

    console.log(
      `[meeting] "${entry.meetingId as string}" open: branch="${entry.branchName}", worktree="${entry.worktreeDir}"`,
    );

    // Start the SDK session (outside lock, streaming can take arbitrarily long)
    yield* startSession(entry, prompt);
  }

  async function* sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent> {
    const meeting = registry.get(meetingId);
    if (!meeting) {
      yield { type: "error", reason: `Meeting "${meetingId}" not found` };
      return;
    }
    if (meeting.status === "closed") {
      yield { type: "error", reason: `Meeting "${meetingId}" is closed` };
      return;
    }
    if (!meeting.sdkSessionId) {
      // No SDK session (typically after daemon restart recovery). Start a
      // fresh session with transcript context so the agent picks up where
      // the conversation left off.
      meeting.abortController = new AbortController();

      try {
        await appendUserTurn(meetingId, message, ghHome);
      } catch (err: unknown) {
        console.warn(
          `[meeting] Transcript append failed for "${meetingId as string}" (non-fatal):`,
          err instanceof Error ? err.message : String(err),
        );
      }

      let transcript = "";
      try {
        transcript = await readTranscript(meetingId, ghHome);
      } catch (err: unknown) {
        console.warn(
          `[meeting] Transcript read failed for "${meetingId as string}", proceeding without context:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      const truncatedTranscript = truncateTranscript(transcript);
      const contextPrompt = truncatedTranscript
        ? `Previous conversation context:\n${truncatedTranscript}`
        : message;

      yield* startSession(meeting, contextPrompt);
      return;
    }

    // Create new AbortController for this turn
    meeting.abortController = new AbortController();

    // Record user turn in transcript before querying
    try {
      await appendUserTurn(meetingId, message, ghHome);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Transcript append failed for "${meetingId as string}" (non-fatal):`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const oldSessionId = meeting.sdkSessionId;

    const resumePrepResult = await buildMeetingPrepSpec(meeting, message, meeting.sdkSessionId);
    if (!resumePrepResult.ok) {
      yield { type: "error", reason: resumePrepResult.reason };
      return;
    }

    const resumePrep = await prepareSdkSession(resumePrepResult.spec, prepDeps);
    if (!resumePrep.ok) {
      yield { type: "error", reason: resumePrep.error };
      return;
    }

    const { lastError, hasExpiryError } = yield* iterateSession(
      meeting,
      message,
      resumePrep.result.options,
      true,
    );

    const needsRenewal = lastError !== null && hasExpiryError;

    if (!needsRenewal) {
      // Normal path: update state file if session ID changed
      try {
        await writeStateFile(meetingId, serializeMeetingState(meeting));
      } catch (err: unknown) {
        console.warn(
          `[meeting] Failed to update state file for "${meetingId as string}" (non-fatal):`,
          err instanceof Error ? err.message : String(err),
        );
      }
      return;
    }

    // -- Session renewal --
    // The SDK session has expired. Start a fresh session with transcript
    // context so the agent has conversation history.

    // Read and truncate transcript for context injection
    let transcript = "";
    try {
      transcript = await readTranscript(meetingId, ghHome);
    } catch (err: unknown) {
      console.warn(
        `[meeting] Transcript read failed for "${meetingId as string}" during renewal, proceeding without context:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const truncatedTranscript = truncateTranscript(transcript);
    // The transcript already contains the current user turn (appendUserTurn was
    // called above). Build the renewal prompt from the transcript only; do not
    // append a separate "User's new message" suffix that would duplicate it.
    const renewalPrompt = truncatedTranscript
      ? `Previous conversation context:\n${truncatedTranscript}`
      : message;

    // Create a fresh AbortController for the renewal session
    meeting.abortController = new AbortController();
    // Clear the old session ID so startSession captures the new one
    meeting.sdkSessionId = null;

    yield* startSession(meeting, renewalPrompt);

    // Record the renewal in the meeting log (artifact is in activity worktree)
    try {
      await appendMeetingLog(
        meeting.worktreeDir,
        meetingId,
        "session_renewed",
        `SDK session expired. Old: ${oldSessionId}, New: ${String(meeting.sdkSessionId)}`,
      );
    } catch (err: unknown) {
      console.warn(
        `[meeting] Meeting log append failed for "${meetingId as string}" (non-fatal):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Closes a meeting: aborts SDK, generates notes, writes artifact,
   * finalizes workspace (squash-merge), handles escalation, cleans up.
   *
   * Returns the generated notes (or error reason if notes generation failed).
   */
  async function closeMeeting(meetingId: MeetingId): Promise<{ notes: string }> {
    const meeting = registry.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }

    // Acquire close guard to prevent concurrent closes
    if (!registry.acquireClose(meetingId)) {
      throw new Error(`Meeting "${meetingId as string}" is already being closed`);
    }

    try {
      // 1. Abort any active SDK generation
      meeting.abortController.abort();
      meeting.status = "closed";

      // 2. Generate notes from transcript
      let notesResult: { success: true; notes: string } | { success: false; reason: string };
      try {
        notesResult = await generateMeetingNotes(
          meetingId,
          meeting.worktreeDir,
          meeting.workerName,
          { guildHallHome: ghHome, queryFn: deps.notesQueryFn },
        );
      } catch (err: unknown) {
        const errMsg = errorMessage(err);
        console.error(
          `[meeting] Notes generation threw for "${meetingId as string}":`,
          errMsg,
        );
        notesResult = { success: false, reason: `Notes generation failed: ${errMsg}` };
      }

      const notesText = notesResult.success ? notesResult.notes : notesResult.reason;

      // 3. Write notes, update status, and append log in a single read-write cycle
      try {
        await closeArtifact(
          meeting.worktreeDir, meetingId, notesText,
          "closed", "closed", "User closed audience",
        );
      } catch (err: unknown) {
        console.error(
          `[meeting] Failed to update artifact for "${meetingId as string}":`,
          errorMessage(err),
        );
      }

      // 5. Finalize workspace (squash-merge into integration worktree)
      let merged = false;
      if (meeting.worktreeDir && meeting.branchName) {
        const project = findProject(meeting.projectName);
        if (project) {
          const workspace = await getWorkspace();
          const iPath = integrationWorktreePathFn(ghHome, meeting.projectName);
          try {
            const result = await workspace.finalize({
              activityBranch: meeting.branchName,
              worktreeDir: meeting.worktreeDir,
              projectPath: project.path,
              integrationPath: iPath,
              activityId: meetingId as string,
              commitMessage: `Meeting closed: ${meetingId as string}`,
              commitLabel: "Meeting",
              lockFn: (fn) => withProjectLock(meeting.projectName, fn),
            });
            merged = result.merged;
          } catch (err: unknown) {
            const errMsg = errorMessage(err);
            console.error(
              `[meeting] finalizeActivity threw for "${meetingId as string}":`,
              errMsg,
            );
          }
        } else {
          console.warn(
            `[meeting] "${meetingId as string}" closed but project "${meeting.projectName}" not found, skipping merge`,
          );
        }
      } else {
        console.warn(
          `[meeting] "${meetingId as string}" closed but missing worktree/branch info, skipping merge`,
        );
      }

      // 6. Handle merge result
      if (merged) {
        // Success: clean up state file
        try {
          await deleteStateFile(meetingId);
        } catch (err: unknown) {
          console.warn(
            `[meeting] Failed to delete state file for "${meetingId as string}":`,
            errorMessage(err),
          );
        }

        // After merge, new artifacts may satisfy blocked commission dependencies
        if (deps.commissionSession) {
          try {
            await deps.commissionSession.checkDependencyTransitions(meeting.projectName);
          } catch (err: unknown) {
            console.warn(
              `[meeting] Dependency transition check failed after merge for "${meetingId as string}":`,
              errorMessage(err),
            );
          }
        }

        console.log(
          `[meeting] "${meetingId as string}" squash-merged to claude and cleaned up`,
        );

        // Only remove transcript if notes generated successfully
        if (notesResult.success) {
          try {
            await removeTranscript(meetingId, ghHome);
          } catch (err: unknown) {
            console.debug(
              `[meeting] Transcript removal skipped for "${meetingId as string}":`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      } else {
        // Merge failed (non-.lore/ conflicts) or skipped. Escalate.
        if (deps.createMeetingRequestFn && meeting.branchName) {
          await escalateMergeConflict({
            activityType: "meeting",
            activityId: meetingId as string,
            branchName: meeting.branchName,
            projectName: meeting.projectName,
            createMeetingRequest: deps.createMeetingRequestFn,
            managerPackageName: MANAGER_PACKAGE_NAME,
          });
        }

        console.log(
          `[meeting] "${meetingId as string}" merge failed: non-.lore/ conflicts. Branch preserved.`,
        );

        // Remove transcript on successful notes even when merge fails
        if (notesResult.success) {
          try {
            await removeTranscript(meetingId, ghHome);
          } catch (err: unknown) {
            console.debug(
              `[meeting] Transcript removal skipped for "${meetingId as string}":`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      }

      // Always emit event and delete state file (regardless of merge result)
      eventBus.emit({ type: "meeting_ended", meetingId: meetingId as string });

      // Delete state file for non-merged meetings too (they are terminal)
      if (!merged) {
        try {
          await deleteStateFile(meetingId);
        } catch (err: unknown) {
          console.warn(
            `[meeting] Failed to delete state file for "${meetingId as string}":`,
            errorMessage(err),
          );
        }
      }

      // 7. Deregister from registry
      registry.deregister(meetingId);

      // 8. Return the notes generated in step 2. Using the in-memory value
      // instead of re-reading from the integration worktree because the merge
      // may have failed, leaving notes only on the activity branch.
      return { notes: notesText || "Meeting closed." };
    } catch (err: unknown) {
      // If close fails for any reason, release the close guard so it can be retried
      registry.releaseClose(meetingId);
      throw err;
    }
  }

  async function declineMeeting(
    meetingId: MeetingId,
    projectName: string,
  ): Promise<void> {
    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }
    // Meeting requests live on the integration worktree (claude branch),
    // not in the user's working directory.
    const iPath = integrationWorktreePathFn(ghHome, projectName);

    const currentStatus = await readArtifactStatus(iPath, meetingId);
    if (!currentStatus) {
      throw new Error(`Could not read status for meeting "${meetingId}"`);
    }
    if (currentStatus !== "requested") {
      throw new Error(
        `Invalid meeting status transition: ${currentStatus} -> declined`,
      );
    }

    // Update artifact status and log on integration worktree (no workspace needed)
    await updateArtifactStatus(iPath, meetingId, "declined");
    await appendMeetingLog(iPath, meetingId, "declined", "User declined meeting request");

    // Emit event
    eventBus.emit({
      type: "meeting_ended",
      meetingId: meetingId as string,
    });

    console.log(
      `[meeting] "${meetingId as string}" declined: User declined meeting request`,
    );
  }

  async function deferMeeting(
    meetingId: MeetingId,
    projectName: string,
    deferredUntil: string,
  ): Promise<void> {
    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }
    // Meeting requests live on the integration worktree (claude branch),
    // not in the user's working directory.
    const iPath = integrationWorktreePathFn(ghHome, projectName);

    const currentStatus = await readArtifactStatus(iPath, meetingId);
    if (!currentStatus) {
      throw new Error(`Could not read status for meeting "${meetingId}"`);
    }
    if (currentStatus !== "requested") {
      throw new Error(`Cannot defer meeting with status "${currentStatus}": only requested meetings can be deferred`);
    }

    // Replace the deferred_until value in the artifact frontmatter
    const artifactFilePath = meetingArtifactPath(iPath, meetingId);
    const raw = await fs.readFile(artifactFilePath, "utf-8");
    // Sanitize the value to strip newlines that could corrupt YAML frontmatter
    const sanitized = deferredUntil.replace(/[\r\n]/g, "");
    const updated = raw.replace(/^deferred_until: ".*"$/m, `deferred_until: "${sanitized}"`);
    await fs.writeFile(artifactFilePath, updated, "utf-8");

    await appendMeetingLog(iPath, meetingId, "deferred", `Deferred until ${deferredUntil}`);
  }

  /**
   * Recovers open meetings from persisted state files on daemon startup.
   * Scans ~/.guild-hall/state/meetings/ for .json files, reads each one,
   * and adds open meetings with valid projects to the registry.
   * Closed meetings and meetings for projects no longer in config are skipped.
   */
  async function recoverMeetings(): Promise<number> {
    const stateDir = path.join(ghHome, "state", "meetings");
    let files: string[];
    try {
      files = await fs.readdir(stateDir);
    } catch (err: unknown) {
      // No state directory means no meetings to recover
      if (isNodeError(err) && err.code === "ENOENT") return 0;
      throw err;
    }

    let recovered = 0;

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      let state: {
        meetingId: string;
        projectName: string;
        workerName: string;
        packageName?: string;
        sdkSessionId: string | null;
        worktreeDir: string;
        branchName?: string;
        status: string;
      };

      try {
        const raw = await fs.readFile(path.join(stateDir, file), "utf-8");
        state = JSON.parse(raw) as typeof state;
      } catch (err: unknown) {
        console.warn(
          `[recoverMeetings] Skipping unreadable state file "${file}":`,
          err instanceof Error ? err.message : String(err),
        );
        continue;
      }

      // Only recover open meetings
      if (state.status !== "open") continue;

      // Only recover meetings for projects that still exist in config
      const project = findProject(state.projectName);
      if (!project) continue;

      const meetingId = asMeetingId(state.meetingId);

      // Don't re-add meetings already tracked (shouldn't happen on
      // fresh startup, but guard defensively)
      if (registry.has(meetingId)) continue;

      // packageName may be absent in state files written before this field
      // was added. Fall back to workerName, which is the identity name. This
      // won't match getWorkerByName (which uses package name), so renewal
      // will fail for those meetings, but at least they'll be visible.
      const packageName = state.packageName ?? state.workerName;
      const branchName = typeof state.branchName === "string" ? state.branchName : "";

      // With git integration, worktrees are not temp dirs. If the worktree
      // is gone (reboot, manual cleanup), close the meeting rather than
      // recreating a temp dir that won't have the git state.
      const worktreeDir = state.worktreeDir;
      try {
        await fs.access(worktreeDir);
      } catch {
        console.warn(`[recoverMeetings] Worktree missing for meeting ${meetingId}, closing`);
        try {
          const iPath = integrationWorktreePathFn(ghHome, state.projectName);
          await updateArtifactStatus(iPath, meetingId, "closed");
          await appendMeetingLog(iPath, meetingId, "closed", "Stale worktree detected on recovery");
        } catch (err: unknown) {
          console.warn(
            `[recoverMeetings] Failed to update artifact for stale meeting "${meetingId as string}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
        eventBus.emit({ type: "meeting_ended", meetingId: meetingId as string });
        try {
          await deleteStateFile(meetingId);
        } catch (err: unknown) {
          console.warn(
            `[recoverMeetings] Failed to delete state file for stale meeting "${meetingId as string}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
        continue;
      }

      // SDK session is lost on reboot. Set to null so sendMessage starts
      // a fresh session with context injection instead of trying to resume
      // a stale session ID.
      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName: state.projectName,
        workerName: state.workerName,
        packageName,
        sdkSessionId: null,
        worktreeDir,
        branchName,
        abortController: new AbortController(),
        status: "open",
      };

      registry.register(meetingId, entry);
      recovered++;
    }

    return recovered;
  }

  function interruptTurn(meetingId: MeetingId): void {
    const meeting = registry.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }
    meeting.abortController.abort();
  }

  function getActiveMeetings(): number {
    return registry.size;
  }

  function getOpenMeetingsForProjectPublic(projectName: string): ActiveMeetingEntry[] {
    return registry.listForProject(projectName);
  }

  /**
   * Creates a meeting request artifact (status: "requested") on the integration
   * worktree without starting a session or creating a git branch/worktree.
   * Used by production wiring to surface merge conflicts as actionable Guild
   * Master meeting requests. No registry involvement (request is artifact-only).
   */
  async function createMeetingRequest(params: {
    projectName: string;
    workerName: string;
    reason: string;
  }): Promise<void> {
    const project = findProject(params.projectName);
    if (!project) {
      throw new Error(`Project "${params.projectName}" not found`);
    }

    const workerPkg = getWorkerByName(deps.packages, params.workerName);
    if (!workerPkg) {
      throw new Error(`Worker "${params.workerName}" not found in discovered packages`);
    }

    const workerMeta = workerPkg.metadata as WorkerMetadata;
    const meetingId = formatMeetingId(workerMeta.identity.name, new Date());

    // Write the meeting request artifact to the integration worktree so the
    // dashboard can surface it immediately, consistent with propose_followup.
    const iPath = integrationWorktreePathFn(ghHome, params.projectName);
    await writeMeetingArtifact(
      iPath,
      meetingId,
      workerMeta.identity.displayTitle,
      params.reason,
      workerMeta.identity.name,
      "requested",
    );
  }

  return {
    acceptMeetingRequest,
    createMeeting,
    createMeetingRequest,
    sendMessage,
    closeMeeting,
    recoverMeetings,
    declineMeeting,
    deferMeeting,
    interruptTurn,
    getActiveMeetings,
    getOpenMeetingsForProject: getOpenMeetingsForProjectPublic,
  };
}
