/**
 * Trigger evaluator: event-driven commission creation.
 *
 * Contains the template variable expansion utility (REQ-TRIG-10, 11, 12)
 * and the trigger evaluator service (REQ-TRIG-27 through 32).
 *
 * The trigger evaluator follows the notification service consumer pattern:
 * receives the Event Router, registers subscriptions per active trigger,
 * fire-and-forget async handlers. The key additions are depth tracking,
 * source exclusion, approval downgrades, and template expansion.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SystemEvent } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import type { EventRouter } from "@/daemon/services/event-router";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { TriggerBlock, TriggeredBy, CommissionId } from "@/daemon/types";
import type { AppConfig } from "@/lib/types";
import { integrationWorktreePath } from "@/lib/paths";
import matter from "gray-matter";

// -- Template expansion --

/**
 * Expands `{{fieldName}}` placeholders in a template string using
 * top-level fields from the event object.
 *
 * - String values substitute directly.
 * - Array values are joined with commas.
 * - Missing or undefined fields expand to empty string.
 * - No nested access: `{{foo.bar}}` is treated as a field named "foo.bar".
 */
export function expandTemplate(template: string, event: SystemEvent): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, fieldName: string) => {
    const record = event as Record<string, unknown>;
    const value = record[fieldName];

    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return (value as string[]).join(",");
    return String(value as string | number | boolean);
  });
}

// -- Trigger artifact reading --

/** Fields read from a trigger artifact's frontmatter for commission creation. */
interface TriggerArtifactData {
  title: string;
  worker: string;
  prompt: string;
  dependencies: string[];
  trigger: TriggerBlock;
}

/**
 * Reads the fields needed from a trigger artifact to create a commission.
 * Uses gray-matter for full frontmatter parsing since we need multiple fields.
 */
