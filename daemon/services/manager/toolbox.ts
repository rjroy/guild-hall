/**
 * Manager toolbox: exclusive tools for the Guild Master worker.
 *
 * Provides nine tools for project coordination:
 * - create_commission: create (and optionally dispatch) a new commission
 * - dispatch_commission: dispatch an existing pending commission
 * - cancel_commission: cancel an active or pending commission
 * - abandon_commission: abandon a commission with a required reason
 * - create_pr: push claude/main and open a PR on the hosting platform
 * - initiate_meeting: create a meeting request artifact
 * - add_commission_note: annotate a commission with a manager note
 * - sync_project: post-merge sync (detect merged PRs, reset claude branch)
 * - check_commission_status: read commission detail or list all commissions
 *
 * Tools that map to existing daemon routes call those routes via the Unix
 * socket instead of service methods directly. This makes the manager toolbox
 * a projection of the daemon's skill contract into the agent session, using
 * the same invocation path as CLI and web.
 *
 * Tools without matching daemon routes (create_pr, initiate_meeting)
 * remain internal per REQ-DAB-11.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ToolResult } from "@/daemon/types";
import { formatTimestamp, escapeYamlValue, errorMessage } from "@/daemon/lib/toolbox-utils";
import type { EventBus } from "@/daemon/lib/event-bus";
import { CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import { withProjectLock } from "@/daemon/lib/project-lock";
import { hasActiveActivities } from "@/daemon/services/git-admin";
import { isValidModel } from "@/lib/types";
import type { AppConfig, ProjectConfig, DiscoveredPackage } from "@/lib/types";
import { integrationWorktreePath, resolveCommissionBasePath } from "@/lib/paths";
import { readCommissionMeta, scanCommissions } from "@/lib/commissions";
import type { CommissionMeta } from "@/lib/commissions";
import type { ToolboxFactory } from "@/daemon/services/toolbox-types";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import { daemonFetch, isDaemonError, discoverTransport, type TransportDescriptor } from "@/lib/daemon-client";

// -- Daemon route caller --

/**
 * Calls a daemon route via the Unix socket. Returns parsed JSON on success
 * or an error string on failure. Used by manager tools that delegate to
 * daemon routes (REQ-DAB-7) instead of calling service methods directly.
 */
export type RouteCaller = (
  routePath: string,
  body: unknown,
) => Promise<{ ok: true; status: number; data: unknown } | { ok: false; error: string }>;

/**
 * Creates a RouteCaller backed by daemonFetch over the daemon's transport.
 */
export function createDaemonRouteCaller(transport: TransportDescriptor): RouteCaller {
  return async (routePath: string, body: unknown) => {
    const result = await daemonFetch(
      routePath,
      { method: "POST", body: JSON.stringify(body) },
      transport,
    );

    if (isDaemonError(result)) {
      return { ok: false, error: result.message };
    }

    const data: unknown = await result.json();
    if (result.ok) {
      return { ok: true, status: result.status, data };
    }
    return { ok: false, error: (data as { error?: string }).error ?? "Unknown error" };
  };
}

