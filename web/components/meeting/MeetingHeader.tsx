"use client";

import { useState } from "react";
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
}

export default function MeetingHeader({
  projectName,
  workerName,
  workerDisplayTitle,
  workerPortraitUrl,
  agenda,
  model,
}: MeetingHeaderProps) {
  const [condensed, setCondensed] = useState(false);
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
          </div>
        </div>
      </div>
    </div>
  );
}
