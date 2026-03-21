/**
 * Trigger evaluator utilities.
 *
 * Contains the template variable expansion function used to substitute
 * event payload fields into trigger commission templates.
 *
 * REQ-TRIG-10, REQ-TRIG-11, REQ-TRIG-12
 */

import type { SystemEvent } from "@/daemon/lib/event-bus";

/**
 * Expands `{{fieldName}}` placeholders in a template string using
 * top-level fields from the event object.
 *
 * - String values substitute directly.
 * - Array values are joined with commas.
 * - Missing or undefined fields expand to empty string.
 * - No nested access: `{{foo.bar}}` is treated as a field named "foo.bar".
 */
export function expandTemplate(template: string, event: SystemEvent): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, fieldName: string) => {
    const record = event as Record<string, unknown>;
    const value = record[fieldName];

    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.join(",");
    return String(value);
  });
}