export interface ManagerToolboxDeps {
  projectName: string;
  guildHallHome: string;
  /** Calls daemon routes via Unix socket. Tools that map to existing
   *  daemon routes use this instead of service methods (REQ-DAB-7). */
  callRoute: RouteCaller;
  eventBus: EventBus;
  gitOps: GitOps;
  config: AppConfig;
  getProjectConfig: (name: string) => Promise<ProjectConfig | undefined>;
  /** Internal deps for tools without daemon routes. */
  recordOps?: CommissionRecordOps;
  packages?: DiscoveredPackage[];
  /** Injectable logger. Defaults to nullLog("manager"). */
  log?: Log;
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

/**
 * Converts a daemon route error response to a ToolResult with isError.
 */
function routeError(errorMsg: string): ToolResult {
  return {
    content: [{ type: "text", text: errorMsg }],
    isError: true,
  };
}

// -- Tool handler factories --

export function makeCreateCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    title: string;
    workerName: string;
    prompt: string;
    dependencies?: string[];
    resourceOverrides?: { model?: string };
    dispatch?: boolean;
  }): Promise<ToolResult> => {
    try {
      // Create the commission via daemon route
      const createResult = await deps.callRoute(
        "/commission/request/commission/create",
        {
          projectName: deps.projectName,
          title: args.title,
          workerName: args.workerName,
          prompt: args.prompt,
          dependencies: args.dependencies,
          resourceOverrides: args.resourceOverrides,
        },
      );

      if (!createResult.ok) {
        log.error(
          `Failed to create commission "${args.title}":`,
          createResult.error,
        );
        return routeError(createResult.error);
      }

      const { commissionId } = createResult.data as { commissionId: string };

      const shouldDispatch = args.dispatch !== false;
      let dispatched = false;

      if (shouldDispatch) {
        const dispatchResult = await deps.callRoute(
          "/commission/run/dispatch",
          { commissionId },
        );

        if (!dispatchResult.ok) {
          log.error(
            `Failed to dispatch commission "${commissionId}":`,
            dispatchResult.error,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  commissionId,
                  dispatched: false,
                  error: dispatchResult.error,
                }),
              },
            ],
            isError: true,
          };
        }
        dispatched = true;
      }

      log.info(
        `Created commission "${args.title}" (id: ${commissionId}, dispatched: ${dispatched})`,
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
      log.error(
        `Failed to create commission "${args.title}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

export function makeDispatchCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: { commissionId: string }): Promise<ToolResult> => {
    try {
      const result = await deps.callRoute(
        "/commission/run/dispatch",
        { commissionId: args.commissionId },
      );

      if (!result.ok) {
        log.error(
          `Failed to dispatch commission "${args.commissionId}":`,
          result.error,
        );
        return routeError(result.error);
      }

      log.info(
        `Dispatched commission "${args.commissionId}"`,
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
      log.error(
        `Failed to dispatch commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
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

// create_pr remains internal: no matching daemon route (REQ-DAB-11)
export function makeCreatePrHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
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

        log.info(
          `Created PR for "${deps.projectName}": ${url}`,
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
      log.error(
        `Failed to create PR for "${deps.projectName}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

// initiate_meeting remains internal: no matching daemon route (REQ-DAB-11)
export function makeInitiateMeetingHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
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
        log.error(
          `Failed to commit meeting request "${meetingId}":`,
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
      // Normalize to POSIX separators: relativePath is a logical path, not a filesystem path
      const relativePath = path.relative(
        path.join(intPath, ".lore"),
        artifactPath,
      ).split(path.sep).join("/");

      log.info(
        `Created meeting request for "${args.workerName}" (artifact: ${relativePath})`,
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
      log.error(
        `Failed to create meeting request for "${args.workerName}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

export function makeAddCommissionNoteHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    commissionId: string;
    content: string;
  }): Promise<ToolResult> => {
    try {
      const result = await deps.callRoute(
        "/commission/request/commission/note",
        {
          commissionId: args.commissionId,
          content: args.content,
        },
      );

      if (!result.ok) {
        log.error(
          `Failed to add note to commission "${args.commissionId}":`,
          result.error,
        );
        return routeError(result.error);
      }

      log.info(
        `Added note to commission "${args.commissionId}"`,
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
      log.error(
        `Failed to add note to commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

export function makeCancelCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    commissionId: string;
  }): Promise<ToolResult> => {
    try {
      const result = await deps.callRoute(
        "/commission/run/cancel",
        { commissionId: args.commissionId },
      );

      if (!result.ok) {
        log.error(
          `Failed to cancel commission "${args.commissionId}":`,
          result.error,
        );
        return routeError(result.error);
      }

      log.info(
        `Cancelled commission "${args.commissionId}"`,
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
      log.error(
        `Failed to cancel commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

export function makeAbandonCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    commissionId: string;
    reason: string;
  }): Promise<ToolResult> => {
    try {
      const result = await deps.callRoute(
        "/commission/run/abandon",
        {
          commissionId: args.commissionId,
          reason: args.reason,
        },
      );

      if (!result.ok) {
        log.error(
          `Failed to abandon commission "${args.commissionId}":`,
          result.error,
        );
        return routeError(result.error);
      }

      log.info(
        `Abandoned commission "${args.commissionId}"`,
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
      log.error(
        `Failed to abandon commission "${args.commissionId}":`,
        errorMessage(err),
      );
      return routeError(errorMessage(err));
    }
  };
}

// -- Commission status tool --

/**
 * Status-to-summary-group mapping for list mode counts.
 * Groups: pending (0), active (1), failed (2), completed (3).
 */
const SUMMARY_GROUP: Record<string, "pending" | "active" | "failed" | "completed"> = {
  pending: "pending",
  blocked: "pending",
  dispatched: "active",
  in_progress: "active",
  failed: "failed",
  cancelled: "failed",
  completed: "completed",
  abandoned: "completed",
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * Projects a CommissionMeta to the compact list entry format.
 */
function projectForList(c: CommissionMeta) {
  return {
    commissionId: c.commissionId,
    title: c.title,
    status: c.status,
    worker: c.worker,
    current_progress: truncate(c.current_progress, 200),
    result_summary: truncate(c.result_summary, 200),
  };
}

export function makeCheckCommissionStatusHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: { commissionId?: string }): Promise<ToolResult> => {
    try {
      if (args.commissionId) {
        // Single commission mode (REQ-CST-3, REQ-CST-4, REQ-CST-5)
        const basePath = await resolveCommissionBasePath(
          deps.guildHallHome,
          deps.projectName,
          args.commissionId,
        );
        const filePath = path.join(
          basePath, ".lore", "commissions", `${args.commissionId}.md`,
        );

        let meta: CommissionMeta;
        try {
          meta = await readCommissionMeta(filePath, deps.projectName);
        } catch (err: unknown) {
          if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
            return {
              content: [{ type: "text", text: `Commission not found: ${args.commissionId}` }],
              isError: true,
            };
          }
          throw err;
        }

        const result: Record<string, unknown> = {
          commissionId: meta.commissionId,
          title: meta.title,
          status: meta.status,
          worker: meta.worker,
          date: meta.date,
          current_progress: meta.current_progress,
          result_summary: meta.result_summary,
          linked_artifacts: meta.linked_artifacts,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }

      // List mode (REQ-CST-6, REQ-CST-7, REQ-CST-8)
      const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
      const lorePath = path.join(intPath, ".lore");

      let commissions: CommissionMeta[];
      try {
        commissions = await scanCommissions(lorePath, deps.projectName);
      } catch {
        commissions = [];
      }

      const summary = { pending: 0, active: 0, failed: 0, completed: 0, total: commissions.length };
      for (const c of commissions) {
        const group = SUMMARY_GROUP[c.status];
        if (group) summary[group]++;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            summary,
            commissions: commissions.map(projectForList),
          }),
        }],
      };
    } catch (err: unknown) {
      return routeError(errorMessage(err));
    }
  };
}

