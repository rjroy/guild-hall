import type { CliOperation } from "./resolve";

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

/** Shape returned by the daemon's /help hierarchy endpoints. */
export interface HelpNode {
  name: string;
  description: string;
  kind: string;
  children?: Array<{ name: string; description: string; kind: string; path: string }>;
}

/**
 * Formats the daemon's help tree response for terminal display.
 * The daemon owns the hierarchy; this just renders it.
 */
export function formatHelpTree(
  data: HelpNode,
  prefix: string[],
): string {
  const lines: string[] = [];
  const title = prefix.length > 0 ? `guild-hall ${prefix.join(" ")}` : "Guild Hall CLI";
  lines.push(title);
  lines.push(data.description);
  lines.push("");

  if (data.children && data.children.length > 0) {
    lines.push("Commands:");
    const maxName = Math.max(...data.children.map((c) => c.name.length));
    for (const child of data.children) {
      lines.push(`  ${child.name.padEnd(maxName + 2)}${child.description}`);
    }

    // Add migrate-content at root level
    if (prefix.length === 0) {
      const pad = Math.max(maxName, "migrate-content".length);
      lines.push(`  ${"migrate-content".padEnd(pad + 2)}Migrate result_summary from frontmatter to body`);
    }

    lines.push("");
    const prefixStr = prefix.length > 0 ? prefix.join(" ") + " " : "";
    lines.push(`Run 'guild-hall ${prefixStr}<command> help' for more information.`);
  }

  return lines.join("\n");
}

/**
 * Formats an operation's metadata for terminal display (leaf help).
 */
export function formatOperationHelp(skill: CliOperation): string {
  const lines: string[] = [];
  const cmdSegments = skill.invocation.path.split("/").filter(Boolean).join(" ");

  lines.push(`guild-hall ${cmdSegments}`);
  lines.push(skill.description);
  lines.push("");
  lines.push(`  Method:  ${skill.invocation.method}`);
  lines.push(`  Path:    ${skill.invocation.path}`);

  if (skill.streaming) {
    lines.push(`  Stream:  yes (${skill.streaming.eventTypes.join(", ")})`);
  }

  if (skill.parameters && skill.parameters.length > 0) {
    lines.push("");
    lines.push("Parameters:");
    for (const param of skill.parameters) {
      const req = param.required ? "(required)" : "(optional)";
      lines.push(`  ${param.name}  ${req}`);
    }
  }

  const usage = (skill.parameters ?? [])
    .map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`))
    .join(" ");
  if (usage) {
    lines.push("");
    lines.push(`Usage: guild-hall ${cmdSegments} ${usage}`);
  }

  return lines.join("\n");
}

/**
 * Suggests a close match from available operation invocation paths.
 */
export function suggestCommand(
  segments: string[],
  skills: CliOperation[],
): string | null {
  const input = segments.join(" ");
  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (const skill of skills) {
    const candidate = skill.invocation.path.split("/").filter(Boolean).join(" ");
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
 * the format options, and any additional boolean flags (e.g. --clean → { clean: true }).
 */
export function extractFlags(argv: string[]): {
  segments: string[];
  options: FormatOptions;
  flags: Record<string, boolean>;
} {
  const options: FormatOptions = { json: false, tty: false };
  const flags: Record<string, boolean> = {};
  const segments: string[] = [];

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--tty") {
      options.tty = true;
    } else if (arg.startsWith("--")) {
      flags[arg.slice(2)] = true;
    } else {
      segments.push(arg);
    }
  }

  return { segments, options, flags };
}
