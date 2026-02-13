"use client";

import { useState } from "react";

import styles from "./ToolCallDisplay.module.css";

type ToolCallDisplayProps = {
  toolName: string;
  toolInput: Record<string, unknown>;
  result?: unknown;
  pending?: boolean;
};

export function ToolCallDisplay({
  toolName,
  toolInput,
  result,
  pending = false,
}: ToolCallDisplayProps) {
  const [inputExpanded, setInputExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const containerClass = pending
    ? `${styles.container} ${styles.pending}`
    : styles.container;

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        <span className={styles.toolIcon}>&#9881;</span>
        <span className={styles.toolName}>{toolName}</span>
        {pending && <span className={styles.runningBadge}>Running...</span>}
        {!pending && result !== undefined && (
          <span className={styles.completedBadge}>Completed</span>
        )}
      </div>

      <div className={styles.section}>
        <button
          className={styles.sectionToggle}
          onClick={() => setInputExpanded(!inputExpanded)}
          aria-expanded={inputExpanded}
        >
          <span
            className={
              inputExpanded ? styles.chevronOpen : styles.chevron
            }
          >
            &#9654;
          </span>
          Input
        </button>
        {inputExpanded && (
          <pre className={styles.codeBlock}>
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        )}
      </div>

      {result !== undefined && (
        <div className={styles.section}>
          <button
            className={styles.sectionToggle}
            onClick={() => setResultExpanded(!resultExpanded)}
            aria-expanded={resultExpanded}
          >
            <span
              className={
                resultExpanded ? styles.chevronOpen : styles.chevron
              }
            >
              &#9654;
            </span>
            Result
          </button>
          {resultExpanded && (
            <pre className={`${styles.codeBlock} ${styles.resultBlock}`}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
