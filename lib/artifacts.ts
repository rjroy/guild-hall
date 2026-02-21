import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import type { Artifact, ArtifactMeta } from "@/lib/types";

// -- Path validation --

/**
 * Resolves a relative path within lorePath and verifies it stays inside.
 * Throws on path traversal attempts (e.g. ../../../etc/passwd).
 */
function validatePath(lorePath: string, relativePath: string): string {
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

/**
 * Extracts ArtifactMeta from gray-matter's data object.
 * Missing or malformed fields fall back to empty defaults.
 */
function parseMeta(data: Record<string, unknown>): ArtifactMeta {
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
  };
}

// -- Public API --

/**
 * Recursively finds all .md files in lorePath, parses frontmatter,
 * and returns Artifact[] sorted by lastModified descending.
 *
 * Files with malformed frontmatter are included with empty meta.
 */
export async function scanArtifacts(lorePath: string): Promise<Artifact[]> {
  const resolvedBase = path.resolve(lorePath);

  let entries: string[];
  try {
    entries = await collectMarkdownFiles(resolvedBase);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const artifacts: Artifact[] = [];

  for (const filePath of entries) {
    try {
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
        // Malformed frontmatter: include the file with empty meta and full content
        meta = { ...EMPTY_META };
        content = raw;
      }

      artifacts.push({
        meta,
        filePath,
        relativePath: path.relative(resolvedBase, filePath),
        content,
        lastModified: stat.mtime,
      });
    } catch {
      // Skip files we can't read (permissions, etc.)
    }
  }

  artifacts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
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

  return {
    meta,
    filePath,
    relativePath,
    content,
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
 * Returns the top N most recently modified artifacts.
 */
export async function recentArtifacts(
  lorePath: string,
  limit: number
): Promise<Artifact[]> {
  const all = await scanArtifacts(lorePath);
  return all.slice(0, limit);
}

// -- Internal helpers --

/**
 * Replaces the body of a frontmatter document while keeping the raw
 * frontmatter block untouched.
 *
 * Frontmatter is delimited by opening and closing '---' lines.
 * Everything after the closing delimiter is the body.
 */
function spliceBody(raw: string, newBody: string): string {
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
 * Recursively collects all .md file paths under a directory.
 */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
