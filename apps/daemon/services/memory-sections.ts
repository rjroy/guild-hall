/**
 * Section-level parser and renderer for single-file memory storage.
 *
 * Memory files use `## ` headers as section delimiters. Content before the
 * first `## ` header is preamble (empty name). `###` and deeper headers are
 * body content within their parent section, not boundaries.
 */

// -- Types --

export type MemorySection = { name: string; content: string };

// -- Parser --

/**
 * Parses a markdown string into an ordered array of sections.
 * Sections are delimited by `## ` at the start of a line.
 * Content before the first `## ` header is preamble (empty name).
 * `###` and deeper are body content, not boundaries.
 */
export function parseMemorySections(markdown: string): MemorySection[] {
  if (markdown === "") return [];

  const sections: MemorySection[] = [];
  const lines = markdown.split("\n");
  let currentName = "";
  let currentLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    // Match exactly `## ` at line start (not `### ` or deeper).
    // Bare `## ` (empty name after slice) is treated as body content to avoid
    // collision with the preamble sentinel (empty string name).
    const sectionName = line.startsWith("## ") && !line.startsWith("### ")
      ? line.slice(3)
      : null;
    if (sectionName !== null && sectionName !== "") {
      // Flush previous section
      if (inSection || currentLines.length > 0) {
        sections.push({
          name: currentName,
          content: currentLines.join("\n"),
        });
      }
      currentName = sectionName;
      currentLines = [];
      inSection = true;
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  if (inSection || currentLines.length > 0) {
    sections.push({
      name: currentName,
      content: currentLines.join("\n"),
    });
  }

  return sections;
}

// -- Renderer --

/**
 * Converts an array of sections back to a markdown string.
 * Round-trip fidelity: renderMemorySections(parseMemorySections(input))
 * produces identical output to input after normalizing trailing whitespace
 * per line and ensuring a single trailing newline at EOF.
 */
export function renderMemorySections(sections: MemorySection[]): string {
  if (sections.length === 0) return "";

  const parts: string[] = [];
  for (const section of sections) {
    if (section.name !== "") {
      if (section.content === "") {
        parts.push(`## ${section.name}`);
      } else {
        parts.push(`## ${section.name}\n${section.content}`);
      }
    } else {
      parts.push(section.content);
    }
  }

  let result = parts.join("\n");

  // Normalize: strip trailing whitespace per line, single trailing newline
  result = result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Ensure single trailing newline
  result = result.replace(/\n*$/, "\n");

  return result;
}

// -- Content sanitization --

/**
 * Downgrades `## ` headers in content to `### ` so they don't collide with
 * the section delimiter format. Only affects lines that start with exactly
 * `## ` (not `### ` or deeper, which are already safe).
 */
export function sanitizeSectionContent(content: string): string {
  return content.replace(/^## (?!#)/gm, "### ");
}

// -- Deduplication --

/**
 * Merges sections that share the same name (case-insensitive). Keeps the
 * first occurrence's casing. Concatenates content of duplicates with a blank
 * line separator. Preamble sections (empty name) are not merged.
 */
export function deduplicateSections(sections: MemorySection[]): MemorySection[] {
  const seen = new Map<string, number>(); // lowercase name → index in result
  const result: MemorySection[] = [];

  for (const section of sections) {
    // Don't merge preamble sections
    if (section.name === "") {
      result.push(section);
      continue;
    }

    const key = section.name.toLowerCase();
    const existingIdx = seen.get(key);

    if (existingIdx !== undefined) {
      // Merge into existing: concatenate content with blank line separator
      const existing = result[existingIdx];
      const merged = existing.content.trimEnd() + "\n\n" + section.content.trimEnd() + "\n";
      result[existingIdx] = { name: existing.name, content: merged };
    } else {
      seen.set(key, result.length);
      result.push({ ...section });
    }
  }

  return result;
}

// -- Mutex --

const locks = new Map<string, Promise<void>>();

/**
 * Serializes async operations per key. Used to prevent concurrent
 * edit_memory writes to the same scope from losing updates.
 * Key format: `{scope}:{scopeKey}` (e.g., `project:guild-hall`).
 */
export async function withMemoryLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Wait for any existing lock on this key
  while (locks.has(key)) {
    await locks.get(key);
  }

  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(key, promise);

  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve!();
  }
}
