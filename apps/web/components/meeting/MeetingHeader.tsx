"use client";

import WorkerPortrait from "@/apps/web/components/ui/WorkerPortrait";
import Breadcrumb from "@/apps/web/components/ui/Breadcrumb";
import DetailHeader from "@/apps/web/components/ui/DetailHeader";
import type { BreadcrumbSegment } from "@/apps/web/components/ui/Breadcrumb";
import styles from "./MeetingHeader.module.css";

interface MeetingHeaderProps {
  projectName: string;
  projectTitle?: string;
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
  projectTitle,
  workerName,
  workerDisplayTitle,
  workerPortraitUrl,
  agenda,
  model,
  onClose,
  closing,
  isOnline = true,
}: MeetingHeaderProps) {
  const encodedName = encodeURIComponent(projectName);

  const segments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: projectTitle ?? projectName, href: `/projects/${encodedName}` },
    { label: "Audience" },
  ];

  return (
    <DetailHeader
      expandedMaxHeight="300px"
      condensedClassName={styles.meetingCondensed}
      condensedContent={(toggleButton) => (
        <div className={styles.headerContentCondensed}>
          <div className={styles.workerInfo}>
            <WorkerPortrait
              portraitUrl={workerPortraitUrl}
              size="xs"
            />
          </div>

          <div className={styles.agendaSectionCondensed}>
            <div className={styles.agendaContentCondensed}>
              <Breadcrumb segments={segments} />
              <p className={styles.agendaTextCondensed}>{agenda}</p>
            </div>

            <div className={styles.agendaTrailing}>
              {model && (
                <span className={styles.modelLabel}>Model: {model}</span>
              )}
              {toggleButton}
              {onClose && (
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
      )}
      expandedContent={(toggleButton) => (
        <div className={styles.headerContent}>
          <div className={styles.workerInfo}>
            <WorkerPortrait
              name={workerName}
              title={workerDisplayTitle}
              portraitUrl={workerPortraitUrl}
              size="lg"
            />
          </div>

          <div className={styles.agendaSection}>
            <Breadcrumb segments={segments} />

            <h3 className={styles.agendaTitle}>Agenda</h3>
            <p className={styles.agendaText}>{agenda}</p>

            <div className={styles.agendaTrailing}>
              {model && (
                <span className={styles.modelLabel}>Model: {model}</span>
              )}
              {toggleButton}
            </div>
          </div>
        </div>
      )}
    />
  );
}
