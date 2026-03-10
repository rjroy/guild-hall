import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import StatusBadge from "@/web/components/ui/StatusBadge";
import EmptyState from "@/web/components/ui/EmptyState";
import CommissionGraph from "@/web/components/dashboard/CommissionGraph";
import { statusToGem } from "@/lib/types";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import { sortCommissions } from "@/lib/commissions";
import type { CommissionMeta } from "@/lib/commissions";
import { commissionHref } from "@/lib/commission-href";
import styles from "./DependencyMap.module.css";

export { commissionHref };

interface DependencyMapProps {
  commissions: CommissionMeta[];
}

/**
 * Dashboard panel showing commission dependencies as an SVG graph when
 * inter-commission edges exist, or as a flat card list otherwise.
 * Server component that receives pre-scanned commission data from the page.
 */
export default function DependencyMap({ commissions }: DependencyMapProps) {
  const sorted = sortCommissions(commissions);

  if (sorted.length === 0) {
    return (
      <Panel title="Task Dependency Map">
        <EmptyState message="No active commissions." />
      </Panel>
    );
  }

  const graph = buildDependencyGraph(commissions);

  // When commissions have inter-commission dependencies, render the SVG graph.
  // Otherwise fall back to the flat card list.
  if (graph.edges.length > 0) {
    return (
      <Panel title="Task Dependency Map">
        <CommissionGraph graph={graph} />
      </Panel>
    );
  }

  return (
    <Panel title="Task Dependency Map">
      <ul className={styles.list}>
        {sorted.map((commission) => {
          const gemStatus = statusToGem(commission.status);
          return (
            <li
              key={`${commission.projectName}-${commission.commissionId}`}
              className={[
                styles.card,
                commission.type === "scheduled" ? styles.scheduledCard : "",
              ].filter(Boolean).join(" ")}
            >
              <Link
                href={commissionHref(commission.projectName, commission.commissionId)}
                className={styles.link}
              >
                <StatusBadge gem={gemStatus} label={commission.status} size="sm" />
                <div className={styles.info}>
                  <span className={styles.title}>
                    {commission.title || commission.commissionId}
                    {commission.type === "scheduled" && (
                      <span className={styles.scheduledBadge}>Recurring</span>
                    )}
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
    </Panel>
  );
}
