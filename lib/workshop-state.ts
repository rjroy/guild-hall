/**
 * Pure state machine for workshop session management.
 *
 * Extracted from the useWorkshopSession hook so that state transitions
 * can be tested without React. The hook is a thin wrapper around these
 * functions.
 */

import type {
  SessionMetadata,
  SessionStatus,
  SSEEvent,
  StoredMessage,
} from "./types";

// -- Types --

/** Returns an ISO 8601 timestamp string. Inject for deterministic testing. */
export type ClockFn = () => string;
const defaultClock: ClockFn = () => new Date().toISOString();

export type ToolCallEntry = {
  toolName: string;
  toolInput: Record<string, unknown>;
  result?: unknown;
};

export type WorkshopState = {
  session: { metadata: SessionMetadata; messages: StoredMessage[] } | null;
  loading: boolean;
  error: string | null;
  streamingText: string;
  pendingToolCalls: Map<string, ToolCallEntry>;
  status: SessionStatus;
};

export function initialState(): WorkshopState {
  return {
    session: null,
    loading: true,
    error: null,
    streamingText: "",
    pendingToolCalls: new Map(),
    status: "idle",
  };
}

// -- State transitions --

export function setSessionLoaded(
  state: WorkshopState,
  metadata: SessionMetadata,
  messages: StoredMessage[],
): WorkshopState {
  return {
    ...state,
    session: { metadata, messages },
    loading: false,
    error: null,
    status: metadata.status,
  };
}

export function setSessionError(
  state: WorkshopState,
  message: string,
  resetStatus: boolean = false,
): WorkshopState {
  return {
    ...state,
    loading: false,
    error: message,
    ...(resetStatus ? { status: "idle" as const } : {}),
  };
}

export function addUserMessage(
  state: WorkshopState,
  content: string,
  clock: ClockFn = defaultClock,
): WorkshopState {
  if (!state.session) return state;

  const userMessage: StoredMessage = {
    role: "user",
    content,
    timestamp: clock(),
  };

  return {
    ...state,
    session: {
      ...state.session,
      messages: [...state.session.messages, userMessage],
      metadata: {
        ...state.session.metadata,
        messageCount: state.session.metadata.messageCount + 1,
      },
    },
    status: "running",
    error: null,
  };
}

/**
 * Applies a single SSE event to the workshop state.
 * Returns a new state object (immutable).
 */
export function applySSEEvent(
  state: WorkshopState,
  event: SSEEvent,
  clock: ClockFn = defaultClock,
): WorkshopState {
  switch (event.type) {
    case "processing":
      return { ...state, status: "running" };

    case "assistant_text":
      return { ...state, streamingText: state.streamingText + event.text };

    case "tool_use": {
      const nextPending = new Map(state.pendingToolCalls);
      nextPending.set(event.toolUseId, {
        toolName: event.toolName,
        toolInput: event.toolInput,
      });
      return { ...state, pendingToolCalls: nextPending };
    }

    case "tool_result": {
      const nextPending = new Map(state.pendingToolCalls);
      const existing = nextPending.get(event.toolUseId);
      if (existing) {
        nextPending.set(event.toolUseId, {
          ...existing,
          result: event.result,
        });
      }
      return { ...state, pendingToolCalls: nextPending };
    }

    case "status_change":
      return { ...state, status: event.status };

    case "error":
      return { ...state, error: event.message };

    case "done": {
      // Flush streaming text as a new assistant message
      const messages = state.session
        ? [...state.session.messages]
        : [];

      if (state.streamingText.length > 0) {
        messages.push({
          role: "assistant",
          content: state.streamingText,
          timestamp: clock(),
        });
      }

      const session = state.session
        ? {
            ...state.session,
            messages,
            metadata: {
              ...state.session.metadata,
              messageCount:
                state.streamingText.length > 0
                  ? state.session.metadata.messageCount + 1
                  : state.session.metadata.messageCount,
            },
          }
        : null;

      return {
        ...state,
        session,
        streamingText: "",
        pendingToolCalls: new Map(),
        status: "idle",
      };
    }

    default: {
      const _exhaustive: never = event;
      return state;
    }
  }
}
