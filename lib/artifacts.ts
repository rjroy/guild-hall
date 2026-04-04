import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { ArtifactStatusGroup, artifactTypeSegment, isNodeError, statusToPriority } from "@/lib/types";
import type { Artifact, ArtifactMeta } from "@/lib/types";
import { compareArtifactsByStatusAndTitle  } from "@/lib/types";

// -- Image constants --

/** File extensions recognized as image artifacts. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/** Maps file extensions to MIME types for image serving. */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

// -- Path normalization --

/**
 * Converts an OS-native path to POSIX-style forward slashes.
 * Used when crossing from filesystem paths into logical paths (relativePath,
 * URL segments, artifact grouping keys) that must use `/` on all platforms.
 */
function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

// -- Path validation --

/**
 * Resolves a relative path within lorePath and verifies it stays inside.
 * Throws on path traversal attempts (e.g. ../../../etc/passwd).
 */
export function validatePath(lorePath: string, relativePath: string): string {
  const resolvedBase = path.resolve(lorePath);
  const resolved = path.resolve(lorePath, relativePath);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

// -- Frontmatter parsing --

const EMPTY_META: ArtifactMeta = {
  title: "",
  date: "",
  status: "",
  tags: [],
};

/** Frontmatter keys handled by the typed ArtifactMeta fields. */
const KNOWN_KEYS = new Set(["title", "date", "status", "tags", "modules", "related"]);

/**
 * Extracts ArtifactMeta from gray-matter's data object.
 * Missing or malformed fields fall back to empty defaults.
 * Frontmatter keys not in the typed set are collected into extras.
 */
function parseMeta(data: Record<string, unknown>): ArtifactMeta {
  // Collect unknown frontmatter fields into extras
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      extras[key] = data[key];
    }
  }

  return {
    title: typeof data.title === "string" ? data.title : "",
    date: data.date instanceof Date
      ? data.date.toISOString().split("T")[0]
      : typeof data.date === "string"
        ? data.date
        : "",
    status: typeof data.status === "string" ? data.status : "",
    tags: Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === "string")
      : [],
    modules: Array.isArray(data.modules)
      ? data.modules.filter((m): m is string => typeof m === "string")
      : undefined,
    related: Array.isArray(data.related)
      ? data.related.filter((r): r is string => typeof r === "string")
      : undefined,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  };
}

// -- Sorting (re-exported from artifact-sorting.ts for client-safety) --

/**
 * Compare function for recency feeds (Surface 1: Dashboard Recent Scrolls).
 * Sorts by filesystem modification time descending (newest first).
 * REQ-SORT-5, REQ-SORT-7
 */
export function compareArtifactsByRecency(a: Artifact, b: Artifact): number {
  return b.lastModified.getTime() - a.lastModified.getTime();
}

// -- Public API --

/**
 * Recursively finds all .md files in lorePath, parses frontmatter,
 * and returns Artifact[] sorted by status (active first), then date
 * descending, then title ascending.
 *
 * Files with malformed frontmatter are included with empty meta.
 */
export async function scanArtifacts(lorePath: string): Promise<Artifact[]> {
  const resolvedBase = path.resolve(lorePath);

  let entries: string[];
  try {
    entries = await collectArtifactFiles(resolvedBase);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const artifacts: Artifact[] = [];

  for (const filePath of entries) {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (IMAGE_EXTENSIONS.has(ext)) {
        // Synthetic metadata for image artifacts (REQ-IMG-4)
        const stat = await fs.stat(filePath);
        // Normalize OS path to POSIX for the logical relativePath convention
        const relPath = toPosixPath(path.relative(resolvedBase, filePath));
        const filename = path.basename(filePath, ext);
        const title = filename
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        artifacts.push({
          meta: {
            title,
            date: stat.mtime.toISOString().split("T")[0],
            type: artifactTypeSegment(relPath) || undefined,
            status: "complete",
            tags: [],
          },
          filePath,
          relativePath: relPath,
          content: "",
          lastModified: stat.mtime,
          artifactType: "image",
        });
      } else {
        // Markdown artifact: parse frontmatter
        const [raw, stat] = await Promise.all([
          fs.readFile(filePath, "utf-8"),
          fs.stat(filePath),
        ]);

        let meta: ArtifactMeta;
        let content: string;

        // Normalize OS path to POSIX for the logical relativePath convention
        const relPath = toPosixPath(path.relative(resolvedBase, filePath));

        try {
          const parsed = matter(raw);
          meta = parseMeta(parsed.data as Record<string, unknown>);
          content = parsed.content;
        } catch {
          // Malformed frontmatter: include the file with empty meta and full content
          meta = { ...EMPTY_META };
          content = raw;
        }
        meta.type = artifactTypeSegment(relPath) || undefined;  

        artifacts.push({
          meta,
          filePath,
          relativePath: relPath,
          content,
          lastModified: stat.mtime,
          artifactType: "document",
        });
      }
    } catch {
      // Skip files we can't read (permissions, etc.)
    }
  }

  artifacts.sort(compareArtifactsByStatusAndTitle);
  return artifacts;
}

