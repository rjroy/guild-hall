import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import styles from "./CommissionList.module.css";

interface CommissionListProps {
  commissions: CommissionMeta[];
  projectName: string;
}

/**
 * Truncates a string to a maximum length, appending ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Server component that renders a list of commissions for a project.
 * Each commission shows a status gem, title, worker name, and prompt preview.
 * Active/pending commissions link to the commission detail view.
 */
export default function CommissionList({
  commissions,
  projectName,
}: CommissionListProps) {
  if (commissions.length === 0) {
    return (
      <Panel>
        <EmptyState message="No commissions yet." />
      </Panel>
    );
  }

  const encodedName = encodeURIComponent(projectName);

  return (
    <Panel size="lg">
      <ul className={styles.list}>
        {commissions.map((commission) => {
          const gem = statusToGem(commission.status);
          const displayTitle = commission.title || commission.commissionId;
          const promptPreview = truncate(commission.prompt, 100);

          return (
            <li key={commission.commissionId} className={styles.item}>
              <Link
                href={`/projects/${encodedName}/commissions/${encodeURIComponent(commission.commissionId)}`}
                className={styles.link}
              >
                <GemIndicator status={gem} size="sm" />
                <div className={styles.info}>
                  <p className={styles.title}>{displayTitle}</p>
                  <div className={styles.meta}>
                    {commission.worker && (
                      <span className={styles.worker}>
                        {commission.workerDisplayTitle || commission.worker}
                      </span>
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
    </Panel>
  );
}
