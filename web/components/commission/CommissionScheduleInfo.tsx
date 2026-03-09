import type { ScheduleInfo } from "./CommissionView";
import styles from "./CommissionScheduleInfo.module.css";

interface CommissionScheduleInfoProps {
  schedule: ScheduleInfo;
}

/**
 * Displays schedule metadata for a scheduled commission: cron expression,
 * run count, and last run timestamp. Appears in the sidebar when the
 * commission type is "scheduled".
 */
export default function CommissionScheduleInfo({
  schedule,
}: CommissionScheduleInfoProps) {
  const repeatDisplay =
    schedule.repeat === null ? "indefinite" : String(schedule.repeat);

  const lastRunDisplay = schedule.lastRun
    ? formatTimestamp(schedule.lastRun)
    : "Never";

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Schedule</h3>

      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Cron</dt>
          <dd className={styles.fieldValue}>
            <code className={styles.cronValue}>{schedule.cron || "(none)"}</code>
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
      </dl>
    </div>
  );
}

/** Formats an ISO timestamp to a readable local date/time string. */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
