"use client";

import GemIndicator from "@/web/components/ui/GemIndicator";
import Breadcrumb from "@/web/components/ui/Breadcrumb";
import DetailHeader from "@/web/components/ui/DetailHeader";
import { statusToGem } from "@/lib/types";
import type { BreadcrumbSegment } from "@/web/components/ui/Breadcrumb";
import styles from "./CommissionHeader.module.css";

interface CommissionHeaderProps {
  title: string;
  status: string;
  worker: string;
  workerDisplayTitle: string;
  projectName: string;
  model?: string;
  isModelOverride?: boolean;
  isLocalModel?: boolean;
  localModelBaseUrl?: string;
  commissionType?: string;
}

/**
 * Displays commission identity: title, status gem, worker attribution,
 * and breadcrumb navigation. Delegates container chrome and condensed
 * state to DetailHeader.
 */
export default function CommissionHeader({
  title,
  status,
  worker,
  workerDisplayTitle,
  projectName,
  model,
  isModelOverride,
  isLocalModel,
  localModelBaseUrl,
  commissionType,
}: CommissionHeaderProps) {
  const encodedProject = encodeURIComponent(projectName);
  const gemStatus = statusToGem(status);
  const displayStatus = status.replace(/_/g, " ");

  const condensedSegments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: projectName, href: `/projects/${encodedProject}` },
    { label: "Commission" },
  ];

  const expandedSegments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: projectName, href: `/projects/${encodedProject}` },
    { label: "Commissions", href: `/projects/${encodedProject}?tab=commissions` },
    { label: "Commission" },
  ];

  return (
    <DetailHeader
      condensedContent={(toggleButton) => (
        <div className={styles.condensedRow}>
          <GemIndicator status={gemStatus} size="sm" />
          <div className={styles.condensedContent}>
            <Breadcrumb segments={condensedSegments} />
            <span className={styles.condensedTitle}>{title || "Untitled Commission"}</span>
          </div>
          <div className={styles.condensedTrailing}>
            <span className={styles.condensedStatus}>{displayStatus}</span>
            {model && (
              <span className={styles.condensedModel}>{model}</span>
            )}
            {toggleButton}
          </div>
        </div>
      )}
      expandedContent={(toggleButton) => (
        <>
          {toggleButton}
          <Breadcrumb segments={expandedSegments} />

          <div className={styles.titleRow}>
            <GemIndicator status={gemStatus} size="md" />
            <h1 className={styles.title}>{title || "Untitled Commission"}</h1>
            {commissionType === "scheduled" && (
              <span className={styles.scheduleLabel}>Schedule</span>
            )}
          </div>

          <div className={styles.meta}>
            <span className={styles.statusBadge}>{displayStatus}</span>
            {worker && (
              <span className={styles.workerLabel}>
                Assigned to: {workerDisplayTitle || worker}
              </span>
            )}
            {model && (
              <span
                className={styles.modelLabel}
                title={isLocalModel && localModelBaseUrl ? localModelBaseUrl : undefined}
              >
                Model: {model}
                {isLocalModel ? " (local)" : ""}
                {isModelOverride ? " (override)" : ""}
              </span>
            )}
          </div>
        </>
      )}
    />
  );
}
