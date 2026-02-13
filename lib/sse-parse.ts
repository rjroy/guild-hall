/**
 * Pure functions for parsing SSE events on the client side.
 *
 * Extracted from the useSSE hook for testability. These handle the
 * mapping between named SSE event types and our typed SSEEvent union.
 */

import type { SSEEvent } from "./types";

/** The named event types we listen for on the EventSource. */
export const SSE_EVENT_TYPES = [
  "processing",
  "assistant_text",
  "tool_use",
  "tool_result",
  "status_change",
  "error",
  "done",
] as const;

export type SSEEventType = (typeof SSE_EVENT_TYPES)[number];

/**
 * Parses a named SSE event's data string into a typed SSEEvent.
 *
 * The SSE wire format sends the event type as the event name and the
 * remaining fields as the JSON data payload. This function reconstructs
 * the full SSEEvent by combining the event name with the parsed data.
 *
 * Returns null if parsing fails (malformed JSON or unknown event type).
 */
export function parseSSEData(
  eventType: string,
  dataString: string,
): SSEEvent | null {
  if (!isKnownEventType(eventType)) {
    return null;
  }

  try {
    const data = JSON.parse(dataString) as Record<string, unknown>;
    return { type: eventType, ...data } as SSEEvent;
  } catch {
    return null;
  }
}

function isKnownEventType(type: string): type is SSEEventType {
  return (SSE_EVENT_TYPES as readonly string[]).includes(type);
}
