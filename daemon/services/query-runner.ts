/**
 * SDK query execution pipeline for meeting sessions.
 *
 * Stateless module-level functions that handle running SDK queries,
 * translating messages into Guild Hall events, and accumulating
 * transcript data. Separated from meeting/orchestrator.ts (lifecycle
 * management) so the execution layer is independently testable.
 *
 * Follows the event-translator.ts pattern: pure or near-pure functions,
 * no factory, no closure over mutable state.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  translateSdkMessage,
  type TranslatorContext,
} from "@/daemon/services/event-translator";
import type { GuildHallEvent, SdkSessionId } from "@/daemon/types";
import { asSdkSessionId } from "@/daemon/types";
import { appendAssistantTurn, type ToolUseEntry } from "@/daemon/services/transcript";
import { errorMessage } from "@/daemon/lib/toolbox-utils";

// -- Types --

export type QueryRunOutcome = "ok" | "session_expired" | "failed";

/**
 * Narrow interface for the meeting object that query-runner needs.
 * ActiveMeeting satisfies this structurally, so no changes at call sites.
 */
export interface QueryRunnerMeeting {
  meetingId: string;
  workerName: string;
  sdkSessionId: SdkSessionId | null; // mutated by iterateAndTranslate
}

/**
 * Minimal SDK query options that the meeting session passes to the queryFn.
 * The real SDK Options type has many more fields; this captures what we use.
 */
export type PresetQueryPrompt = {
  type: "preset";
  preset: "claude_code";
  append?: string;
};

export type QueryOptions = {
  systemPrompt?: string | PresetQueryPrompt;
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
  model?: string;
  resume?: string;
};

// -- Session expiry detection --

/**
 * Detects whether an error message indicates an expired or not-found SDK
 * session. The SDK uses phrases like "session expired" or "session not found"
 * when a resume attempt targets a stale session.
 */
export function isSessionExpiryError(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    (lower.includes("session") &&
      (lower.includes("expired") || lower.includes("not found"))) ||
    lower.includes("session_expired")
  );
}

// -- Transcript truncation --

/**
 * Truncates a transcript to approximately maxChars, preserving complete
 * turn boundaries. Splits on `## User` or `## Assistant` headings and
 * drops leading turns until the remainder fits.
 */
export function truncateTranscript(transcript: string, maxChars = 30000): string {
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

  // Walk backward from the end, summing turn lengths until we exceed the
  // budget. This avoids the O(N^2) of repeatedly slicing and joining.
  let totalLen = 0;
  let startIdx = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (totalLen + turns[i].length > maxChars && startIdx < turns.length) break;
    totalLen += turns[i].length;
    startIdx = i;
  }

  return turns.slice(startIdx).join("");
}

// -- Transcript append (error-swallowing) --

/**
 * Appends an assistant turn to the transcript, swallowing errors so
 * transcript failures don't break the meeting flow.
 */
export async function appendAssistantTurnSafe(
  meetingId: string,
  textParts: string[],
  toolUses: ToolUseEntry[],
  guildHallHome: string,
): Promise<void> {
  const text = textParts.join("");
  if (!text && toolUses.length === 0) return;
  try {
    await appendAssistantTurn(
      meetingId,
      text,
      toolUses.length > 0 ? toolUses : undefined,
      guildHallHome,
    );
  } catch (err: unknown) {
    const reason = errorMessage(err);
    console.warn(`[query-runner] Transcript append failed for meeting ${meetingId} (non-fatal): ${reason}`);
  }
}

// -- Iterate SDK generator and translate to Guild Hall events --
//
// Accumulates text_delta and tool_use/tool_result events during iteration
// so the assistant turn can be appended to the transcript after the
// generator completes. Only text_delta events contribute text (not
// SDKAssistantMessage text blocks) to avoid the double-data problem
// documented in event-translator.ts.

export async function* iterateAndTranslate(
  generator: AsyncGenerator<SDKMessage>,
  translatorContext: TranslatorContext,
  meeting: QueryRunnerMeeting,
  guildHallHome: string,
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
      await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses, guildHallHome);
      return;
    }
    const reason = errorMessage(err);
    yield { type: "error", reason };
    // Append partial content on error too
    await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses, guildHallHome);
    return;
  }

  // Append the complete assistant turn to the transcript
  await appendAssistantTurnSafe(meeting.meetingId, textParts, toolUses, guildHallHome);
}

// -- Run a query and translate results --

export async function* runQueryAndTranslate(
  queryFn: (params: {
    prompt: string;
    options: QueryOptions;
  }) => AsyncGenerator<SDKMessage>,
  meeting: QueryRunnerMeeting,
  prompt: string,
  options: QueryOptions,
  guildHallHome: string,
  suppressSessionExpiryError = false,
): AsyncGenerator<GuildHallEvent, QueryRunOutcome> {
  const translatorContext: TranslatorContext = {
    meetingId: meeting.meetingId,
    workerName: meeting.workerName,
  };

  let generator: AsyncGenerator<SDKMessage>;
  try {
    generator = queryFn({ prompt, options });
  } catch (err: unknown) {
    const reason = errorMessage(err);
    if (isSessionExpiryError(reason)) {
      if (!suppressSessionExpiryError) {
        yield { type: "error", reason };
      }
      return "session_expired";
    }
    yield { type: "error", reason };
    return "failed";
  }

  try {
    for await (const event of iterateAndTranslate(generator, translatorContext, meeting, guildHallHome)) {
      if (event.type === "error" && isSessionExpiryError(event.reason)) {
        if (!suppressSessionExpiryError) {
          yield event;
        }
        return "session_expired";
      }

      yield event;
    }
  } catch (err: unknown) {
    const reason = errorMessage(err);
    if (isSessionExpiryError(reason)) {
      if (!suppressSessionExpiryError) {
        yield { type: "error", reason };
      }
      return "session_expired";
    }
    yield { type: "error", reason };
    return "failed";
  }

  return "ok";
}
