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
import * as os from "node:os";
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
import {
  translateSdkMessage,
  type TranslatorContext,
} from "@/daemon/services/event-translator";
import type { GuildHallEvent, MeetingId, MeetingStatus, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";
import { getGuildHallHome } from "@/lib/paths";
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
  appendAssistantTurn,
  readTranscript,
  removeTranscript,
  type ToolUseEntry,
} from "@/daemon/services/transcript";
import {
  generateMeetingNotes,
  formatNotesForYaml,
  type NotesResult,
} from "@/daemon/services/notes-generator";
import { isNodeError } from "@/lib/types";

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
  tempDir: string;
  abortController: AbortController;
  // In-memory only; "requested"/"declined" are artifact-only states
  status: "open" | "closed";
};

// -- Dependency types --

/**
 * Minimal SDK query options that the meeting session passes to the queryFn.
 * The real SDK Options type has many more fields; this captures what we use.
 */
export type QueryOptions = {
  systemPrompt?: string;
  includePartialMessages?: boolean;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: boolean;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  settingSources?: string[];
  cwd?: string;
  additionalDirectories?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  abortController?: AbortController;
  resume?: string;
};

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
};

// -- Factory --

export function createMeetingSession(deps: MeetingSessionDeps) {
  const meetings = new Map<string, ActiveMeeting>();
  const ghHome = deps.guildHallHome ?? getGuildHallHome();
  let meetingSeq = 0;

  // -- Helpers --

  function findProject(projectName: string) {
    return deps.config.projects.find((p) => p.name === projectName);
  }

  function getOpenMeetingsForProject(projectName: string): ActiveMeeting[] {
    return Array.from(meetings.values()).filter(
      (m) => m.projectName === projectName && m.status === "open",
    );
  }

  function formatMeetingId(workerName: string, now: Date): MeetingId {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const ts = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
    const seq = meetingSeq++;
    // Append sequence number only when needed to avoid collisions within
    // the same second. Sequence 0 is omitted for clean default IDs.
    const suffix = seq > 0 ? `-${seq}` : "";
    return asMeetingId(`audience-${workerName}-${ts}${suffix}`);
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
    if (deps.activateFn) {
      return deps.activateFn(workerPkg, context);
    }
    // Dynamic import for production use. path.resolve() ensures an absolute
    // path even when the package was discovered from a relative scan path
    // (e.g., --packages-dir ./packages).
    const workerModule = (await import(path.resolve(workerPkg.path, "index.ts"))) as {
      activate: (ctx: ActivationContext) => ActivationResult;
    };
    return workerModule.activate(context);
  }

  async function declineMeeting(
    meetingId: MeetingId,
    projectName: string,
  ): Promise<void> {
    const project = findProject(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }
    const projectPath = project.path;

    const currentStatus = await readArtifactStatus(projectPath, meetingId);
    if (!currentStatus) {
      throw new Error(`Could not read status for meeting "${meetingId}"`);
    }
    validateTransition(currentStatus, "declined");
    await updateArtifactStatus(projectPath, meetingId, "declined");
    await appendMeetingLog(projectPath, meetingId, "declined", "User declined meeting request");
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
    const projectPath = project.path;

    const currentStatus = await readArtifactStatus(projectPath, meetingId);
    if (!currentStatus) {
      throw new Error(`Could not read status for meeting "${meetingId}"`);
    }
    if (currentStatus !== "requested") {
      throw new Error(`Cannot defer meeting with status "${currentStatus}": only requested meetings can be deferred`);
    }

    // Replace the deferred_until value in the artifact frontmatter
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    // Sanitize the value to strip newlines that could corrupt YAML frontmatter
    const sanitized = deferredUntil.replace(/[\r\n]/g, "");
    const updated = raw.replace(/^deferred_until: ".*"$/m, `deferred_until: "${sanitized}"`);
    await fs.writeFile(artifactPath, updated, "utf-8");

    await appendMeetingLog(projectPath, meetingId, "deferred", `Deferred until ${deferredUntil}`);
  }

  // -- Async generator: iterate SDK messages and yield Guild Hall events --
  //
  // Accumulates text_delta and tool_use/tool_result events during iteration
  // so the assistant turn can be appended to the transcript after the
  // generator completes. Only text_delta events contribute text (not
  // SDKAssistantMessage text blocks) to avoid the double-data problem
  // documented in event-translator.ts.

  async function* iterateAndTranslate(
    generator: AsyncGenerator<SDKMessage>,
    translatorContext: TranslatorContext,
    meeting: ActiveMeeting,
  ): AsyncGenerator<GuildHallEvent> {
    const textParts: string[] = [];
    const toolUses: ToolUseEntry[] = [];
    // Track the current tool_use name so we can pair it with its result
    let pendingToolName: string | null = null;

    try {
      for await (const sdkMessage of generator) {
        const events = translateSdkMessage(sdkMessage, translatorContext);

        for (const event of events) {
          // Intercept session event to capture SDK session ID
          if (event.type === "session" && event.sessionId) {
            meeting.sdkSessionId = asSdkSessionId(event.sessionId);
          }

          // Accumulate text from streaming deltas only (not complete messages)
          if (event.type === "text_delta") {
            textParts.push(event.text);
          }

          // Track tool_use name for pairing with its result
          if (event.type === "tool_use") {
            pendingToolName = event.name;
          }

          // Pair tool_result with the most recent tool_use name
          if (event.type === "tool_result") {
            toolUses.push({
              toolName: pendingToolName ?? event.name,
              result: event.output,
            });
            pendingToolName = null;
          }

          yield event;
        }
      }
    } catch (err: unknown) {
      // AbortError is expected when interruptTurn is called
      if (err instanceof Error && err.name === "AbortError") {
        yield { type: "error", reason: "Turn interrupted" };
        // Still append whatever was accumulated before interruption
        await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses);
        return;
      }
      const reason =
        err instanceof Error ? err.message : String(err);
      yield { type: "error", reason };
      // Append partial content on error too
      await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses);
      return;
    }

    // Append the complete assistant turn to the transcript
    await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses);
  }

  /**
   * Appends an assistant turn to the transcript, swallowing errors so
   * transcript failures don't break the meeting flow.
   */
  async function appendAssistantTurnSafe(
    meetingId: MeetingId,
    textParts: string[],
    toolUses: ToolUseEntry[],
  ): Promise<void> {
    const text = textParts.join("");
    if (!text && toolUses.length === 0) return;
    try {
      await appendAssistantTurn(
        meetingId as string,
        text,
        toolUses.length > 0 ? toolUses : undefined,
        ghHome,
      );
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[meeting-session] Transcript append failed for meeting ${meetingId} (non-fatal): ${reason}`);
    }
  }

  // -- Session creation helper --
  //
  // Shared by createMeeting (first turn) and sendMessage renewal (expired
  // session recovery). Resolves tools, activates the worker, calls queryFn,
  // captures the new session_id, updates the state file, and yields events.

  async function* startSession(
    meeting: ActiveMeeting,
    prompt: string,
    projectPath: string,
  ): AsyncGenerator<GuildHallEvent> {
    const workerPkg = getWorkerByName(deps.packages, meeting.packageName);
    if (!workerPkg) {
      yield {
        type: "error",
        reason: `Worker "${meeting.packageName}" not found in discovered packages`,
      };
      return;
    }

    const workerMeta = workerPkg.metadata as WorkerMetadata;

    // Resolve tools and activate worker
    let activation: ActivationResult;
    try {
      const resolvedTools = resolveToolSet(workerMeta, deps.packages, {
        projectPath,
        meetingId: meeting.meetingId as string,
        workerName: workerMeta.identity.name,
        guildHallHome: ghHome,
      });

      const activationContext: ActivationContext = {
        posture: workerMeta.posture,
        injectedMemory: "",
        resolvedTools,
        resourceDefaults: {
          maxTurns: workerMeta.resourceDefaults?.maxTurns,
          maxBudgetUsd: workerMeta.resourceDefaults?.maxBudgetUsd,
        },
        meetingContext: {
          meetingId: meeting.meetingId as string,
          agenda: prompt,
          referencedArtifacts: [],
        },
        projectPath,
        workingDirectory: meeting.tempDir,
      };

      activation = await activateWorker(workerPkg, activationContext);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Worker activation failed: ${reason}` };
      return;
    }

    if (!deps.queryFn) {
      yield { type: "error", reason: "No queryFn provided" };
      return;
    }

    // Build MCP servers as a Record for SDK compatibility
    const mcpServersRecord: Record<string, unknown> = {};
    for (const server of activation.tools.mcpServers) {
      mcpServersRecord[server.name] = server;
    }

    const generator = deps.queryFn({
      prompt,
      options: {
        systemPrompt: activation.systemPrompt,
        includePartialMessages: true,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers: mcpServersRecord,
        allowedTools: activation.tools.allowedTools,
        settingSources: [],
        cwd: meeting.tempDir,
        additionalDirectories: [projectPath],
        maxTurns: activation.resourceBounds.maxTurns,
        maxBudgetUsd: activation.resourceBounds.maxBudgetUsd,
        abortController: meeting.abortController,
      },
    });

    const translatorContext: TranslatorContext = {
      meetingId: meeting.meetingId as string,
      workerName: meeting.workerName,
    };

    yield* iterateAndTranslate(generator, translatorContext, meeting);

    // Update state file with captured session ID
    try {
      await writeStateFile(meeting.meetingId, {
        meetingId: meeting.meetingId,
        projectName: meeting.projectName,
        workerName: meeting.workerName,
        packageName: meeting.packageName,
        sdkSessionId: meeting.sdkSessionId,
        tempDir: meeting.tempDir,
        status: "open",
      });
    } catch {
      // State file update failure is non-fatal; the meeting is already in memory
    }
  }

  // -- Session renewal helpers --

  /**
   * Detects whether an error message indicates an expired or not-found SDK
   * session. The SDK uses phrases like "session expired" or "session not found"
   * when a resume attempt targets a stale session.
   */
  function isSessionExpiryError(reason: string): boolean {
    const lower = reason.toLowerCase();
    return (
      (lower.includes("session") &&
        (lower.includes("expired") || lower.includes("not found"))) ||
      lower.includes("session_expired")
    );
  }

  /**
   * Truncates a transcript to approximately maxChars, preserving complete
   * turn boundaries. Splits on `## User` or `## Assistant` headings and
   * drops leading turns until the remainder fits.
   */
  function truncateTranscript(transcript: string, maxChars = 30000): string {
    if (transcript.length <= maxChars) return transcript;

    // Split on turn headings, keeping the delimiter with the following section
    const turnPattern = /^(## (?:User|Assistant) \([^)]+\))/m;
    const parts = transcript.split(turnPattern);

    // parts alternates: [preamble, heading1, body1, heading2, body2, ...]
    // Reassemble into turns (heading + body pairs)
    const turns: string[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      turns.push(parts[i] + (parts[i + 1] ?? ""));
    }

    // Drop turns from the front until we fit
    let result = turns.join("");
    let startIdx = 0;
    while (result.length > maxChars && startIdx < turns.length - 1) {
      startIdx++;
      result = turns.slice(startIdx).join("");
    }

    return result;
  }

  // -- Public API --

  async function* acceptMeetingRequest(
    meetingId: MeetingId,
    projectName: string,
    message?: string,
  ): AsyncGenerator<GuildHallEvent> {
    // a. Verify project exists
    const project = findProject(projectName);
    if (!project) {
      yield { type: "error", reason: `Project "${projectName}" not found` };
      return;
    }

    // b. Check concurrent meeting cap
    const cap = project.meetingCap ?? DEFAULT_MEETING_CAP;
    const openMeetings = getOpenMeetingsForProject(projectName);
    if (openMeetings.length >= cap) {
      yield {
        type: "error",
        reason: `Meeting cap reached for project "${projectName}" (${cap} concurrent meetings)`,
      };
      return;
    }

    // c. Read the meeting artifact and verify status is "requested"
    let currentStatus: MeetingStatus | null;
    try {
      currentStatus = await readArtifactStatus(project.path, meetingId);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to read meeting artifact: ${reason}` };
      return;
    }

    if (!currentStatus) {
      yield { type: "error", reason: `Could not read status for meeting "${meetingId}"` };
      return;
    }

    // d. Validate transition: requested -> open
    try {
      validateTransition(currentStatus, "open");
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason };
      return;
    }

    // e. Update artifact status to "open"
    try {
      await updateArtifactStatus(project.path, meetingId, "open");
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to update artifact status: ${reason}` };
      return;
    }

    // f. Append meeting log
    try {
      await appendMeetingLog(project.path, meetingId, "opened", "User accepted meeting request");
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to append meeting log: ${reason}` };
      return;
    }

    // g. Read the agenda and worker info from the meeting artifact
    let agenda: string;
    let workerName: string;
    let linkedArtifacts: string[];
    try {
      const artifactPath = meetingArtifactPath(project.path, meetingId);
      const raw = await fs.readFile(artifactPath, "utf-8");
      const matter = await import("gray-matter");
      const parsed = matter.default(raw);
      const data = parsed.data as Record<string, unknown>;
      agenda = typeof data.agenda === "string" ? data.agenda : "";
      workerName = typeof data.worker === "string" ? data.worker : "";
      linkedArtifacts = await readLinkedArtifacts(project.path, meetingId);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to read meeting artifact data: ${reason}` };
      return;
    }

    // h. Find the worker package by worker name (identity name)
    // Workers are registered by package name, but the artifact stores the
    // identity name. Search packages by identity name.
    const workerPkg = deps.packages.find((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.identity.name === workerName;
    });
    if (!workerPkg) {
      yield { type: "error", reason: `Worker "${workerName}" not found in discovered packages` };
      return;
    }

    // i. Create temp directory
    let tempDir: string;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "guild-hall-"));
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to create temp directory: ${reason}` };
      return;
    }

    // j. Write machine-local state file
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName,
        workerName,
        packageName: workerPkg.name,
        sdkSessionId: null,
        tempDir,
        status: "open",
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to write state file: ${reason}` };
      return;
    }

    // k. Build initial prompt from agenda + optional user message + linked artifacts context
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
        meetingId as string,
        workerName,
        projectName,
        ghHome,
      );
      await appendUserTurn(meetingId as string, prompt, ghHome);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to create transcript: ${reason}` };
      return;
    }

    // m. Create AbortController and register meeting in active map
    const abortController = new AbortController();

    const meeting: ActiveMeeting = {
      meetingId,
      projectName,
      workerName,
      packageName: workerPkg.name,
      sdkSessionId: null,
      tempDir,
      abortController,
      status: "open",
    };
    meetings.set(meetingId as string, meeting);

    // n. Start the SDK session
    yield* startSession(meeting, prompt, project.path);
  }

  async function* createMeeting(
    projectName: string,
    workerName: string,
    prompt: string,
  ): AsyncGenerator<GuildHallEvent> {
    // a. Verify project exists
    const project = findProject(projectName);
    if (!project) {
      yield { type: "error", reason: `Project "${projectName}" not found` };
      return;
    }

    // b. Check concurrent meeting cap
    const cap = project.meetingCap ?? DEFAULT_MEETING_CAP;
    const openMeetings = getOpenMeetingsForProject(projectName);
    if (openMeetings.length >= cap) {
      yield {
        type: "error",
        reason: `Meeting cap reached for project "${projectName}" (${cap} concurrent meetings)`,
      };
      return;
    }

    // Find the worker package
    const workerPkg = getWorkerByName(deps.packages, workerName);
    if (!workerPkg) {
      yield {
        type: "error",
        reason: `Worker "${workerName}" not found in discovered packages`,
      };
      return;
    }

    const workerMeta = workerPkg.metadata as WorkerMetadata;

    // c. Generate meeting ID
    const meetingId = formatMeetingId(workerMeta.identity.name, new Date());

    // d. Create temp directory
    let tempDir: string;
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "guild-hall-"));
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to create temp directory: ${reason}` };
      return;
    }

    // e. Create meeting artifact
    try {
      await writeMeetingArtifact(
        project.path,
        meetingId,
        workerMeta.identity.displayTitle,
        prompt,
        workerMeta.identity.name,
      );
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to create meeting artifact: ${reason}` };
      return;
    }

    // e2. Create transcript and record initial user turn
    try {
      await createTranscript(
        meetingId as string,
        workerMeta.identity.name,
        projectName,
        ghHome,
      );
      await appendUserTurn(meetingId as string, prompt, ghHome);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to create transcript: ${reason}` };
      return;
    }

    // f. Write initial machine-local state
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
        packageName: workerName,
        sdkSessionId: null,
        tempDir,
        status: "open",
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Failed to write state file: ${reason}` };
      return;
    }

    // g. Create AbortController and register meeting in active map
    const abortController = new AbortController();

    const meeting: ActiveMeeting = {
      meetingId,
      projectName,
      workerName: workerMeta.identity.name,
      packageName: workerName,
      sdkSessionId: null,
      tempDir,
      abortController,
      status: "open",
    };
    meetings.set(meetingId as string, meeting);

    // h. Start the SDK session via the shared helper
    yield* startSession(meeting, prompt, project.path);
  }

  async function* sendMessage(
    meetingId: MeetingId,
    message: string,
  ): AsyncGenerator<GuildHallEvent> {
    const meeting = meetings.get(meetingId as string);
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

    if (!deps.queryFn) {
      yield { type: "error", reason: "No queryFn provided" };
      return;
    }

    // Create new AbortController for this turn
    const abortController = new AbortController();
    meeting.abortController = abortController;

    const project = findProject(meeting.projectName);
    if (!project) {
      yield { type: "error", reason: `Project "${meeting.projectName}" not found` };
      return;
    }

    // Record user turn in transcript before querying
    try {
      await appendUserTurn(meetingId as string, message, ghHome);
    } catch {
      // Transcript append failure is non-fatal
    }

    // Try to resume the existing SDK session. If the session has expired,
    // fall back to creating a fresh session with transcript context.
    let needsRenewal = false;
    const oldSessionId = meeting.sdkSessionId;

    try {
      const generator = deps.queryFn({
        prompt: message,
        options: {
          resume: meeting.sdkSessionId as string,
          includePartialMessages: true,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          settingSources: [],
          cwd: meeting.tempDir,
          additionalDirectories: [project.path],
          abortController,
        },
      });

      const translatorContext: TranslatorContext = {
        meetingId: meetingId as string,
        workerName: meeting.workerName,
      };

      // Iterate events, checking for session expiry errors
      for await (const event of iterateAndTranslate(generator, translatorContext, meeting)) {
        if (event.type === "error" && isSessionExpiryError(event.reason)) {
          needsRenewal = true;
          break;
        }
        yield event;
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      if (isSessionExpiryError(reason)) {
        needsRenewal = true;
      } else {
        yield { type: "error", reason };
        return;
      }
    }

    if (!needsRenewal) {
      // Normal path: update state file if session ID changed
      try {
        await writeStateFile(meetingId, {
          meetingId,
          projectName: meeting.projectName,
          workerName: meeting.workerName,
          packageName: meeting.packageName,
          sdkSessionId: meeting.sdkSessionId,
          tempDir: meeting.tempDir,
          status: "open",
        });
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
      transcript = await readTranscript(meetingId as string, ghHome);
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
    const renewalAbortController = new AbortController();
    meeting.abortController = renewalAbortController;
    // Clear the old session ID so startSession captures the new one
    meeting.sdkSessionId = null;

    yield* startSession(meeting, renewalPrompt, project.path);

    // Record the renewal in the meeting log
    try {
      await appendMeetingLog(
        project.path,
        meetingId,
        "session_renewed",
        `SDK session expired. Old: ${oldSessionId as string}, New: ${String(meeting.sdkSessionId)}`,
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
        tempDir: string;
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

      // Don't re-add meetings already in the map (shouldn't happen on
      // fresh startup, but guard defensively)
      if (meetings.has(state.meetingId)) continue;

      // packageName may be absent in state files written before this field
      // was added. Fall back to workerName, which is the identity name. This
      // won't match getWorkerByName (which uses package name), so renewal
      // will fail for those meetings, but at least they'll be visible.
      const packageName = state.packageName ?? state.workerName;

      // After an OS reboot, temp directories no longer exist. Create a fresh
      // one if the stored path is gone so the SDK's cwd doesn't fail.
      let tempDir = state.tempDir;
      try {
        await fs.access(tempDir);
      } catch {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "guild-hall-"));
        // Persist the new path so subsequent reads are consistent
        try {
          await writeStateFile(asMeetingId(state.meetingId), {
            meetingId: state.meetingId,
            projectName: state.projectName,
            workerName: state.workerName,
            packageName,
            sdkSessionId: state.sdkSessionId,
            tempDir,
            status: "open",
          });
        } catch {
          // Non-fatal; the meeting is still usable with the new tempDir
        }
      }

      const meeting: ActiveMeeting = {
        meetingId: asMeetingId(state.meetingId),
        projectName: state.projectName,
        workerName: state.workerName,
        packageName,
        sdkSessionId: state.sdkSessionId
          ? asSdkSessionId(state.sdkSessionId)
          : null,
        tempDir,
        abortController: new AbortController(),
        status: "open",
      };

      meetings.set(state.meetingId, meeting);
      recovered++;
    }

    return recovered;
  }

  async function closeMeeting(meetingId: MeetingId): Promise<{ notes: string }> {
    const meeting = meetings.get(meetingId as string);
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
          meetingId as string,
          project.path,
          meeting.workerName,
          {
            guildHallHome: ghHome,
            queryFn: deps.notesQueryFn,
          },
        );
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[closeMeeting] Notes generation threw for ${meetingId}: ${reason}`);
        result = { success: false, reason: `Notes generation failed: ${reason}` };
      }
    } else {
      result = { success: false, reason: "Notes generation not available." };
    }

    const notesGenerationFailed = !result.success;
    const notes = result.success ? result.notes : result.reason;

    // Update meeting artifact: status, notes_summary, and meeting log
    if (project) {
      try {
        const currentStatus = await readArtifactStatus(project.path, meetingId);
        if (currentStatus) {
          validateTransition(currentStatus, "closed");
        }
        await updateArtifactStatus(project.path, meetingId, "closed");
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[closeMeeting] Failed to update artifact status for ${meetingId}: ${reason}`);
      }

      try {
        await writeNotesToArtifact(project.path, meetingId, notes);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[closeMeeting] Failed to write notes to artifact for ${meetingId}: ${reason}`);
      }

      try {
        await appendMeetingLog(project.path, meetingId, "closed", "User closed audience");
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[closeMeeting] Failed to append meeting log for ${meetingId}: ${reason}`);
      }
    }

    // Update machine-local state
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName: meeting.projectName,
        workerName: meeting.workerName,
        packageName: meeting.packageName,
        sdkSessionId: meeting.sdkSessionId,
        tempDir: meeting.tempDir,
        status: "closed",
        closedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }

    // Clean up temp directory
    try {
      await fs.rm(meeting.tempDir, { recursive: true, force: true });
    } catch {
      // Non-fatal; temp dirs are cleaned on reboot anyway
    }

    // Only remove transcript if notes generated successfully.
    // If notes generation failed, preserve the transcript so it can be
    // used for manual review or retry.
    if (!notesGenerationFailed) {
      try {
        await removeTranscript(meetingId as string, ghHome);
      } catch {
        // Non-fatal; transcript may not exist if creation failed
      }
    }

    // Mark closed and remove from active map
    meeting.status = "closed";
    meetings.delete(meetingId as string);

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
    const meeting = meetings.get(meetingId as string);
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

  return {
    acceptMeetingRequest,
    createMeeting,
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
