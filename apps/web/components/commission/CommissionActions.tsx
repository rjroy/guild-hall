"use client";

import { useState, useCallback } from "react";
import { useDaemonStatus } from "@/apps/web/components/ui/DaemonContext";
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
 * - pending: Dispatch, Abandon
 * - dispatched / in_progress: Cancel (with confirmation)
 * - blocked: Abandon
 * - failed / cancelled: Re-dispatch, Abandon (with reason textarea)
 *
 * All buttons are disabled when the daemon is offline.
 */
export default function CommissionActions({
  status,
  commissionId,
  onStatusChange,
}: CommissionActionsProps) {
  const { isOnline } = useDaemonStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState<
    "cancel" | "redispatch" | "abandon" | null
  >(null);
  const [abandonReason, setAbandonReason] = useState("");

  const encodedId = encodeURIComponent(commissionId);

  const handleDispatch = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/commissions/${encodedId}/dispatch`, {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        onStatusChange?.(data.status === "queued" ? "queued" : "dispatched");
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
        const data = (await res.json()) as { status?: string };
        onStatusChange?.(data.status === "queued" ? "queued" : "dispatched");
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

  const handleAbandon = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setConfirming(null);
    try {
      const res = await fetch(`/api/commissions/${encodedId}/abandon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: abandonReason }),
      });
      if (res.ok) {
        onStatusChange?.("abandoned");
        setAbandonReason("");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Abandon failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [encodedId, onStatusChange, abandonReason]);

  const showDispatch = status === "pending";
  const showQueued = status === "queued";
  const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
  const showRedispatch = status === "failed" || status === "cancelled";
  const showAbandon =
    status === "pending" ||
    status === "blocked" ||
    status === "failed" ||
    status === "cancelled";
  const offlineTitle = !isOnline ? "Daemon offline" : undefined;

  return (
    <div className={styles.container}>
      {showDispatch && (
        <button
          className={styles.dispatchButton}
          onClick={() => void handleDispatch()}
          disabled={loading || !isOnline}
          title={offlineTitle}
          type="button"
        >
          {loading ? "Dispatching..." : "Dispatch Commission"}
        </button>
      )}

      {showQueued && (
        <div className={styles.queuedIndicator}>
          <span className={styles.queuedLabel}>Queued</span>
          <span className={styles.queuedText}>Waiting for capacity</span>
        </div>
      )}

      {showCancel && (
        <>
          {confirming === "cancel" ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>Cancel this commission?</span>
              <button
                className={styles.confirmYes}
                onClick={() => void handleCancel()}
                disabled={loading || !isOnline}
                title={offlineTitle}
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
              disabled={loading || !isOnline}
              title={offlineTitle}
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
                disabled={loading || !isOnline}
                title={offlineTitle}
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
              disabled={loading || !isOnline}
              title={offlineTitle}
              type="button"
            >
              Re-dispatch Commission
            </button>
          )}
        </>
      )}

      {showAbandon && (
        <>
          {confirming === "abandon" ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>Abandon this commission?</span>
              <textarea
                className={styles.actionReason}
                placeholder="Why is this being abandoned?"
                value={abandonReason}
                onChange={(e) => setAbandonReason(e.target.value)}
                rows={2}
              />
              <div className={styles.confirmButtons}>
                <button
                  className={styles.confirmYes}
                  onClick={() => void handleAbandon()}
                  disabled={loading || !isOnline || !abandonReason.trim()}
                  title={offlineTitle}
                  type="button"
                >
                  {loading ? "Abandoning..." : "Yes, Abandon"}
                </button>
                <button
                  className={styles.confirmNo}
                  onClick={() => {
                    setConfirming(null);
                    setAbandonReason("");
                  }}
                  disabled={loading}
                  type="button"
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.abandonButton}
              onClick={() => setConfirming("abandon")}
              disabled={loading || !isOnline}
              title={offlineTitle}
              type="button"
            >
              Abandon
            </button>
          )}
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
