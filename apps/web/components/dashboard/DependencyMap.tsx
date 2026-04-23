"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/apps/web/components/ui/Panel";
import StatusBadge from "@/apps/web/components/ui/StatusBadge";
import EmptyState from "@/apps/web/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import { commissionHref } from "@/lib/commission-href";
import {
  DEFAULT_STATUSES,
  filterCommissions,
} from "@/apps/web/components/commission/commission-filter";
import CommissionFilterPanel from "@/apps/web/components/commission/CommissionFilterPanel";
import styles from "./DependencyMap.module.css";

interface InFlightProps {
  commissions: CommissionMeta[];
  selectedProject?: string;
}

/**
 * Dashboard "In Flight" card. Shows a filtered commission list with the
 * shared filter panel. Replaces the former "Task Dependency Map" tree list.
 * Client component (filter state requires useState).
 */
export default function InFlight({ commissions, selectedProject }: InFlightProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_STATUSES),
  );

  const showProjectLabel = !selectedProject;

  if (commissions.length === 0) {
    return (
      <Panel title="In Flight">
        <EmptyState message="No active commissions." />
      </Panel>
    );
  }

  const filtered = filterCommissions(commissions, selected);

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
    <Panel title="In Flight">
      <CommissionFilterPanel
        commissions={commissions}
        selected={selected}
        onToggle={handleToggle}
        onReset={handleReset}
      />
      {filtered.length === 0 ? (
        <EmptyState message="No commissions match the current filter." />
      ) : (
        <ul className={styles.list}>
          {filtered.map((commission) => {
            const gem = statusToGem(commission.status);
            const displayTitle = commission.title || commission.commissionId;

            return (
              <li
                key={`${commission.projectName}-${commission.commissionId}`}
                className={styles.row}
              >
                <Link
                  href={commissionHref(commission.projectName, commission.commissionId)}
                  className={styles.link}
                >
                  <StatusBadge gem={gem} label={commission.status} size="sm" />
                  <span className={styles.title}>{displayTitle}</span>
                  {commission.worker && (
                    <span className={styles.worker}>
                      {commission.workerDisplayTitle || commission.worker}
                    </span>
                  )}
                  {showProjectLabel && (
                    <span className={styles.projectLabel}>
                      {commission.projectName}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