export async function readTriggerArtifact(artifactPath: string): Promise<TriggerArtifactData> {
  const raw = await fs.readFile(artifactPath, "utf-8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const trigger = data.trigger as Record<string, unknown> | undefined;
  if (!trigger || !trigger.match) {
    throw new Error(`readTriggerArtifact: no trigger.match in ${artifactPath}`);
  }

  // gray-matter coerces YAML values (e.g. "true" -> boolean, "123" -> number).
  // Coerce fields values back to strings so micromatch receives valid input.
  const rawMatch = trigger.match as Record<string, unknown>;
  const match: TriggerBlock["match"] = {
    type: String(rawMatch.type as string) as TriggerBlock["match"]["type"],
    projectName: rawMatch.projectName ? String(rawMatch.projectName as string) : undefined,
    fields: rawMatch.fields && typeof rawMatch.fields === "object"
      ? Object.fromEntries(Object.entries(rawMatch.fields as Record<string, unknown>).map(([k, v]) => [k, String(v as string)]))
      : undefined,
  };
  const triggerBlock: TriggerBlock = {
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

  // Parse dependencies: can be [] or a list of strings
  let dependencies: string[] = [];
  if (Array.isArray(data.dependencies)) {
    dependencies = data.dependencies.map(String);
  }

  return {
    title: String((data.title as string) ?? ""),
    worker: String((data.worker as string) ?? ""),
    prompt: String((data.prompt as string) ?? ""),
    dependencies,
    trigger: triggerBlock,
  };
}

// -- Source ID extraction --

/**
 * Extracts the source context ID from an event for provenance tracking.
 * Returns { sourceId, isCommissionSource }.
 */
function extractSourceInfo(event: SystemEvent, log: Log): { sourceId: string; isCommissionSource: boolean } {
  const record = event as Record<string, unknown>;

  if (event.type === "commission_status" || event.type === "commission_result") {
    return { sourceId: String((record.commissionId as string) ?? ""), isCommissionSource: true };
  }
  if (event.type === "schedule_spawned") {
    return { sourceId: String((record.scheduleId as string) ?? ""), isCommissionSource: false };
  }
  if (event.type === "meeting_ended") {
    return { sourceId: String((record.meetingId as string) ?? ""), isCommissionSource: false };
  }

  log.warn(`unknown event type for source ID extraction: ${event.type}`);
  return { sourceId: "", isCommissionSource: false };
}

// -- Trigger evaluator service --

export interface TriggerEvaluatorDeps {
  router: EventRouter;
  recordOps: CommissionRecordOps;
  commissionSession: CommissionSessionForRoutes;
  config: AppConfig;
  guildHallHome: string;
  log: Log;
}

export interface TriggerEvaluator {
  /** Scan all projects and register subscriptions for active triggers. */
  initialize(): Promise<void>;
  /** Register a subscription for a new or resumed trigger. */
  registerTrigger(artifactPath: string, projectName: string): Promise<void>;
  /** Remove subscription for a paused/completed trigger. */
  unregisterTrigger(commissionId: string): void;
  /** Cleanup: unsubscribe all handlers. */
  shutdown(): void;
}

export function createTriggerEvaluator(deps: TriggerEvaluatorDeps): TriggerEvaluator {
  const { router, recordOps, commissionSession, config, guildHallHome, log } = deps;

  // Map of commissionId -> unsubscribe callback
  const subscriptions = new Map<string, () => void>();

  /**
   * Core trigger dispatch handler. Created per-trigger via closure over
   * the trigger's artifact path, project name, and metadata.
   */
  function createHandler(
    artifactPath: string,
    projectName: string,
    triggerData: TriggerArtifactData,
  ): (event: SystemEvent) => void {
    const commissionId = path.basename(artifactPath, ".md");
    const triggerArtifactName = commissionId;

    return (event: SystemEvent) => {
      // Fire-and-forget async (REQ-TRIG-31)
      void (async () => {
        try {
          // 1. Extract source info
          const { sourceId, isCommissionSource } = extractSourceInfo(event, log);

          // 2. Read source commission artifact for depth and source exclusion
          let sourceTriggeredBy: TriggeredBy | null = null;
          if (isCommissionSource && sourceId) {
            const iPath = integrationWorktreePath(guildHallHome, projectName);
            const sourceArtifactPath = path.join(iPath, ".lore", "commissions", `${sourceId}.md`);
            try {
              sourceTriggeredBy = await recordOps.readTriggeredBy(sourceArtifactPath);
            } catch {
              // Fail-open: default depth 1, skip source exclusion (REQ-TRIG-19, 24)
              log.debug(`could not read source artifact for ${sourceId}, defaulting depth to 1`);
            }
          }

          // 3. Source exclusion check (REQ-TRIG-23)
          if (sourceTriggeredBy && sourceTriggeredBy.trigger_artifact === triggerArtifactName) {
            log.debug(`source exclusion: ${sourceId} was created by this trigger, skipping`);
            return;
          }

          // 4. Depth computation (REQ-TRIG-18)
          let depth: number;
          if (!isCommissionSource) {
            depth = 1;
          } else if (sourceTriggeredBy) {
            depth = sourceTriggeredBy.depth + 1;
          } else {
            depth = 1;
          }

          // 5. Determine effective approval (REQ-TRIG-13, 21, 22)
          const configuredApproval = triggerData.trigger.approval ?? "confirm";
          const maxDepth = triggerData.trigger.maxDepth ?? 3;
          let effectiveApproval = configuredApproval;
          const depthLimitReached = depth > maxDepth;
          if (depthLimitReached) {
            effectiveApproval = "confirm";
          }

          // 6. Template expansion (REQ-TRIG-10)
          const expandedPrompt = expandTemplate(triggerData.prompt, event);
          const expandedTitle = expandTemplate(
            triggerData.title || `Triggered: ${triggerArtifactName}`,
            event,
          );
          const expandedDeps = triggerData.dependencies.map((d) => expandTemplate(d, event));

          // Skip if essential fields are empty after expansion (REQ-TRIG-12)
          if (!expandedPrompt || !triggerData.worker) {
            log.warn(`trigger "${triggerArtifactName}": empty prompt or worker after expansion, skipping`);
            return;
          }

          // 7. Commission creation (REQ-TRIG-33)
          const result = await commissionSession.createCommission(
            projectName,
            expandedTitle,
            triggerData.worker,
            expandedPrompt,
            expandedDeps.length > 0 ? expandedDeps : undefined,
            undefined,
            {
              type: "triggered" as const,
              sourceTrigger: {
                triggerArtifact: triggerArtifactName,
                sourceId,
                depth,
              },
            },
          );

          const spawnedId = result.commissionId;

          // 8. Depth limit downgrade timeline entry (REQ-TRIG-22)
          if (depthLimitReached) {
            const iPath = integrationWorktreePath(guildHallHome, projectName);
            const spawnedArtifactPath = path.join(iPath, ".lore", "commissions", `${spawnedId}.md`);
            try {
              await recordOps.appendTimeline(
                spawnedArtifactPath,
                "depth_limit",
                `Depth limit reached (depth ${depth} > maxDepth ${maxDepth}). Created with approval: confirm.`,
              );
            } catch (err) {
              log.warn(`failed to append depth limit timeline for ${spawnedId}:`, err instanceof Error ? err.message : String(err));
            }
          }

          // 9. Conditional dispatch (REQ-TRIG-13, 14, 15)
          if (effectiveApproval === "auto") {
            try {
              // createCommission returns a plain string; dispatchCommission expects a branded CommissionId.
              // The value is the same, but the type system doesn't know that.
              await commissionSession.dispatchCommission(spawnedId as unknown as CommissionId);
            } catch (err) {
              log.warn(`dispatch failed for triggered commission ${spawnedId}:`, err instanceof Error ? err.message : String(err));
            }
          }

          // 10. Update trigger artifact state (REQ-TRIG-25, 26)
          const firedAt = new Date().toISOString();
          try {
            await recordOps.writeTriggerFields(artifactPath, {
              runs_completed: triggerData.trigger.runs_completed + 1,
              last_triggered: firedAt,
              last_spawned_id: spawnedId,
            });
            await recordOps.appendTimeline(
              artifactPath,
              "fired",
              `Trigger fired: spawned ${spawnedId} (source: ${sourceId}, depth: ${depth})`,
            );
          } catch (err) {
            log.warn(`failed to update trigger state for ${triggerArtifactName}:`, err instanceof Error ? err.message : String(err));
          }

          // Mutate the captured data so subsequent firings use the updated count
          triggerData.trigger.runs_completed += 1;
          triggerData.trigger.last_triggered = firedAt;
          triggerData.trigger.last_spawned_id = spawnedId;

          log.info(`trigger "${triggerArtifactName}" fired: created ${spawnedId} (depth: ${depth}, approval: ${effectiveApproval})`);
        } catch (err) {
          log.warn(
            `trigger handler failed for "${path.basename(artifactPath, ".md")}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    };
  }

  return {
    async initialize(): Promise<void> {
      log.info("scanning projects for active triggers");

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
          if (type !== "triggered") continue;

          let status: string;
          try {
            status = await recordOps.readStatus(artifactPath);
          } catch {
            continue;
          }
          if (status !== "active") continue;

          try {
            await this.registerTrigger(artifactPath, project.name);
          } catch (err) {
            log.warn(
              `failed to register trigger "${filename}":`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      }

      log.info(`initialized with ${subscriptions.size} active trigger(s)`);
    },

    async registerTrigger(artifactPath: string, projectName: string): Promise<void> {
      const commissionId = path.basename(artifactPath, ".md");

      // Read the full trigger artifact data
      const triggerData = await readTriggerArtifact(artifactPath);

      // Create the handler with closed-over data
      const handler = createHandler(artifactPath, projectName, triggerData);

      // Subscribe to the router with the trigger's match rule
      const unsub = router.subscribe(triggerData.trigger.match, handler);

      // Store the unsubscribe callback
      subscriptions.set(commissionId, unsub);

      log.info(`registered trigger "${commissionId}" (match type: ${triggerData.trigger.match.type})`);
    },

    unregisterTrigger(commissionId: string): void {
      const unsub = subscriptions.get(commissionId);
      if (unsub) {
        unsub();
        subscriptions.delete(commissionId);
        log.info(`unregistered trigger "${commissionId}"`);
      }
    },

    shutdown(): void {
      for (const [id, unsub] of subscriptions) {
        unsub();
        log.debug(`shutdown: unsubscribed trigger "${id}"`);
      }
      subscriptions.clear();
      log.info("trigger evaluator shut down");
    },
  };
}
