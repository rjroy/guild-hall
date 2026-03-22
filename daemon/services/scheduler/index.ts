/**
 * Scheduler service for recurring scheduled commissions.
 *
 * Runs on a 60-second interval within the daemon process. Each tick scans
 * all projects for active schedule artifacts, checks whether their cron
 * expression is due, handles overlap prevention and stuck-run escalation,
 * spawns one-shot commissions, and manages auto-completion when repeat
 * counts are reached.
 *
 * Error handling is per-schedule: one schedule throwing does not prevent
 * others from processing. Consecutive failures are tracked in-memory and
 * trigger a transition to "failed" after 3 consecutive ticks.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nextOccurrence, intervalSeconds } from "@/daemon/services/scheduler/cron";
import type { ScheduleLifecycle } from "@/daemon/services/scheduler/schedule-lifecycle";
import type { CommissionRecordOps, ScheduleMetadata } from "@/daemon/services/commission/record";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { AppConfig } from "@/lib/types";
import { integrationWorktreePath } from "@/lib/paths";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { asCommissionId } from "@/daemon/types";

// -- Dependency interface --

export interface SchedulerDeps {
  scheduleLifecycle: ScheduleLifecycle;
  recordOps: CommissionRecordOps;
  commissionSession: CommissionSessionForRoutes;
  createMeetingRequestFn: (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => Promise<void>;
  eventBus: EventBus;
  config: AppConfig;
  guildHallHome: string;
  log?: Log;
}

// -- Constants --

const TICK_INTERVAL_MS = 60_000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// -- Service --

export class SchedulerService {
  private readonly deps: SchedulerDeps;
  private readonly log: Log;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Tracks which lastSpawnedIds have already been escalated to avoid duplicates. */
  private readonly escalatedIds = new Set<string>();

  /** Tracks consecutive tick failures per schedule artifact path. */
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
    this.log = deps.log ?? nullLog("scheduler");
  }

  start(): void {
    // Run initial tick immediately (fire-and-forget with error protection)
    void this.tick();

    this.intervalId = setInterval(() => {
      void this.tick().catch((err: unknown) => {
        this.log.error("Unhandled error in tick:", err);
      });
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Core scheduling loop. Scans all projects for active schedules,
   * evaluates cron timing, handles overlaps, spawns commissions.
   *
   * Public so tests can call it directly without timer management.
   */
  async tick(): Promise<void> {
    const { config, guildHallHome, recordOps } = this.deps;

    for (const project of config.projects) {
      const iPath = integrationWorktreePath(guildHallHome, project.name);
      const commissionsDir = path.join(iPath, ".lore", "commissions");

      let entries: string[];
      try {
        entries = await fs.readdir(commissionsDir);
      } catch {
        continue;
      }

      for (const filename of entries) {
        if (!filename.endsWith(".md")) continue;

        const artifactPath = path.join(commissionsDir, filename);

        // Check if this is a scheduled commission
        let type: string;
        try {
          type = await recordOps.readType(artifactPath);
        } catch {
          continue;
        }
        if (type !== "scheduled") continue;

        // Check if it's active
        let status: string;
        try {
          status = await recordOps.readStatus(artifactPath);
        } catch {
          continue;
        }
        if (status !== "active") continue;

        const scheduleId = filename.replace(/\.md$/, "");

        // Process this schedule, isolated from others
        try {
          await this.processSchedule(artifactPath, scheduleId, project.name);
          // Reset consecutive failure counter on success
          this.consecutiveFailures.delete(artifactPath);
        } catch (err: unknown) {
          this.log.error(
            `Error processing schedule "${scheduleId}":`,
            err,
          );

          const failures = (this.consecutiveFailures.get(artifactPath) ?? 0) + 1;
          this.consecutiveFailures.set(artifactPath, failures);

          if (failures >= CONSECUTIVE_FAILURE_THRESHOLD) {
            try {
              const cId = asCommissionId(scheduleId);
              if (!this.deps.scheduleLifecycle.isTracked(cId)) {
                this.deps.scheduleLifecycle.register(
                  cId,
                  project.name,
                  "active",
                  artifactPath,
                );
              }
              await this.deps.scheduleLifecycle.fail(
                cId,
                `${CONSECUTIVE_FAILURE_THRESHOLD} consecutive tick failures`,
              );
            } catch (failErr: unknown) {
              this.log.error(
                `Failed to transition schedule "${scheduleId}" to failed:`,
                failErr,
              );
            }
            this.consecutiveFailures.delete(artifactPath);
          }
        }
      }
    }
  }

  /**
   * Startup catch-up: spawns at most one commission per active schedule
   * that missed its expected run while the daemon was down.
   *
   * Called once during daemon startup after commission recovery completes.
   * The intent is to restore cadence, not replay every missed run
   * (REQ-SCOM-14). Catch-up spawns record a "commission_spawned_catchup"
   * timeline event with a missed_since field instead of the normal
   * "commission_spawned" event.
   */
  async catchUp(): Promise<void> {
    const { config, guildHallHome, recordOps } = this.deps;
    const now = new Date();

    for (const project of config.projects) {
      const iPath = integrationWorktreePath(guildHallHome, project.name);
      const commissionsDir = path.join(iPath, ".lore", "commissions");

      let entries: string[];
      try {
        entries = await fs.readdir(commissionsDir);
      } catch {
        continue;
      }

      for (const filename of entries) {
        if (!filename.endsWith(".md")) continue;

        const artifactPath = path.join(commissionsDir, filename);

        let type: string;
        try {
          type = await recordOps.readType(artifactPath);
        } catch {
          continue;
        }
        if (type !== "scheduled") continue;

        let status: string;
        try {
          status = await recordOps.readStatus(artifactPath);
        } catch {
          continue;
        }
        if (status !== "active") continue;

        const scheduleId = filename.replace(/\.md$/, "");

        try {
          const metadata = await recordOps.readScheduleMetadata(artifactPath);

          // A schedule that has never run can't have missed a run.
          // The normal tick loop will handle the first firing.
          if (!metadata.lastRun) continue;

          const lastRunDate = new Date(metadata.lastRun);
          const next = nextOccurrence(metadata.cron, lastRunDate);
          if (!next) continue;
          if (now < next) continue; // Not overdue

          // Overlap prevention: skip if last spawned commission is still active
          if (metadata.lastSpawnedId) {
            const stillActive = await this.isSpawnedCommissionActive(
              metadata.lastSpawnedId,
              project.name,
            );
            if (stillActive) continue;
          }

          // Spawn exactly one catch-up commission
          await this.spawnFromSchedule({
            artifactPath,
            scheduleId,
            projectName: project.name,
            metadata,
            eventType: "commission_spawned_catchup",
            extraTimelineFields: { missed_since: next.toISOString() },
          });
        } catch (err: unknown) {
          this.log.error(
            `Error during catch-up for schedule "${scheduleId}":`,
            err,
          );
        }
      }
    }
  }

  // -- Per-schedule processing --

  private async processSchedule(
    artifactPath: string,
    scheduleId: string,
    projectName: string,
  ): Promise<void> {
    const { recordOps } = this.deps;

    // 1. Read schedule metadata
    const metadata: ScheduleMetadata = await recordOps.readScheduleMetadata(artifactPath);

    // 2. Compute next occurrence
    let lastRunDate: Date;
    if (metadata.lastRun) {
      lastRunDate = new Date(metadata.lastRun);
    } else {
      // Fall back to the artifact's date field
      const dateStr = this.readArtifactField(await fs.readFile(artifactPath, "utf-8"), "date");
      lastRunDate = dateStr ? new Date(dateStr) : new Date(0);
    }

    const next = nextOccurrence(metadata.cron, lastRunDate);
    if (!next) return; // Invalid cron expression

    const now = new Date();
    if (now < next) return; // Not due yet

    // 3. Overlap check
    if (metadata.lastSpawnedId) {
      const stillActive = await this.isSpawnedCommissionActive(
        metadata.lastSpawnedId,
        projectName,
      );

      if (stillActive) {
        // Stuck run check
        const cadenceSeconds = intervalSeconds(metadata.cron);
        const spawnedStatus = await this.getSpawnedCommissionCreatedDate(
          metadata.lastSpawnedId,
          projectName,
        );
        if (spawnedStatus) {
          const activeForSeconds = (now.getTime() - spawnedStatus.getTime()) / 1000;
          if (
            activeForSeconds > 2 * cadenceSeconds &&
            !this.escalatedIds.has(metadata.lastSpawnedId)
          ) {
            // Escalate
            const worker = this.readArtifactField(
              await fs.readFile(artifactPath, "utf-8"),
              "worker",
            );
            await this.deps.createMeetingRequestFn({
              projectName,
              workerName: worker ?? "unknown",
              reason: `Scheduled commission "${scheduleId}" has a stuck run: "${metadata.lastSpawnedId}" has been active for ${Math.round(activeForSeconds / 60)} minutes (cadence is ${Math.round(cadenceSeconds / 60)} minutes)`,
            });

            await recordOps.appendTimeline(
              artifactPath,
              "escalation_created",
              `Stuck run escalated: ${metadata.lastSpawnedId}`,
              {
                stuck_commission_id: metadata.lastSpawnedId,
                running_since: spawnedStatus.toISOString(),
              },
            );

            this.escalatedIds.add(metadata.lastSpawnedId);
          }
        }

        // Skip this schedule for this tick (overlap)
        return;
      }
    }

    // 4. Spawn
    await this.spawnFromSchedule({
      artifactPath,
      scheduleId,
      projectName,
      metadata,
      eventType: "commission_spawned",
    });
  }

  /**
   * Shared spawn logic used by both processSchedule() (tick-based) and
   * catchUp() (startup catch-up). Creates a one-shot commission from a
   * schedule artifact, dispatches it, updates metadata, writes a timeline
   * entry, emits an event, and checks auto-completion.
   *
   * The eventType and extraTimelineFields parameters let callers distinguish
   * between normal tick spawns and catch-up spawns in the timeline.
   */
  private async spawnFromSchedule(params: {
    artifactPath: string;
    scheduleId: string;
    projectName: string;
    metadata: ScheduleMetadata;
    eventType: string;
    extraTimelineFields?: Record<string, string>;
  }): Promise<void> {
    const { artifactPath, scheduleId, projectName, metadata, eventType, extraTimelineFields } = params;
    const { recordOps, commissionSession, eventBus, scheduleLifecycle } = this.deps;

    // Read worker and prompt from artifact
    const raw = await fs.readFile(artifactPath, "utf-8");
    const worker = this.readArtifactField(raw, "worker");
    const prompt = this.readArtifactField(raw, "prompt");

    if (!worker || !prompt) {
      throw new Error(
        `Schedule "${scheduleId}" missing worker or prompt field`,
      );
    }

    // Read optional fields for createCommission
    const dependencies = await recordOps.readDependencies(artifactPath);

    // Read resource overrides from the indented resource_overrides block
    const resourceOverrides = this.readResourceOverrides(raw);

    // Create a one-shot commission
    const { commissionId: spawnedIdStr } = await commissionSession.createCommission(
      projectName,
      `Scheduled run of ${scheduleId}`,
      worker,
      prompt,
      dependencies,
      Object.keys(resourceOverrides).length > 0 ? resourceOverrides : undefined,
      { type: "one-shot", sourceSchedule: scheduleId },
    );

    // Dispatch the spawned commission
    const spawnedId = asCommissionId(spawnedIdStr);
    await commissionSession.dispatchCommission(spawnedId);

    // Update schedule metadata
    const newRunsCompleted = metadata.runsCompleted + 1;
    const nowIso = new Date().toISOString();

    await recordOps.writeScheduleFields(artifactPath, {
      runsCompleted: newRunsCompleted,
      lastRun: nowIso,
      lastSpawnedId: spawnedIdStr,
    });

    // Read previous run's outcome for the timeline entry (REQ-SCOM-16)
    let previousRunOutcome: string | null = null;
    if (metadata.lastSpawnedId) {
      previousRunOutcome = await this.getSpawnedCommissionStatus(
        metadata.lastSpawnedId,
        projectName,
      );
    }

    // Timeline entry
    const timelineExtra: Record<string, unknown> = {
      spawned_id: spawnedIdStr,
      run_number: String(newRunsCompleted),
      ...extraTimelineFields,
    };
    if (previousRunOutcome) {
      timelineExtra.previous_run_outcome = previousRunOutcome;
    }
    await recordOps.appendTimeline(
      artifactPath,
      eventType,
      `Spawned commission ${spawnedIdStr}`,
      timelineExtra,
    );

    // Emit event
    eventBus.emit({
      type: "schedule_spawned",
      scheduleId,
      spawnedId: spawnedIdStr,
      projectName,
      runNumber: newRunsCompleted,
    });

    // Auto-completion check
    if (metadata.repeat !== null && newRunsCompleted >= metadata.repeat) {
      const cId = asCommissionId(scheduleId);
      if (!scheduleLifecycle.isTracked(cId)) {
        scheduleLifecycle.register(cId, projectName, "active", artifactPath);
      }
      await scheduleLifecycle.complete(
        cId,
        `Repeat count reached: ${newRunsCompleted}/${metadata.repeat}`,
      );
    }
  }

  // -- Helpers --

  /**
   * Reads a single YAML field value from raw artifact content.
   * Handles quoted strings: `prompt: "some text"` returns `some text`.
   */
  private readArtifactField(raw: string, fieldName: string): string | null {
    const match = raw.match(new RegExp("^" + fieldName + ": (.+)$", "m"));
    if (!match) return null;

    let value = match[1].trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }

  /**
   * Reads the resource_overrides block from a schedule artifact.
   * Fields are 2-space indented under "resource_overrides:".
   */
  private readResourceOverrides(raw: string): { model?: string } {
    const result: { model?: string } = {};

    if (!/^resource_overrides:$/m.test(raw)) return result;

    const modelMatch = raw.match(/^ {2}model: (.+)$/m);
    if (modelMatch) result.model = modelMatch[1].trim();

    return result;
  }

  /**
   * Checks whether a spawned commission is still actively running.
   * "Still active" means dispatched or in_progress.
   */
  private async isSpawnedCommissionActive(
    spawnedId: string,
    projectName: string,
  ): Promise<boolean> {
    const { guildHallHome, recordOps } = this.deps;
    const iPath = integrationWorktreePath(guildHallHome, projectName);
    const artifactPath = path.join(
      iPath,
      ".lore",
      "commissions",
      `${spawnedId}.md`,
    );

    try {
      const status = await recordOps.readStatus(artifactPath);
      return status === "dispatched" || status === "in_progress";
    } catch {
      // Artifact not found or unreadable: treat as not active
      return false;
    }
  }

  /**
   * Returns the status string of a spawned commission, or null if unreadable.
   */
  private async getSpawnedCommissionStatus(
    spawnedId: string,
    projectName: string,
  ): Promise<string | null> {
    const { guildHallHome, recordOps } = this.deps;
    const iPath = integrationWorktreePath(guildHallHome, projectName);
    const artifactPath = path.join(
      iPath,
      ".lore",
      "commissions",
      `${spawnedId}.md`,
    );

    try {
      return await recordOps.readStatus(artifactPath);
    } catch {
      return null;
    }
  }

  /**
   * Returns the creation date of a spawned commission for stuck-run timing.
   * Reads the `date` field from the artifact.
   */
  private async getSpawnedCommissionCreatedDate(
    spawnedId: string,
    projectName: string,
  ): Promise<Date | null> {
    const { guildHallHome } = this.deps;
    const iPath = integrationWorktreePath(guildHallHome, projectName);
    const artifactPath = path.join(
      iPath,
      ".lore",
      "commissions",
      `${spawnedId}.md`,
    );

    try {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const dateStr = this.readArtifactField(raw, "date");
      if (!dateStr) return null;
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }
}
