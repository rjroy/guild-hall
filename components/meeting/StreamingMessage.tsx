"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import WorkerPortrait from "@/components/ui/WorkerPortrait";
import ToolUseIndicator from "./ToolUseIndicator";
import type { ToolUseEntry } from "./ToolUseIndicator";
import styles from "./StreamingMessage.module.css";

interface StreamingMessageProps {
  content: string;
  tools: ToolUseEntry[];
  workerName?: string;
  workerPortraitUrl?: string;
}

export default function StreamingMessage({
  content,
  tools,
  workerName,
  workerPortraitUrl,
}: StreamingMessageProps) {
  return (
    <div className={styles.messageRow}>
      <div className={styles.portrait}>
        <WorkerPortrait
          name={workerName}
          portraitUrl={workerPortraitUrl}
          size="sm"
        />
      </div>
      <div className={styles.bubble}>
        {tools.length > 0 && (
          <div className={styles.tools}>
            {tools.map((tool, i) => (
              <ToolUseIndicator key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        )}
        {content && (
          <div className={styles.content}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
            <span className={styles.cursor} aria-hidden="true" />
          </div>
        )}
        {!content && tools.length === 0 && (
          <div className={styles.content}>
            <span className={styles.cursor} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
