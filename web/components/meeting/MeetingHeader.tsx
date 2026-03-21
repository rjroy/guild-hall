"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
import styles from "./MeetingHeader.module.css";

interface MeetingHeaderProps {
  projectName: string;
  workerName: string;
  workerDisplayTitle: string;
  workerPortraitUrl?: string;
  agenda: string;
  model?: string;
  /** Close callback for phone-viewport close button (REQ-MTG-LAYOUT-22) */
  onClose?: () => void;
  /** Whether a close operation is in progress */
  closing?: boolean;
  /** Whether the daemon is online */
  isOnline?: boolean;
}

export default function MeetingHeader({
  projectName,
  workerName,
  workerDisplayTitle,
  workerPortraitUrl,
  agenda,
  model,
  onClose,
  closing,
  isOnline = true,
}: MeetingHeaderProps) {
  // REQ-MTG-LAYOUT-17/18: Default to condensed on tablet (<=960px) at mount time.
  // Not reactive to resize; toggle overrides in either direction.
  const [condensed, setCondensed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 960px)").matches;
  });

  // SSR safety: re-check on mount since SSR always returns false
  useEffect(() => {
    const matches = window.matchMedia("(max-width: 960px)").matches;
    if (matches) setCondensed(true);
  }, []);

  const encodedName = encodeURIComponent(projectName);

  const headerClassName = `${styles.header} ${condensed ? styles.headerCondensed : ""}`;

  return (
    <div className={headerClassName}>
      <div className={condensed ? styles.headerContentCondensed : styles.headerContent}>
        <div className={styles.workerInfo}>
          <WorkerPortrait
            name={workerName}
            title={condensed ? undefined : workerDisplayTitle}
            portraitUrl={workerPortraitUrl}
            size={condensed ? "xs" : "lg"}
          />
        </div>

        <div className={condensed ? styles.agendaSectionCondensed : styles.agendaSection}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/" className={styles.breadcrumbLink}>
              Guild Hall
            </Link>
            <span className={styles.separator} aria-hidden="true">
              &rsaquo;
            </span>
            <Link
              href={`/projects/${encodedName}`}
              className={styles.breadcrumbLink}
            >
              Project: {projectName}
            </Link>
            <span className={styles.separator} aria-hidden="true">
              &rsaquo;
            </span>
            <span className={styles.breadcrumbCurrent}>Audience</span>
          </nav>

          <h3 className={`${styles.agendaTitle} ${condensed ? styles.agendaTitleCondensed : ""}`}>Agenda</h3>
          <p className={condensed ? styles.agendaTextCondensed : styles.agendaText}>
            {agenda}
          </p>

          <div className={styles.agendaTrailing}>
            {model && (
              <span className={styles.modelLabel}>Model: {model}</span>
            )}
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setCondensed((prev) => !prev)}
              aria-label={condensed ? "Expand header" : "Collapse header"}
              aria-expanded={!condensed}
            >
              {condensed ? "\u25BC" : "\u25B2"}
            </button>
            {/* REQ-MTG-LAYOUT-22: Phone close button in condensed header bar.
                Rendered when condensed + onClose provided. Hidden above 480px via CSS. */}
            {condensed && onClose && (
              <button
                type="button"
                className={styles.headerCloseButton}
                onClick={onClose}
                disabled={closing || !isOnline}
                title={!isOnline ? "Daemon offline" : "Close Audience"}
                aria-label="Close Audience"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
