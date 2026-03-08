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
import type { SdkRunnerEvent } from "@/daemon/lib/agent-sdk/sdk-runner";

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
): SdkRunnerEvent[] {
  // Cast to access .type: SDKMessage is a complex union that ESLint's type
  // checker can't resolve for member access.
  const msg = message as unknown as { type: string };
  switch (msg.type) {
    case "system":
      return translateSystemMessage(
        message as unknown as SdkSystemMessage,
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
): SdkRunnerEvent[] {
  // The SDK uses "system" for multiple subtypes. Only "init" maps to a
  // Guild Hall event; compact_boundary, status, hook_*, task_*, and
  // files_persisted are internal.
  if (message.subtype !== "init") {
    return [];
  }

  return [
    {
      type: "session",
      sessionId: message.session_id ?? "",
    },
  ];
}

// -- Stream events (partial assistant messages) --

function translateStreamEvent(
  message: SdkStreamEventMessage,
): SdkRunnerEvent[] {
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
      const id = typeof contentBlock.id === "string" ? contentBlock.id : undefined;
      return [
        {
          type: "tool_use",
          name: contentBlock.name,
          input: {},
          id,
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
  _message: SdkAssistantMessage,
): SdkRunnerEvent[] {
  // The SDK emits all content blocks twice when includePartialMessages is
  // enabled: once via stream_event (content_block_start for tool_use,
  // content_block_delta for text) and once in the finalized assistant
  // message. We use the streaming path for both text and tool_use events,
  // so the assistant message is fully redundant. Return empty to prevent
  // duplicate tool indicators in the UI.
  //
  // This means the translator only produces text_delta events from
  // stream_event messages. runSdkSession enforces includePartialMessages
  // to guarantee those messages are present.
  return [];
}

// -- User messages (contain tool results) --

function translateUserMessage(
  message: SdkUserMessage,
): SdkRunnerEvent[] {
  // SDKUserMessage.message is a MessageParam with a content field.
  // When the SDK sends tool results back, the content array contains
  // tool_result blocks.
  const content = message.message?.content;
  if (!Array.isArray(content)) return [];

  const events: SdkRunnerEvent[] = [];
  for (const block of content) {
    const typed = block as Record<string, unknown>;
    if (typed.type === "tool_result") {
      const name = extractToolResultName(typed);
      const output = extractToolResultOutput(typed);
      const toolUseId = typeof typed.tool_use_id === "string" ? typed.tool_use_id : undefined;
      events.push({ type: "tool_result", name, output, toolUseId });
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
): SdkRunnerEvent[] {
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
