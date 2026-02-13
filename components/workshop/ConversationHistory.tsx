"use client";

import { useEffect, useRef } from "react";

import type { StoredMessage } from "@/lib/types";
import type { ToolCallEntry } from "@/lib/workshop-state";
import { isConversationEmpty } from "@/lib/workshop-utils";
import { MessageBubble } from "./MessageBubble";
import { ToolCallDisplay } from "./ToolCallDisplay";
import styles from "./ConversationHistory.module.css";

type ConversationHistoryProps = {
  messages: StoredMessage[];
  streamingText: string;
  pendingToolCalls: Map<string, ToolCallEntry>;
};

export function ConversationHistory({
  messages,
  streamingText,
  pendingToolCalls,
}: ConversationHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  const isEmpty = isConversationEmpty(messages, streamingText, pendingToolCalls);

  return (
    <div className={styles.container}>
      {isEmpty && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>No messages yet</p>
          <p className={styles.emptyHint}>
            Send a message to start the conversation.
          </p>
        </div>
      )}

      {messages.map((msg, index) => (
        <MessageBubble
          key={`${msg.timestamp}-${index}`}
          role={msg.role}
          content={msg.content}
          timestamp={msg.timestamp}
        />
      ))}

      {Array.from(pendingToolCalls.entries()).map(([id, entry]) => (
        <ToolCallDisplay
          key={id}
          toolName={entry.toolName}
          toolInput={entry.toolInput}
          result={entry.result}
          pending={entry.result === undefined}
        />
      ))}

      {streamingText.length > 0 && (
        <MessageBubble
          role="assistant"
          content={streamingText}
          streaming={true}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
