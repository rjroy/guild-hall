"use client";

import { useState } from "react";
import type { ToolUseEntry } from "@/lib/types";
import ToolUseIndicator from "./ToolUseIndicator";
import styles from "./CollapsibleToolList.module.css";

/**
 * Splits a tool list into active (running) and completed entries.
 * Exported for direct unit testing.
 */
export function categorizeTools(tools: ToolUseEntry[]): {
  activeTools: ToolUseEntry[];
  completedTools: ToolUseEntry[];
} {
  const activeTools: ToolUseEntry[] = [];
  const completedTools: ToolUseEntry[] = [];

  for (const tool of tools) {
    if (tool.status === "running") {
      activeTools.push(tool);
    } else {
      completedTools.push(tool);
    }
  }

  return { activeTools, completedTools };
}

/**
 * Builds the summary text shown on the collapsed toggle line.
 */
export function buildSummaryText(
  totalCount: number,
  isStreaming: boolean,
): string {
  if (isStreaming) {
    return `${totalCount} tool${totalCount === 1 ? "" : "s"} completed`;
  }
  return `${totalCount} tool${totalCount === 1 ? "" : "s"} used`;
}

interface CollapsibleToolListProps {
  tools: ToolUseEntry[];
  /** When true, running tools are shown individually and only completed tools are collapsed. */
  isStreaming: boolean;
}

export default function CollapsibleToolList({
  tools,
  isStreaming,
}: CollapsibleToolListProps) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const { activeTools, completedTools } = categorizeTools(tools);

  if (isStreaming) {
    // During streaming: show active tools individually, collapse completed behind summary
    return (
      <div className={styles.toolSection}>
        {completedTools.length > 0 && (
          <div className={styles.summaryGroup}>
            <button
              className={styles.summaryToggle}
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              type="button"
            >
              <span className={styles.expandIcon} aria-hidden="true">
                {expanded ? "\u25BC" : "\u25B6"}
              </span>
              <span className={styles.summaryText}>
                {buildSummaryText(completedTools.length, true)}
              </span>
            </button>
            {expanded && (
              <div className={styles.expandedList}>
                {completedTools.map((tool, i) => (
                  <ToolUseIndicator key={`${tool.name}-${i}`} tool={tool} />
                ))}
              </div>
            )}
          </div>
        )}
        {activeTools.map((tool, i) => (
          <ToolUseIndicator key={`active-${tool.name}-${i}`} tool={tool} />
        ))}
      </div>
    );
  }

  // After turn completes: collapse all tools behind summary
  return (
    <div className={styles.toolSection}>
      <button
        className={styles.summaryToggle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        type="button"
      >
        <span className={styles.expandIcon} aria-hidden="true">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className={styles.summaryText}>
          {buildSummaryText(tools.length, false)}
        </span>
      </button>
      {expanded && (
        <div className={styles.expandedList}>
          {tools.map((tool, i) => (
            <ToolUseIndicator key={`${tool.name}-${i}`} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
