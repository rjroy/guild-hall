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
import type { GuildHallEvent, MeetingId, SdkSessionId } from "@/daemon/types";
import { asMeetingId, asSdkSessionId } from "@/daemon/types";
import { getGuildHallHome } from "@/lib/paths";

// -- Constants --

const DEFAULT_MEETING_CAP = 5;

// -- In-memory state --

type ActiveMeeting = {
  meetingId: MeetingId;
  projectName: string;
  workerName: string;
  sdkSessionId: SdkSessionId | null;
  tempDir: string;
  abortController: AbortController;
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

  function meetingArtifactPath(projectPath: string, meetingId: MeetingId): string {
    return path.join(projectPath, ".lore", "meetings", `${meetingId}.md`);
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
  ): Promise<void> {
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    // Write raw YAML frontmatter + empty body. Using template literal to
    // avoid gray-matter stringify reformatting (lesson from retros).
    const content = `---
title: "Audience with ${workerDisplayTitle}"
date: ${dateStr}
status: open
tags: [meeting]
worker: ${workerName}
workerDisplayTitle: "${workerDisplayTitle.replace(/"/g, '\\"')}"
agenda: "${prompt.replace(/"/g, '\\"')}"
linked_artifacts: []
meeting_log:
  - timestamp: ${isoStr}
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
  }

  async function appendMeetingLog(
    projectPath: string,
    meetingId: MeetingId,
    event: string,
    reason: string,
  ): Promise<void> {
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    const now = new Date();
    const logEntry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${reason.replace(/"/g, '\\"')}"`;

    // Insert the new log entry before "notes_summary:" line
    const notesSummaryIndex = raw.indexOf("notes_summary:");
    if (notesSummaryIndex === -1) {
      // Fallback: append before closing ---
      const closingIndex = raw.lastIndexOf("\n---");
      if (closingIndex !== -1) {
        const updated = raw.slice(0, closingIndex) + "\n" + logEntry + raw.slice(closingIndex);
        await fs.writeFile(artifactPath, updated, "utf-8");
      }
      return;
    }

    const updated = raw.slice(0, notesSummaryIndex) + logEntry + "\n" + raw.slice(notesSummaryIndex);
    await fs.writeFile(artifactPath, updated, "utf-8");
  }

  async function updateArtifactStatus(
    projectPath: string,
    meetingId: MeetingId,
    newStatus: string,
  ): Promise<void> {
    const artifactPath = meetingArtifactPath(projectPath, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const updated = raw.replace(/^status: open$/m, `status: ${newStatus}`);
    await fs.writeFile(artifactPath, updated, "utf-8");
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

  // -- Async generator: iterate SDK messages and yield Guild Hall events --

  async function* iterateAndTranslate(
    generator: AsyncGenerator<SDKMessage>,
    translatorContext: TranslatorContext,
    meeting: ActiveMeeting,
  ): AsyncGenerator<GuildHallEvent> {
    try {
      for await (const sdkMessage of generator) {
        const events = translateSdkMessage(sdkMessage, translatorContext);

        for (const event of events) {
          // Intercept session event to capture SDK session ID
          if (event.type === "session" && event.sessionId) {
            meeting.sdkSessionId = asSdkSessionId(event.sessionId);
          }
          yield event;
        }
      }
    } catch (err: unknown) {
      // AbortError is expected when interruptTurn is called
      if (err instanceof Error && err.name === "AbortError") {
        yield { type: "error", reason: "Turn interrupted" };
        return;
      }
      const reason =
        err instanceof Error ? err.message : String(err);
      yield { type: "error", reason };
    }
  }

  // -- Public API --

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

    // f. Write initial machine-local state
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
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

    // g. Resolve tools and activate worker
    let activation: ActivationResult;
    try {
      const resolvedTools = resolveToolSet(workerMeta, deps.packages, {
        projectPath: project.path,
        meetingId: meetingId as string,
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
          meetingId: meetingId as string,
          agenda: prompt,
          referencedArtifacts: [],
        },
        projectPath: project.path,
        workingDirectory: tempDir,
      };

      activation = await activateWorker(workerPkg, activationContext);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      yield { type: "error", reason: `Worker activation failed: ${reason}` };
      return;
    }

    // h. Create AbortController for this turn
    const abortController = new AbortController();

    // Register meeting in active map before calling queryFn
    const meeting: ActiveMeeting = {
      meetingId,
      projectName,
      workerName: workerMeta.identity.name,
      sdkSessionId: null,
      tempDir,
      abortController,
      status: "open",
    };
    meetings.set(meetingId as string, meeting);

    // i. Call queryFn if provided
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
        cwd: tempDir,
        additionalDirectories: [project.path],
        maxTurns: activation.resourceBounds.maxTurns,
        maxBudgetUsd: activation.resourceBounds.maxBudgetUsd,
        abortController,
      },
    });

    const translatorContext: TranslatorContext = {
      meetingId: meetingId as string,
      workerName: workerMeta.identity.name,
    };

    // j-k. Iterate, translate, capture session_id, yield events
    yield* iterateAndTranslate(generator, translatorContext, meeting);

    // l. Update state file with captured session ID
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName,
        workerName: workerMeta.identity.name,
        sdkSessionId: meeting.sdkSessionId,
        tempDir,
        status: "open",
        createdAt: new Date().toISOString(),
      });
    } catch {
      // State file update failure is non-fatal; the meeting is already in memory
    }
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

    yield* iterateAndTranslate(generator, translatorContext, meeting);

    // Update state file if session ID changed
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName: meeting.projectName,
        workerName: meeting.workerName,
        sdkSessionId: meeting.sdkSessionId,
        tempDir: meeting.tempDir,
        status: "open",
      });
    } catch {
      // Non-fatal
    }
  }

  async function closeMeeting(meetingId: MeetingId): Promise<void> {
    const meeting = meetings.get(meetingId as string);
    if (!meeting) {
      throw new Error(`Meeting "${meetingId}" not found`);
    }

    // Abort any active generation
    meeting.abortController.abort();

    // Update meeting artifact
    const project = findProject(meeting.projectName);
    if (project) {
      try {
        await updateArtifactStatus(project.path, meetingId, "closed");
        await appendMeetingLog(project.path, meetingId, "closed", "User closed audience");
      } catch {
        // Artifact update failure is non-fatal for closing
      }
    }

    // Update machine-local state
    try {
      await writeStateFile(meetingId, {
        meetingId,
        projectName: meeting.projectName,
        workerName: meeting.workerName,
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

    // Mark closed and remove from active map
    meeting.status = "closed";
    meetings.delete(meetingId as string);
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
    createMeeting,
    sendMessage,
    closeMeeting,
    interruptTurn,
    getActiveMeetings,
    getOpenMeetingsForProject: getOpenMeetingsForProjectPublic,
  };
}
