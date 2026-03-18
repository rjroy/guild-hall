/**
 * Domain-agnostic YAML frontmatter manipulation utilities.
 *
 * These functions operate on raw content strings. No filesystem I/O,
 * no knowledge of commission or meeting artifact schemas. They exist
 * so that commission record.ts and meeting record.ts can
 * share the same field-replacement and log-append logic without
 * duplicating regex patterns.
 *
 * All modifications use regex/string slicing to avoid gray-matter's
 * stringify(), which reformats the entire YAML block and produces
 * noisy git diffs.
 */

/**
 * Replaces a top-level YAML frontmatter field that may span multiple lines.
 * Matches from "fieldName:" (with or without space after colon) through all
 * continuation lines (lines that don't start a new top-level key) up to the
 * next top-level field or closing ---. The replacement always normalizes to
 * "fieldName: newValue" (with space after colon).
 *
 * Throws if the field is not found in the content.
 */
export function replaceYamlField(raw: string, fieldName: string, newValue: string): string {
  const pattern = new RegExp(
    `^${fieldName}:[ ]?.*$(?:\\n(?![a-z_]|---).*)*`,
    "m",
  );
  if (!pattern.test(raw)) {
    throw new Error(`replaceYamlField: no "${fieldName}" field found in content`);
  }
  pattern.lastIndex = 0;
  return raw.replace(pattern, `${fieldName}: ${newValue}`);
}

/**
 * Reads a single top-level YAML field value from raw frontmatter content.
 * Returns the value as a string (trimmed, surrounding quotes stripped),
 * or undefined if the field is not found.
 */
export function readYamlField(raw: string, fieldName: string): string | undefined {
  const match = raw.match(new RegExp(`^${fieldName}:[ ]?(.*)$`, "m"));
  if (!match) return undefined;
  let value = match[1].trim();
  // Strip surrounding quotes (single or double)
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/**
 * Appends a pre-formatted log entry to a YAML array in frontmatter content.
 *
 * Insertion strategy:
 *   - When `marker` is provided (a field name), inserts the entry immediately
 *     before the line starting with that field. Commission artifacts use
 *     marker: "current_progress" so timeline entries land above the progress
 *     summary.
 *   - When `marker` is omitted, inserts before the closing "---" delimiter.
 *     Meeting artifacts use this pattern so meeting_log entries append at the
 *     end of the frontmatter.
 *
 * Throws if neither the marker field nor a closing "---" is found.
 */
export function appendLogEntry(raw: string, entry: string, marker?: string): string {
  if (marker) {
    const markerMatch = raw.match(new RegExp(`^${marker}:`, "m"));
    if (markerMatch && markerMatch.index !== undefined) {
      return raw.slice(0, markerMatch.index) + entry + "\n" + raw.slice(markerMatch.index);
    }
  }

  // Fallback (or no marker): append before closing ---
  const closingIndex = raw.lastIndexOf("\n---");
  if (closingIndex !== -1) {
    return raw.slice(0, closingIndex) + "\n" + entry + raw.slice(closingIndex);
  }

  throw new Error(
    `appendLogEntry: no ${marker ? `"${marker}:" field or ` : ""}closing "---" delimiter found in content`,
  );
}
