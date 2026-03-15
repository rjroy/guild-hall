import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import StatusBadge from "@/web/components/ui/StatusBadge";
import EmptyState from "@/web/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import { buildDependencyGraph } from "@/lib/dependency-graph";
import type { CommissionMeta } from "@/lib/commissions";
import { commissionHref } from "@/lib/commission-href";
import { buildTreeList } from "./build-tree-list";
import styles from "./DependencyMap.module.css";

export { commissionHref };

const DEPTH_CLASSES: Record<number, string> = {
  1: styles.depth1,
  2: styles.depth2,
  3: styles.depth3,
  4: styles.depth4,
};

interface DependencyMapProps {
  commissions: CommissionMeta[];
}

/**
 * Dashboard panel showing commission dependencies as an indented tree list.
 * When commissions have dependencies, dependent commissions render indented
 * under their parent with CSS connector lines. When no dependencies exist,
 * the result is a flat card list.
 * Server component that receives pre-scanned commission data from the page.
 */
export default function DependencyMap({ commissions }: DependencyMapProps) {
  if (commissions.length === 0) {
    return (
      <Panel title="Task Dependency Map">
        <EmptyState message="No active commissions." />
      </Panel>
    );
  }

  const graph = buildDependencyGraph(commissions);
  const treeItems = buildTreeList(commissions, graph);

  return (
    <Panel title="Task Dependency Map">
      <ul className={styles.list}>
        {treeItems.map(({ commission, depth, awaits }) => {
          const gemStatus = statusToGem(commission.status);
          const depthClass = depth > 0
            ? DEPTH_CLASSES[Math.min(depth, 4)]
            : undefined;

          return (
            <li
              key={`${commission.projectName}-${commission.commissionId}`}
              className={[
                styles.card,
                commission.type === "scheduled" ? styles.scheduledCard : "",
                depth > 0 ? styles.treeItem : "",
                depthClass ?? "",
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
                  {awaits && awaits.length > 0 && (
                    <span className={styles.awaitsAnnotation}>
                      Awaits: {awaits.join(", ")}
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
