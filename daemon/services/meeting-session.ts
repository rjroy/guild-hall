/**
 * Meeting session lifecycle management.
 *
 * Orchestration core: CRUD operations, SDK session runner, and session
 * renewal. State management is delegated to the ActivityMachine via
 * meeting-handlers.ts.
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
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import { getWorkerByName } from "@/lib/packages";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import { noopEventBus, type EventBus } from "@/daemon/services/event-bus";
import {
  MANAGER_PACKAGE_NAME,
  activateWorker as activateWorkerShared,
} from "@/daemon/services/manager-worker";
import { buildManagerContext } from "@/daemon/services/manager-context";
import type { GuildHallEvent, MeetingId, MeetingStatus, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";
import {
  runQueryAndTranslate,
  truncateTranscript,
} from "@/daemon/services/query-runner";
import {
  getGuildHallHome,
  meetingWorktreePath as meetingWorktreePathFn,
  meetingBranchName as meetingBranchNameFn,
  integrationWorktreePath as integrationWorktreePathFn,
} from "@/lib/paths";
import matter from "gray-matter";
import { createGitOps, CLAUDE_BRANCH, finalizeActivity, type GitOps } from "@/daemon/lib/git";
import { errorMessage, formatTimestamp, sanitizeForGitRef } from "@/daemon/lib/toolbox-utils";
import { withProjectLock } from "@/daemon/lib/project-lock";
import {
  meetingArtifactPath,
  appendMeetingLog,
  readArtifactStatus,
  updateArtifactStatus,
  readLinkedArtifacts,
} from "@/daemon/services/meeting-artifact-helpers";
import {
  createTranscript,
  appendUserTurn,
  readTranscript,
  removeTranscript,
} from "@/daemon/services/transcript";
import {
  generateMeetingNotes,
  formatNotesForYaml,
} from "@/daemon/services/notes-generator";
import { isNodeError } from "@/lib/types";
import { loadMemories } from "@/daemon/services/memory-injector";
import { triggerCompaction } from "@/daemon/services/memory-compaction";
import { ActivityMachine } from "@/daemon/lib/activity-state-machine";
import {
  createMeetingHandlers,
  type ActiveMeetingEntry,
  type MeetingHandlerDeps,
} from "@/daemon/services/meeting-handlers";

// -- Constants --

const DEFAULT_MEETING_CAP = 5;

// -- Re-exports for backward compatibility --

export type { QueryOptions, PresetQueryPrompt } from "@/daemon/services/query-runner";
import type { QueryOptions } from "@/daemon/services/query-runner";

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
    options: QueryOptions;
  }) => AsyncGenerator<SDKMessage>;
  /**
   * DI seam for notes generation. Same type signature as queryFn, but used
   * for the single-turn notes summary call at meeting close. If omitted,
   * notes generation returns placeholder text.
   */
  notesQueryFn?: (params: {
    prompt: string;
    options: QueryOptions;
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
};

// -- Factory --

export function createMeetingSession(deps: MeetingSessionDeps) {
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  const git = deps.gitOps ?? createGitOps();
  let meetingSeq = 0;

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

  /**
   * Returns entries occupying meeting slots for a project. Used for cap
   * enforcement and the public getOpenMeetingsForProject API.
   *
   * Counts entries in trackedEntries whose status is NOT a terminal state
   * (closed/declined). This ensures entries registered inside withProjectLock
   * but not yet injected into the machine still count toward the cap,
   * preventing TOCTOU races between concurrent creates/accepts.
   */
  function getOpenMeetingsForProject(projectName: string): ActiveMeetingEntry[] {
    const result: ActiveMeetingEntry[] = [];
    for (const [, entry] of trackedEntries) {
      if (
        entry.projectName === projectName &&
        entry.status !== "closed" &&
        entry.status !== "declined"
      ) {
        result.push(entry);
      }
    }
    return result;
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
    await fs.unlink(statePath(meetingId)).catch(() => {});
  }

  async function writeMeetingArtifact(
    projectPath: string,
    meetingId: MeetingId,
    workerDisplayTitle: string,
    prompt: string,
    workerName: string,
    status: MeetingStatus = "open",
  ): Promise<void> {
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const initialEvent = status === "requested" ? "requested" : "opened";
    const initialReason = status === "requested"
      ? "Meeting requested"
      : "User started audience";

    // Write raw YAML frontmatter + empty body. Using template literal to
    // avoid gray-matter stringify reformatting (lesson from retros).
    const content = `---
title: "Audience with ${workerDisplayTitle}"
date: ${dateStr}
status: ${status}
tags: [meeting]
worker: ${workerName}
workerDisplayTitle: "${workerDisplayTitle.replace(/"/g, '\\"')}"
agenda: "${prompt.replace(/"/g, '\\"')}"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${isoStr}
    event: ${initialEvent}
    reason: "${initialReason}"
notes_summary: ""
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
  }

  async function activateWorker(
    workerPkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    return activateWorkerShared(workerPkg, context, deps.activateFn);
  }

  // -- Build the ActivityMachine --

  const handlerDeps: MeetingHandlerDeps = {
    eventBus: deps.eventBus ?? noopEventBus,
    git,
    writeStateFile,
    deleteStateFile,
    finalizeActivity: async (opts) => {
      const iPath = integrationWorktreePathFn(ghHome, opts.projectName);
      const project = findProject(opts.projectName);
      if (!project) {
        console.warn(`[meeting] finalizeActivity: project "${opts.projectName}" not found`);
        return { merged: false, preserved: false };
      }
      return finalizeActivity(git, {
        activityId: opts.activityId,
        worktreeDir: opts.worktreeDir,
        branchName: opts.branchName,
        projectPath: project.path,
        integrationPath: iPath,
        commitMessage: `Meeting closed: ${opts.activityId}`,
        logPrefix: "meeting",
        commitLabel: "Meeting",
        lockFn: (fn) => withProjectLock(opts.projectName, fn),
      });
    },
    createMeetingRequest: deps.createMeetingRequestFn,
    managerPackageName: MANAGER_PACKAGE_NAME,
    findProjectPath: (name) => findProject(name)?.path,
    fileExists: async (filePath: string): Promise<boolean> => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    integrationWorktreePath: (name) => integrationWorktreePathFn(ghHome, name),
    meetingWorktreePath: (name, id) => meetingWorktreePathFn(ghHome, name, id),
    meetingBranchName: (id) => meetingBranchNameFn(id),
    ensureDir: async (dirPath: string) => {
      await fs.mkdir(dirPath, { recursive: true });
    },
    resolveCheckoutScope: (workerName: string) => {
      const workerPkg = deps.packages.find((p) => {
        if (!("identity" in p.metadata)) return false;
        return p.metadata.identity.name === workerName;
      });
      if (workerPkg && "checkoutScope" in workerPkg.metadata) {
        return workerPkg.metadata.checkoutScope;
      }
      return "full";
    },
    claudeBranch: CLAUDE_BRANCH,
    createTranscript: async (id, workerName, projectName) => {
      await createTranscript(id, workerName, projectName, ghHome);
    },
    appendUserTurn: async (id, message) => {
      await appendUserTurn(id, message, ghHome);
    },
    readTranscript: async (id) => {
      return readTranscript(id, ghHome);
    },
    removeTranscript: async (id) => {
      await removeTranscript(id, ghHome);
    },
    generateMeetingNotes: async (id, worktreeDir, workerName) => {
      return generateMeetingNotes(id, worktreeDir, workerName, {
        guildHallHome: ghHome,
        queryFn: deps.notesQueryFn,
      });
    },
    writeNotesToArtifact: async (projectPath, meetingId, notes) => {
      await writeNotesToArtifact(projectPath, meetingId, notes);
    },
    writeMeetingArtifact: async (projectPath, meetingId, workerName, prompt, status) => {
      // For inject (direct creation), we need the worker display title.
      // The handler receives the identity name; look up the display title.
      const workerPkg = deps.packages.find((p) => {
        if (!("identity" in p.metadata)) return false;
        return p.metadata.identity.name === workerName;
      });
      const displayTitle = workerPkg
        ? (workerPkg.metadata as WorkerMetadata).identity.displayTitle
        : workerName;
      await writeMeetingArtifact(projectPath, meetingId, displayTitle, prompt, workerName, status);
    },
    checkDependencyTransitions: deps.commissionSession
      ? async (projectName) => {
          await deps.commissionSession!.checkDependencyTransitions(projectName);
        }
      : undefined,
  };

  const handlersConfig = createMeetingHandlers(handlerDeps);

  // Parallel lookup for all tracked entries (active and inactive).
  // Populated when entries are injected/registered into the machine.
  const trackedEntries = new Map<MeetingId, ActiveMeetingEntry>();

  // Create the artifact ops with a lookup that reads from the machine's state tracker.
  // The machine is created below; we use a lazy reference to avoid circular init.
  let machineRef: ActivityMachine<MeetingStatus, MeetingId, ActiveMeetingEntry> | null = null;

  const artifactOps = handlersConfig.createArtifactOps((id) => {
    if (!machineRef) return undefined;
    const active = machineRef.get(id);
    if (active) return active;
    return trackedEntries.get(id);
  });

  const machine = new ActivityMachine<MeetingStatus, MeetingId, ActiveMeetingEntry>({
    activityType: "meeting",
    transitions: handlersConfig.transitions,
    cleanupStates: handlersConfig.cleanupStates,
    activeStates: handlersConfig.activeStates,
    handlers: handlersConfig.handlers,
    artifactOps,
    extractProjectName: (entry) => entry.projectName,
  });
  machineRef = machine;

  // Meetings don't trigger auto-dispatch (they don't consume commission
  // capacity), but successful merges may satisfy blocked commission
  // dependencies. The cleanup hooks in the handlers already call
  // checkDependencyTransitions, so we don't need a separate machine
  // cleanup hook for that. No additional cleanup hooks needed.

  // -- Operations that stay outside the machine --

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

    // Register and transition through the machine for declined meetings.
    // The entry is minimal since declined meetings have no worktree.
    const entry: ActiveMeetingEntry = {
      meetingId,
      projectName,
      workerName: "",
      packageName: "",
      sdkSessionId: null,
      worktreeDir: "",
      branchName: "",
      abortController: new AbortController(),
      status: "requested",
    };
    trackedEntries.set(meetingId, entry);
    machine.register(meetingId, entry, "requested");
    const result = await machine.transition(meetingId, "requested", "declined", "User declined meeting request");
    if (result.outcome === "skipped") {
      throw new Error(`Could not decline meeting "${meetingId as string}": ${result.reason}`);
    }

    // Clean up parallel tracking after terminal state transition
    trackedEntries.delete(meetingId);
    machine.forget(meetingId);
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

  type QueryOptionsResult =
    | { ok: true; options: QueryOptions }
    | { ok: false; reason: string };

  async function buildActivatedQueryOptions(
    meeting: ActiveMeetingEntry,
    prompt: string,
    resumeSessionId?: SdkSessionId,
  ): Promise<QueryOptionsResult> {
    const workerPkg = getWorkerByName(deps.packages, meeting.packageName);
    if (!workerPkg) {
      return {
        ok: false,
        reason: `Worker "${meeting.packageName}" not found in discovered packages`,
      };
    }

    const project = findProject(meeting.projectName);
    if (!project) {
      return {
        ok: false,
        reason: `Project "${meeting.projectName}" not found`,
      };
    }

    const workerMeta = workerPkg.metadata as WorkerMetadata;
    const isManager = workerPkg.name === MANAGER_PACKAGE_NAME;

    let activation: ActivationResult;
    try {
      const resolvedTools = await resolveToolSet(workerMeta, deps.packages, {
        projectName: meeting.projectName,
        contextId: meeting.meetingId,
        contextType: "meeting",
        workerName: workerMeta.identity.name,
        guildHallHome: ghHome,
        eventBus: deps.eventBus ?? noopEventBus,
        config: deps.config,
        services: isManager && deps.commissionSession
          ? { commissionSession: deps.commissionSession, gitOps: git }
          : undefined,
      });

      let injectedMemory = "";
      try {
        const memoryResult = await loadMemories(
          workerMeta.identity.name,
          meeting.projectName,
          {
            guildHallHome: ghHome,
            memoryLimit: project.memoryLimit,
          },
        );
        injectedMemory = memoryResult.memoryBlock;
        if (memoryResult.needsCompaction && deps.queryFn) {
          console.log(
            `[meeting-session] Memory for worker "${workerMeta.identity.name}" exceeds limit, triggering compaction`,
          );
          void triggerCompaction(
            workerMeta.identity.name,
            meeting.projectName,
            { guildHallHome: ghHome, compactFn: deps.queryFn },
          );
        }
      } catch (err: unknown) {
        console.warn(
          `[meeting-session] Failed to load memories for "${workerMeta.identity.name}" (non-fatal):`,
          errorMessage(err),
        );
      }

      const activationContext: ActivationContext = {
        posture: workerMeta.posture,
        injectedMemory,
        resolvedTools,
        resourceDefaults: {
          maxTurns: workerMeta.resourceDefaults?.maxTurns,
          maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
        },
        meetingContext: {
          meetingId: meeting.meetingId,
          agenda: prompt,
          referencedArtifacts: [],
        },
        projectPath: project.path,
        workingDirectory: meeting.worktreeDir,
      };

      if (isManager) {
        activationContext.managerContext = await buildManagerContext({
          packages: deps.packages,
          projectName: meeting.projectName,
          integrationPath: integrationWorktreePathFn(ghHome, meeting.projectName),
          guildHallHome: ghHome,
          memoryLimit: project.memoryLimit,
        });
      }

      activation = await activateWorker(workerPkg, activationContext);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      return { ok: false, reason: `Worker activation failed: ${reason}` };
    }

    const mcpServersRecord: Record<string, unknown> = {};
    for (const server of activation.tools.mcpServers) {
      mcpServersRecord[server.name] = server;
    }

    const maxTurns = activation.resourceBounds.maxTurns;
    const maxBudgetUsd = activation.resourceBounds.maxBudgetUsd;

    return {
      ok: true,
      options: {
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        abortController: meeting.abortController,
        includePartialMessages: true,
        permissionMode: "dontAsk",
        allowedTools: activation.tools.allowedTools,
        settingSources: ["local", "project", "user"],
        systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt },
        ...(activation.model ? { model: activation.model } : {}),
        mcpServers: mcpServersRecord,
        ...(maxTurns ? { maxTurns } : {}),
        ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
        cwd: meeting.worktreeDir,
      }
    };
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

    const queryOptionsResult = await buildActivatedQueryOptions(
      meeting,
      prompt,
    );
    if (!queryOptionsResult.ok) {
      yield { type: "error", reason: queryOptionsResult.reason };
      return;
    }

    const outcome = yield* runQueryAndTranslate(deps.queryFn, meeting, prompt, queryOptionsResult.options, ghHome);
    if (outcome === "failed") {
      return;
    }

    // Update state file with captured session ID
    try {
      await writeStateFile(meeting.meetingId, serializeMeetingState(meeting));
    } catch {
      // State file update failure is non-fatal; the meeting is already in memory
    }
  }

  // NOTE: startSdkSession is NOT wired into the handler deps. The SDK
  // session must stream events back through the caller's async generator
  // (createMeeting, acceptMeetingRequest). The enter-open handler handles
  // git setup, artifact writes, state file, and transcript. The SDK session
  // is started after the machine transition completes.

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
      const openMeetings = getOpenMeetingsForProject(projectName);
      if (openMeetings.length >= cap) {
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

      // d. Validate status is "requested" (the machine will validate the edge)
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

      // h. Create the entry and register with the machine. The enter-open
      // handler will create the branch, worktree, state file, transcript,
      // and start the SDK session.
      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName,
        workerName,
        packageName: workerPkg.name,
        sdkSessionId: null,
        worktreeDir: "", // Populated by enter-open handler
        branchName: "",  // Populated by enter-open handler
        abortController: new AbortController(),
        status: "requested",
      };
      trackedEntries.set(meetingId, entry);
      machine.register(meetingId, entry, "requested");

      return { ok: true, entry, prompt };
    });

    // Yield errors from the setup phase
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    // i. Transition requested -> open (outside lock; the enter-open handler
    // handles git setup, artifact updates, and transcript creation)
    try {
      await machine.transition(
        meetingId,
        "requested",
        "open",
        setup.prompt,
      );
    } catch (err: unknown) {
      machine.forget(meetingId);
      trackedEntries.delete(meetingId);
      yield { type: "error", reason: errorMessage(err) };
      return;
    }

    // j. Start the SDK session (outside lock, streaming can take arbitrarily long).
    // The entry's worktreeDir and branchName were populated by the enter-open handler.
    const entry = machine.get(meetingId);
    if (entry) {
      yield* startSession(entry, setup.prompt);
    }
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
      const openMeetings = getOpenMeetingsForProject(projectName);
      if (openMeetings.length >= cap) {
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

      // d. Write the meeting artifact to the integration worktree BEFORE
      // machine.inject() runs. The machine's ArtifactOps updates status and
      // appends a timeline entry during inject, which requires the artifact
      // to already exist. This mirrors the commission pattern where
      // createCommission writes the artifact before dispatch.
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

      // e. Create the entry. The enter-open handler (via machine.inject)
      // will create the branch, worktree, transcript, state file.
      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
        packageName: workerName,
        sdkSessionId: null,
        worktreeDir: "", // Populated by enter-open handler
        branchName: "",  // Populated by enter-open handler
        abortController: new AbortController(),
        status: "open",
      };
      trackedEntries.set(meetingId, entry);

      return { ok: true, entry };
    });

    // Yield errors from the setup phase
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    // e. Inject into the machine at "open" state (outside lock; the
    // enter-open handler with sourceState=null handles git setup, artifact,
    // transcript, and state file)
    try {
      await machine.inject(
        setup.entry.meetingId,
        setup.entry,
        "open",
        prompt,
      );
    } catch (err: unknown) {
      trackedEntries.delete(setup.entry.meetingId);
      yield { type: "error", reason: errorMessage(err) };
      return;
    }

    // f. Start the SDK session (outside lock, streaming can take arbitrarily long).
    // The entry's worktreeDir and branchName were populated by the enter-open handler.
    const entry = machine.get(setup.entry.meetingId);
    if (entry) {
      yield* startSession(entry, prompt);
    }
  }

  async function* sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent> {
    const meeting = machine.get(meetingId);
    if (!meeting) {
      yield { type: "error", reason: `Meeting "${meetingId}" not found` };
      return;
    }
    if (meeting.status === "closed") {
      yield { type: "error", reason: `Meeting "${meetingId}" is closed` };
      return;
    }
    if (!meeting.sdkSessionId) {
      yield { type: "error", reason: `Meeting "${meetingId}" has no SDK session to resume` };
      return;
    }

    // Create new AbortController for this turn
    meeting.abortController = new AbortController();

    // Record user turn in transcript before querying
    try {
      await appendUserTurn(meetingId, message, ghHome);
    } catch {
      // Transcript append failure is non-fatal
    }

    const oldSessionId = meeting.sdkSessionId;

    const resumeOptionsResult = await buildActivatedQueryOptions(
      meeting,
      message,
      meeting.sdkSessionId,
    );
    if (!resumeOptionsResult.ok) {
      yield { type: "error", reason: resumeOptionsResult.reason };
      return;
    }

    if (!deps.queryFn) {
      yield { type: "error", reason: "No queryFn provided" };
      return;
    }

    const queryOutcome = yield* runQueryAndTranslate(
      deps.queryFn,
      meeting,
      message,
      resumeOptionsResult.options,
      ghHome,
      true,
    );

    const needsRenewal = queryOutcome === "session_expired";
    if (queryOutcome === "failed") {
      return;
    }

    if (!needsRenewal) {
      // Normal path: update state file if session ID changed
      try {
        await writeStateFile(meetingId, serializeMeetingState(meeting));
      } catch {
        // Non-fatal
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
    } catch {
      // If transcript read fails, proceed without context
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
    } catch {
      // Meeting log append failure is non-fatal
    }
  }

  /**
   * Recovers open meetings from persisted state files on daemon startup.
   * Scans ~/.guild-hall/state/meetings/ for .json files, reads each one,
   * and adds open meetings with valid projects to the machine via
   * registerActive (no enter handler re-run). Closed meetings and meetings
   * for projects no longer in config are skipped.
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
      } catch {
        // Corrupt or unreadable state file, skip
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
      if (machine.isTracked(meetingId)) continue;

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
          await appendMeetingLog(iPath, meetingId, "closed", "Worktree lost during daemon restart");
        } catch {
          // Best-effort artifact update
        }
        try {
          await writeStateFile(meetingId, {
            ...state,
            status: "closed",
          });
        } catch {
          // Best-effort state update
        }
        continue;
      }

      const entry: ActiveMeetingEntry = {
        meetingId,
        projectName: state.projectName,
        workerName: state.workerName,
        packageName,
        sdkSessionId: state.sdkSessionId
          ? asSdkSessionId(state.sdkSessionId)
          : null,
        worktreeDir,
        branchName,
        abortController: new AbortController(),
        status: "open",
      };

      trackedEntries.set(meetingId, entry);
      machine.registerActive(meetingId, entry, "open");
      recovered++;
    }

    return recovered;
  }

  /**
   * Closes a meeting by transitioning open -> closed through the machine.
   * The enter-closed handler generates notes, writes them to the artifact,
   * runs finalizeActivity, handles escalation on merge conflict, and cleans
   * up the state file.
   *
   * Returns the generated notes (or error reason if notes generation failed).
   */
  async function closeMeeting(meetingId: MeetingId): Promise<{ notes: string }> {
    const meeting = machine.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }

    // The machine's exit-open handler aborts the SDK session, and the
    // enter-closed handler handles notes, merge, escalation, state file
    // cleanup, transcript removal, and event emission.
    const result = await machine.transition(meetingId, "open", "closed", "User closed audience");
    if (result.outcome === "skipped") {
      throw new Error(`Could not close meeting "${meetingId as string}": ${result.reason}`);
    }

    // Clean up: the machine handles its own state tracker and active map,
    // but trackedEntries is a parallel lookup that must be cleaned separately.
    trackedEntries.delete(meetingId);
    machine.forget(meetingId);

    // The notes are generated inside the enter-closed handler. We need to
    // return them to the caller. Read the artifact to extract notes_summary.
    // After the transition, the worktree has been removed by finalizeActivity.
    // Read unconditionally from the integration worktree where the squash-merge
    // landed the artifact.
    let notes = "Meeting closed.";
    try {
      const basePath = integrationWorktreePathFn(ghHome, meeting.projectName);
      const artifactFilePath = meetingArtifactPath(basePath, meetingId);
      const raw = await fs.readFile(artifactFilePath, "utf-8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      if (typeof data.notes_summary === "string" && data.notes_summary.trim()) {
        notes = data.notes_summary.trim();
      }
    } catch (err: unknown) {
      console.warn(
        `[meeting] Failed to read notes from artifact for "${meetingId as string}":`,
        err instanceof Error ? err.message : String(err),
      );
    }

    return { notes };
  }

  /**
   * Writes notes_summary to a meeting artifact. Replaces the empty
   * `notes_summary: ""` placeholder with a YAML block scalar.
   */
  async function writeNotesToArtifact(
    projectPath: string,
    meetingId: MeetingId,
    notes: string,
  ): Promise<void> {
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const replacement = formatNotesForYaml(notes);
    const updated = raw.replace(/^notes_summary: ""$/m, replacement);
    if (updated === raw) {
      console.error(`[writeNotesToArtifact] notes_summary placeholder not found in artifact for meeting ${meetingId}`);
    }
    await fs.writeFile(artifactPath, updated, "utf-8");
  }

  function interruptTurn(meetingId: MeetingId): void {
    const meeting = machine.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }
    meeting.abortController.abort();
  }

  function getActiveMeetings(): number {
    return machine.activeCount;
  }

  function getOpenMeetingsForProjectPublic(projectName: string): ActiveMeetingEntry[] {
    return getOpenMeetingsForProject(projectName);
  }

  /**
   * Creates a meeting request artifact (status: "requested") on the integration
   * worktree without starting a session or creating a git branch/worktree.
   * Used by production wiring to surface merge conflicts as actionable Guild
   * Master meeting requests. No machine involvement (request is artifact-only).
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
