/**
 * Commission artifact reading and scanning for Next.js server components.
 *
 * Reads commission artifacts from {projectPath}/.lore/commissions/ and
 * parses their YAML frontmatter into typed metadata. Read-only; mutations
 * go through the daemon.
 *
 * Follows the same pattern as lib/meetings.ts: gray-matter for parsing,
 * graceful handling of missing directories and malformed frontmatter.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { isNodeError } from "@/lib/types";

// -- Types --

export interface CommissionMeta {
  commissionId: string;
  title: string;
  status: string;
  worker: string;
  workerDisplayTitle: string;
  prompt: string;
  dependencies: string[];
  linked_artifacts: string[];
  resource_overrides: { maxTurns?: number; maxBudgetUsd?: number };
  current_progress: string;
  result_summary: string;
  projectName: string;
  date: string;
}

export interface TimelineEntry {
  timestamp: string;
  event: string;
  reason: string;
  [key: string]: unknown;
}

// -- Internal helpers --

/**
 * Extracts the commission ID from a filename.
 * "commission-researcher-20260221-143000.md" -> "commission-researcher-20260221-143000"
 */
function commissionIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/**
 * Parses a gray-matter data object into CommissionMeta.
 * Missing or malformed fields fall back to empty defaults.
 */
function parseCommissionData(
  data: Record<string, unknown>,
  commissionId: string,
  projectName: string,
): CommissionMeta {
  const resourceOverrides = (
    typeof data.resource_overrides === "object" && data.resource_overrides !== null
  )
    ? data.resource_overrides as Record<string, unknown>
    : {};

  return {
    commissionId,
    title: typeof data.title === "string" ? data.title : "",
    status: typeof data.status === "string" ? data.status : "",
    worker: typeof data.worker === "string" ? data.worker : "",
    workerDisplayTitle: typeof data.workerDisplayTitle === "string"
      ? data.workerDisplayTitle
      : "",
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    dependencies: Array.isArray(data.dependencies)
      ? data.dependencies.filter((d): d is string => typeof d === "string")
      : [],
    linked_artifacts: Array.isArray(data.linked_artifacts)
      ? data.linked_artifacts.filter((a): a is string => typeof a === "string")
      : [],
    resource_overrides: {
      maxTurns: typeof resourceOverrides.maxTurns === "number"
        ? resourceOverrides.maxTurns
        : undefined,
      maxBudgetUsd: typeof resourceOverrides.maxBudgetUsd === "number"
        ? resourceOverrides.maxBudgetUsd
        : undefined,
    },
    current_progress: typeof data.current_progress === "string"
      ? data.current_progress
      : "",
    result_summary: typeof data.result_summary === "string"
      ? data.result_summary
      : "",
    projectName,
    date: formatDate(data.date),
  };
}

// -- Public API --

/**
 * Reads a single commission artifact's frontmatter into typed metadata.
 */
export async function readCommissionMeta(
  filePath: string,
  projectName: string,
): Promise<CommissionMeta> {
  const raw = await fs.readFile(filePath, "utf-8");
  const commissionId = commissionIdFromFilename(path.basename(filePath));

  try {
    const parsed = matter(raw);
    return parseCommissionData(
      parsed.data as Record<string, unknown>,
      commissionId,
      projectName,
    );
  } catch {
    // Malformed frontmatter: return empty defaults
    return {
      commissionId,
      title: "",
      status: "",
      worker: "",
      workerDisplayTitle: "",
      prompt: "",
      dependencies: [],
      linked_artifacts: [],
      resource_overrides: {},
      current_progress: "",
      result_summary: "",
      projectName,
      date: "",
    };
  }
}

/**
 * Reads all .md files in {projectLorePath}/commissions/, parses frontmatter,
 * and returns an array of commission metadata.
 *
 * Returns an empty array if the commissions directory doesn't exist.
 */
export async function scanCommissions(
  projectLorePath: string,
  projectName: string,
): Promise<CommissionMeta[]> {
  const commissionsDir = path.join(projectLorePath, "commissions");

  let entries: string[];
  try {
    const dirEntries = await fs.readdir(commissionsDir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const commissions: CommissionMeta[] = [];

  for (const filename of entries) {
    const filePath = path.join(commissionsDir, filename);
    try {
      const meta = await readCommissionMeta(filePath, projectName);
      commissions.push(meta);
    } catch {
      // Skip files we can't read
    }
  }

  // Active/pending first, then by date descending (newest first)
  const statusPriority: Record<string, number> = {
    in_progress: 0,
    dispatched: 1,
    pending: 2,
    blocked: 3,
    failed: 4,
    cancelled: 5,
    completed: 6,
  };

  commissions.sort((a, b) => {
    const pa = statusPriority[a.status] ?? 9;
    const pb = statusPriority[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.date.localeCompare(a.date);
  });

  return commissions;
}

/**
 * Pure function that parses the activity_timeline YAML array into typed
 * TimelineEntry objects. Takes full file content (with --- frontmatter).
 *
 * Exported for use in Next.js server components that need to display
 * timeline entries without going through the daemon.
 */
export function parseActivityTimeline(raw: string): TimelineEntry[] {
  const { data } = matter(raw);
  const timeline = data.activity_timeline as unknown[] | undefined;
  if (!Array.isArray(timeline)) return [];

  return timeline
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
    )
    .map((entry): TimelineEntry => {
      // js-yaml parses ISO timestamps as Date objects; convert to ISO string.
      const ts = entry.timestamp;
      const timestamp =
        ts instanceof Date
          ? ts.toISOString()
          : typeof ts === "string"
            ? ts
            : "";

      return {
        ...entry,
        timestamp,
        event: typeof entry.event === "string" ? entry.event : "",
        reason: typeof entry.reason === "string" ? entry.reason : "",
      };
    });
}

// -- Helpers --

/** gray-matter parses dates as Date objects; coerce to YYYY-MM-DD string. */
function formatDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") return value;
  return "";
}

