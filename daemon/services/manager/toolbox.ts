/**
 * Manager toolbox: exclusive tools for the Guild Master worker.
 *
 * Provides ten tools for project coordination:
 * - create_commission: create (and optionally dispatch) a new commission
 * - dispatch_commission: dispatch an existing pending commission
 * - cancel_commission: cancel an active or pending commission
 * - abandon_commission: abandon a commission with a required reason
 * - create_pr: push claude/main and open a PR on the hosting platform
 * - initiate_meeting: create a meeting request artifact
 * - add_commission_note: annotate a commission with a manager note
 * - sync_project: post-merge sync (detect merged PRs, reset claude branch)
 * - create_scheduled_commission: create a recurring scheduled commission
 * - update_schedule: update schedule config or transition schedule status
 *
 * Follows the same MCP server factory pattern as commission-toolbox.ts and
 * meeting-toolbox.ts.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { asCommissionId } from "@/daemon/types";
import type { ToolResult, ScheduledCommissionStatus } from "@/daemon/types";
import { formatTimestamp, escapeYamlValue, errorMessage, sanitizeForGitRef } from "@/daemon/lib/toolbox-utils";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { EventBus } from "@/daemon/lib/event-bus";
import { CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { withProjectLock } from "@/daemon/lib/project-lock";
import { hasActiveActivities, syncProject } from "@/cli/rebase";
import type { SyncResult } from "@/cli/rebase";
import { isValidModel } from "@/lib/types";
import type { ProjectConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import { getWorkerByName } from "@/lib/packages";
import { integrationWorktreePath } from "@/lib/paths";
import type { ToolboxFactory } from "@/daemon/services/toolbox-types";
import type { ScheduleLifecycle } from "@/daemon/services/scheduler/schedule-lifecycle";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import { isValidCron } from "@/daemon/services/scheduler/cron";

export interface ManagerToolboxDeps {
  projectName: string;
  guildHallHome: string;
  commissionSession: CommissionSessionForRoutes;
  eventBus: EventBus;
  gitOps: GitOps;
  getProjectConfig: (name: string) => Promise<ProjectConfig | undefined>;
  scheduleLifecycle?: ScheduleLifecycle;
  recordOps?: CommissionRecordOps;
  packages?: DiscoveredPackage[];
}

/**
 * Sanitizes a string for use in filenames: lowercases, replaces whitespace
 * and non-alphanumeric characters with hyphens, collapses consecutive
 * hyphens, and trims leading/trailing hyphens. Truncates to maxLen chars.
 */
function sanitizeForFilename(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen)
    .replace(/-$/g, "");
}

// -- Tool handler factories --

export function makeCreateCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    title: string;
    workerName: string;
    prompt: string;
    dependencies?: string[];
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
    dispatch?: boolean;
  }): Promise<ToolResult> => {
    try {
      const { commissionId } = await deps.commissionSession.createCommission(
        deps.projectName,
        args.title,
        args.workerName,
        args.prompt,
        args.dependencies,
        args.resourceOverrides,
      );

      const shouldDispatch = args.dispatch !== false;
      let dispatched = false;

      if (shouldDispatch) {
        const cid = asCommissionId(commissionId);

        try {
          await deps.commissionSession.dispatchCommission(cid);
          dispatched = true;
        } catch (dispatchErr: unknown) {
          // createCommission succeeded but dispatch failed. Return the
          // commission ID so the manager LLM can dispatch separately.
          console.error(
            `[manager-toolbox] Failed to dispatch commission "${commissionId}":`,
            errorMessage(dispatchErr),
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  commissionId,
                  dispatched: false,
                  error: errorMessage(dispatchErr),
                }),
              },
            ],
            isError: true,
          };
        }

      }

      console.log(
        `[manager-toolbox] Created commission "${args.title}" (id: ${commissionId}, dispatched: ${dispatched})`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId, dispatched }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to create commission "${args.title}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