/**
 * Reads a single artifact with full content and parsed frontmatter.
 * Validates the path stays within lorePath.
 */
export async function readArtifact(
  lorePath: string,
  relativePath: string
): Promise<Artifact> {
  const filePath = validatePath(lorePath, relativePath);

  const [raw, stat] = await Promise.all([
    fs.readFile(filePath, "utf-8"),
    fs.stat(filePath),
  ]);

  let meta: ArtifactMeta;
  let content: string;
  try {
    const parsed = matter(raw);
    meta = parseMeta(parsed.data as Record<string, unknown>);
    content = parsed.content;
  } catch {
    meta = { ...EMPTY_META };
    content = raw;
  }
  meta.type = artifactTypeSegment(relativePath) || undefined;

  return {
    meta,
    filePath,
    relativePath,
    content,
    rawContent: raw,
    lastModified: stat.mtime,
  };
}

/**
 * Writes new body content to an artifact file while preserving the
 * existing frontmatter exactly as-is.
 *
 * gray-matter's stringify() reformats YAML (changes key ordering, block
 * style), which creates noisy git diffs. Instead we find the closing
 * frontmatter delimiter and splice only the body portion.
 */
export async function writeArtifactContent(
  lorePath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = validatePath(lorePath, relativePath);

  const raw = await fs.readFile(filePath, "utf-8");
  const newContent = spliceBody(raw, content);
  await fs.writeFile(filePath, newContent, "utf-8");
}

/**
 * Writes raw content directly to an artifact file, bypassing frontmatter
 * splice logic. Use this when you already have the complete file content
 * (frontmatter + body) and want to write it as-is.
 */
export async function writeRawArtifactContent(
  lorePath: string,
  relativePath: string,
  rawContent: string
): Promise<void> {
  const filePath = validatePath(lorePath, relativePath);
  await fs.writeFile(filePath, rawContent, "utf-8");
}

/**
 * Returns the top N artifacts by filesystem modification time (newest first).
 * REQ-SORT-5: Dashboard "Recent Scrolls" sorts by recency, not status.
 */
export async function recentArtifacts(
  lorePath: string,
  limit: number
): Promise<Artifact[]> {
  const all = await scanArtifacts(lorePath);
  const filtered = all.filter(
    (a) =>
      a.meta.type !== "Commission" &&
      a.meta.type !== "Meeting" &&
      a.relativePath !== "heartbeat.md" &&
      statusToPriority(a.meta.status) < (ArtifactStatusGroup.Inactive as number)
  );
  filtered.sort(compareArtifactsByRecency);
  return filtered.slice(0, limit);
}

// -- Internal helpers --

/**
 * Replaces the body of a frontmatter document while keeping the raw
 * frontmatter block untouched.
 *
 * Frontmatter is delimited by opening and closing '---' lines.
 * Everything after the closing delimiter is the body.
 */
export function spliceBody(raw: string, newBody: string): string {
  // Check if file starts with frontmatter delimiter
  if (!raw.startsWith("---")) {
    // No frontmatter, replace entire content
    return newBody;
  }

  // Find the closing '---' (skip the opening one)
  const closingIndex = raw.indexOf("\n---", 3);
  if (closingIndex === -1) {
    // Malformed frontmatter (no closing delimiter), replace entire content
    return newBody;
  }

  // Find the end of the closing '---' line
  const afterClosing = raw.indexOf("\n", closingIndex + 1);
  const frontmatterBlock =
    afterClosing === -1
      ? raw // Frontmatter with no body at all
      : raw.slice(0, afterClosing);

  // Ensure body starts with a newline for clean separation
  const normalizedBody = newBody.startsWith("\n") ? newBody : "\n" + newBody;
  return frontmatterBlock + normalizedBody;
}

/**
 * Recursively collects all artifact file paths (.md and image files) under a directory.
 */
async function collectArtifactFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectArtifactFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || IMAGE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
