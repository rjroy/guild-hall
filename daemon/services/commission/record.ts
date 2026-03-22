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
import matter from "gray-matter";
import { replaceYamlField, appendLogEntry } from "@/daemon/lib/record-utils";
import { escapeYamlValue } from "@/daemon/lib/toolbox-utils";
import { spliceBody } from "@/lib/artifacts";
import { isNodeError } from "@/lib/types";
import type { TriggerBlock, TriggeredBy } from "@/daemon/types";

// -- Types --

export interface ScheduleMetadata {
  cron: string;
  repeat: number | null;
  runsCompleted: number;
  lastRun: string | null; // ISO 8601 or null
  lastSpawnedId: string | null;
}

// -- Interface --

export interface CommissionRecordOps {
  readStatus(artifactPath: string): Promise<string>;
  readType(artifactPath: string): Promise<string>;
  writeStatus(artifactPath: string, status: string): Promise<void>;
  appendTimeline(
    artifactPath: string,
    event: string,
    reason: string,
    extra?: Record<string, unknown>,
  ): Promise<void>;
  /** Combines writeStatus + appendTimeline in a single read/write cycle. */
  writeStatusAndTimeline(
    artifactPath: string,
    status: string,
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
  readProgress(artifactPath: string): Promise<string>;
  incrementHaltCount(artifactPath: string): Promise<number>;
  readScheduleMetadata(artifactPath: string): Promise<ScheduleMetadata>;
  writeScheduleFields(
    artifactPath: string,
    updates: Partial<{
      runsCompleted: number;
      lastRun: string;
      lastSpawnedId: string;
      cron: string;
      repeat: number | null;
    }>,
  ): Promise<void>;
  readTriggerMetadata(artifactPath: string): Promise<TriggerBlock>;
  writeTriggerFields(
    artifactPath: string,
    updates: Partial<{
      runs_completed: number;
      last_triggered: string | null;
      last_spawned_id: string | null;
    }>,
  ): Promise<void>;
  readTriggeredBy(artifactPath: string): Promise<TriggeredBy | null>;
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
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new Error(`${operation}: artifact not found at ${artifactPath}`);
    }
    throw err;
  }
}

/**
 * Builds a YAML timeline entry string. Used by appendTimeline and
 * writeStatusAndTimeline to avoid duplicating the formatting logic.
 */
