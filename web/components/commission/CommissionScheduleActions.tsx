"use client";

import styles from "./CommissionScheduleActions.module.css";

interface CommissionScheduleActionsProps {
  status: string;
}

/**
 * Placeholder schedule action buttons for scheduled commissions.
 * Shows Pause when active, Resume when paused. No backend routes
 * exist yet, so both are disabled with a "coming soon" tooltip.
 */
export default function CommissionScheduleActions({
  status,
}: CommissionScheduleActionsProps) {
  const isPaused = status === "paused";

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Schedule Actions</h3>

      {isPaused ? (
        <button
          className={styles.resumeButton}
          disabled
          title="Coming soon"
          type="button"
        >
          Resume Schedule
        </button>
      ) : (
        <button
          className={styles.pauseButton}
          disabled
          title="Coming soon"
          type="button"
        >
          Pause Schedule
        </button>
      )}

      <p className={styles.hint}>Schedule management coming soon.</p>
    </div>
  );
}
