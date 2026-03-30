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
  // System messages render as centered info banners, not speech bubbles
  if (message.role === "system") {
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
