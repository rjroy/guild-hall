import type { SSEEvent } from "./types";

/**
 * Format an SSE event from a type string and data object.
 * Produces the text/event-stream wire format:
 *   event: <type>\ndata: <json>\n\n
 */
export function formatSSEEvent(
  type: string,
  data: Record<string, unknown>,
): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format a typed SSEEvent into the text/event-stream wire format.
 * Extracts the `type` field as the SSE event name and serializes
 * the remaining fields as the JSON data payload.
 */
export function formatSSE(event: SSEEvent): string {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
