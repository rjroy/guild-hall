"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
import CollapsibleToolList from "./CollapsibleToolList";
import type { ChatMessage } from "./types";
import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  message: ChatMessage;
  workerName?: string;
  workerPortraitUrl?: string;
}

export default function MessageBubble({
  message,
  workerName,
  workerPortraitUrl,
}: MessageBubbleProps) {
  // System messages render as centered info banners, not speech bubbles.
  // Error messages (content prefixed with "Error:") get error styling (REQ-MEP-8).
  // They render inline, not in the sticky error banner (REQ-MEP-9).
  if (message.role === "system") {
    const isError = message.content.startsWith("Error:");

    if (isError) {
      const errorText = message.content.slice("Error:".length).trim();
      return (
        <div className={styles.errorMessage}>
          <p className={styles.errorText}>{errorText}</p>
        </div>
      );
    }

    const parts = message.content.split("\n\n");
    const firstLine = parts[0];
    const restOfContent = parts.slice(1).join("\n\n");

    return (
      <div className={styles.systemMessage}>
        <p className={styles.systemText}>{firstLine}</p>
        {restOfContent && (
          <details className={styles.systemDetails}>
            <summary>Compaction summary</summary>
            <p>{restOfContent}</p>
          </details>
        )}
      </div>
    );
  }

  const isUser = message.role === "user";

  const bubbleClass = [
    styles.bubble,
    isUser ? styles.userBubble : styles.assistantBubble,
  ].join(" ");

  const rowClass = [
    styles.messageRow,
    isUser ? styles.userRow : styles.assistantRow,
  ].join(" ");

  return (
    <div className={rowClass}>
      {!isUser && (
        <div className={styles.portrait}>
          <WorkerPortrait
            name={workerName}
            portraitUrl={workerPortraitUrl}
            size="sm"
          />
        </div>
      )}
      <div className={bubbleClass}>
        <div className={styles.content}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
            {message.content}
          </ReactMarkdown>
        </div>
        {message.toolUses && message.toolUses.length > 0 && (
          <div className={styles.tools}>
            <CollapsibleToolList tools={message.toolUses} isStreaming={false} />
          </div>
        )}
      </div>
    </div>
  );
}
