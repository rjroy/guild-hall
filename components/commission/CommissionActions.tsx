"use client";

import { useState, useCallback } from "react";
import styles from "./CommissionActions.module.css";

interface CommissionActionsProps {
  status: string;
  commissionId: string;
  onStatusChange?: (newStatus: string) => void;
}

/**
 * Action buttons for a commission. Which buttons appear depends on
 * the current status:
 *
 * - pending: Dispatch
 * - dispatched / in_progress: Cancel (with confirmation)
 * - failed / cancelled: Re-dispatch (with confirmation)
 */
export default function CommissionActions({
  status,
  commissionId,
  onStatusChange,
}: CommissionActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState<
    "cancel" | "redispatch" | null
  >(null);

  const encodedId = encodeURIComponent(commissionId);

  const handleDispatch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/commissions/${encodedId}/dispatch`, {
        method: "POST",
      });
      if (res.ok) {
        onStatusChange?.("dispatched");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Dispatch failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [encodedId, onStatusChange]);

  const handleCancel = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setConfirming(null);
    try {
      const res = await fetch(`/api/commissions/${encodedId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onStatusChange?.("cancelled");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Cancel failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [encodedId, onStatusChange]);

  const handleRedispatch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setConfirming(null);
    try {
      const res = await fetch(`/api/commissions/${encodedId}/redispatch`, {
        method: "POST",
      });
      if (res.ok) {
        onStatusChange?.("dispatched");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Re-dispatch failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [encodedId, onStatusChange]);

  const showDispatch = status === "pending";
  const showCancel = status === "dispatched" || status === "in_progress";
  const showRedispatch = status === "failed" || status === "cancelled";

  return (
    <div className={styles.container}>
      {showDispatch && (
        <button
          className={styles.dispatchButton}
          onClick={() => void handleDispatch()}
          disabled={loading}
          type="button"
        >
          {loading ? "Dispatching..." : "Dispatch Commission"}
        </button>
      )}

      {showCancel && (
        <>
          {confirming === "cancel" ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>Cancel this commission?</span>
              <button
                className={styles.confirmYes}
                onClick={() => void handleCancel()}
                disabled={loading}
                type="button"
              >
                {loading ? "Cancelling..." : "Yes, Cancel"}
              </button>
              <button
                className={styles.confirmNo}
                onClick={() => setConfirming(null)}
                disabled={loading}
                type="button"
              >
                No
              </button>
            </div>
          ) : (
            <button
              className={styles.cancelButton}
              onClick={() => setConfirming("cancel")}
              disabled={loading}
              type="button"
            >
              Cancel Commission
            </button>
          )}
        </>
      )}

      {showRedispatch && (
        <>
          {confirming === "redispatch" ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>Re-dispatch this commission?</span>
              <button
                className={styles.confirmYes}
                onClick={() => void handleRedispatch()}
                disabled={loading}
                type="button"
              >
                {loading ? "Dispatching..." : "Yes, Re-dispatch"}
              </button>
              <button
                className={styles.confirmNo}
                onClick={() => setConfirming(null)}
                disabled={loading}
                type="button"
              >
                No
              </button>
            </div>
          ) : (
            <button
              className={styles.redispatchButton}
              onClick={() => setConfirming("redispatch")}
              disabled={loading}
              type="button"
            >
              Re-dispatch Commission
            </button>
          )}
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
