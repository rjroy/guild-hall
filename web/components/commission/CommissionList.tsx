"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import StatusBadge from "@/web/components/ui/StatusBadge";
import EmptyState from "@/web/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import styles from "./CommissionList.module.css";

// -- Filter logic (exported for testing) --

/** The 8 statuses shown by default: anything that might need user attention. */
export const DEFAULT_STATUSES = new Set([
  "pending",
  "blocked",
  "dispatched",
  "in_progress",
  "sleeping",
  "active",
  "failed",
  "cancelled",
]);

/** Filter panel groups, mirroring STATUS_GROUP order from lib/commissions.ts. */
export const FILTER_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "Idle", statuses: ["pending", "blocked", "paused"] },
  { label: "Active", statuses: ["dispatched", "in_progress", "sleeping", "active"] },
  { label: "Failed", statuses: ["failed", "cancelled"] },
  { label: "Done", statuses: ["abandoned", "completed"] },
];

/** Returns only commissions whose status is in the selected set. Preserves input order. */
export function filterCommissions(
  commissions: CommissionMeta[],
  selected: Set<string>,
): CommissionMeta[] {
  return commissions.filter((c) => selected.has(c.status));
}

/** Builds a count map of commissions by status. */
export function countByStatus(
  commissions: CommissionMeta[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of commissions) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  }
  return counts;
}

/** Returns true if the selected set exactly matches DEFAULT_STATUSES. */
export function isDefaultSelection(selected: Set<string>): boolean {
  if (selected.size !== DEFAULT_STATUSES.size) return false;
  for (const s of selected) {
    if (!DEFAULT_STATUSES.has(s)) return false;
  }
  return true;
}

// -- Component internals --

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

  const counts = countByStatus(commissions);
  const filtered = filterCommissions(commissions, selected);
  const encodedName = encodeURIComponent(projectName);

  return (
    <>
      <div className={styles.filterPanel}>
        {FILTER_GROUPS.map(({ label, statuses }) => (
          <div key={label} className={styles.filterRow}>
            <span className={styles.filterGroupLabel}>{label}</span>
            <div className={styles.filterCheckboxes}>
              {statuses.map((status) => {
                const count = counts[status] ?? 0;
                const gem = statusToGem(status);
                return (
                  <label key={status} className={styles.filterCheckbox}>
                    <input
                      type="checkbox"
                      checked={selected.has(status)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(status)) next.delete(status);
                          else next.add(status);
                          return next;
                        });
                      }}
                    />
                    <StatusBadge gem={gem} label={status} size="sm" />
                    {count > 0 && (
                      <span className={styles.filterCount}>({count})</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {!isDefaultSelection(selected) && (
          <div className={styles.filterReset}>
            <button
              className={styles.resetButton}
              onClick={() => setSelected(new Set(DEFAULT_STATUSES))}
            >
              Reset
            </button>
          </div>
        )}
      </div>
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
                        {commission.type === "scheduled" && (
                          <span className={styles.recurringLabel}>Recurring</span>
                        )}
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
                  {commission.sourceSchedule && (
                    <span className={styles.sourceSchedule}>
                      from:{" "}
                      <Link
                        href={`/projects/${encodedName}/schedules/${encodeURIComponent(commission.sourceSchedule)}`}
                        className={styles.sourceScheduleLink}
                      >
                        {commission.sourceSchedule}
                      </Link>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