function buildTimelineEntry(
  event: string,
  reason: string,
  extra?: Record<string, unknown>,
): string {
  const now = new Date();
  let entry = `  - timestamp: ${now.toISOString()}\n    event: ${event}\n    reason: "${escapeYamlValue(reason)}"`;

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      entry += `\n    ${key}: "${escapeYamlValue(String(value))}"`;
    }
  }

  return entry;
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

    async readType(artifactPath: string): Promise<string> {
      const raw = await readArtifact(artifactPath, "readType");
      const match = raw.match(/^type: (\S+)$/m);
      // Default to "one-shot" for backward compatibility with artifacts
      // created before the type field was introduced.
      return match ? match[1] : "one-shot";
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
      const entry = buildTimelineEntry(event, reason, extra);
      const updated = appendLogEntry(raw, entry, "current_progress");
      await fs.writeFile(artifactPath, updated, "utf-8");
    },

    async writeStatusAndTimeline(
      artifactPath: string,
      status: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      const raw = await readArtifact(artifactPath, "writeStatusAndTimeline");
      if (!/^status: \S+$/m.test(raw)) {
        throw new Error(`writeStatusAndTimeline: no status field found in ${artifactPath}`);
      }
      let updated = raw.replace(/^status: \S+$/m, `status: ${status}`);
      const entry = buildTimelineEntry(event, reason, extra);
      updated = appendLogEntry(updated, entry, "current_progress");
      await fs.writeFile(artifactPath, updated, "utf-8");
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

    async readProgress(artifactPath: string): Promise<string> {
      const raw = await readArtifact(artifactPath, "readProgress");
      const match = raw.match(/^current_progress: "?(.*?)"?\s*$/m);
      if (!match) return "";
      return match[1];
    },

    async incrementHaltCount(artifactPath: string): Promise<number> {
      let raw = await readArtifact(artifactPath, "incrementHaltCount");
      const match = raw.match(/^halt_count: (\d+)$/m);
      if (match) {
        const newCount = Number(match[1]) + 1;
        raw = raw.replace(/^halt_count: \d+$/m, `halt_count: ${newCount}`);
        await fs.writeFile(artifactPath, raw, "utf-8");
        return newCount;
      }
      // Field doesn't exist yet: insert it before current_progress
      const inserted = raw.replace(
        /^current_progress:/m,
        `halt_count: 1\ncurrent_progress:`,
      );
      if (inserted === raw) {
        // current_progress field missing too; insert before end of frontmatter
        const withField = raw.replace(/^---\s*$/m, `halt_count: 1\n---`);
        await fs.writeFile(artifactPath, withField, "utf-8");
        return 1;
      }
      await fs.writeFile(artifactPath, inserted, "utf-8");
      return 1;
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

      raw = spliceBody(raw, "\n" + summary + "\n");
      await fs.writeFile(artifactPath, raw, "utf-8");
    },

    async readScheduleMetadata(artifactPath: string): Promise<ScheduleMetadata> {
      const raw = await readArtifact(artifactPath, "readScheduleMetadata");

      // Check for the schedule block
      if (!/^schedule:$/m.test(raw)) {
        throw new Error(`readScheduleMetadata: no schedule block found in ${artifactPath}`);
      }

      // Parse individual fields within the schedule block (2-space indented)
      const cronMatch = raw.match(/^  cron: "(.+)"$/m);
      if (!cronMatch) {
        throw new Error(`readScheduleMetadata: no cron field in schedule block of ${artifactPath}`);
      }
      const cron = cronMatch[1];

      const repeatMatch = raw.match(/^  repeat: (.+)$/m);
      const repeatValue = repeatMatch ? repeatMatch[1].trim() : "null";
      const repeat = repeatValue === "null" ? null : Number(repeatValue);

      const runsMatch = raw.match(/^  runs_completed: (.+)$/m);
      const runsCompleted = runsMatch ? Number(runsMatch[1].trim()) : 0;

      const lastRunMatch = raw.match(/^  last_run: (.+)$/m);
      const lastRunValue = lastRunMatch ? lastRunMatch[1].trim() : "null";
      const lastRun = lastRunValue === "null" ? null : lastRunValue;

      const lastSpawnedMatch = raw.match(/^  last_spawned_id: (.+)$/m);
      const lastSpawnedValue = lastSpawnedMatch ? lastSpawnedMatch[1].trim() : "null";
      const lastSpawnedId = lastSpawnedValue === "null" ? null : lastSpawnedValue;

      return { cron, repeat, runsCompleted, lastRun, lastSpawnedId };
    },

    async writeScheduleFields(
      artifactPath: string,
      updates: Partial<{
        runsCompleted: number;
        lastRun: string;
        lastSpawnedId: string;
        cron: string;
        repeat: number | null;
      }>,
    ): Promise<void> {
      let raw = await readArtifact(artifactPath, "writeScheduleFields");

      if (updates.runsCompleted !== undefined) {
        raw = raw.replace(
          /^  runs_completed: .+$/m,
          `  runs_completed: ${updates.runsCompleted}`,
        );
      }

      if (updates.lastRun !== undefined) {
        raw = raw.replace(
          /^  last_run: .+$/m,
          `  last_run: ${updates.lastRun}`,
        );
      }

      if (updates.lastSpawnedId !== undefined) {
        raw = raw.replace(
          /^  last_spawned_id: .+$/m,
          `  last_spawned_id: ${updates.lastSpawnedId}`,
        );
      }

      if (updates.cron !== undefined) {
        raw = raw.replace(
          /^  cron: ".+"$/m,
          `  cron: "${updates.cron}"`,
        );
      }

      if (updates.repeat !== undefined) {
        raw = raw.replace(
          /^  repeat: .+$/m,
          `  repeat: ${updates.repeat}`,
        );
      }

      await fs.writeFile(artifactPath, raw, "utf-8");
    },

    async readTriggerMetadata(artifactPath: string): Promise<TriggerBlock> {
      const raw = await readArtifact(artifactPath, "readTriggerMetadata");

      if (!/^trigger:$/m.test(raw)) {
        throw new Error(`readTriggerMetadata: no trigger block found in ${artifactPath}`);
      }

      // Parse using gray-matter for the match sub-block
      const parsed = matter(raw);
      const trigger = parsed.data.trigger as Record<string, unknown> | undefined;
      if (!trigger) {
        throw new Error(`readTriggerMetadata: no trigger block found in ${artifactPath}`);
      }

      const rawMatch = trigger.match as Record<string, unknown>;
      if (!rawMatch || !rawMatch.type) {
        throw new Error(`readTriggerMetadata: no match rule in trigger block of ${artifactPath}`);
      }

      // gray-matter coerces YAML values (e.g. "true" -> boolean, "123" -> number).
      // Coerce fields values back to strings so micromatch receives valid input.
      const match: TriggerBlock["match"] = {
        type: String(rawMatch.type as string) as TriggerBlock["match"]["type"],
        projectName: rawMatch.projectName ? String(rawMatch.projectName as string) : undefined,
        fields: rawMatch.fields && typeof rawMatch.fields === "object"
          ? Object.fromEntries(Object.entries(rawMatch.fields as Record<string, unknown>).map(([k, v]) => [k, String(v as string)]))
          : undefined,
      };

      return {
        match,
        approval: trigger.approval as TriggerBlock["approval"],
        maxDepth: trigger.maxDepth as number | undefined,
        runs_completed: (trigger.runs_completed as number) ?? 0,
        last_triggered: trigger.last_triggered === null || trigger.last_triggered === undefined
          ? null : trigger.last_triggered instanceof Date
            ? trigger.last_triggered.toISOString() : String(trigger.last_triggered as string),
        last_spawned_id: trigger.last_spawned_id === null || trigger.last_spawned_id === undefined
          ? null : String(trigger.last_spawned_id as string),
      };
    },

    async writeTriggerFields(
      artifactPath: string,
      updates: Partial<{
        runs_completed: number;
        last_triggered: string | null;
        last_spawned_id: string | null;
      }>,
    ): Promise<void> {
      let raw = await readArtifact(artifactPath, "writeTriggerFields");

      if (updates.runs_completed !== undefined) {
        raw = raw.replace(
          /^  runs_completed: .+$/m,
          `  runs_completed: ${updates.runs_completed}`,
        );
      }

      if (updates.last_triggered !== undefined) {
        raw = raw.replace(
          /^  last_triggered: .+$/m,
          `  last_triggered: ${updates.last_triggered ?? "null"}`,
        );
      }

      if (updates.last_spawned_id !== undefined) {
        raw = raw.replace(
          /^  last_spawned_id: .+$/m,
          `  last_spawned_id: ${updates.last_spawned_id ?? "null"}`,
        );
      }

      await fs.writeFile(artifactPath, raw, "utf-8");
    },

    async readTriggeredBy(artifactPath: string): Promise<TriggeredBy | null> {
      try {
        const raw = await fs.readFile(artifactPath, "utf-8");

        if (!/^triggered_by:$/m.test(raw)) {
          return null;
        }

        const parsed = matter(raw);
        const triggeredBy = parsed.data.triggered_by as Record<string, unknown> | undefined;
        if (!triggeredBy) return null;

        const sourceId = triggeredBy.source_id;
        const triggerArtifact = triggeredBy.trigger_artifact;
        const depth = triggeredBy.depth;

        if (typeof sourceId !== "string" || typeof triggerArtifact !== "string" || typeof depth !== "number") {
          return null;
        }

        return { source_id: sourceId, trigger_artifact: triggerArtifact, depth };
      } catch {
        return null;
      }
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