export function makeDispatchCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: { commissionId: string }): Promise<ToolResult> => {
    try {
      const cid = asCommissionId(args.commissionId);
      await deps.commissionSession.dispatchCommission(cid);

      console.log(
        `[manager-toolbox] Dispatched commission "${args.commissionId}"`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId: args.commissionId, dispatched: true }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to dispatch commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Zod schema for the PR marker file written to
 * `<guildHallHome>/state/pr-pending/<projectName>.json`.
 * Used by post-merge sync to detect that a PR was created through Guild Hall.
 */
export interface PrMarker {
  claudeMainTip: string;
  createdAt: string;
  prUrl: string;
}

export function makeCreatePrHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    title: string;
    body?: string;
  }): Promise<ToolResult> => {
    try {
      return await withProjectLock(deps.projectName, async () => {
        // 0. Look up project config to get repoPath and defaultBranch
        const project = await deps.getProjectConfig(deps.projectName);
        if (!project) {
          return {
            content: [
              {
                type: "text",
                text: `Project "${deps.projectName}" is not registered. Check the project name and try again.`,
              },
            ],
            isError: true,
          } as ToolResult;
        }
        const repoPath = project.path;
        const defaultBranch = project.defaultBranch ?? "master";

        // 1. Block if any active commissions or meetings exist
        const active = await hasActiveActivities(deps.guildHallHome, deps.projectName);
        if (active) {
          return {
            content: [
              {
                type: "text",
                text: "Cannot create PR: active commissions or open meetings exist for this project. " +
                  "Complete or cancel all active work before creating a PR.",
              },
            ],
            isError: true,
          } as ToolResult;
        }

        // 2. Fetch to ensure local view of origin is current
        await deps.gitOps.fetch(repoPath);

        // 3. Push claude/main to origin
        await deps.gitOps.push(repoPath, CLAUDE_BRANCH);

        // 4. Create the PR via gh CLI
        const body = args.body ?? "";
        const { url } = await deps.gitOps.createPullRequest(
          repoPath,
          defaultBranch,
          CLAUDE_BRANCH,
          args.title,
          body,
        );

        // 5. Record the current claude/main tip so post-merge sync can detect
        //    that this PR was created through Guild Hall.
        const claudeMainTip = await deps.gitOps.revParse(
          repoPath,
          CLAUDE_BRANCH,
        );

        const markerDir = path.join(deps.guildHallHome, "state", "pr-pending");
        await fs.mkdir(markerDir, { recursive: true });

        const marker: PrMarker = {
          claudeMainTip,
          createdAt: new Date().toISOString(),
          prUrl: url,
        };

        await fs.writeFile(
          path.join(markerDir, `${deps.projectName}.json`),
          JSON.stringify(marker, null, 2),
          "utf-8",
        );

        console.log(
          `[manager-toolbox] Created PR for "${deps.projectName}": ${url}`,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ url }),
            },
          ],
        } as ToolResult;
      });
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to create PR for "${deps.projectName}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

