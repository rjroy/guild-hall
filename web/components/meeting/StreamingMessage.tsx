"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
import CollapsibleToolList from "./CollapsibleToolList";
import styles from "./StreamingMessage.module.css";
import type { ToolUseEntry } from "@/lib/types";

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
            <CollapsibleToolList tools={tools} isStreaming={true} />
          </div>
        )}
        {content && (
          <div className={styles.content}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
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
