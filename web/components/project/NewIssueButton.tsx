"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./NewIssueButton.module.css";

interface NewIssueButtonProps {
  projectName: string;
}

type ResultState = { slug: string } | { error: string } | null;

export default function NewIssueButton({ projectName }: NewIssueButtonProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggle = useCallback(() => {
    setShowForm(true);
    setResult(null);
    setTitleError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setTitleError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      setTitleError("Title is required");
      return;
    }
    if (trimmedTitle.length > 100) {
      setTitleError("Title must be 100 characters or fewer");
      return;
    }

    setSubmitting(true);
    setTitleError(null);

    try {
      const payload: Record<string, string> = { projectName, title: trimmedTitle };
      if (body.trim() !== "") {
        payload.body = body;
      }

      const response = await fetch("/api/issues/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { slug?: string; path?: string; error?: string };

      if (!response.ok) {
        setResult({ error: data.error ?? `Request failed (${response.status})` });
        setSubmitting(false);
        return;
      }

      setShowForm(false);
      setTitle("");
      setBody("");
      setResult({ slug: data.slug ?? "" });
      router.refresh();
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setResult(null), 4000);
    } catch {
      setResult({ error: "Network error. Is the daemon running?" });
    }

    setSubmitting(false);
  }, [title, body, projectName]);

  return (
    <div>
      <button className={styles.newIssueButton} onClick={handleToggle}>
        New Issue
      </button>

      {showForm && (
        <div className={styles.form}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="issue-title">Title</label>
            <input
              id="issue-title"
              type="text"
              className={styles.titleInput}
              maxLength={100}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              autoFocus
            />
            {titleError && (
              <span className={styles.validationError}>{titleError}</span>
            )}
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="issue-body">Body (optional)</label>
            <textarea
              id="issue-body"
              className={styles.bodyTextarea}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className={styles.formActions}>
            <button
              className={styles.submitButton}
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Creating..." : "Create Issue"}
            </button>
            <button className={styles.cancelLink} onClick={handleCancel}>
              Cancel
            </button>
          </div>
          {result && "error" in result && (
            <span className={styles.resultError}>{result.error}</span>
          )}
        </div>
      )}

      {!showForm && result && "slug" in result && (
        <span className={styles.resultText}>Issue created: {result.slug}</span>
      )}
    </div>
  );
}
