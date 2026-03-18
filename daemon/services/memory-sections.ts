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
    // Match exactly `## ` at line start (not `### ` or deeper)
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      // Flush previous section
      if (inSection || currentLines.length > 0) {
        sections.push({
          name: currentName,
          content: currentLines.join("\n"),
        });
      }
      currentName = line.slice(3);
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
