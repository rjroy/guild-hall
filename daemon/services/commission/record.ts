/**
 * Commission record operations: pure data I/O against commission artifact
 * YAML frontmatter.
 *
 * Layer 1 of the commission layer separation. This module reads and writes
 * individual YAML fields in commission artifacts using regex-based replacement.
 * It does NOT use gray-matter's stringify() because that reformats the entire
 * YAML block, producing noisy git diffs.
 *
 * This layer has no knowledge of state transitions, invariants, or events.
 * It operates on file paths and strings only, with no commission domain types.
 * The caller resolves which worktree and artifact path to use.
 */

import * as fs from "node:fs/promises";

// -- Interface --

export interface CommissionRecordOps {
  readStatus(artifactPath: string): Promise<string>;
  writeStatus(artifactPath: string, status: string): Promise<void>;
  appendTimeline(
    artifactPath: string,
    event: string,
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void>;
  readDependencies(artifactPath: string): Promise<string[]>;
  updateProgress(artifactPath: string, summary: string): Promise<void>;
  updateResult(
    artifactPath: string,
    summary: string,
    artifacts?: string[],
  ): Promise<void>;
}

// -- Internal helpers --

/**
 * Reads a file and wraps ENOENT with a descriptive error mentioning
 * the artifact path and the operation that failed.
 */
async function readArtifact(artifactPath: string, operation: string): Promise<string> {
  try {
    return await fs.readFile(artifactPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${operation}: artifact not found at ${artifactPath}`);
    }
    throw err;
  }
}

/**
 * Replaces a top-level YAML frontmatter field that may span multiple lines.
 * Matches from "fieldName: " through all continuation lines (lines that don't
 * start a new top-level key) up to the next top-level field or closing ---.
 */
function replaceYamlField(raw: string, fieldName: string, newValue: string): string {
  const pattern = new RegExp(
    `^${fieldName}: .*$(?:\\n(?![a-z_]|---).*)*`,
    "m",
  );
  if (!pattern.test(raw)) {
    throw new Error(`replaceYamlField: no "${fieldName}" field found in content`);
  }
  return raw.replace(pattern, `${fieldName}: ${newValue}`);
}

/**
 * Escapes a string for use as a YAML double-quoted value.
 * Handles backslashes, double quotes, and newlines so the value
 * stays on a single line.
 */
function escapeYamlValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

// -- Implementation --

function createRecordOps(): CommissionRecordOps {
  return {
    async readStatus(artifactPath: string): Promise<string> {
      const raw = await readArtifact(artifactPath, "readStatus");
      const match = raw.match(/^status: (\S+)$/m);
      if (!match) {
        throw new Error(`readStatus: no status field found in ${artifactPath}`);
      }
      return match[1];
    },

    async writeStatus(artifactPath: string, status: string): Promise<void> {
      const raw = await readArtifact(artifactPath, "writeStatus");
      if (!/^status: \S+$/m.test(raw)) {
        throw new Error(`writeStatus: no status field found in ${artifactPath}`);
      }
      const updated = raw.replace(/^status: \S+$/m, `status: ${status}`);
      await fs.writeFile(artifactPath, updated, "utf-8");
    },

    async appendTimeline(
      artifactPath: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      const raw = await readArtifact(artifactPath, "appendTimeline");

      const now = new Date();
      let entry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${escapeYamlValue(reason)}"`;

      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          entry += `\n    ${key}: "${escapeYamlValue(String(value))}"`;
        }
      }

      // Insert before "current_progress:" line
      const progressIndex = raw.indexOf("current_progress:");
      if (progressIndex !== -1) {
        const updated =
          raw.slice(0, progressIndex) +
          entry +
          "\n" +
          raw.slice(progressIndex);
        await fs.writeFile(artifactPath, updated, "utf-8");
        return;
      }

      // Fallback: append before closing ---
      const closingIndex = raw.lastIndexOf("\n---");
      if (closingIndex !== -1) {
        const updated =
          raw.slice(0, closingIndex) + "\n" + entry + raw.slice(closingIndex);
        await fs.writeFile(artifactPath, updated, "utf-8");
        return;
      }

      throw new Error(
        `appendTimeline: no "current_progress:" field or closing "---" delimiter found in ${artifactPath}`,
      );
    },

    async readDependencies(artifactPath: string): Promise<string[]> {
      const raw = await readArtifact(artifactPath, "readDependencies");

      // Empty array form: `dependencies: []`
      if (/^dependencies: \[\]$/m.test(raw)) {
        return [];
      }

      // Parse list items under dependencies:
      const match = raw.match(
        /^dependencies:\n((?:  - .+\n)*)/m,
      );
      if (!match) return [];

      return match[1]
        .split("\n")
        .filter((line) => line.startsWith("  - "))
        .map((line) => line.replace(/^  - /, "").trim());
    },

    async updateProgress(artifactPath: string, summary: string): Promise<void> {
      const raw = await readArtifact(artifactPath, "updateProgress");
      const updated = replaceYamlField(raw, "current_progress", `"${escapeYamlValue(summary)}"`);
      await fs.writeFile(artifactPath, updated, "utf-8");
    },

    async updateResult(
      artifactPath: string,
      summary: string,
      artifacts?: string[],
    ): Promise<void> {
      let raw = await readArtifact(artifactPath, "updateResult");
      raw = replaceYamlField(raw, "result_summary", `"${escapeYamlValue(summary)}"`);

      if (artifacts && artifacts.length > 0) {
        for (const artifact of artifacts) {
          // Check for empty array form
          if (/^linked_artifacts: \[\]$/m.test(raw)) {
            raw = raw.replace(
              /^linked_artifacts: \[\]$/m,
              `linked_artifacts:\n  - ${artifact}`,
            );
          } else {
            // Find the end of the linked_artifacts list and append
            const linkedIndex = raw.indexOf("linked_artifacts:\n");
            if (linkedIndex !== -1) {
              // Check if already present
              const existing = raw.match(/^linked_artifacts:\n((?:  - .+\n)*)/m);
              const existingPaths = existing
                ? existing[1]
                  .split("\n")
                  .filter((line) => line.startsWith("  - "))
                  .map((line) => line.replace(/^  - /, "").trim())
                : [];

              if (!existingPaths.includes(artifact)) {
                const afterLinked = raw.slice(linkedIndex + "linked_artifacts:\n".length);
                const nextFieldMatch = afterLinked.match(/^[a-z_]/m);
                const insertionPoint = nextFieldMatch
                  ? linkedIndex + "linked_artifacts:\n".length + (nextFieldMatch.index ?? 0)
                  : raw.length;

                raw =
                  raw.slice(0, insertionPoint) +
                  `  - ${artifact}\n` +
                  raw.slice(insertionPoint);
              }
            }
          }
        }
      }

      await fs.writeFile(artifactPath, raw, "utf-8");
    },
  };
}

// -- Factory --

/**
 * Creates a CommissionRecordOps instance. No dependencies required;
 * this layer is pure filesystem I/O.
 */
export function createCommissionRecordOps(): CommissionRecordOps {
  return createRecordOps();
}
