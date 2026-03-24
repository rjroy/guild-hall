"use client";

import { useState, useEffect, useCallback } from "react";
import { useDaemonStatus } from "@/web/components/ui/DaemonContext";
import { SYSTEM_EVENT_TYPES } from "@/lib/types";
import { EVENT_TYPE_FIELDS, buildMatchSummaryParts, buildTriggerPayloadFields } from "./trigger-form-data";
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
  const [modelOverride, setModelOverride] = useState("");
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [models, setModels] = useState<ModelsResponse | null>(null);

  const [commissionType, setCommissionType] = useState<"one-shot" | "scheduled" | "triggered">("one-shot");
  const [cron, setCron] = useState("");
  const [repeat, setRepeat] = useState("");
  const [matchType, setMatchType] = useState("");
  const [approval, setApproval] = useState<"confirm" | "auto">("confirm");
  const [projectFilter, setProjectFilter] = useState("");
  const [fieldPatterns, setFieldPatterns] = useState<{ key: string; value: string }[]>([]);
  const [maxDepth, setMaxDepth] = useState("");

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

    const resourceOverrides: { model?: string } = {};
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
    if (commissionType === "triggered") {
      const triggerFields = buildTriggerPayloadFields(
        matchType, projectFilter, fieldPatterns, approval, maxDepth
      );
      Object.assign(payload, triggerFields);
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
  }, [title, workerName, prompt, dependencies, modelOverride, commissionType, cron, repeat, matchType, approval, projectFilter, fieldPatterns, maxDepth, projectName, onCreated]);

  const canSubmit =
    title.trim().length > 0 &&
    workerName.length > 0 &&
    prompt.trim().length > 0 &&
    (commissionType === "one-shot"
      || (commissionType === "scheduled" && cron.trim().length > 0)
      || (commissionType === "triggered" && matchType.length > 0)) &&
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
          <label className={`${styles.typeOption} ${commissionType === "triggered" ? styles.typeOptionActive : ""}`}>
            <input
              type="radio"
              name="commission-type"
              value="triggered"
              checked={commissionType === "triggered"}
              onChange={() => setCommissionType("triggered")}
              className={styles.typeRadio}
              disabled={submitting}
            />
            Trigger
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

      {commissionType === "triggered" && (
        <div className={styles.triggerFields}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="commission-event-type">
              Event Type
            </label>
            <select
              id="commission-event-type"
              className={styles.select}
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select an event type...</option>
              {SYSTEM_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Approval</span>
            <div className={styles.approvalRadios}>
              <label className={styles.approvalOption}>
                <input
                  type="radio"
                  name="trigger-approval"
                  value="confirm"
                  checked={approval === "confirm"}
                  onChange={() => setApproval("confirm")}
                  disabled={submitting}
                />
                Confirm before dispatch
              </label>
              <label className={styles.approvalOption}>
                <input
                  type="radio"
                  name="trigger-approval"
                  value="auto"
                  checked={approval === "auto"}
                  onChange={() => setApproval("auto")}
                  disabled={submitting}
                />
                Auto-dispatch
              </label>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="commission-project-filter">
              Project filter (optional)
            </label>
            <input
              id="commission-project-filter"
              className={styles.textInput}
              type="text"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              placeholder="Project name"
              disabled={submitting}
            />
            <span className={styles.fieldHint}>
              Only respond to events from this project. Leave blank for any.
            </span>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Field Patterns</span>
            {fieldPatterns.map((fp, i) => (
              <div key={i} className={styles.fieldPatternRow}>
                <div className={styles.fieldPatternInputs}>
                  <input
                    className={styles.textInput}
                    type="text"
                    value={fp.key}
                    onChange={(e) => {
                      const updated = [...fieldPatterns];
                      updated[i] = { ...fp, key: e.target.value };
                      setFieldPatterns(updated);
                    }}
                    placeholder="field name"
                    disabled={submitting}
                  />
                  <input
                    className={styles.textInput}
                    type="text"
                    value={fp.value}
                    onChange={(e) => {
                      const updated = [...fieldPatterns];
                      updated[i] = { ...fp, value: e.target.value };
                      setFieldPatterns(updated);
                    }}
                    placeholder="glob pattern"
                    disabled={submitting}
                  />
                </div>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => setFieldPatterns(fieldPatterns.filter((_, idx) => idx !== i))}
                  disabled={submitting}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addPatternButton}
              onClick={() => setFieldPatterns([...fieldPatterns, { key: "", value: "" }])}
              disabled={submitting}
            >
              + Add pattern
            </button>
            <span className={styles.fieldHint}>
              {matchType
                ? <>Available keys: {EVENT_TYPE_FIELDS[matchType]?.join(", ") ?? "none"}. Supports glob patterns: <code>*</code>, <code>?</code>, <code>{"{a,b}"}</code>, <code>!pattern</code></>
                : "Select an event type to see available field keys."}
            </span>
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
        {commissionType === "triggered" && (
          <span className={styles.templateVarHint}>
            {matchType
              ? <>Template variables: {EVENT_TYPE_FIELDS[matchType]?.map((k) => (
                  <code key={k}>{`{{${k}}}`}</code>
                )) ?? null}</>
              : "Template variables: select an event type to see available variables."}
          </span>
        )}
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
        {commissionType === "triggered" && (
          <span className={styles.templateVarHint}>
            {matchType
              ? <>Template variables: {EVENT_TYPE_FIELDS[matchType]?.map((k) => (
                  <code key={k}>{`{{${k}}}`}</code>
                )) ?? null}</>
              : "Template variables: select an event type to see available variables."}
          </span>
        )}
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
            {commissionType === "triggered" && (
              <div className={styles.overridesField}>
                <label className={styles.overridesLabel} htmlFor="commission-max-depth">
                  Max chain depth
                </label>
                <input
                  id="commission-max-depth"
                  className={styles.numberInput}
                  type="number"
                  min="1"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(e.target.value)}
                  placeholder="3"
                  disabled={submitting}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      {commissionType === "triggered" && matchType && (
        <p className={styles.matchSummary}>
          {buildMatchSummaryParts(matchType, projectFilter, fieldPatterns).map((seg, i) =>
            seg.isCode
              ? <code key={i} className={styles.fieldHint}>{seg.text}</code>
              : <span key={i}>{seg.text}</span>
          )}
        </p>
      )}

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
              : commissionType === "triggered"
                ? "Create Trigger"
                : "Create Commission"}
        </button>
      </div>
    </div>
  );
}