export function makeInitiateMeetingHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    workerName: string;
    reason: string;
    referencedArtifacts?: string[];
  }): Promise<ToolResult> => {
    try {
      const now = new Date();
      const ts = formatTimestamp(now);
      const sanitizedReason = sanitizeForFilename(args.reason);
      const meetingFilename = `meeting-request-${ts}-${sanitizedReason}`;

      const dateStr = now.toISOString().split("T")[0];
      const isoStr = now.toISOString();

      const linkedArtifacts = args.referencedArtifacts ?? [];
      const linkedYaml =
        linkedArtifacts.length === 0
          ? "linked_artifacts: []"
          : "linked_artifacts:\n" +
            linkedArtifacts.map((a) => `  - ${a}`).join("\n");

      const escapedTitle = escapeYamlValue(`Meeting request: ${args.reason}`);
      const escapedAgenda = escapeYamlValue(args.reason);

      const content = `---
title: "${escapedTitle}"
date: ${dateStr}
status: requested
tags: [meeting]
worker: ${args.workerName}
workerDisplayTitle: "${args.workerName}"
agenda: "${escapedAgenda}"
deferred_until: ""
${linkedYaml}
meeting_log:
  - timestamp: ${isoStr}
    event: requested
    reason: "Guild Master initiated meeting request"
---
`;

      const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
      const meetingsDir = path.join(intPath, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });

      const artifactPath = path.join(meetingsDir, `${meetingFilename}.md`);
      await fs.writeFile(artifactPath, content, "utf-8");

      // Commit to claude/main under the project lock
      const meetingId = meetingFilename;
      try {
        await withProjectLock(deps.projectName, async () => {
          await deps.gitOps.commitAll(
            intPath,
            `Add meeting request: ${meetingId}`,
          );
        });
      } catch (commitErr: unknown) {
        console.error(
          `[manager-toolbox] Failed to commit meeting request "${meetingId}":`,
          errorMessage(commitErr),
        );
        return {
          content: [
            {
              type: "text",
              text: `Meeting request file was written but commit failed: ${errorMessage(commitErr)}`,
            },
          ],
          isError: true,
        };
      }

      // Return path relative to integration worktree's .lore/
      const relativePath = path.relative(
        path.join(intPath, ".lore"),
        artifactPath,
      );

      console.log(
        `[manager-toolbox] Created meeting request for "${args.workerName}" (artifact: ${relativePath})`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ artifactPath: relativePath }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to create meeting request for "${args.workerName}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

export function makeAddCommissionNoteHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    commissionId: string;
    content: string;
  }): Promise<ToolResult> => {
    try {
      const cid = asCommissionId(args.commissionId);
      await deps.commissionSession.addUserNote(cid, args.content);

      console.log(
        `[manager-toolbox] Added note to commission "${args.commissionId}"`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId: args.commissionId, noted: true }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to add note to commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

export function makeCancelCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    commissionId: string;
    reason?: string;
  }): Promise<ToolResult> => {
    try {
      const cid = asCommissionId(args.commissionId);
      const reason = args.reason ?? "Commission cancelled by manager";
      await deps.commissionSession.cancelCommission(cid, reason);

      console.log(
        `[manager-toolbox] Cancelled commission "${args.commissionId}"`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId: args.commissionId, status: "cancelled" }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to cancel commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

export function makeAbandonCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    commissionId: string;
    reason: string;
  }): Promise<ToolResult> => {
    try {
      const cid = asCommissionId(args.commissionId);
      await deps.commissionSession.abandonCommission(cid, args.reason);

      console.log(
        `[manager-toolbox] Abandoned commission "${args.commissionId}"`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId: args.commissionId, status: "abandoned" }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to abandon commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

// -- sync_project --

/**
 * Translates a SyncResult into a human-readable summary for the LLM.
 */
function describeSyncResult(result: SyncResult, projectName: string): string {
  switch (result.action) {
    case "reset":
      return `Merged PR detected for "${projectName}". Claude branch has been reset to match the remote default branch. (${result.reason})`;
    case "rebase":
      return `Claude branch for "${projectName}" has been rebased onto the latest default branch. (${result.reason})`;
    case "merge":
      return `Claude branch for "${projectName}" has been merged and compacted onto the remote default branch. (${result.reason})`;
    case "skip":
      return `Sync skipped for "${projectName}": active commissions or meetings are in progress. Complete or cancel active work first.`;
    case "noop":
      return `No sync needed for "${projectName}": ${result.reason}.`;
  }
}

export function makeSyncProjectHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: { projectName: string }): Promise<ToolResult> => {
    try {
      // Look up the project config to validate it exists and get its path
      const project = await deps.getProjectConfig(args.projectName);

      if (!project) {
        return {
          content: [
            {
              type: "text",
              text: `Project "${args.projectName}" is not registered. Check the project name and try again.`,
            },
          ],
          isError: true,
        };
      }

      // syncProject() already wraps itself in withProjectLock()
      const result = await syncProject(
        project.path,
        args.projectName,
        deps.guildHallHome,
        deps.gitOps,
        project.defaultBranch,
      );

      const summary = describeSyncResult(result, args.projectName);

      console.log(
        `[manager-toolbox] sync_project "${args.projectName}": ${result.action} (${result.reason})`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ action: result.action, summary }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to sync project "${args.projectName}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

// -- Scheduled commission tools --

export function makeCreateScheduledCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    title: string;
    workerName: string;
    prompt: string;
    cron: string;
    repeat?: number | null;
    dependencies?: string[];
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
  }): Promise<ToolResult> => {
    try {
      // Validate worker exists
      const workerPkg = getWorkerByName(deps.packages ?? [], args.workerName);
      if (!workerPkg) {
        return {
          content: [
            {
              type: "text",
              text: `Worker "${args.workerName}" not found in discovered packages`,
            },
          ],
          isError: true,
        };
      }
      const workerMeta = workerPkg.metadata as WorkerMetadata;

      // Validate model if provided
      if (args.resourceOverrides?.model && !isValidModel(args.resourceOverrides.model)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid model name: "${args.resourceOverrides.model}". Valid models: opus, sonnet, haiku`,
            },
          ],
          isError: true,
        };
      }

      // Validate cron expression
      if (!isValidCron(args.cron)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid cron expression: "${args.cron}". Must be a valid 5-field cron expression.`,
            },
          ],
          isError: true,
        };
      }

      // Generate commission ID (same pattern as orchestrator.ts)
      const now = new Date();
      const safeName = sanitizeForGitRef(workerMeta.identity.name);
      const ts = formatTimestamp(now);
      const commissionId = `commission-${safeName}-${ts}`;

      const dateStr = now.toISOString().split("T")[0];
      const isoStr = now.toISOString();

      const escapedTitle = escapeYamlValue(args.title);
      const escapedPrompt = escapeYamlValue(args.prompt);
      const escapedDisplayTitle = escapeYamlValue(workerMeta.identity.displayTitle);

      const depsYaml =
        args.dependencies && args.dependencies.length > 0
          ? "\n" + args.dependencies.map((d) => `  - ${d}`).join("\n")
          : " []";

      const repeatValue = args.repeat ?? null;

      const resourceLines =
        args.resourceOverrides &&
        (args.resourceOverrides.maxTurns !== undefined ||
          args.resourceOverrides.maxBudgetUsd !== undefined ||
          args.resourceOverrides.model !== undefined)
          ? `resource_overrides:\n${
              args.resourceOverrides.maxTurns !== undefined
                ? `  maxTurns: ${args.resourceOverrides.maxTurns}\n`
                : ""
            }${
              args.resourceOverrides.maxBudgetUsd !== undefined
                ? `  maxBudgetUsd: ${args.resourceOverrides.maxBudgetUsd}\n`
                : ""
            }${
              args.resourceOverrides.model !== undefined
                ? `  model: ${args.resourceOverrides.model}\n`
                : ""
            }`
          : "";

      const content = `---
title: "Commission: ${escapedTitle}"
date: ${dateStr}
status: active
type: scheduled
tags: [commission, scheduled]
worker: ${workerMeta.identity.name}
workerDisplayTitle: "${escapedDisplayTitle}"
prompt: "${escapedPrompt}"
dependencies:${depsYaml}
linked_artifacts: []
schedule:
  cron: "${args.cron}"
  repeat: ${repeatValue}
  runs_completed: 0
  last_run: null
  last_spawned_id: null
${resourceLines}activity_timeline:
  - timestamp: ${isoStr}
    event: created
    reason: "Scheduled commission created"
current_progress: ""
projectName: ${deps.projectName}
---
`;

      // Write to integration worktree
      const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
      const commissionsDir = path.join(intPath, ".lore", "commissions");
      await fs.mkdir(commissionsDir, { recursive: true });

      const artifactPath = path.join(commissionsDir, `${commissionId}.md`);
      await fs.writeFile(artifactPath, content, "utf-8");

      // Commit to claude branch under project lock
      try {
        await withProjectLock(deps.projectName, async () => {
          await deps.gitOps.commitAll(
            intPath,
            `Add commission: ${commissionId}`,
          );
        });
      } catch (commitErr: unknown) {
        console.error(
          `[manager-toolbox] Failed to commit scheduled commission "${commissionId}":`,
          errorMessage(commitErr),
        );
        return {
          content: [
            {
              type: "text",
              text: `Scheduled commission file was written but commit failed: ${errorMessage(commitErr)}`,
            },
          ],
          isError: true,
        };
      }

      // Register with schedule lifecycle so the scheduler picks it up
      if (deps.scheduleLifecycle) {
        const cid = asCommissionId(commissionId);
        deps.scheduleLifecycle.register(cid, deps.projectName, "active", artifactPath);
      }

      console.log(
        `[manager-toolbox] Created scheduled commission "${args.title}" (id: ${commissionId})`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId, created: true, status: "active" }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to create scheduled commission "${args.title}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Valid status transitions for the update_schedule tool.
 * Maps (currentStatus, requestedStatus) to the lifecycle method to call.
 */
