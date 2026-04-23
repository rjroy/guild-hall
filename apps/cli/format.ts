import { CLI_SURFACE, type CliGroupNode } from "./surface";
import { leafNodes, pathForNode } from "./surface-utils";

export interface FormatOptions {
  /** Force JSON output regardless of TTY detection. */
  json: boolean;
  /** Force human-readable output regardless of TTY detection. */
  tty: boolean;
}

/**
 * Determines whether to output JSON or human-readable text.
 * Explicit flags override TTY detection.
 */
export function shouldOutputJson(options: FormatOptions): boolean {
  if (options.json) return true;
  if (options.tty) return false;
  return !process.stdout.isTTY;
}

/**
 * Formats a daemon response for terminal output.
 * Handles common response shapes: arrays (tables), objects (key-value), strings.
 */
export function formatResponse(data: unknown, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify(data, null, 2);
  }

  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return formatTable(data);
  }

  if (typeof data === "object" && data !== null) {
    return formatKeyValue(data as Record<string, unknown>);
  }

  return String(data);
}

/**
 * Formats an array of objects as a simple table.
 */
function formatTable(rows: unknown[]): string {
  if (rows.length === 0) return "(empty)";

  // If rows are primitive, just list them
  if (typeof rows[0] !== "object" || rows[0] === null) {
    return rows.map((r) => String(r)).join("\n");
  }

  const objects = rows as Record<string, unknown>[];
  const keys = Object.keys(objects[0]);

  const stringify = (val: unknown): string =>
    val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val as string | number | boolean);

  // Calculate column widths
  const widths = keys.map((key) =>
    Math.max(
      key.length,
      ...objects.map((row) => stringify(row[key]).length),
    ),
  );

  // Header
  const header = keys.map((key, i) => key.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  // Rows
  const dataRows = objects.map((row) =>
    keys.map((key, i) => stringify(row[key]).padEnd(widths[i])).join("  "),
  );

  return [header, separator, ...dataRows].join("\n");
}

/**
 * Formats an object as key-value pairs.
 */
function formatKeyValue(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          lines.push(`  ${JSON.stringify(item)}`);
        } else {
          lines.push(`  - ${String(item)}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value == null ? "" : String(value as string | number | boolean)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Suggests a close match from the CLI surface when the user's segments don't
 * resolve to any leaf. Uses Levenshtein distance over full command paths.
 */
export function suggestCommand(
  segments: string[],
  surface: CliGroupNode = CLI_SURFACE,
): string | null {
  const input = segments.join(" ");
  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (const leaf of leafNodes(surface)) {
    const candidatePath = pathForNode(leaf, surface) ?? [];
    const candidate = candidatePath.join(" ");
    const distance = levenshtein(input, candidate);
    if (distance < bestScore && distance <= 3) {
      bestScore = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/** Simple Levenshtein distance for command suggestion. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

/**
 * Extracts --json and --tty flags from argv, returning cleaned segments,
 * the format options, and any additional flags. Supports both bare boolean
 * flags (`--clean`) and `--name=value` / `--name value` string flags.
 */
export function extractFlags(argv: string[]): {
  segments: string[];
  options: FormatOptions;
  flags: Record<string, string | boolean>;
} {
  const options: FormatOptions = { json: false, tty: false };
  const flags: Record<string, string | boolean> = {};
  const segments: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--tty") {
      options.tty = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eqIdx = body.indexOf("=");
      if (eqIdx >= 0) {
        flags[body.slice(0, eqIdx)] = body.slice(eqIdx + 1);
      } else {
        flags[body] = true;
      }
      continue;
    }
    segments.push(arg);
  }

  return { segments, options, flags };
}
