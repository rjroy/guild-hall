"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./CommissionForm.module.css";

interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  description: string;
}

interface CommissionFormProps {
  projectName: string;
  onCreated?: (commissionId: string) => void;
  onCancel?: () => void;
}

/**
 * Inline form for creating a new commission. Fetches the worker list
 * from /api/workers on mount and POSTs to /api/commissions on submit.
 */
export default function CommissionForm({
  projectName,
  onCreated,
  onCancel,
}: CommissionFormProps) {
  // Form fields
  const [title, setTitle] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dependencies, setDependencies] = useState("");
  const [maxTurns, setMaxTurns] = useState("");
  const [maxBudgetUsd, setMaxBudgetUsd] = useState("");
  const [overridesOpen, setOverridesOpen] = useState(false);

  // Workers list
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch workers on mount
  useEffect(() => {
    let cancelled = false;

    fetch("/api/workers")
      .then(async (res) => {
        if (cancelled) return;

        if (!res.ok) {
          setError(`Failed to load workers (${res.status})`);
          setWorkers([]);
          return;
        }

        const data = (await res.json()) as { workers?: WorkerInfo[] };
        setWorkers(data.workers ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not reach daemon. Is it running?");
          setWorkers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWorkers(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !workerName || !prompt.trim()) return;

    setSubmitting(true);
    setError(null);

    // Parse dependencies from comma-separated input
    const deps = dependencies
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    // Build resource overrides only if values are provided
    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number } = {};
    if (maxTurns.trim()) {
      const parsed = parseInt(maxTurns, 10);
      if (!isNaN(parsed) && parsed > 0) {
        resourceOverrides.maxTurns = parsed;
      }
    }
    if (maxBudgetUsd.trim()) {
      const parsed = parseFloat(maxBudgetUsd);
      if (!isNaN(parsed) && parsed > 0) {
        resourceOverrides.maxBudgetUsd = parsed;
      }
    }

    const payload: Record<string, unknown> = {
      projectName,
      title: title.trim(),
      workerName,
      prompt: prompt.trim(),
    };
    if (deps.length > 0) payload.dependencies = deps;
    if (Object.keys(resourceOverrides).length > 0) {
      payload.resourceOverrides = resourceOverrides;
    }

    try {
      const response = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`;
        setError(reason);
        setSubmitting(false);
        return;
      }

      const data = (await response.json()) as { commissionId?: string };
      if (data.commissionId && onCreated) {
        onCreated(data.commissionId);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setSubmitting(false);
    }
  }, [title, workerName, prompt, dependencies, maxTurns, maxBudgetUsd, projectName, onCreated]);

  const canSubmit =
    title.trim().length > 0 &&
    workerName.length > 0 &&
    prompt.trim().length > 0 &&
    !submitting;

  return (
    <div className={styles.form} role="form" aria-label="Create Commission">
      {/* Title */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="commission-title">
          Title
        </label>
        <input
          id="commission-title"
          className={styles.textInput}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Implement user authentication"
          disabled={submitting}
        />
      </div>

      {/* Worker */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="commission-worker">
          Worker
        </label>
        {loadingWorkers ? (
          <p className={styles.statusMessage}>Loading workers...</p>
        ) : (
          <select
            id="commission-worker"
            className={styles.select}
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            disabled={submitting || workers.length === 0}
          >
            <option value="">Select a worker...</option>
            {workers.map((w) => (
              <option key={w.name} value={w.name}>
                {w.displayName} ({w.displayTitle})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Prompt */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="commission-prompt">
          Prompt
        </label>
        <textarea
          id="commission-prompt"
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want this worker to accomplish..."
          disabled={submitting}
        />
      </div>

      {/* Dependencies */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="commission-dependencies">
          Dependencies (optional)
        </label>
        <input
          id="commission-dependencies"
          className={styles.textInput}
          type="text"
          value={dependencies}
          onChange={(e) => setDependencies(e.target.value)}
          placeholder="Comma-separated artifact paths, e.g. specs/api.md, designs/schema.md"
          disabled={submitting}
        />
      </div>

      {/* Resource Overrides (collapsible) */}
      <div className={styles.fieldGroup}>
        <button
          type="button"
          className={styles.overridesToggle}
          onClick={() => setOverridesOpen((prev) => !prev)}
          aria-expanded={overridesOpen}
        >
          <span
            className={`${styles.overridesArrow} ${overridesOpen ? styles.overridesArrowOpen : ""}`}
            aria-hidden="true"
          >
            &#9654;
          </span>
          Resource Overrides
        </button>
        {overridesOpen && (
          <div className={styles.overridesFields}>
            <div className={styles.overridesField}>
              <label
                className={styles.overridesLabel}
                htmlFor="commission-max-turns"
              >
                Max Turns
              </label>
              <input
                id="commission-max-turns"
                className={styles.numberInput}
                type="number"
                min="1"
                value={maxTurns}
                onChange={(e) => setMaxTurns(e.target.value)}
                placeholder="10"
                disabled={submitting}
              />
            </div>
            <div className={styles.overridesField}>
              <label
                className={styles.overridesLabel}
                htmlFor="commission-max-budget"
              >
                Max Budget (USD)
              </label>
              <input
                id="commission-max-budget"
                className={styles.numberInput}
                type="number"
                min="0"
                step="0.01"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd(e.target.value)}
                placeholder="5.00"
                disabled={submitting}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className={styles.errorMessage}>{error}</p>}

      {/* Buttons */}
      <div className={styles.buttonRow}>
        {onCancel && (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className={styles.submitButton}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Creating..." : "Create Commission"}
        </button>
      </div>
    </div>
  );
}
