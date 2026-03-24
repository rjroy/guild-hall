"use client";

import { useState, useEffect, startTransition, type ReactNode } from "react";
import styles from "./DetailHeader.module.css";

/**
 * Computes the interactive props for the header container based on condensed state.
 * In condensed mode, the entire container acts as a click target to expand.
 * In expanded mode, only the toggle button collapses (no container-level handler).
 */
export function containerInteractiveProps(condensed: boolean): {
  role: string | undefined;
  tabIndex: number | undefined;
  hasClickHandler: boolean;
} {
  return {
    role: condensed ? "button" : undefined,
    tabIndex: condensed ? 0 : undefined,
    hasClickHandler: condensed,
  };
}

interface DetailHeaderProps {
  /** Content rendered when the header is collapsed. Receives the toggle button for placement. */
  condensedContent: (toggleButton: ReactNode) => ReactNode;
  /** Content rendered when the header is expanded. Receives the toggle button for placement. */
  expandedContent: (toggleButton: ReactNode) => ReactNode;
  /** CSS max-height for expanded state. Must include units. */
  expandedMaxHeight?: string;
  /** CSS max-height for condensed state. Must include units. */
  condensedMaxHeight?: string;
  /** Additional class name applied to the outer container. */
  className?: string;
  /** Additional class name applied only in condensed state. */
  condensedClassName?: string;
}

const TABLET_BREAKPOINT = "(max-width: 960px)";

export default function DetailHeader({
  condensedContent,
  expandedContent,
  expandedMaxHeight = "200px",
  condensedMaxHeight = "56px",
  className,
  condensedClassName,
}: DetailHeaderProps) {
  // Always start expanded to match SSR output, then correct on mount.
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(TABLET_BREAKPOINT);
    if (mql.matches) {
      startTransition(() => setCondensed(true));
    }
  }, []);

  const containerClass = [
    styles.header,
    condensed ? styles.headerCondensed : "",
    className ?? "",
    condensed ? (condensedClassName ?? "") : "",
  ]
    .filter(Boolean)
    .join(" ");

  const maxHeight = condensed ? condensedMaxHeight : expandedMaxHeight;

  const toggleButton = (
    <button
      type="button"
      className={styles.toggleButton}
      onClick={(e) => {
        if (condensed) e.stopPropagation();
        setCondensed((prev) => !prev);
      }}
      aria-label={condensed ? "Expand header" : "Collapse header"}
      aria-expanded={!condensed}
    >
      {condensed ? "\u25BC" : "\u25B2"}
    </button>
  );

  const handleCondensedClick = condensed
    ? () => setCondensed(false)
    : undefined;

  return (
    <div
      className={containerClass}
      style={{ maxHeight }}
      role={condensed ? "button" : undefined}
      tabIndex={condensed ? 0 : undefined}
    >
      {condensed
        ? condensedContent(toggleButton)
        : expandedContent(toggleButton)}
    </div>
  );
}
