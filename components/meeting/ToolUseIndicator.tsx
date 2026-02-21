"use client";

import { useState } from "react";
import GemIndicator from "@/components/ui/GemIndicator";
import styles from "./ToolUseIndicator.module.css";

export interface ToolUseEntry {
  name: string;
  input?: unknown;
  output?: string;
  status: "running" | "complete";
}

interface ToolUseIndicatorProps {
  tool: ToolUseEntry;
}

export default function ToolUseIndicator({ tool }: ToolUseIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const gemStatus = tool.status === "running" ? "pending" : "active";
  const statusLabel = tool.status === "running" ? "Running..." : "Complete";

  return (
    <div className={styles.toolUse}>
      <button
        className={styles.toolHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        type="button"
      >
        <GemIndicator status={gemStatus} size="sm" />
        <span className={styles.toolName}>{tool.name}</span>
        <span className={styles.toolStatus}>{statusLabel}</span>
        <span className={styles.expandIcon} aria-hidden="true">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
      </button>

      {expanded && (
        <div className={styles.toolDetails}>
          {tool.input !== undefined && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>Input</span>
              <pre className={styles.detailContent}>
                {typeof tool.input === "string"
                  ? tool.input
                  : JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output !== undefined && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>Output</span>
              <pre className={styles.detailContent}>{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
