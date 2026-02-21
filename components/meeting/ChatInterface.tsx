"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import StreamingMessage from "./StreamingMessage";
import MessageInput from "./MessageInput";
import ErrorMessage from "./ErrorMessage";
import type { ChatMessage, ToolUseEntry } from "./types";
import styles from "./ChatInterface.module.css";

export type { ChatMessage, ToolUseEntry };

interface ChatInterfaceProps {
  meetingId: string;
  projectName: string;
  workerName: string;
  workerDisplayTitle: string;
  workerPortraitUrl?: string;
  initialMessages?: ChatMessage[];
}

/**
 * Parses SSE lines from a buffered response stream. Returns events parsed
 * from complete lines and the remaining incomplete buffer.
 */
function parseSSEBuffer(buffer: string): {
  events: Array<{ type: string; [key: string]: unknown }>;
  remaining: string;
} {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const lines = buffer.split("\n");
  const remaining = lines.pop()!; // keep the last (possibly incomplete) line

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6)) as {
          type: string;
          [key: string]: unknown;
        };
        events.push(data);
      } catch {
        // Malformed JSON line, skip
      }
    }
  }

  return { events, remaining };
}

let nextMessageId = 1;
function generateId(): string {
  return `msg-${nextMessageId++}`;
}

export default function ChatInterface({
  meetingId,
  projectName,
  workerName,
  // workerDisplayTitle is accepted via ChatInterfaceProps but currently displayed
  // only in MeetingHeader, not within the chat area itself.
  workerPortraitUrl,
  initialMessages = [],
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolUseEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load initial messages from sessionStorage (set by WorkerPicker during meeting creation)
  useEffect(() => {
    const storageKey = `meeting-${meetingId}-initial`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // sessionStorage unavailable or malformed data, proceed with prop-based initial messages
    }
  }, [meetingId]);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent, streamingTools, error]);

  const handleSend = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
      setStreamingContent("");
      setStreamingTools([]);
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `/api/meetings/${encodeURIComponent(meetingId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const reason =
            typeof data.error === "string"
              ? data.error
              : `Request failed (${response.status})`;
          setError(reason);
          setIsStreaming(false);
          return;
        }

        if (!response.body) {
          setError("No response stream available");
          setIsStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Accumulate streaming state in local variables so we can finalize
        // a complete assistant message at turn_end without stale closure values.
        let accumulatedText = "";
        let accumulatedTools: ToolUseEntry[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(buffer);
          buffer = remaining;

          for (const event of events) {
            switch (event.type) {
              case "text_delta": {
                const delta = event.text as string;
                accumulatedText += delta;
                setStreamingContent(accumulatedText);
                break;
              }

              case "tool_use": {
                const entry: ToolUseEntry = {
                  name: event.name as string,
                  input: event.input,
                  status: "running",
                };
                accumulatedTools = [...accumulatedTools, entry];
                setStreamingTools(accumulatedTools);
                break;
              }

              case "tool_result": {
                accumulatedTools = accumulatedTools.map((t) =>
                  t.name === (event.name as string) && t.status === "running"
                    ? {
                        ...t,
                        output: event.output as string,
                        status: "complete" as const,
                      }
                    : t
                );
                setStreamingTools(accumulatedTools);
                break;
              }

              case "turn_end": {
                const assistantMessage: ChatMessage = {
                  id: generateId(),
                  role: "assistant",
                  content: accumulatedText,
                  toolUses:
                    accumulatedTools.length > 0
                      ? accumulatedTools
                      : undefined,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent("");
                setStreamingTools([]);
                setIsStreaming(false);
                break;
              }

              case "error": {
                setError(event.reason as string);
                setIsStreaming(false);
                break;
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled, finalize what we have
          setStreamingContent("");
          setStreamingTools([]);
          setIsStreaming(false);
          return;
        }
        const message =
          err instanceof Error ? err.message : "Connection failed";
        setError(message);
        setIsStreaming(false);
      } finally {
        abortRef.current = null;
      }
    },
    [meetingId]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    // Also attempt the server-side interrupt
    void fetch(
      `/api/meetings/${encodeURIComponent(meetingId)}/interrupt`,
      { method: "POST" }
    );
  }, [meetingId]);

  return (
    <div className={styles.chatInterface} data-project={projectName}>
      <div className={styles.messageArea} ref={scrollRef}>
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            workerName={workerName}
            workerPortraitUrl={workerPortraitUrl}
          />
        ))}

        {isStreaming && (
          <StreamingMessage
            content={streamingContent}
            tools={streamingTools}
            workerName={workerName}
            workerPortraitUrl={workerPortraitUrl}
          />
        )}

        {error && <ErrorMessage error={error} />}
      </div>

      <MessageInput
        onSend={(text: string) => void handleSend(text)}
        onStop={handleStop}
        isStreaming={isStreaming}
        value={inputValue}
        onChange={setInputValue}
      />
    </div>
  );
}
