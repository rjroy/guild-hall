/**
 * Translates SDK messages into Guild Hall events.
 *
 * Pure function: no side effects, no I/O. This is the boundary where SDK
 * internals stop and the daemon's public event schema begins.
 *
 * Key design decisions:
 * - SDKAssistantMessage text blocks are intentionally ignored to avoid
 *   double-data (SDK emits text via both stream_event deltas and the
 *   final assistant message when includePartialMessages is enabled).
 * - Unknown SDK message types produce empty arrays. No SDK internals leak.
 * - Tool result names are best-effort: the SDK doesn't always carry the
 *   tool name alongside tool_result content blocks, so we fall back to
 *   "unknown" when the name isn't available.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { GuildHallEvent } from "../types";

// -- Context --

export interface TranslatorContext {
  meetingId: string;
  workerName: string;
}

// -- Local type projections for SDK message shapes --
//
// The SDK's SDKMessage is a complex union with generics that ESLint's type
// checker can't resolve. These interfaces describe the subset of fields
// we actually access, letting us cast once at the switch boundary.

interface SdkSystemMessage {
  type: "system";
  subtype?: string;
  session_id?: string;
}

interface SdkStreamEventMessage {
  type: "stream_event";
  event: Record<string, unknown>;
}

interface SdkAssistantMessage {
  type: "assistant";
  message?: { content?: unknown[] };
}

interface SdkUserMessage {
  type: "user";
  message?: { content?: unknown };
}

interface SdkResultMessage {
  type: "result";
  subtype?: string;
  total_cost_usd?: number;
  errors?: string[];
}

// -- Translator --

/**
 * Converts a single SDK message into zero or more Guild Hall events.
 *
 * Returns an array because some SDK messages produce multiple events
 * (e.g., an assistant message with multiple tool_use blocks) and some
 * produce none (internal SDK bookkeeping messages).
 */
export function translateSdkMessage(
  message: SDKMessage,
  context: TranslatorContext,
): GuildHallEvent[] {
  // Cast to access .type: SDKMessage is a complex union that ESLint's type
  // checker can't resolve for member access.
  const msg = message as unknown as { type: string };
  switch (msg.type) {
    case "system":
      return translateSystemMessage(
        message as unknown as SdkSystemMessage,
        context,
      );

    case "stream_event":
      return translateStreamEvent(
        message as unknown as SdkStreamEventMessage,
      );

    case "assistant":
      return translateAssistantMessage(
        message as unknown as SdkAssistantMessage,
      );

    case "user":
      return translateUserMessage(message as unknown as SdkUserMessage);

    case "result":
      return translateResultMessage(message as unknown as SdkResultMessage);

    default:
      // tool_progress, tool_use_summary, auth_status, and any future
      // SDK message types are internal bookkeeping. Return nothing.
      return [];
  }
}

// -- System messages --

function translateSystemMessage(
  message: SdkSystemMessage,
  context: TranslatorContext,
): GuildHallEvent[] {
  // The SDK uses "system" for multiple subtypes. Only "init" maps to a
  // Guild Hall event; compact_boundary, status, hook_*, task_*, and
  // files_persisted are internal.
  if (message.subtype !== "init") {
    return [];
  }

  return [
    {
      type: "session",
      meetingId: context.meetingId,
      sessionId: message.session_id ?? "",
      worker: context.workerName,
    },
  ];
}

// -- Stream events (partial assistant messages) --

function translateStreamEvent(
  message: SdkStreamEventMessage,
): GuildHallEvent[] {
  const event = message.event;
  const eventType = event.type as string | undefined;

  if (eventType === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return [{ type: "text_delta", text: delta.text }];
    }
    // input_json_delta and other delta types are not surfaced
    return [];
  }

  if (eventType === "content_block_start") {
    const contentBlock = event.content_block as Record<string, unknown> | undefined;
    if (contentBlock?.type === "tool_use" && typeof contentBlock.name === "string") {
      return [
        {
          type: "tool_use",
          name: contentBlock.name,
          input: {},
        },
      ];
    }
    return [];
  }

  // message_start, message_delta, message_stop, content_block_stop:
  // lifecycle events with no Guild Hall equivalent
  return [];
}

// -- Assistant messages (complete, non-streaming) --

function translateAssistantMessage(
  message: SdkAssistantMessage,
): GuildHallEvent[] {
  // CRITICAL: Do NOT extract text blocks here. The SDK emits text twice
  // when includePartialMessages is enabled (once via stream_event deltas,
  // once in the final assistant message). We only use the streaming path
  // for text. Extract ONLY tool_use blocks.
  const content = message.message?.content;
  if (!Array.isArray(content)) return [];

  const events: GuildHallEvent[] = [];
  for (const block of content) {
    const typed = block as Record<string, unknown>;
    if (typed.type === "tool_use" && typeof typed.name === "string") {
      events.push({
        type: "tool_use",
        name: typed.name,
        input: typed.input ?? {},
      });
    }
    // text blocks intentionally ignored (double-data prevention)
  }
  return events;
}

// -- User messages (contain tool results) --

function translateUserMessage(
  message: SdkUserMessage,
): GuildHallEvent[] {
  // SDKUserMessage.message is a MessageParam with a content field.
  // When the SDK sends tool results back, the content array contains
  // tool_result blocks.
  const content = message.message?.content;
  if (!Array.isArray(content)) return [];

  const events: GuildHallEvent[] = [];
  for (const block of content) {
    const typed = block as Record<string, unknown>;
    if (typed.type === "tool_result") {
      const name = extractToolResultName(typed);
      const output = extractToolResultOutput(typed);
      events.push({ type: "tool_result", name, output });
    }
  }
  return events;
}

/**
 * Extracts the tool name from a tool_result block. The SDK doesn't always
 * include the name directly on tool_result blocks (they reference tool_use_id
 * instead). We look for a name field but fall back to "unknown".
 */
function extractToolResultName(block: Record<string, unknown>): string {
  if (typeof block.name === "string") return block.name;
  // Some SDK versions include tool_name on the block
  if (typeof block.tool_name === "string") return block.tool_name;
  return "unknown";
}

/**
 * Extracts text output from a tool_result content block.
 * The content can be a string directly or an array of content parts.
 */
function extractToolResultOutput(block: Record<string, unknown>): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" &&
          part !== null &&
          (part as Record<string, unknown>).type === "text" &&
          typeof (part as Record<string, unknown>).text === "string",
      )
      .map((part) => part.text)
      .join("");
  }
  return "";
}

// -- Result messages --

function translateResultMessage(
  message: SdkResultMessage,
): GuildHallEvent[] {
  const subtype = message.subtype;

  if (subtype === "success") {
    const cost =
      typeof message.total_cost_usd === "number"
        ? message.total_cost_usd
        : undefined;
    return [{ type: "turn_end", cost }];
  }

  // All error subtypes: error_during_execution, error_max_turns,
  // error_max_budget_usd, error_max_structured_output_retries
  if (typeof subtype === "string" && subtype.startsWith("error")) {
    const errors = message.errors;
    const reason =
      Array.isArray(errors) && errors.length > 0
        ? errors.join("; ")
        : subtype;
    return [{ type: "error", reason }];
  }

  return [];
}
