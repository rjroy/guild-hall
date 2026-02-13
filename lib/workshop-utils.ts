import type { SessionStatus, StoredMessage } from "./types";
import type { ToolCallEntry } from "./workshop-state";

/** Determines the SSE URL for a session, or null if SSE should not connect. */
export function getSSEUrl(
  status: SessionStatus,
  sessionId: string,
): string | null {
  return status === "running" ? `/api/sessions/${sessionId}/events` : null;
}

/** Whether the conversation history is empty (no messages, no streaming, no pending tools). */
export function isConversationEmpty(
  messages: StoredMessage[],
  streamingText: string,
  pendingToolCalls: Map<string, ToolCallEntry>,
): boolean {
  return (
    messages.length === 0 &&
    streamingText.length === 0 &&
    pendingToolCalls.size === 0
  );
}

/** Whether the message input should submit on a key press. */
export function shouldSubmitOnKey(
  key: string,
  shiftKey: boolean,
): boolean {
  return key === "Enter" && !shiftKey;
}

/** Whether the message input should be disabled. */
export function isInputDisabled(status: SessionStatus): boolean {
  return status === "running";
}

/** Whether the processing indicator should be visible. */
export function isProcessing(status: SessionStatus): boolean {
  return status === "running";
}

/** Whether to show the expired session banner. */
export function isSessionExpired(status: SessionStatus): boolean {
  return status === "expired";
}

/** CSS alignment class for a message role. */
export function getMessageAlignment(
  role: "user" | "assistant",
): "right" | "left" {
  return role === "user" ? "right" : "left";
}
