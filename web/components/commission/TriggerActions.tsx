"use client";

import { useState } from "react";
import styles from "./TriggerActions.module.css";

interface TriggerActionsProps {
  status: string;
  commissionId: string;
  onStatusChange: (newStatus: string) => void;
}

/**
 * Trigger action buttons for triggered commissions.
 * Shows Pause when active, Resume when paused, and Complete
 * for non-terminal states. Calls the daemon API to transition.
 */
export default function TriggerActions({
  status,
  commissionId,
  onStatusChange,
}: TriggerActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isTerminal = status === "completed" || status === "failed";

  async function handleAction(targetStatus: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/commissions/${encodeURIComponent(commissionId)}/trigger-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        },
      );

      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to update trigger");
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
      <h3 className={styles.label}>Trigger Actions</h3>

      <div className={styles.buttonGroup}>
        {isPaused ? (
          <button
            className={styles.resumeButton}
            disabled={loading}
            onClick={() => void handleAction("active")}
            type="button"
          >
            {loading ? "Resuming..." : "Resume Trigger"}
          </button>
        ) : (
          <button
            className={styles.pauseButton}
            disabled={loading}
            onClick={() => void handleAction("paused")}
            type="button"
          >
            {loading ? "Pausing..." : "Pause Trigger"}
          </button>
        )}

        <button
          className={styles.completeButton}
          disabled={loading}
          onClick={() => void handleAction("completed")}
          type="button"
        >
          {loading ? "Completing..." : "Complete Trigger"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
