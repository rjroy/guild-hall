"use client";

import { useState } from "react";
import styles from "./InlinePanel.module.css";

interface InlinePanelProps {
  label: string;
  children: React.ReactNode;
}

/**
 * Collapsible panel for mobile viewports. Renders a brass handle with a
 * label and chevron; clicking toggles the panel content open/closed.
 * Collapsed by default.
 */
export default function InlinePanel({ label, children }: InlinePanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.inlinePanel}>
      <button
        type="button"
        className={styles.handle}
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span>{label}</span>
        <span
          className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
          aria-hidden="true"
        >
          &#x25B6;
        </span>
      </button>
      {expanded && (
        <div className={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}
