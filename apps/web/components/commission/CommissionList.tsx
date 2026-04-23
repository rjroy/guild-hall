"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/apps/web/components/ui/Panel";
import StatusBadge from "@/apps/web/components/ui/StatusBadge";
import EmptyState from "@/apps/web/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import {
  DEFAULT_STATUSES,
  filterCommissions,
} from "./commission-filter";
import CommissionFilterPanel from "./CommissionFilterPanel";
import styles from "./CommissionList.module.css";

interface CommissionListProps {
  commissions: CommissionMeta[];
  projectName: string;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;

    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    if (ts.includes("T")) {
      const dateStr = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(sameYear ? {} : { year: "numeric" }),
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${dateStr}, ${timeStr}`;
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  } catch {
    return ts;
  }
}

/**
 * Client component that renders a filterable list of commissions for a project.
 * Each commission shows a status gem, title, worker name, and prompt preview.
 */
export default function CommissionList({
  commissions,
  projectName,
}: CommissionListProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_STATUSES),
  );

  if (commissions.length === 0) {
    return (
      <Panel>
        <EmptyState message="No commissions yet." />
      </Panel>
    );
  }

  const filtered = filterCommissions(commissions, selected);
  const encodedName = encodeURIComponent(projectName);

  const handleToggle = (status: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleReset = () => setSelected(new Set(DEFAULT_STATUSES));

  return (
    <>
      <CommissionFilterPanel
        commissions={commissions}
        selected={selected}
        onToggle={handleToggle}
        onReset={handleReset}
      />
      <Panel size="lg">
        {filtered.length === 0 ? (
          <EmptyState message="No commissions match the current filter." />
        ) : (
          <ul className={styles.list}>
            {filtered.map((commission) => {
              const gem = statusToGem(commission.status);
              const displayTitle = commission.title || commission.commissionId;
              const promptPreview = truncate(commission.prompt, 100);
              const timestamp = formatTimestamp(commission.relevantDate);

              return (
                <li key={commission.commissionId} className={styles.item}>
                  <Link
                    href={`/projects/${encodedName}/commissions/${encodeURIComponent(commission.commissionId)}`}
                    className={styles.link}
                  >
                    <StatusBadge gem={gem} label={commission.status} size="sm" />
                    <div className={styles.info}>
                      <p className={styles.title}>
                        {displayTitle}
                      </p>
                      <div className={styles.meta}>
                        {commission.worker && (
                          <span className={styles.worker}>
                            {commission.workerDisplayTitle || commission.worker}
                          </span>
                        )}
                        {timestamp && (
                          <span className={styles.timestamp}>{timestamp}</span>
                        )}
                        {commission.prompt && (
                          <span className={styles.promptPreview}>
                            {promptPreview}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
