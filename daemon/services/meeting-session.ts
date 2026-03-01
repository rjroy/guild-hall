/**
 * Meeting session lifecycle management.
 *
 * Manages the full lifecycle of meetings: creation, follow-up messages,
 * interruption, and closure. Integrates with the Claude Agent SDK via a
 * dependency-injected queryFn, so tests can substitute a mock generator
 * without mock.module().
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
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";
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
  meetingWorktreePath,
  meetingBranchName,
  integrationWorktreePath,
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
  type NotesResult,
} from "@/daemon/services/notes-generator";
import { isNodeError } from "@/lib/types";
import { loadMemories } from "@/daemon/services/memory-injector";
import { triggerCompaction } from "@/daemon/services/memory-compaction";

// -- Constants --

const DEFAULT_MEETING_CAP = 5;

const VALID_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  requested: ["open", "declined"],
  open: ["closed"],
  closed: [],
  declined: [],
};

function validateTransition(from: MeetingStatus, to: MeetingStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid meeting status transition: ${from} -> ${to}`);
  }
}

// -- In-memory state --

type ActiveMeeting = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  /** The discovered package name (e.g., "guild-hall-sample-assistant"),
   *  used for getWorkerByName lookups during session renewal/recovery. */
  packageName: string;
  sdkSessionId: SdkSessionId | null;
  worktreeDir: string;
  branchName: string;
  abortController: AbortController;
  // In-memory only; "requested"/"declined" are artifact-only states
  status: "open" | "closed";
};

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
  const meetings = new Map<MeetingId, ActiveMeeting>();
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  const git = deps.gitOps ?? createGitOps();
  let meetingSeq = 0;

  // -- Helpers --

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  /** Serializes an ActiveMeeting to the shape written to state files. */
  function serializeMeetingState(
    meeting: ActiveMeeting,
    status: "open" | "closed" = meeting.status,
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

  function getOpenMeetingsForProject(projectName: string): ActiveMeeting[] {
    return Array.from(meetings.values()).filter(
      (m) => m.projectName === projectName && m.status === "open",
    );
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

  async function writeMeetingArtifact(
    projectPath: string,
    meetingId: MeetingId,
    workerDisplayTitle: string,
    prompt: string,
    workerName: string,
    status: "open" | "requested" = "open",
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
    const iPath = integrationWorktreePath(ghHome, projectName);

    const currentStatus = await readArtifactStatus(iPath, meetingId);
    if (!currentStatus) {
      throw new Error(`Could not read status for meeting "${meetingId}"`);
    }
    validateTransition(currentStatus, "declined");
    await updateArtifactStatus(iPath, meetingId, "declined");
    await appendMeetingLog(iPath, meetingId, "declined", "User declined meeting request");
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
    const iPath = integrationWorktreePath(ghHome, projectName);

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
    meeting: ActiveMeeting,
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
          integrationPath: integrationWorktreePath(ghHome, meeting.projectName),
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
    meeting: ActiveMeeting,
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

  // -- Public API --

  async function* acceptMeetingRequest(
    meetingId: MeetingId,
    projectName: string,
    message?: string,
  ): AsyncGenerator<GuildHallEvent> {
    // The setup phase (cap check through map registration) runs under
    // withProjectLock to prevent the TOCTOU race where two concurrent
    // accepts both pass the cap check before either registers.
    type SetupResult =
      | { ok: true; meeting: ActiveMeeting; prompt: string }
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
      const iPath = integrationWorktreePath(ghHome, projectName);
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

      // d. Validate transition: requested -> open
      try {
        validateTransition(currentStatus, "open");
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason });
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
      // Workers are registered by package name, but the artifact stores the
      // identity name. Search packages by identity name.
      const workerPkg = deps.packages.find((p) => {
        if (!("identity" in p.metadata)) return false;
        return p.metadata.identity.name === workerName;
      });
      if (!workerPkg) {
        errors.push({ type: "error", reason: `Worker "${workerName}" not found in discovered packages` });
        return { ok: false, errors };
      }

      // g. Create git branch and worktree (activity branch inherits artifact from claude)
      const branchName = meetingBranchName(meetingId);
      const worktreeDir = meetingWorktreePath(ghHome, projectName, meetingId);
      try {
        await git.createBranch(project.path, branchName, CLAUDE_BRANCH);
        await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
        await git.createWorktree(project.path, worktreeDir, branchName);

        // Configure sparse checkout if the worker requests it
        const workerMeta = workerPkg.metadata as WorkerMetadata;
        if (workerMeta.checkoutScope === "sparse") {
          await git.configureSparseCheckout(worktreeDir, [".lore/"]);
        }
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to create git worktree: ${reason}` });
        return { ok: false, errors };
      }

      // h. Update artifact status to "open" on the activity worktree
      try {
        await updateArtifactStatus(worktreeDir, meetingId, "open");
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to update artifact status: ${reason}` });
        return { ok: false, errors };
      }

      // h2. Append meeting log on the activity worktree
      try {
        await appendMeetingLog(worktreeDir, meetingId, "opened", "User accepted meeting request");
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to append meeting log: ${reason}` });
        return { ok: false, errors };
      }

      // i. Write machine-local state file
      try {
        await writeStateFile(meetingId, {
          meetingId,
          projectName,
          workerName,
          packageName: workerPkg.name,
          sdkSessionId: null,
          worktreeDir,
          branchName,
          status: "open",
        });
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to write state file: ${reason}` });
        return { ok: false, errors };
      }

      // j. Build initial prompt from agenda + optional user message + linked artifacts context
      let prompt = agenda;
      if (linkedArtifacts.length > 0) {
        prompt += `\n\nReferenced artifacts: ${linkedArtifacts.join(", ")}`;
      }
      if (message) {
        prompt += `\n\n${message}`;
      }

      // l. Create transcript and record initial user turn
      try {
        await createTranscript(
          meetingId,
          workerName,
          projectName,
          ghHome,
        );
        await appendUserTurn(meetingId, prompt, ghHome);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to create transcript: ${reason}` });
        return { ok: false, errors };
      }

      // m. Create AbortController and register meeting in active map
      const abortController = new AbortController();

      const meeting: ActiveMeeting = {
        meetingId,
        projectName,
        workerName,
        packageName: workerPkg.name,
        sdkSessionId: null,
        worktreeDir,
        branchName,
        abortController,
        status: "open",
      };
      meetings.set(meetingId, meeting);

      return { ok: true, meeting, prompt };
    });

    // Yield errors from the setup phase, or start the SDK session
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    // n. Start the SDK session (outside lock, streaming can take arbitrarily long)
    yield* startSession(setup.meeting, setup.prompt);
  }

  async function* createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent> {
    // The setup phase (cap check through map registration) runs under
    // withProjectLock to prevent the TOCTOU race where two concurrent
    // creates both pass the cap check before either registers.
    type SetupResult =
      | { ok: true; meeting: ActiveMeeting }
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

      // d. Create git branch and worktree
      const branchName = meetingBranchName(meetingId);
      const worktreeDir = meetingWorktreePath(ghHome, projectName, meetingId);
      try {
        await git.createBranch(project.path, branchName, CLAUDE_BRANCH);
        await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
        await git.createWorktree(project.path, worktreeDir, branchName);

        // Configure sparse checkout if the worker requests it
        if (workerMeta.checkoutScope === "sparse") {
          await git.configureSparseCheckout(worktreeDir, [".lore/"]);
        }
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to create git worktree: ${reason}` });
        return { ok: false, errors };
      }

      // e. Create meeting artifact (written to activity worktree)
      try {
        await writeMeetingArtifact(
          worktreeDir,
          meetingId,
          workerMeta.identity.displayTitle,
          prompt,
          workerMeta.identity.name,
        );
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to create meeting artifact: ${reason}` });
        return { ok: false, errors };
      }

      // e2. Create transcript and record initial user turn
      try {
        await createTranscript(
          meetingId,
          workerMeta.identity.name,
          projectName,
          ghHome,
        );
        await appendUserTurn(meetingId, prompt, ghHome);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to create transcript: ${reason}` });
        return { ok: false, errors };
      }

      // f. Write initial machine-local state
      const meeting: ActiveMeeting = {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
        packageName: workerName,
        sdkSessionId: null,
        worktreeDir,
        branchName,
        abortController: new AbortController(),
        status: "open",
      };
      try {
        await writeStateFile(meetingId, serializeMeetingState(meeting));
      } catch (err: unknown) {
        const reason = errorMessage(err);
        errors.push({ type: "error", reason: `Failed to write state file: ${reason}` });
        return { ok: false, errors };
      }

      // g. Register meeting in active map
      meetings.set(meetingId, meeting);

      return { ok: true, meeting };
    });

    // Yield errors from the setup phase, or start the SDK session
    if (!setup.ok) {
      for (const event of setup.errors) {
        yield event;
      }
      return;
    }

    // h. Start the SDK session via the shared helper (outside lock)
    yield* startSession(setup.meeting, prompt);
  }

  async function* sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent> {
    const meeting = meetings.get(meetingId);
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
   * and adds open meetings with valid projects to the in-memory map.
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

      // Don't re-add meetings already in the map (shouldn't happen on
      // fresh startup, but guard defensively)
      if (meetings.has(meetingId)) continue;

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
          const iPath = integrationWorktreePath(ghHome, state.projectName);
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

      const meeting: ActiveMeeting = {
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

      meetings.set(meetingId, meeting);
      recovered++;
    }

    return recovered;
  }

  async function closeMeeting(meetingId: MeetingId): Promise<{ notes: string }> {
    const meeting = meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }

    // Abort any active generation
    meeting.abortController.abort();

    const project = findProject(meeting.projectName);

    // Generate notes from transcript before closing
    let result: NotesResult;
    if (project) {
      try {
        result = await generateMeetingNotes(
          meetingId,
          meeting.worktreeDir,
          meeting.workerName,
          {
            guildHallHome: ghHome,
            queryFn: deps.notesQueryFn,
          },
        );
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.error(`[closeMeeting] Notes generation threw for ${meetingId}: ${reason}`);
        result = { success: false, reason: `Notes generation failed: ${reason}` };
      }
    } else {
      result = { success: false, reason: "Notes generation not available." };
    }

    const notesGenerationFailed = !result.success;
    const notes = result.success ? result.notes : result.reason;

    // Update meeting artifact in the activity worktree: status, notes_summary, and meeting log
    if (project) {
      try {
        const currentStatus = await readArtifactStatus(meeting.worktreeDir, meetingId);
        if (currentStatus) {
          validateTransition(currentStatus, "closed");
        }
        await updateArtifactStatus(meeting.worktreeDir, meetingId, "closed");
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.error(`[closeMeeting] Failed to update artifact status for ${meetingId}: ${reason}`);
      }

      try {
        await writeNotesToArtifact(meeting.worktreeDir, meetingId, notes);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.error(`[closeMeeting] Failed to write notes to artifact for ${meetingId}: ${reason}`);
      }

      try {
        await appendMeetingLog(meeting.worktreeDir, meetingId, "closed", "User closed audience");
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.error(`[closeMeeting] Failed to append meeting log for ${meetingId}: ${reason}`);
      }
    }

    // Update machine-local state
    try {
      await writeStateFile(meetingId, serializeMeetingState(meeting, "closed"));
    } catch {
      // Non-fatal
    }

    // Git cleanup: commit changes, squash-merge to integration, remove worktree and branch.
    // Non-.lore/ conflicts are logged but don't fail the meeting close
    // (meetings should always close gracefully).
    let squashMergeSucceeded = false;
    if (project) {
      try {
        const iPath = integrationWorktreePath(ghHome, meeting.projectName);
        const result = await finalizeActivity(git, {
          activityId: meeting.meetingId,
          worktreeDir: meeting.worktreeDir,
          branchName: meeting.branchName,
          projectPath: project.path,
          integrationPath: iPath,
          commitMessage: `Meeting closed: ${meeting.meetingId}`,
          logPrefix: "closeMeeting",
          commitLabel: "Meeting",
          lockFn: (fn) => withProjectLock(meeting.projectName, fn),
        });

        squashMergeSucceeded = result.merged;

        if (squashMergeSucceeded) {
          await fs.unlink(statePath(meetingId)).catch(() => {});
        } else {
          // Escalate conflict to Guild Master as a meeting request so the user
          // sees an actionable notification instead of a silent log line.
          // Meeting still closes as "closed"; the request surfaces the unmerged branch.
          if (deps.createMeetingRequestFn) {
            const escalationReason =
              `Meeting ${meeting.meetingId} (branch ${meeting.branchName}) completed but ` +
              `could not merge: non-.lore/ conflicts detected. ` +
              `The activity branch has been preserved. ` +
              `Please resolve conflicts manually and merge ${meeting.branchName} into the integration branch.`;
            deps.createMeetingRequestFn({
              projectName: meeting.projectName,
              workerName: MANAGER_PACKAGE_NAME,
              reason: escalationReason,
            }).catch((err: unknown) => {
              console.warn(
                `[closeMeeting] Failed to create Guild Master meeting request for "${meeting.meetingId}":`,
                errorMessage(err),
              );
            });
          }
        }
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.warn(`[closeMeeting] Git cleanup failed for ${meeting.meetingId}: ${reason}`);
      }
    }

    // After squash-merge, new artifacts may have appeared on the integration
    // worktree that satisfy blocked commission dependencies.
    if (squashMergeSucceeded && deps.commissionSession) {
      try {
        await deps.commissionSession.checkDependencyTransitions(meeting.projectName);
      } catch (err: unknown) {
        console.warn(
          `[closeMeeting] Dependency transition check failed:`,
          errorMessage(err),
        );
      }
    }

    // Only remove transcript if notes generated successfully.
    // If notes generation failed, preserve the transcript so it can be
    // used for manual review or retry.
    if (!notesGenerationFailed) {
      try {
        await removeTranscript(meetingId, ghHome);
      } catch {
        // Non-fatal; transcript may not exist if creation failed
      }
    }

    // Mark closed and remove from active map
    meeting.status = "closed";
    meetings.delete(meetingId);

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
    const meeting = meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }
    meeting.abortController.abort();
  }

  function getActiveMeetings(): number {
    return meetings.size;
  }

  function getOpenMeetingsForProjectPublic(projectName: string): ActiveMeeting[] {
    return getOpenMeetingsForProject(projectName);
  }

  /**
   * Creates a meeting request artifact (status: "requested") on the integration
   * worktree without starting a session or creating a git branch/worktree.
   * Used by production wiring to surface merge conflicts as actionable Guild
   * Master meeting requests.
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
    const iPath = integrationWorktreePath(ghHome, params.projectName);
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