const SCHEDULE_STATUS_ACTIONS: Record<
  string,
  Record<string, "pause" | "complete" | "resume" | "reactivate">
> = {
  active: {
    paused: "pause",
    completed: "complete",
  },
  paused: {
    active: "resume",
    completed: "complete",
  },
  failed: {
    active: "reactivate",
  },
};

export function makeUpdateScheduleHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    commissionId: string;
    cron?: string;
    repeat?: number | null;
    prompt?: string;
    status?: string;
    resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string };
  }): Promise<ToolResult> => {
    try {
      const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
      const artifactPath = path.join(
        intPath,
        ".lore",
        "commissions",
        `${args.commissionId}.md`,
      );

      // Validate it's a scheduled commission
      const commissionType = await deps.recordOps!.readType(artifactPath);
      if (commissionType !== "scheduled") {
        return {
          content: [
            {
              type: "text",
              text: `Commission "${args.commissionId}" is type "${commissionType}", not "scheduled". Only scheduled commissions can be updated with this tool.`,
            },
          ],
          isError: true,
        };
      }

      const cid = asCommissionId(args.commissionId);
      let currentStatus: string;

      // Handle status transitions
      if (args.status) {
        currentStatus = await deps.recordOps!.readStatus(artifactPath);
        const actions = SCHEDULE_STATUS_ACTIONS[currentStatus];
        const action = actions?.[args.status];

        if (!action) {
          return {
            content: [
              {
                type: "text",
                text: `Cannot transition from "${currentStatus}" to "${args.status}": not a valid schedule status transition`,
              },
            ],
            isError: true,
          };
        }

        // Ensure the schedule is tracked before transitioning. After daemon
        // restart, schedules are only tracked by the scheduler tick; the
        // lifecycle has no in-memory state for them.
        if (!deps.scheduleLifecycle!.isTracked(cid)) {
          deps.scheduleLifecycle!.register(
            cid,
            deps.projectName,
            currentStatus as ScheduledCommissionStatus,
            artifactPath,
          );
        }

        // Execute the lifecycle transition
        const reason = `Schedule updated via manager toolbox`;
        let result;
        switch (action) {
          case "pause":
            result = await deps.scheduleLifecycle!.pause(cid);
            break;
          case "complete":
            result = await deps.scheduleLifecycle!.complete(cid, reason);
            break;
          case "resume":
            result = await deps.scheduleLifecycle!.resume(cid);
            break;
          case "reactivate":
            result = await deps.scheduleLifecycle!.reactivate(cid);
            break;
        }

        if (result.outcome === "skipped") {
          return {
            content: [
              {
                type: "text",
                text: `Status transition skipped: ${result.reason}`,
              },
            ],
            isError: true,
          };
        }

        currentStatus = args.status;
      } else {
        currentStatus = await deps.recordOps!.readStatus(artifactPath);
      }

      // Handle field updates (cron, repeat, prompt)
      const scheduleUpdates: Partial<{
        cron: string;
        repeat: number | null;
      }> = {};

      if (args.cron !== undefined) {
        if (!isValidCron(args.cron)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid cron expression: "${args.cron}". Must be a valid 5-field cron expression.`,
              },
            ],
            isError: true,
          };
        }
        scheduleUpdates.cron = args.cron;
      }

      if (args.repeat !== undefined) {
        scheduleUpdates.repeat = args.repeat;

        // If repeat is set and lower than runs_completed, auto-complete
        if (args.repeat !== null) {
          const metadata = await deps.recordOps!.readScheduleMetadata(artifactPath);
          if (args.repeat <= metadata.runsCompleted && currentStatus !== "completed") {
            const reason = `Repeat limit (${args.repeat}) reached: ${metadata.runsCompleted} runs already completed`;
            await deps.scheduleLifecycle!.complete(cid, reason);
            currentStatus = "completed";
          }
        }
      }

      if (Object.keys(scheduleUpdates).length > 0) {
        await deps.recordOps!.writeScheduleFields(artifactPath, scheduleUpdates);
      }

      // Handle prompt update via regex replacement on artifact
      if (args.prompt !== undefined) {
        const raw = await fs.readFile(artifactPath, "utf-8");
        const escaped = escapeYamlValue(args.prompt);
        const updated = raw.replace(
          /^prompt: ".*"$/m,
          `prompt: "${escaped}"`,
        );
        await fs.writeFile(artifactPath, updated, "utf-8");
      }

      // Handle resource overrides update
      if (args.resourceOverrides) {
        if (args.resourceOverrides.model && !isValidModel(args.resourceOverrides.model)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid model name: "${args.resourceOverrides.model}". Valid models: opus, sonnet, haiku`,
              },
            ],
            isError: true,
          };
        }

        let raw = await fs.readFile(artifactPath, "utf-8");

        // Check if resource_overrides block already exists
        if (/^resource_overrides:$/m.test(raw)) {
          // Update existing fields or add new ones within the block
          if (args.resourceOverrides.maxTurns !== undefined) {
            if (/^  maxTurns: .+$/m.test(raw)) {
              raw = raw.replace(/^  maxTurns: .+$/m, `  maxTurns: ${args.resourceOverrides.maxTurns}`);
            } else {
              raw = raw.replace(/^resource_overrides:$/m, `resource_overrides:\n  maxTurns: ${args.resourceOverrides.maxTurns}`);
            }
          }
          if (args.resourceOverrides.maxBudgetUsd !== undefined) {
            if (/^  maxBudgetUsd: .+$/m.test(raw)) {
              raw = raw.replace(/^  maxBudgetUsd: .+$/m, `  maxBudgetUsd: ${args.resourceOverrides.maxBudgetUsd}`);
            } else {
              raw = raw.replace(/^resource_overrides:$/m, `resource_overrides:\n  maxBudgetUsd: ${args.resourceOverrides.maxBudgetUsd}`);
            }
          }
          if (args.resourceOverrides.model !== undefined) {
            if (/^  model: .+$/m.test(raw)) {
              raw = raw.replace(/^  model: .+$/m, `  model: ${args.resourceOverrides.model}`);
            } else {
              raw = raw.replace(/^resource_overrides:$/m, `resource_overrides:\n  model: ${args.resourceOverrides.model}`);
            }
          }
        } else {
          // Insert a new resource_overrides block before activity_timeline
          const overrideLines = [];
          if (args.resourceOverrides.maxTurns !== undefined) {
            overrideLines.push(`  maxTurns: ${args.resourceOverrides.maxTurns}`);
          }
          if (args.resourceOverrides.maxBudgetUsd !== undefined) {
            overrideLines.push(`  maxBudgetUsd: ${args.resourceOverrides.maxBudgetUsd}`);
          }
          if (args.resourceOverrides.model !== undefined) {
            overrideLines.push(`  model: ${args.resourceOverrides.model}`);
          }
          if (overrideLines.length > 0) {
            const block = `resource_overrides:\n${overrideLines.join("\n")}\n`;
            raw = raw.replace(/^activity_timeline:$/m, `${block}activity_timeline:`);
          }
        }

        await fs.writeFile(artifactPath, raw, "utf-8");
      }

      console.log(
        `[manager-toolbox] Updated schedule "${args.commissionId}" (status: ${currentStatus})`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ commissionId: args.commissionId, updated: true, status: currentStatus }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to update schedule "${args.commissionId}":`,
        errorMessage(err),
      );
      return {
        content: [
          {
            type: "text",
            text: errorMessage(err),
          },
        ],
        isError: true,
      };
    }
  };
}

// -- MCP server factory --

/**
 * Creates the manager toolbox MCP server. This toolbox is exclusive to
 * the Guild Master worker, providing tools for coordination: creating
 * commissions, dispatching work, creating PRs, syncing branches, and
 * initiating meetings.
 */
export function createManagerToolbox(
  deps: ManagerToolboxDeps,
): McpSdkServerConfigWithInstance {
  const createCommission = makeCreateCommissionHandler(deps);
  const dispatchCommission = makeDispatchCommissionHandler(deps);
  const cancelCommission = makeCancelCommissionHandler(deps);
  const abandonCommission = makeAbandonCommissionHandler(deps);
  const createPr = makeCreatePrHandler(deps);
  const initiateMeeting = makeInitiateMeetingHandler(deps);
  const addCommissionNote = makeAddCommissionNoteHandler(deps);
  const syncProjectTool = makeSyncProjectHandler(deps);
  const createScheduledCommission = makeCreateScheduledCommissionHandler(deps);
  const updateSchedule = makeUpdateScheduleHandler(deps);

  return createSdkMcpServer({
    name: "guild-hall-manager",
    version: "0.1.0",
    tools: [
      tool(
        "create_commission",
        "Create a new commission for a specialist worker. By default, the commission is dispatched immediately after creation. Set dispatch=false to create without dispatching. Use resourceOverrides.model to override the worker's default model.",
        {
          title: z.string().describe("Short title for the commission"),
          workerName: z.string().describe("Name of the worker to assign"),
          prompt: z.string().describe("The work prompt describing what needs to be done"),
          dependencies: z.array(z.string()).optional().describe("Commission IDs this depends on"),
          resourceOverrides: z.object({
            maxTurns: z.number().optional(),
            maxBudgetUsd: z.number().optional(),
            model: z.string().refine(isValidModel, { message: "Invalid model name" }).optional(),
          }).optional().describe("Override default resource limits. Use model to override the worker's default model."),
          dispatch: z.boolean().optional().describe("Whether to dispatch immediately (default: true)"),
        },
        (args) => createCommission(args),
      ),
      tool(
        "dispatch_commission",
        "Dispatch an existing pending commission to its assigned worker. The commission must be in 'pending' status.",
        {
          commissionId: z.string().describe("The commission ID to dispatch"),
        },
        (args) => dispatchCommission(args),
      ),
      tool(
        "cancel_commission",
        "Cancel an active or pending commission. For running commissions, signals the in-process session to stop immediately. Valid from pending, blocked, or in_progress states.",
        {
          commissionId: z.string().describe("The commission ID to cancel"),
          reason: z.string().optional().describe("Why the commission is being cancelled (default: 'Commission cancelled by manager')"),
        },
        (args) => cancelCommission(args),
      ),
      tool(
        "abandon_commission",
        "Abandon a commission that won't be completed through the commission process. Use when work was done elsewhere, is no longer relevant, or isn't worth retrying. Valid from pending, blocked, failed, or cancelled states. Requires a reason for the audit trail.",
        {
          commissionId: z.string().describe("The commission ID to abandon"),
          reason: z.string().describe("Why the commission is being abandoned"),
        },
        (args) => abandonCommission(args),
      ),
      tool(
        "create_pr",
        "Create a pull request from the integration branch to the default branch. Requires that all active commissions are complete.",
        {
          title: z.string().describe("PR title"),
          body: z.string().optional().describe("PR body/description"),
        },
        (args) => createPr(args),
      ),
      tool(
        "initiate_meeting",
        "Create a meeting request with a specialist worker. The request appears on the Dashboard for the user to accept or decline.",
        {
          workerName: z.string().describe("Name of the worker to meet with"),
          reason: z.string().describe("Why this meeting is needed"),
          referencedArtifacts: z.array(z.string()).optional().describe("Artifact paths to reference in the meeting"),
        },
        (args) => initiateMeeting(args),
      ),
      tool(
        "add_commission_note",
        "Add a coordination note to a commission's timeline. Use for status observations, recommendations, or context that helps the user understand commission progress.",
        {
          commissionId: z.string().describe("The commission ID to annotate"),
          content: z.string().describe("The note content"),
        },
        (args) => addCommissionNote(args),
      ),
      tool(
        "sync_project",
        "Sync a project's claude branch after a PR has been merged. Detects merged PRs, resets the claude branch to match the remote default branch, or rebases if the default branch advanced independently. Use when the user says they merged a PR.",
        {
          projectName: z.string().describe("Name of the project to sync"),
        },
        (args) => syncProjectTool(args),
      ),
      tool(
        "create_scheduled_commission",
        "Create a recurring scheduled commission that spawns one-shot commissions on a cron schedule. The schedule starts in 'active' status and the scheduler will dispatch commissions at each cron interval.",
        {
          title: z.string().describe("Short title for the scheduled commission"),
          workerName: z.string().describe("Name of the worker to assign each run to"),
          prompt: z.string().describe("The work prompt for each spawned commission"),
          cron: z.string().describe("5-field cron expression (e.g. '0 9 * * 1' for every Monday at 9am UTC)"),
          repeat: z.number().nullable().optional().describe("Max number of runs (null for unlimited)"),
          dependencies: z.array(z.string()).optional().describe("Commission IDs this depends on"),
          resourceOverrides: z.object({
            maxTurns: z.number().optional(),
            maxBudgetUsd: z.number().optional(),
            model: z.string().optional(),
          }).optional().describe("Override default resource limits for spawned commissions"),
        },
        (args) => createScheduledCommission(args),
      ),
      tool(
        "update_schedule",
        "Update a scheduled commission's configuration or status. Can change the cron expression, repeat limit, prompt, status (active/paused/completed), or resource overrides. Status transitions follow the schedule lifecycle state machine.",
        {
          commissionId: z.string().describe("The scheduled commission ID to update"),
          cron: z.string().optional().describe("New 5-field cron expression"),
          repeat: z.number().nullable().optional().describe("New repeat limit (null for unlimited)"),
          prompt: z.string().optional().describe("New work prompt"),
          status: z.string().optional().describe("New status: 'active', 'paused', or 'completed'"),
          resourceOverrides: z.object({
            maxTurns: z.number().optional(),
            maxBudgetUsd: z.number().optional(),
            model: z.string().optional(),
          }).optional().describe("Updated resource overrides for spawned commissions"),
        },
        (args) => updateSchedule(args),
      ),
    ],
  });
}

// -- Factory interface --

/**
 * Plain ToolboxFactory: reads services from GuildHallToolboxDeps.services.
 *
 * The scheduleLifecycle, recordOps, and packages fields are provided by
 * the orchestrator's services bag (wired in createProductionApp).
 */
export const managerToolboxFactory: ToolboxFactory = (ctx) => {
  return {
    server: createManagerToolbox({
      projectName: ctx.projectName,
      guildHallHome: ctx.guildHallHome,
      eventBus: ctx.eventBus,
      getProjectConfig: (name: string) =>
        Promise.resolve(ctx.config.projects.find((p) => p.name === name)),
      commissionSession: ctx.services!.commissionSession,
      gitOps: ctx.services!.gitOps,
      scheduleLifecycle: ctx.services?.scheduleLifecycle,
      recordOps: ctx.services?.recordOps,
      packages: ctx.services?.packages,
    }),
  };
};
