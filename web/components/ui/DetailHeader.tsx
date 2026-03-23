"use client";

import { useState, useEffect, startTransition, type ReactNode } from "react";
import styles from "./DetailHeader.module.css";

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
  const [condensed, setCondensed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(TABLET_BREAKPOINT).matches;
  });

  // SSR safety: re-check on mount since SSR always returns false.
  useEffect(() => {
    const matches = window.matchMedia(TABLET_BREAKPOINT).matches;
    if (matches) {
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
      onClick={() => setCondensed((prev) => !prev)}
      aria-label={condensed ? "Expand header" : "Collapse header"}
      aria-expanded={!condensed}
    >
      {condensed ? "\u25BC" : "\u25B2"}
    </button>
  );

  return (
    <div className={containerClass} style={{ maxHeight }}>
      {condensed
        ? condensedContent(toggleButton)
        : expandedContent(toggleButton)}
    </div>
  );
}
