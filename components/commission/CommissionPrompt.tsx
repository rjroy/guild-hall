"use client";

import { useState, useCallback } from "react";
import styles from "./CommissionPrompt.module.css";

interface CommissionPromptProps {
  prompt: string;
  status: string;
  commissionId: string;
}

/**
 * Displays the commission's agentic prompt. Editable as a textarea when
 * status is "pending"; read-only display once dispatched. Saves via PUT
 * to /api/commissions/[id].
 *
 * REQ-VIEW-21
 */
export default function CommissionPrompt({
  prompt,
  status,
  commissionId,
}: CommissionPromptProps) {
  const [value, setValue] = useState(prompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const editable = status === "pending";
  const dirty = value !== prompt;

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(undefined);

    try {
      const response = await fetch(
        `/api/commissions/${encodeURIComponent(commissionId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: value }),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error || "Failed to save prompt");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [commissionId, value, saving, dirty]);

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Prompt</h3>

      {editable ? (
        <>
          <textarea
            className={styles.textarea}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={6}
            placeholder="Describe what the worker should accomplish..."
          />
          {dirty && (
            <div className={styles.actions}>
              <button
                className={styles.saveButton}
                onClick={() => void handleSave()}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving..." : "Save Prompt"}
              </button>
              {error && <span className={styles.error}>{error}</span>}
            </div>
          )}
        </>
      ) : (
        <p className={styles.readOnly}>{value || "No prompt provided."}</p>
      )}
    </div>
  );
}
