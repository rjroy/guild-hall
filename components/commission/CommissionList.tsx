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

/** Formats an ISO timestamp or YYYY-MM-DD date into a compact display string. */
function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;

    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    // ISO timestamp with time component
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

    // Date-only string (YYYY-MM-DD)
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
          const timestamp = formatTimestamp(commission.relevantDate);

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
    </Panel>
  );
}
