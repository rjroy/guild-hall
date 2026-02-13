"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { SessionListResponse, SessionMetadata } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SessionCard } from "./SessionCard";
import { CreateSessionDialog } from "./CreateSessionDialog";
import styles from "./BoardPanel.module.css";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; sessions: SessionMetadata[] };

export function BoardPanel() {
  const router = useRouter();
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SessionMetadata | null>(null);

  const fetchSessions = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions (${response.status})`);
      }
      const sessions = (await response.json()) as SessionListResponse;
      // Sessions arrive sorted by lastActivityAt desc from the API.
      // The Board renders in array order, trusting the API contract.
      setState({ status: "loaded", sessions });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleSessionCreated = (session: SessionMetadata) => {
    setDialogOpen(false);
    router.push(`/sessions/${session.id}`);
  };

  const handleDeleteRequest = (id: string) => {
    if (state.status !== "loaded") return;
    const session = state.sessions.find((s) => s.id === id);
    if (session) setDeleteTarget(session);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/sessions/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        console.error(`Failed to delete session (${response.status})`);
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
    setDeleteTarget(null);
    void fetchSessions();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Board</span>
          {state.status === "loaded" && (
            <span className={styles.sessionCount}>
              {state.sessions.length}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.refreshButton}
            onClick={() => void fetchSessions()}
            title="Refresh sessions"
          >
            Refresh
          </button>
          <button
            className={styles.newSessionButton}
            onClick={() => setDialogOpen(true)}
          >
            + New Session
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {state.status === "loading" && (
          <div className={styles.loadingContainer}>
            <span className={styles.loadingText}>
              Loading sessions
              <span className={styles.loadingDot}>...</span>
            </span>
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.errorContainer}>
            <p className={styles.errorTitle}>Failed to load sessions</p>
            <p className={styles.errorMessage}>{state.message}</p>
            <button
              className={styles.retryButton}
              onClick={() => void fetchSessions()}
            >
              Retry
            </button>
          </div>
        )}

        {state.status === "loaded" && state.sessions.length === 0 && (
          <div className={styles.emptyContainer}>
            <p className={styles.emptyTitle}>No sessions yet</p>
            <p className={styles.emptyMessage}>
              Create one to get started.
            </p>
          </div>
        )}

        {state.status === "loaded" && state.sessions.length > 0 && (
          <div className={styles.sessionGrid}>
            {state.sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </div>

      <CreateSessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleSessionCreated}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete session?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" and all its messages will be permanently deleted.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
