"use client";

import { useState, useEffect, startTransition } from "react";
import Link from "next/link";
import GemIndicator from "@/web/components/ui/GemIndicator";
import { statusToGem } from "@/lib/types";
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
 * and breadcrumb navigation. Rendered by the server component page and
 * also re-rendered client-side when SSE updates change the status.
 *
 * Supports condensed state (REQ-DVL-5 through REQ-DVL-10): collapses to
 * a single row with gem, truncated title, status, worker, model, and toggle.
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
  // REQ-DVL-10: Default to condensed on tablet (<=960px) at mount time.
  const [condensed, setCondensed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 960px)").matches;
  });

  // SSR safety: re-check on mount since SSR always returns false.
  useEffect(() => {
    const matches = window.matchMedia("(max-width: 960px)").matches;
    if (matches) {
      startTransition(() => setCondensed(true));
    }
  }, []);

  const encodedProject = encodeURIComponent(projectName);
  const gemStatus = statusToGem(status);
  const displayStatus = status.replace(/_/g, " ");

  const headerClassName = `${styles.header} ${condensed ? styles.headerCondensed : ""}`;

  return (
    <div className={headerClassName}>
      {condensed ? (
        <div className={styles.condensedRow}>
          <GemIndicator status={gemStatus} size="sm" />
          <span className={styles.condensedTitle}>{title || "Untitled Commission"}</span>
          <span className={styles.condensedStatus}>{displayStatus}</span>
          {worker && (
            <span className={styles.condensedWorker}>{workerDisplayTitle || worker}</span>
          )}
          {model && (
            <span className={styles.condensedModel}>
              Model: {model}
              {isLocalModel ? " (local)" : ""}
              {isModelOverride ? " (override)" : ""}
            </span>
          )}
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setCondensed(false)}
            aria-label="Expand header"
            aria-expanded={false}
          >
            {"\u25BC"}
          </button>
        </div>
      ) : (
        <>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/" className={styles.breadcrumbLink}>
              Guild Hall
            </Link>
            <span className={styles.separator} aria-hidden="true">
              &rsaquo;
            </span>
            <Link
              href={`/projects/${encodedProject}`}
              className={styles.breadcrumbLink}
            >
              {projectName}
            </Link>
            <span className={styles.separator} aria-hidden="true">
              &rsaquo;
            </span>
            <Link
              href={`/projects/${encodedProject}?tab=commissions`}
              className={styles.breadcrumbLink}
            >
              Commissions
            </Link>
            <span className={styles.separator} aria-hidden="true">
              &rsaquo;
            </span>
            <span className={styles.breadcrumbCurrent}>Commission</span>
          </nav>

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

          <button
            type="button"
            className={`${styles.toggleButton} ${styles.toggleExpanded}`}
            onClick={() => setCondensed(true)}
            aria-label="Collapse header"
            aria-expanded={true}
          >
            {"\u25B2"}
          </button>
        </>
      )}
    </div>
  );
}
