"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseSSEData, SSE_EVENT_TYPES } from "@/lib/sse-parse";
import type { SSEEvent } from "@/lib/types";

export type UseSSEResult = {
  connected: boolean;
  disconnect: () => void;
};

/**
 * Manages an EventSource connection for receiving server-sent events.
 *
 * Pass a non-null URL to connect; pass null to disconnect (or stay
 * disconnected). The hook listens for all known SSE event types,
 * parses them, and forwards them to the onEvent callback.
 *
 * The EventSource is closed automatically on "done" events, on
 * unmount, or when the URL changes to null.
 */
export function useSSE(
  url: string | null,
  onEvent: (event: SSEEvent) => void,
): UseSSEResult {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Keep a stable reference to the latest callback so we don't
  // re-create the EventSource when the callback identity changes.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!url) {
      disconnect();
      return;
    }

    // Close any existing connection before opening a new one
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onerror = () => {
      // EventSource automatically reconnects on transient errors.
      // We mark disconnected so the UI can reflect the state.
      setConnected(false);
    };

    // Register a listener for each named event type
    for (const eventType of SSE_EVENT_TYPES) {
      es.addEventListener(eventType, (messageEvent: MessageEvent) => {
        const parsed = parseSSEData(eventType, messageEvent.data as string);
        if (parsed) {
          onEventRef.current(parsed);

          // Close the EventSource on "done" events
          if (parsed.type === "done") {
            es.close();
            eventSourceRef.current = null;
            setConnected(false);
          }
        }
      });
    }

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [url, disconnect]);

  return { connected, disconnect };
}
