/**
 * Session loop: iterateSession and startSession extracted from the meeting
 * orchestrator. These functions drive the SDK session lifecycle (run, map
 * events, accumulate transcript, handle renewal) while the orchestrator
 * handles everything above (registry, git, artifacts, state files).
 *
 * This module must NOT import from orchestrator.ts (no circular deps).
 */

import type { Log } from "@/daemon/lib/log";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  prepareSdkSession,
  runSdkSession,
  isSessionExpiryError,
  prefixLocalModelError,
  type SessionPrepSpec,
  type SessionPrepDeps,
  type SdkQueryOptions,
} from "@/daemon/lib/agent-sdk/sdk-runner";
import type { ResolvedModel } from "@/lib/types";
import type { GuildHallEvent, MeetingId, SdkSessionId } from "@/daemon/types";
import { asSdkSessionId } from "@/daemon/types";
import {
  appendAssistantTurnSafe,
  type ToolUseEntry,
} from "@/daemon/services/meeting/transcript";
import type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";

// -- Constants --

export const MEETING_GREETING_PROMPT =
  "Briefly introduce yourself and summarize your understanding of the meeting agenda, then ask how the user would like to proceed.";

/**
 * Pure function for meeting prompt composition (REQ-SPO-21, REQ-SPO-23).
 * Extracted for testability per plan recommendation.
 *
 * - isInitial (new session): sessionContext + greeting prompt
 * - renewal / no-session-resume: sessionContext alone (falls back to prompt if empty)
 */
export function composeMeetingPrompt(
  sessionContext: string,
  prompt: string,
  isInitial: boolean,
): string {
  if (isInitial) {
    return sessionContext
      ? `${sessionContext}\n\n${MEETING_GREETING_PROMPT}`
      : MEETING_GREETING_PROMPT;
  }
  return sessionContext || prompt;
}

// -- Dependency types --

export type SessionLoopDeps = {
  /** The SDK query function for running sessions. */
  queryFn?: (params: {
    prompt: string;
    options: SdkQueryOptions;
  }) => AsyncGenerator<SDKMessage>;
  /** Guild hall home path for transcript file operations. */
  guildHallHome: string;
  /** Injectable logger. */
  log: Log;
  /** Session prep dependencies (resolveToolSet, loadMemories, activateWorker). */
  prepDeps: SessionPrepDeps;
};

// -- Session loop helper --
//
// Iterates runSdkSession, maps SdkRunnerEvent to GuildHallEvent, accumulates
// transcript data, and appends the assistant turn after the loop completes.
// suppressExpiryErrors: when true, session-expiry errors are tracked for
// post-loop detection but withheld from SSE (sendMessage path).

export async function* iterateSession(
  deps: SessionLoopDeps,
  meeting: ActiveMeetingEntry,
  prompt: string,
  options: SdkQueryOptions,
  suppressExpiryErrors: boolean,
  resolvedModel?: ResolvedModel,
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

  for await (const event of runSdkSession(deps.queryFn, prompt, options, deps.log)) {
    // Capture session ID (guard against empty string from SDK init)
    if (event.type === "session") {
      if (event.sessionId) {
        meeting.sdkSessionId = asSdkSessionId(event.sessionId);
      } else {
        deps.log.warn(
          `SDK init message for "${meeting.meetingId as string}" had no session_id`,
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
      const prefixed = prefixLocalModelError(event.reason, resolvedModel);
      lastError = prefixed;
      if (isSessionExpiryError(event.reason)) {
        hasExpiryError = true;
      }
      if (!suppressExpiryErrors || !isSessionExpiryError(event.reason)) {
        yield { type: "error", reason: prefixed };
      }
    } else {
      // text_delta, tool_use, tool_input, tool_result, turn_end pass through
      yield event;
    }
  }

  // Append the assistant turn to the transcript (single post-loop call
  // handles all cases including abort/error with partial content).
  await appendAssistantTurnSafe(meeting.meetingId as string, textParts, toolUses, deps.guildHallHome);

  return { lastError, hasExpiryError };
}

// -- Session creation helper --
//
// Shared by createMeeting (first turn) and sendMessage renewal (expired
// session recovery). Resolves tools, activates the worker, calls queryFn,
// captures the new session_id, updates the state file, and yields events.

export async function* startSession(
  deps: SessionLoopDeps,
  meeting: ActiveMeetingEntry,
  prompt: string,
  buildMeetingPrepSpec: (
    meeting: ActiveMeetingEntry,
    prompt: string,
    resumeSessionId?: SdkSessionId,
  ) => Promise<{ ok: true; spec: SessionPrepSpec } | { ok: false; reason: string }>,
  writeStateFile: (meetingId: MeetingId, data: Record<string, unknown>) => Promise<void>,
  serializeMeetingState: (meeting: ActiveMeetingEntry) => Record<string, unknown>,
  opts?: { isInitial?: boolean },
): AsyncGenerator<GuildHallEvent> {
  if (!deps.queryFn) {
    deps.log.error(`startSession failed for meeting ${meeting.meetingId as string}: No queryFn provided`);
    yield { type: "error", reason: "No queryFn provided" };
    return;
  }

  const prepSpecResult = await buildMeetingPrepSpec(meeting, prompt);
  if (!prepSpecResult.ok) {
    deps.log.error(`startSession failed for meeting ${meeting.meetingId as string}: ${prepSpecResult.reason}`);
    yield { type: "error", reason: prepSpecResult.reason };
    return;
  }

  const prep = await prepareSdkSession(prepSpecResult.spec, deps.prepDeps, deps.log);
  if (!prep.ok) {
    deps.log.error(`startSession failed for meeting ${meeting.meetingId as string}: ${prep.error}`);
    yield { type: "error", reason: prep.error };
    return;
  }

  // Compose the SDK prompt from sessionContext based on path (REQ-SPO-21, REQ-SPO-23)
  const sdkPrompt = composeMeetingPrompt(prep.result.sessionContext, prompt, !!opts?.isInitial);
  yield* iterateSession(deps, meeting, sdkPrompt, prep.result.options, false, prep.result.resolvedModel);

  // Update state file with captured session ID
  try {
    await writeStateFile(meeting.meetingId, serializeMeetingState(meeting));
  } catch (err: unknown) {
    deps.log.warn(
      `Failed to update state file for "${meeting.meetingId as string}" after session start (non-fatal):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
