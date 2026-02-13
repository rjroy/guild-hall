"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { schemaToFields } from "@/lib/schema-fields";
import type { FormField } from "@/lib/schema-fields";
import styles from "./ToolInvokeForm.module.css";

type ToolInvokeFormProps = {
  guildMember: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
  onCancel: () => void;
};

type InvokeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: unknown }
  | { status: "error"; message: string };

export function ToolInvokeForm({
  guildMember,
  toolName,
  inputSchema,
  onCancel,
}: ToolInvokeFormProps) {
  const fields = schemaToFields(inputSchema);
  const useJsonFallback = fields === null;
  const noParameters = fields !== null && fields.length === 0;

  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(() =>
    buildDefaults(fields),
  );
  const [jsonText, setJsonText] = useState("{}");
  const [invokeState, setInvokeState] = useState<InvokeState>({
    status: "idle",
  });

  function updateField(name: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInvokeState({ status: "loading" });

    let toolInput: Record<string, unknown>;
    if (useJsonFallback) {
      try {
        toolInput = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        setInvokeState({ status: "error", message: "Invalid JSON input" });
        return;
      }
    } else {
      toolInput = buildToolInput(fields, fieldValues);
    }

    try {
      const response = await fetch("/api/tools/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildMember, toolName, toolInput }),
      });

      const body = (await response.json()) as {
        result?: unknown;
        error?: string;
      };

      if (!response.ok) {
        setInvokeState({
          status: "error",
          message: body.error ?? `Request failed (${response.status})`,
        });
        return;
      }

      setInvokeState({ status: "success", result: body.result });
    } catch (err) {
      setInvokeState({
        status: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      {useJsonFallback ? (
        <div className={styles.fieldGroup}>
          <p className={styles.fallbackNote}>
            Complex schema. Enter tool input as JSON:
          </p>
          <textarea
            className={styles.textarea}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
        </div>
      ) : noParameters ? (
        <p className={styles.fallbackNote}>No parameters required.</p>
      ) : (
        fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={fieldValues[field.name]}
            onChange={(value) => updateField(field.name, value)}
          />
        ))
      )}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={invokeState.status === "loading"}
        >
          {invokeState.status === "loading" ? "Invoking..." : "Invoke"}
        </button>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {invokeState.status === "loading" && (
        <p className={styles.loadingText}>Running tool...</p>
      )}

      {invokeState.status === "success" && (
        <div className={styles.resultContainer}>
          <p className={styles.resultLabel}>Result</p>
          <pre className={styles.resultContent}>
            {JSON.stringify(invokeState.result, null, 2)}
          </pre>
        </div>
      )}

      {invokeState.status === "error" && (
        <div className={styles.errorContainer}>{invokeState.message}</div>
      )}
    </form>
  );
}

// -- Field rendering --

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.label}>
        {field.name}
        {field.required && <span className={styles.required}>*</span>}
      </label>
      {field.description && (
        <span className={styles.description}>{field.description}</span>
      )}

      {field.type === "string" && (
        <input
          className={styles.input}
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )}

      {field.type === "number" && (
        <input
          className={styles.input}
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          required={field.required}
        />
      )}

      {field.type === "boolean" && (
        <div className={styles.checkboxRow}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={(value as boolean) ?? false}
            onChange={(e) => onChange(e.target.checked)}
          />
        </div>
      )}

      {field.type === "enum" && (
        <select
          className={styles.select}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">Select...</option>
          {field.enumValues?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// -- Helpers --

function buildDefaults(fields: FormField[] | null): Record<string, unknown> {
  if (!fields) return {};
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      defaults[field.name] = field.defaultValue;
    } else if (field.type === "boolean") {
      defaults[field.name] = false;
    } else {
      defaults[field.name] = "";
    }
  }
  return defaults;
}

function buildToolInput(
  fields: FormField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    // Skip empty optional fields
    if (!field.required && value === "") continue;
    if (field.type === "number" && typeof value === "number") {
      input[field.name] = value;
    } else if (field.type === "boolean") {
      input[field.name] = value;
    } else if (value !== "") {
      input[field.name] = value;
    }
  }
  return input;
}
