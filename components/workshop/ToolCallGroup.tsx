"use client";

import { useState } from "react";

import type { ToolCallEntry } from "@/lib/workshop-state";
import styles from "./ToolCallGroup.module.css";

type ToolCallGroupProps = {
  toolCalls: Map<string, ToolCallEntry>;
};

export function toolCallSummary(total: number): string {
  return total === 1 ? "1 tool call" : `${total} tool calls`;
}

export function runningCount(toolCalls: Map<string, ToolCallEntry>): number {
  let count = 0;
  for (const entry of toolCalls.values()) {
    if (entry.result === undefined) count++;
  }
  return count;
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const total = toolCalls.size;
  const running = runningCount(toolCalls);

  return (
    <div className={styles.container}>
      <div
        className={expanded ? styles.header : styles.headerCollapsed}
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className={expanded ? styles.chevronOpen : styles.chevron}>
          &#9654;
        </span>
        <span className={styles.toolIcon}>&#9881;</span>
        <span className={styles.summary}>{toolCallSummary(total)}</span>
        {running > 0 && (
          <span className={styles.runningCount}>
            {running} running
          </span>
        )}
      </div>

      {expanded && (
        <div className={styles.chips}>
          {Array.from(toolCalls.entries()).map(([id, entry]) => (
            <span
              key={id}
              className={
                entry.result === undefined ? styles.chipPending : styles.chip
              }
            >
              {entry.toolName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
