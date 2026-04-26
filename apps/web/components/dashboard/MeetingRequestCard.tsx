"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDaemonStatus } from "@/apps/web/components/ui/DaemonContext";
import {
  consumeFirstTurnSSE,
  storeFirstTurnMessages,
} from "@/lib/sse-helpers";
import type { MeetingMeta } from "@/lib/meetings";
import WorkerPortrait from "@/apps/web/components/ui/WorkerPortrait";
import styles from "./MeetingRequestCard.module.css";

export interface MeetingRequestCardProps {
  request: MeetingMeta;
  portraitUrl?: string;
}

/**
 * Displays a single meeting request with Open, Defer, Ignore, and
 * Quick Comment actions.
 *
 * Open: accepts the meeting via the daemon, consumes the SSE first-turn
 * stream, stores messages, and navigates to the meeting view.
 *
 * Defer: prompts for a date, then tells the daemon to defer the request.
 *
 * Ignore: declines the meeting request via the daemon.
 *
 * Quick Comment: reveals an inline prompt textarea, creates a commission
 * from the meeting context, declines the meeting, and navigates to the
 * new commission.
 */
export default function MeetingRequestCard({
  request,
  portraitUrl,
}: MeetingRequestCardProps) {
  const router = useRouter();
  const { isOnline } = useDaemonStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deferDate, setDeferDate] = useState("");
  const [showQuickComment, setShowQuickComment] = useState(false);
  const [quickCommentPrompt, setQuickCommentPrompt] = useState("");

  const handleOpen = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(request.meetingId)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName: request.projectName }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Accept failed (${response.status})`;
        setError(reason);
        setLoading(false);
        return;
      }

      if (!response.body) {
        setError("No response stream available");
        setLoading(false);
        return;
      }

      const result = await consumeFirstTurnSSE(response.body);

      storeFirstTurnMessages(result.meetingId, result.messages);
      setLoading(false);
      router.push(
        `/projects/${encodeURIComponent(request.projectName)}/meetings/${encodeURIComponent(result.meetingId)}`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setLoading(false);
    }
  }, [request.meetingId, request.projectName, router]);

  const handleDefer = useCallback(async () => {
    if (!deferDate) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(request.meetingId)}/defer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: request.projectName,
            deferredUntil: deferDate,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Defer failed (${response.status})`;
        setError(reason);
        setLoading(false);
        return;
      }

      setShowDatePicker(false);
      setDeferDate("");
      setLoading(false);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setLoading(false);
    }
  }, [deferDate, request.meetingId, request.projectName, router]);

  const handleIgnore = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(request.meetingId)}/decline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName: request.projectName }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Decline failed (${response.status})`;
        setError(reason);
        setLoading(false);
        return;
      }

      setLoading(false);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setLoading(false);
    }
  }, [request.meetingId, request.projectName, router]);

  const handleQuickComment = useCallback(async () => {
    if (!quickCommentPrompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(request.meetingId)}/quick-comment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: request.projectName,
            prompt: quickCommentPrompt.trim(),
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Quick comment failed (${response.status})`;
        setError(reason);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as { commissionId: string };
      setShowQuickComment(false);
      setQuickCommentPrompt("");
      setLoading(false);
      router.push(
        `/projects/${encodeURIComponent(request.projectName)}/commissions/${encodeURIComponent(data.commissionId)}`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setLoading(false);
    }
  }, [quickCommentPrompt, request.meetingId, request.projectName, router]);

  const workerLabel = request.workerDisplayTitle || request.worker || "Unknown Worker";

  return (
    <div className={styles.card} data-testid="meeting-request-card">
      <div className={styles.header}>
        <WorkerPortrait
          name={workerLabel}
          portraitUrl={portraitUrl}
          size="sm"
        />
        <div>
          <p className={styles.workerName}>{workerLabel}</p>
          {request.workerDisplayTitle && request.worker && (
            <p className={styles.workerTitle}>{request.worker}</p>
          )}
        </div>
      </div>

      {request.agenda && (
        <p className={styles.agenda}>{request.agenda}</p>
      )}

      {request.linked_artifacts.length > 0 && (
        <ul className={styles.artifacts}>
          {request.linked_artifacts.map((artifact) => (
            <li key={artifact} className={styles.artifactTag}>
              {artifact}
            </li>
          ))}
        </ul>
      )}

      {request.deferred_until && (
        <span className={styles.deferredBadge}>
          Deferred until {request.deferred_until}
        </span>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <div className={styles.streamingIndicator}>
          <div className={styles.spinner} aria-hidden="true" />
          <span>Processing...</span>
        </div>
      ) : showDatePicker ? (
        <div className={styles.datePickerRow}>
          <input
            type="date"
            className={styles.dateInput}
            value={deferDate}
            onChange={(e) => setDeferDate(e.target.value)}
            aria-label="Defer until date"
          />
          <button
            type="button"
            className={`${styles.actionButton} ${styles.dateConfirmButton}`}
            disabled={!deferDate || !isOnline}
            title={!isOnline ? "Daemon offline" : undefined}
            onClick={() => void handleDefer()}
          >
            Confirm
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.dateCancelButton}`}
            onClick={() => {
              setShowDatePicker(false);
              setDeferDate("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : showQuickComment ? (
        <div className={styles.quickCommentForm}>
          <textarea
            className={styles.quickCommentInput}
            value={quickCommentPrompt}
            onChange={(e) => setQuickCommentPrompt(e.target.value)}
            placeholder="Commission prompt..."
            aria-label="Commission prompt"
            rows={3}
          />
          <div className={styles.quickCommentActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.quickCommentSendButton}`}
              disabled={!quickCommentPrompt.trim() || !isOnline}
              title={!isOnline ? "Daemon offline" : undefined}
              onClick={() => void handleQuickComment()}
            >
              Send
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.quickCommentCancelButton}`}
              onClick={() => {
                setShowQuickComment(false);
                setQuickCommentPrompt("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.openButton}`}
            disabled={!isOnline}
            title={!isOnline ? "Daemon offline" : undefined}
            onClick={() => void handleOpen()}
          >
            Open
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.quickCommentButton}`}
            disabled={!isOnline}
            title={!isOnline ? "Daemon offline" : undefined}
            onClick={() => setShowQuickComment(true)}
          >
            Quick Comment
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.deferButton}`}
            disabled={!isOnline}
            title={!isOnline ? "Daemon offline" : undefined}
            onClick={() => setShowDatePicker(true)}
          >
            Defer
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.ignoreButton}`}
            disabled={!isOnline}
            title={!isOnline ? "Daemon offline" : undefined}
            onClick={() => void handleIgnore()}
          >
            Ignore
          </button>
        </div>
      )}
    </div>
  );
}
