"use client";

import { formatRelativeTime } from "@/lib/relative-time";
import styles from "./MessageBubble.module.css";

type MessageBubbleProps = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  streaming?: boolean;
};

export function MessageBubble({
  role,
  content,
  timestamp,
  streaming = false,
}: MessageBubbleProps) {
  const bubbleClass =
    role === "user"
      ? `${styles.bubble} ${styles.userBubble}`
      : `${styles.bubble} ${styles.assistantBubble}`;

  return (
    <div
      className={
        role === "user" ? styles.containerUser : styles.containerAssistant
      }
    >
      <div className={bubbleClass}>
        <div className={styles.content}>
          {content}
          {streaming && <span className={styles.cursor} />}
        </div>
        {timestamp && (
          <time className={styles.timestamp} dateTime={timestamp}>
            {formatRelativeTime(timestamp)}
          </time>
        )}
      </div>
    </div>
  );
}
