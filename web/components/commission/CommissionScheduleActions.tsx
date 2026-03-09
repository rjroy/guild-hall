"use client";

import { useState } from "react";
import styles from "./CommissionScheduleActions.module.css";

interface CommissionScheduleActionsProps {
  status: string;
  commissionId: string;
  onStatusChange: (newStatus: string) => void;
}

/**
 * Schedule action buttons for scheduled commissions.
 * Shows Pause when active, Resume when paused, and Complete
 * for non-terminal states. Calls the daemon API to transition.
 */
export default function CommissionScheduleActions({
  status,
  commissionId,
  onStatusChange,
}: CommissionScheduleActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isTerminal = status === "completed" || status === "failed";

  async function handleAction(targetStatus: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/commissions/${encodeURIComponent(commissionId)}/schedule-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        },
      );

      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to update schedule");
        return;
      }

      onStatusChange(data.status ?? targetStatus);
    } catch {
      setError("Failed to reach server");
    } finally {
      setLoading(false);
    }
  }

  if (isTerminal) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Schedule Actions</h3>

      <div className={styles.buttonGroup}>
        {isPaused ? (
          <button
            className={styles.resumeButton}
            disabled={loading}
            onClick={() => void handleAction("active")}
            type="button"
          >
            {loading ? "Resuming..." : "Resume Schedule"}
          </button>
        ) : (
          <button
            className={styles.pauseButton}
            disabled={loading}
            onClick={() => void handleAction("paused")}
            type="button"
          >
            {loading ? "Pausing..." : "Pause Schedule"}
          </button>
        )}

        <button
          className={styles.completeButton}
          disabled={loading}
          onClick={() => void handleAction("completed")}
          type="button"
        >
          {loading ? "Completing..." : "Complete Schedule"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
