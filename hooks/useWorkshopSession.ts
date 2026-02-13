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
): WorkshopState & WorkshopActions & { sseUrl: string | null } {
  const [state, setState] = useState<WorkshopState>(initialState);

  // SSE URL is managed explicitly rather than derived from status.
  // This prevents a race condition where the EventSource connects
  // before the server has registered the query (the POST hasn't
  // returned yet). We only set sseUrl after the server confirms
  // the query is accepted (POST 202) or when loading a session
  // that's already running.
  const [sseUrl, setSseUrl] = useState<string | null>(null);

  const sseCallbackRef = useRef<((event: SSEEvent) => void) | null>(null);

  const fetchSession = useCallback(async () => {
    setState(initialState);
    setSseUrl(null);
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
      // If the session is already running (page load during active query),
      // connect SSE immediately since the server query is already registered.
      if (data.metadata.status === "running") {
        setSseUrl(`/api/sessions/${sessionId}/events`);
      }
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
          return;
        }
        // Server accepted the query (202). The query is now registered
        // in the agent manager, so the SSE events endpoint will find it.
        setSseUrl(`/api/sessions/${sessionId}/events`);
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
    // Disconnect SSE when the query completes
    if (event.type === "done") {
      setSseUrl(null);
    }
    sseCallbackRef.current?.(event);
  }, [clock]);

  return {
    ...state,
    sseUrl,
    fetchSession,
    sendMessage,
    stopQuery,
    handleSSEEvent,
  };
}