// -- MCP server factory --

/**
 * Creates the manager toolbox MCP server. This toolbox is exclusive to
 * the Guild Master worker, providing tools for coordination: creating
 * commissions, dispatching work, creating PRs, syncing branches, and
 * initiating meetings.
 *
 * Tool descriptions include operationId references for tools that map to
 * daemon-governed skills (REQ-DAB-7).
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
  const checkCommissionStatus = makeCheckCommissionStatusHandler(deps);

  return createSdkMcpServer({
    name: "guild-hall-manager",
    version: "0.1.0",
    tools: [
      tool(
        "create_commission",
        "Create a new commission for a specialist worker. By default, the commission is dispatched immediately after creation. Set dispatch=false to create without dispatching. Use resourceOverrides.model to override the worker's default model. [operationId: commission.request.commission.create]",
        {
          title: z.string().describe("Short title for the commission"),
          workerName: z.string().describe("Name of the worker to assign"),
          prompt: z.string().describe("The work prompt describing what needs to be done"),
          dependencies: z.array(z.string()).optional().describe("Commission IDs this depends on"),
          resourceOverrides: z.object({
            model: z.string().optional(),
          }).optional().describe("Override the worker's default model."),
          dispatch: z.boolean().optional().describe("Whether to dispatch immediately (default: true)"),
        },
        (args) => createCommission(args),
      ),
      tool(
        "dispatch_commission",
        "Dispatch an existing pending commission to its assigned worker. The commission must be in 'pending' status. [operationId: commission.run.dispatch]",
        {
          commissionId: z.string().describe("The commission ID to dispatch"),
        },
        (args) => dispatchCommission(args),
      ),
      tool(
        "cancel_commission",
        "Cancel an active or pending commission. For running commissions, signals the in-process session to stop immediately. [operationId: commission.run.cancel]",
        {
          commissionId: z.string().describe("The commission ID to cancel"),
        },
        (args) => cancelCommission(args),
      ),
      tool(
        "abandon_commission",
        "Abandon a commission that won't be completed through the commission process. Use when work was done elsewhere, is no longer relevant, or isn't worth retrying. Valid from pending, blocked, failed, or cancelled states. Requires a reason for the audit trail. [operationId: commission.run.abandon]",
        {
          commissionId: z.string().describe("The commission ID to abandon"),
          reason: z.string().describe("Why the commission is being abandoned"),
        },
        (args) => abandonCommission(args),
      ),
      tool(
        "create_pr",
        "Create a pull request from the integration branch to the default branch. Requires that all active commissions are complete. [internal: no daemon route]",
        {
          title: z.string().describe("PR title"),
          body: z.string().optional().describe("PR body/description"),
        },
        (args) => createPr(args),
      ),
      tool(
        "initiate_meeting",
        "Create a meeting request with a specialist worker. The request appears on the Dashboard for the user to accept or decline. [internal: no daemon route]",
        {
          workerName: z.string().describe("Name of the worker to meet with"),
          reason: z.string().describe("Why this meeting is needed"),
          referencedArtifacts: z.array(z.string()).optional().describe("Artifact paths to reference in the meeting"),
        },
        (args) => initiateMeeting(args),
      ),
      tool(
        "add_commission_note",
        "Add a coordination note to a commission's timeline. Use for status observations, recommendations, or context that helps the user understand commission progress. [operationId: commission.request.commission.note]",
        {
          commissionId: z.string().describe("The commission ID to annotate"),
          content: z.string().describe("The note content"),
        },
        (args) => addCommissionNote(args),
      ),
      tool(
        "check_commission_status",
        "Check the status of a specific commission by ID, or get a summary list of all commissions for the current project. [operationId: commission.request.commission.read, commission.request.commission.list]",
        {
          commissionId: z.string().optional().describe("Commission ID to look up. Omit for a summary list of all commissions."),
        },
        (args) => checkCommissionStatus(args),
      ),
    ],
  });
}

// -- Factory interface --

/**
 * Plain ToolboxFactory: reads services from GuildHallToolboxDeps.services.
 *
 * The recordOps and packages fields are provided by the orchestrator's
 * services bag (wired in createProductionApp).
 *
 * callRoute uses daemonFetch over the daemon's Unix socket. Tools that map
 * to daemon routes call them through this function rather than through
 * deps.services.commissionSession directly.
 */
export const managerToolboxFactory: ToolboxFactory = (ctx) => {
  // The manager toolbox calls the daemon's own transport (same process).
  // This is safe: Hono is async, Bun serves concurrent requests, no deadlock.
  const transport = discoverTransport(ctx.guildHallHome);
  if (!transport) {
    throw new Error("Manager toolbox requires an active daemon transport, but no discovery file was found");
  }
  return {
    server: createManagerToolbox({
      projectName: ctx.projectName,
      guildHallHome: ctx.guildHallHome,
      callRoute: createDaemonRouteCaller(transport),
      eventBus: ctx.eventBus,
      config: ctx.services!.config,
      getProjectConfig: (name: string) =>
        Promise.resolve(ctx.config.projects.find((p) => p.name === name)),
      gitOps: ctx.services!.gitOps,
      recordOps: ctx.services?.recordOps,
      packages: ctx.services?.packages,
    }),
  };
};
