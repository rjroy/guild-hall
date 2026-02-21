"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import WorkerPortrait from "@/components/ui/WorkerPortrait";
import ToolUseIndicator from "./ToolUseIndicator";
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
        {message.toolUses && message.toolUses.length > 0 && (
          <div className={styles.tools}>
            {message.toolUses.map((tool, i) => (
              <ToolUseIndicator key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
