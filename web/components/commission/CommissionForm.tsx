"use client";

import { useState, useEffect, useCallback } from "react";
import { useDaemonStatus } from "@/web/components/ui/DaemonContext";
import styles from "./CommissionForm.module.css";

interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  description: string;
}

interface ModelEntry {
  name: string;
}

interface LocalModelEntry {
  name: string;
  modelId: string;
  baseUrl: string;
  reachable: boolean;
}

interface ModelsResponse {
  builtin: ModelEntry[];
  local: LocalModelEntry[];
}

interface CommissionFormProps {
  projectName: string;
  onCreated?: (commissionId: string) => void;
  onCancel?: () => void;
  /** Pre-populated value for the dependencies field (e.g. from query param). */
  initialDependencies?: string;
}

/**
 * Inline form for creating a new commission. Fetches the worker list
 * from /api/workers on mount and POSTs to /api/commissions on submit.
 */
export default function CommissionForm({
  projectName,
  onCreated,
  onCancel,
  initialDependencies = "",
}: CommissionFormProps) {
  const { isOnline } = useDaemonStatus();
  const [title, setTitle] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dependencies, setDependencies] = useState(initialDependencies);
  const [maxTurns, setMaxTurns] = useState("");
  const [maxBudgetUsd, setMaxBudgetUsd] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [models, setModels] = useState<ModelsResponse | null>(null);

  const [commissionType, setCommissionType] = useState<"one-shot" | "scheduled">("one-shot");
  const [cron, setCron] = useState("");
  const [repeat, setRepeat] = useState("");

  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch available models for the model selector (REQ-LOCAL-27)
  useEffect(() => {
    let cancelled = false;

    fetch("/api/models")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as ModelsResponse;
        setModels(data);
      })
      .catch(() => {
        // Models are optional; selector falls back to no options
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !workerName || !prompt.trim()) return;

    setSubmitting(true);
    setError(null);

    const deps = dependencies
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number; model?: string } = {};
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
    if (modelOverride) {
      resourceOverrides.model = modelOverride;
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
    if (commissionType === "scheduled") {
      payload.type = "scheduled";
      payload.cron = cron.trim();
      if (repeat.trim()) {
        const parsedRepeat = parseInt(repeat, 10);
        if (!isNaN(parsedRepeat) && parsedRepeat > 0) {
          payload.repeat = parsedRepeat;
        }
      }
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
  }, [title, workerName, prompt, dependencies, maxTurns, maxBudgetUsd, modelOverride, commissionType, cron, repeat, projectName, onCreated]);

  const canSubmit =
    title.trim().length > 0 &&
    workerName.length > 0 &&
    prompt.trim().length > 0 &&
    (commissionType === "one-shot" || cron.trim().length > 0) &&
    !submitting &&
    isOnline;

  return (
    <div className={styles.form} role="form" aria-label="Create Commission">
      <div className={styles.fieldGroup}>
        <span className={styles.label}>Type</span>
        <div className={styles.typeToggle} role="radiogroup" aria-label="Commission type">
          <label className={`${styles.typeOption} ${commissionType === "one-shot" ? styles.typeOptionActive : ""}`}>
            <input
              type="radio"
              name="commission-type"
              value="one-shot"
              checked={commissionType === "one-shot"}
              onChange={() => setCommissionType("one-shot")}
              className={styles.typeRadio}
              disabled={submitting}
            />
            One-shot
          </label>
          <label className={`${styles.typeOption} ${commissionType === "scheduled" ? styles.typeOptionActive : ""}`}>
            <input
              type="radio"
              name="commission-type"
              value="scheduled"
              checked={commissionType === "scheduled"}
              onChange={() => setCommissionType("scheduled")}
              className={styles.typeRadio}
              disabled={submitting}
            />
            Schedule
          </label>
        </div>
      </div>

      {commissionType === "scheduled" && (
        <div className={styles.scheduleFields}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="commission-cron">
              Cron Expression
            </label>
            <input
              id="commission-cron"
              className={styles.textInput}
              type="text"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * 1"
              disabled={submitting}
            />
            <span className={styles.fieldHint}>
              minute hour day-of-month month day-of-week
            </span>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="commission-repeat">
              Repeat Count (optional)
            </label>
            <input
              id="commission-repeat"
              className={styles.numberInput}
              type="number"
              min="1"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              placeholder="Leave empty for indefinite"
              disabled={submitting}
            />
          </div>
        </div>
      )}

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
          <div className={styles.overridesSection}>
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
            <div className={styles.overridesField}>
              <label
                className={styles.overridesLabel}
                htmlFor="commission-model"
              >
                Model
              </label>
              <select
                id="commission-model"
                className={styles.select}
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                disabled={submitting}
              >
                <option value="">Worker default</option>
                {models && models.builtin.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
                {models && models.local.length > 0 && (
                  <optgroup label="Local Models">
                    {models.local.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} (local)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        )}
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

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
          title={!isOnline ? "Daemon offline" : undefined}
          onClick={() => void handleSubmit()}
        >
          {submitting
            ? "Creating..."
            : commissionType === "scheduled"
              ? "Create Schedule"
              : "Create Commission"}
        </button>
      </div>
    </div>
  );
}
