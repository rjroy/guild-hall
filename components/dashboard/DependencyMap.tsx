import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import styles from "./DependencyMap.module.css";

interface DependencyMapProps {
  commissions: CommissionMeta[];
}

/**
 * Sorting priority for commission statuses.
 * Running commissions (in_progress, dispatched) sort first,
 * then pending, then terminal states by date descending.
 */
const STATUS_PRIORITY: Record<string, number> = {
  in_progress: 0,
  dispatched: 0,
  pending: 1,
  blocked: 1,
  completed: 2,
  failed: 2,
  cancelled: 2,
};

function statusPriority(status: string): number {
  return STATUS_PRIORITY[status.toLowerCase().trim()] ?? 2;
}

/**
 * Returns commissions sorted for display: running first, then pending,
 * then completed/failed/cancelled by date descending.
 */
export function sortCommissions(commissions: CommissionMeta[]): CommissionMeta[] {
  return [...commissions].sort((a, b) => {
    const priorityDiff = statusPriority(a.status) - statusPriority(b.status);
    if (priorityDiff !== 0) return priorityDiff;
    return b.date.localeCompare(a.date);
  });
}

/**
 * Constructs the href for a commission detail view.
 */
export function commissionHref(
  projectName: string,
  commissionId: string,
): string {
  return `/projects/${encodeURIComponent(projectName)}/commissions/${encodeURIComponent(commissionId)}`;
}

/**
 * Dashboard panel listing commission status cards across all projects.
 * Server component that receives pre-scanned commission data from the page.
 */
export default function DependencyMap({ commissions }: DependencyMapProps) {
  const sorted = sortCommissions(commissions);

  return (
    <Panel title="Task Dependency Map">
      {sorted.length === 0 ? (
        <EmptyState message="No active commissions." />
      ) : (
        <ul className={styles.list}>
          {sorted.map((commission) => {
            const gemStatus = statusToGem(commission.status);
            return (
              <li key={`${commission.projectName}-${commission.commissionId}`} className={styles.card}>
                <Link
                  href={commissionHref(commission.projectName, commission.commissionId)}
                  className={styles.link}
                >
                  <GemIndicator status={gemStatus} size="sm" />
                  <div className={styles.info}>
                    <span className={styles.title}>
                      {commission.title || commission.commissionId}
                    </span>
                    {commission.workerDisplayTitle && (
                      <span className={styles.worker}>
                        {commission.workerDisplayTitle}
                      </span>
                    )}
                    {commission.current_progress && (
                      <span className={styles.progress}>
                        {commission.current_progress}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
