import Link from "next/link";
import GemIndicator from "@/components/ui/GemIndicator";
import { statusToGem } from "@/lib/types";
import styles from "./CommissionHeader.module.css";

interface CommissionHeaderProps {
  title: string;
  status: string;
  worker: string;
  workerDisplayTitle: string;
  projectName: string;
}

/**
 * Displays commission identity: title, status gem, worker attribution,
 * and breadcrumb navigation. Rendered by the server component page and
 * also re-rendered client-side when SSE updates change the status.
 */
export default function CommissionHeader({
  title,
  status,
  worker,
  workerDisplayTitle,
  projectName,
}: CommissionHeaderProps) {
  const encodedProject = encodeURIComponent(projectName);
  const gemStatus = statusToGem(status);
  const displayStatus = status.replace(/_/g, " ");

  return (
    <div className={styles.header}>
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
      </div>

      <div className={styles.meta}>
        <span className={styles.statusBadge}>{displayStatus}</span>
        {worker && (
          <span className={styles.workerLabel}>
            Assigned to: {workerDisplayTitle || worker}
          </span>
        )}
      </div>
    </div>
  );
}
