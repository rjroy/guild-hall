import Link from "next/link";
import type { ScheduleInfo } from "./CommissionView";
import { formatTimestamp } from "./format-timestamp";
import styles from "./CommissionScheduleInfo.module.css";

interface CommissionScheduleInfoProps {
  schedule: ScheduleInfo;
  projectName: string;
}

/**
 * Displays schedule metadata for a scheduled commission: cron expression
 * (with human-readable description), run count, last and next run timestamps,
 * and a list of recent spawned commissions.
 */
export default function CommissionScheduleInfo({
  schedule,
  projectName,
}: CommissionScheduleInfoProps) {
  const repeatDisplay =
    schedule.repeat === null ? "indefinite" : String(schedule.repeat);

  const lastRunDisplay = schedule.lastRun
    ? formatTimestamp(schedule.lastRun)
    : "Never";

  const nextRunDisplay = schedule.nextRun
    ? formatTimestamp(schedule.nextRun)
    : "N/A";

  const cronLabel = schedule.cronDescription !== schedule.cron
    ? schedule.cronDescription
    : null;

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Schedule</h3>

      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Cron</dt>
          <dd className={styles.fieldValue}>
            <code className={styles.cronValue}>{schedule.cron || "(none)"}</code>
            {cronLabel && (
              <span className={styles.cronDescription}>{cronLabel}</span>
            )}
          </dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Runs</dt>
          <dd className={styles.fieldValue}>
            {schedule.runsCompleted} / {repeatDisplay}
          </dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Last run</dt>
          <dd className={styles.fieldValue}>{lastRunDisplay}</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Next run</dt>
          <dd className={styles.fieldValue}>{nextRunDisplay}</dd>
        </div>
      </dl>

      {schedule.recentRuns.length > 0 && (
        <div className={styles.recentRuns}>
          <h4 className={styles.recentRunsLabel}>Recent Runs</h4>
          <ul className={styles.runList}>
            {schedule.recentRuns.map((run) => (
              <li key={run.commissionId} className={styles.runItem}>
                <Link
                  href={`/projects/${encodeURIComponent(projectName)}/commissions/${encodeURIComponent(run.commissionId)}`}
                  className={styles.runLink}
                >
                  <span className={styles.runId}>{run.commissionId}</span>
                  <span className={styles.runMeta}>
                    <span className={`${styles.runStatus} ${styles[`status_${run.status}`] ?? ""}`}>
                      {run.status}
                    </span>
                    <span className={styles.runDate}>{formatTimestamp(run.date)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
