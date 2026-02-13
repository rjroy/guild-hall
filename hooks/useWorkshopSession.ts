"use client";

import { useCallback, useRef, useState } from "react";

import type { SessionMetadata, SSEEvent, StoredMessage } from "@/lib/types";
import {
  addUserMessage,
  applySSEEvent,
  type ClockFn,
  initialState,
  setSessionError,
  setSessionLoaded,
  type WorkshopState,
} from "@/lib/workshop-state";

export type { WorkshopState };

export type WorkshopActions = {
  fetchSession: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopQuery: () => Promise<void>;
  handleSSEEvent: (event: SSEEvent) => void;
};

type FetchFn = typeof fetch;

/**
 * Manages workshop session state. Uses the pure state machine from
 * lib/workshop-state.ts for all transitions; this hook handles the
 * React integration (useState, fetch calls, SSE coordination).
 *
 * Accepts an optional fetchFn for dependency injection during testing
 * (though the state machine itself is tested independently via pure functions).
 */
export function useWorkshopSession(
  sessionId: string,
  fetchFn: FetchFn = fetch,
  clock?: ClockFn,
): WorkshopState & WorkshopActions {
  const [state, setState] = useState<WorkshopState>(initialState);

  // Ref to track whether we should connect SSE after sending a message.
  // The SSE connection is managed by useSSE in the parent component,
  // so we just expose the status for it to react to.
  const sseCallbackRef = useRef<((event: SSEEvent) => void) | null>(null);

  const fetchSession = useCallback(async () => {
    setState(initialState);
    try {
      const response = await fetchFn(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setState((s) => setSessionError(s, "Session not found"));
          return;
        }
        throw new Error(`Failed to fetch session (${response.status})`);
      }
      const data = (await response.json()) as {
        metadata: SessionMetadata;
        messages: StoredMessage[];
      };
      setState((s) => setSessionLoaded(s, data.metadata, data.messages));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState((s) => setSessionError(s, message));
    }
  }, [sessionId, fetchFn]);

  const sendMessage = useCallback(
    async (content: string) => {
      setState((s) => addUserMessage(s, content, clock));
      try {
        const response = await fetchFn(`/api/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const errorMsg =
            body?.error ?? `Failed to send message (${response.status})`;
          setState((s) => setSessionError(s, errorMsg, true));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState((s) => setSessionError(s, message, true));
      }
    },
    [sessionId, fetchFn, clock],
  );

  const stopQuery = useCallback(async () => {
    try {
      const response = await fetchFn(`/api/sessions/${sessionId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const errorMsg =
          body?.error ?? `Failed to stop query (${response.status})`;
        setState((s) => setSessionError(s, errorMsg));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState((s) => setSessionError(s, message));
    }
  }, [sessionId, fetchFn]);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    setState((s) => applySSEEvent(s, event, clock));
    // Forward to any registered callback (for extensibility)
    sseCallbackRef.current?.(event);
  }, [clock]);

  return {
    ...state,
    fetchSession,
    sendMessage,
    stopQuery,
    handleSSEEvent,
  };
}
