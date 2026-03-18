"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./CreateMeetingButton.module.css";

interface CreateMeetingButtonProps {
  projectName: string;
  /** When true, the form is expanded on mount (e.g. from a query param link). */
  defaultOpen?: boolean;
  /** Pre-populates the prompt with artifact context and shows artifact path display. */
  initialArtifact?: string;
}

export default function CreateMeetingButton({
  projectName,
  defaultOpen = false,
  initialArtifact,
}: CreateMeetingButtonProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(defaultOpen);
  const [workerName, setWorkerName] = useState("");
  const [prompt, setPrompt] = useState(
    initialArtifact ? `Discussing artifact: .lore/${initialArtifact}\n\n` : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = workerName.trim().length > 0 && prompt.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, workerName: workerName.trim(), prompt: prompt.trim() }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
        setSubmitting(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json) as { type: string; meetingId?: string; reason?: string };
            if (event.type === "session" && event.meetingId) {
              router.push(
                `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(event.meetingId)}`,
              );
              return;
            }
            if (event.type === "error") {
              setError(event.reason ?? "Meeting creation failed");
              setSubmitting(false);
              return;
            }
          } catch {
            // ignore malformed SSE data lines
          }
        }
      }

      setError("Meeting created but no session ID received");
      setSubmitting(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSubmitting(false);
    }
  }, [canSubmit, projectName, workerName, prompt, router]);

  if (!showForm) {
    return (
      <button
        type="button"
        className={styles.createButton}
        onClick={() => setShowForm(true)}
      >
        Request Meeting
      </button>
    );
  }

  return (
    <div className={styles.form} role="form" aria-label="Request Meeting">
      {initialArtifact && (
        <div className={styles.fieldGroup}>
          <span className={styles.label}>Artifact</span>
          <p className={styles.artifactContext}>.lore/{initialArtifact}</p>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="meeting-worker">
          Worker
        </label>
        <input
          id="meeting-worker"
          className={styles.textInput}
          type="text"
          value={workerName}
          onChange={(e) => setWorkerName(e.target.value)}
          placeholder="e.g. octavia"
          disabled={submitting}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="meeting-prompt">
          Prompt
        </label>
        <textarea
          id="meeting-prompt"
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What do you want to discuss?"
          disabled={submitting}
        />
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => setShowForm(false)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.submitButton}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Starting..." : "Start Meeting"}
        </button>
      </div>
    </div>
  );
}
