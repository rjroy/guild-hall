"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./CommitLoreButton.module.css";

interface CommitLoreButtonProps {
  projectName: string;
  hasPendingChanges: boolean;
  pendingFileCount: number;
}

type ResultState = { kind: "success" | "nothing" | "error"; text: string } | null;

export default function CommitLoreButton({
  projectName,
  hasPendingChanges,
  pendingFileCount,
}: CommitLoreButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggle = useCallback(() => {
    setShowForm(true);
    setResult(null);
    setValidationError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setValidationError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (message.trim() === "") {
      setValidationError("A commit message is required");
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const response = await fetch(
        `/api/git/lore/commit?projectName=${encodeURIComponent(projectName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim() }),
        },
      );

      const data = (await response.json()) as { committed?: boolean; message?: string; error?: string };

      if (!response.ok) {
        setResult({ kind: "error", text: data.error ?? `Request failed (${response.status})` });
        setSubmitting(false);
        return;
      }

      if (data.committed) {
        setResult({ kind: "success", text: "Committed." });
        setShowForm(false);
        setMessage("");
        // Clear result after 4 seconds
        if (fadeTimer.current) clearTimeout(fadeTimer.current);
        fadeTimer.current = setTimeout(() => setResult(null), 4000);
      } else {
        setResult({ kind: "nothing", text: "Nothing to commit." });
        setShowForm(false);
      }
    } catch {
      setResult({ kind: "error", text: "Network error. Is the daemon running?" });
    }

    setSubmitting(false);
  }, [message, projectName]);

  return (
    <div>
      <button
        className={hasPendingChanges ? styles.commitButton : `${styles.commitButton} ${styles.commitButtonMuted}`}
        onClick={handleToggle}
        title={hasPendingChanges ? undefined : "No uncommitted .lore changes"}
      >
        Commit .lore
      </button>

      {showForm && (
        <div className={styles.form}>
          <div className={styles.inputRow}>
            <input
              type="text"
              className={styles.messageInput}
              placeholder="Commit message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) void handleSubmit();
              }}
              autoFocus
            />
            <span className={styles.fileCount}>
              {pendingFileCount} file(s) pending
            </span>
          </div>
          {validationError && (
            <span className={styles.validationError}>{validationError}</span>
          )}
          <div className={styles.formActions}>
            <button
              className={styles.submitButton}
              disabled={submitting || message.trim() === ""}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Committing..." : "Commit"}
            </button>
            <button className={styles.cancelLink} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showForm && result && (
        <span className={result.kind === "error" ? styles.resultError : styles.resultText}>
          {result.text}
        </span>
      )}
    </div>
  );
}
