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
  resource_overrides: { model?: string };
  current_progress: string;
  result_summary: string;
  projectName: string;
  date: string;
  /** ISO timestamp most relevant for the commission's current status. */
  relevantDate: string;
  /** Source information for commissions created by automated processes. */
  source: { description: string } | null;
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
  body: string,
): CommissionMeta {
  const resourceOverrides = (
    typeof data.resource_overrides === "object" && data.resource_overrides !== null
  )
    ? data.resource_overrides as Record<string, unknown>
    : {};

  const status = typeof data.status === "string" ? data.status : "";
  const date = formatDate(data.date);
  const timeline = Array.isArray(data.activity_timeline)
    ? data.activity_timeline as unknown[]
    : [];

  return {
    commissionId,
    title: typeof data.title === "string" ? data.title : "",
    status,
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
      model: typeof resourceOverrides.model === "string"
        ? resourceOverrides.model
        : undefined,
    },
    current_progress: typeof data.current_progress === "string"
      ? data.current_progress
      : "",
    result_summary: body.trim()
      || (typeof data.result_summary === "string" ? data.result_summary : ""),
    projectName,
    date,
    relevantDate: extractRelevantDate(status, date, timeline),
    source: extractSource(data),
  };
}

/**
 * Extracts the source block from commission frontmatter.
 */
function extractSource(data: Record<string, unknown>): { description: string } | null {
  const source = data.source;
  if (typeof source === "object" && source !== null) {
    const s = source as Record<string, unknown>;
    if (typeof s.description === "string") {
      return { description: s.description };
    }
  }
  return null;
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
    // Only treat body as result_summary when the file had valid frontmatter.
    // Without this check, files with no frontmatter delimiters would have their
    // entire content interpreted as result_summary (gray-matter puts everything
    // in `content` when there's no `---` block).
    const body = parsed.matter ? parsed.content : "";
    return parseCommissionData(
      parsed.data as Record<string, unknown>,
      commissionId,
      projectName,
      body,
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
      relevantDate: "",
      source: null,
    };
  }
}

/**
 * Lists `.md` filenames in a directory, returning [] if the directory
 * does not exist. Other errors propagate.
 */
async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Reads commission artifacts from both `.lore/work/commissions/` and the
 * legacy `.lore/commissions/`, merges them, and returns the array sorted
 * by status group and date (REQ-LDR-11).
 *
 * Duplicate IDs (same commission written to both layouts) prefer the
 * `work/` copy; the flat copy is dropped from the merged list. The merge
 * is at the listing level only; no rewrite occurs.
 *
 * Returns an empty array if neither directory exists.
 */
export async function scanCommissions(
  projectLorePath: string,
  projectName: string,
): Promise<CommissionMeta[]> {
  const workDir = path.join(projectLorePath, "work", "commissions");
  const flatDir = path.join(projectLorePath, "commissions");

  const seen = new Set<string>();
  const commissions: CommissionMeta[] = [];

  // Read work/ first so duplicate IDs preferentially come from there.
  for (const dir of [workDir, flatDir]) {
    const filenames = await listMarkdownFiles(dir);
    for (const filename of filenames) {
      const id = commissionIdFromFilename(filename);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const meta = await readCommissionMeta(path.join(dir, filename), projectName);
        commissions.push(meta);
      } catch {
        // Skip files we can't read
      }
    }
  }

  return sortCommissions(commissions);
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

// -- Sorting --

/**
 * Status group ordering: idle (0), active (1), failed (2), completed (3).
 * Within idle/active/failed, oldest first. Within completed, newest first.
 */
const STATUS_GROUP: Record<string, number> = {
  pending: 0,
  blocked: 0,
  paused: 0,
  dispatched: 1,
  in_progress: 1,
  active: 1,
  failed: 2,
  cancelled: 2,
  abandoned: 3,
  completed: 3,
};

const COMPLETED_GROUP = 3;

/**
 * Sorts commissions by status group, then by date within each group.
 * Group order: idle, active, failed, completed.
 * Idle/active/failed sort oldest first; completed sorts newest first.
 */
export function sortCommissions(commissions: CommissionMeta[]): CommissionMeta[] {
  return [...commissions].sort((a, b) => {
    const ga = STATUS_GROUP[a.status] ?? 9;
    const gb = STATUS_GROUP[b.status] ?? 9;
    if (ga !== gb) return ga - gb;

    const dateA = a.relevantDate || a.date;
    const dateB = b.relevantDate || b.date;
    if (ga === COMPLETED_GROUP) {
      return dateB.localeCompare(dateA);
    }
    return dateA.localeCompare(dateB);
  });
}

// -- Helpers --

/**
 * Finds the ISO timestamp for the timeline event matching a status.
 * Falls back to the creation date if no matching event exists.
 */
function extractRelevantDate(
  status: string,
  date: string,
  timeline: unknown[],
): string {
  const targetEvent: Record<string, string> = {
    completed: "status_completed",
    failed: "status_failed",
    cancelled: "status_cancelled",
    dispatched: "status_dispatched",
    in_progress: "status_in_progress",
  };

  const eventName = targetEvent[status];
  if (eventName) {
    const ts = findTimelineTimestamp(timeline, eventName);
    if (ts) return ts;
  }

  // For idle statuses (pending/blocked) or missing timeline events, use creation event
  const createdTs = findTimelineTimestamp(timeline, "created");
  if (createdTs) return createdTs;

  return date;
}

/** Finds the last timeline entry with a given event name and returns its timestamp. */
function findTimelineTimestamp(timeline: unknown[], eventName: string): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (rec.event !== eventName) continue;

    const ts = rec.timestamp;
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string" && ts) return ts;
  }
  return null;
}

/** gray-matter parses dates as Date objects; coerce to YYYY-MM-DD string. */
function formatDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") return value;
  return "";
}

