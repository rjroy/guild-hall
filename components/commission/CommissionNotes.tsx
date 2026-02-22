"use client";

import { useState, useCallback } from "react";
import styles from "./CommissionNotes.module.css";

interface CommissionNotesProps {
  commissionId: string;
  onNoteAdded?: () => void;
}

/**
 * Text input + submit button for adding user notes to a commission.
 * Notes are POSTed to the daemon and appear in the activity timeline.
 */
export default function CommissionNotes({
  commissionId,
  onNoteAdded,
}: CommissionNotesProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = useCallback(async () => {
    if (submitting || !content.trim()) return;
    setSubmitting(true);
    setError(undefined);

    try {
      const res = await fetch(
        `/api/commissions/${encodeURIComponent(commissionId)}/note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim() }),
        },
      );

      if (res.ok) {
        setContent("");
        onNoteAdded?.();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to add note");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [commissionId, content, submitting, onNoteAdded]);

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Add Note</h3>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note to the timeline..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <button
          className={styles.submitButton}
          onClick={() => void handleSubmit()}
          disabled={submitting || !content.trim()}
          type="button"
        >
          {submitting ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
