/**
 * Shared SSE stream parsing and consumption utilities.
 *
 * Extracts the SSE protocol handling that WorkerPicker and MeetingRequestCard
 * both need: buffered line parsing, event accumulation, and first-turn message
 * collection. Components handle their own fetch initiation, error display,
 * and navigation.
 */

import type { ChatMessage } from "@/components/meeting/types";

// -- SSE Parsing --

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Parses SSE "data:" lines from a buffered response stream. Returns events
 * parsed from complete lines and the remaining incomplete buffer.
 */
export function parseSSEBuffer(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const lines = buffer.split("\n");
  const remaining = lines.pop()!;

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6)) as SSEEvent;
        events.push(data);
      } catch {
        // Malformed JSON line, skip
      }
    }
  }

  return { events, remaining };
}

// -- Message ID generation --

let nextMessageId = 1;

export function generateMessageId(): string {
  return `msg-${nextMessageId++}`;
}

// -- First-turn SSE consumption --

export interface FirstTurnResult {
  meetingId: string;
  messages: ChatMessage[];
}

/**
 * Reads an SSE response stream for a first-turn interaction, accumulating
 * text deltas into assistant messages and capturing the meeting ID from
 * session events.
 *
 * The caller provides the initial user message (if any) and the readable
 * stream from the fetch response. Returns the meeting ID and collected
 * messages on success.
 *
 * On error events from the stream, throws with the error reason.
 * If the stream ends without a meeting ID, throws.
 */
export async function consumeFirstTurnSSE(
  stream: ReadableStream<Uint8Array>,
  userMessage?: string,
): Promise<FirstTurnResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let meetingId: string | null = null;
  const messages: ChatMessage[] = [];
  let accumulatedText = "";

  if (userMessage) {
    messages.push({
      id: generateMessageId(),
      role: "user",
      content: userMessage,
    });
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const event of events) {
      switch (event.type) {
        case "session": {
          meetingId = event.meetingId as string;
          break;
        }

        case "text_delta": {
          accumulatedText += event.text as string;
          break;
        }

        case "tool_use":
        case "tool_result": {
          // Accumulated but not displayed during the first-turn flow.
          // These events are stored with the messages for the chat view.
          break;
        }

        case "turn_end": {
          if (accumulatedText) {
            messages.push({
              id: generateMessageId(),
              role: "assistant",
              content: accumulatedText,
            });
            accumulatedText = "";
          }
          break;
        }

        case "error": {
          throw new Error(event.reason as string);
        }
      }
    }
  }

  // Flush any remaining accumulated text (stream ended without turn_end)
  if (accumulatedText) {
    messages.push({
      id: generateMessageId(),
      role: "assistant",
      content: accumulatedText,
    });
  }

  if (!meetingId) {
    throw new Error("Stream ended without a meeting ID");
  }

  return { meetingId, messages };
}

/**
 * Stores first-turn messages in sessionStorage for the meeting chat view
 * to pick up on navigation. Silently ignores quota/availability errors.
 */
export function storeFirstTurnMessages(
  meetingId: string,
  messages: ChatMessage[],
): void {
  try {
    sessionStorage.setItem(
      `meeting-${meetingId}-initial`,
      JSON.stringify(messages),
    );
  } catch {
    // sessionStorage quota exceeded or unavailable, proceed without
  }
}
