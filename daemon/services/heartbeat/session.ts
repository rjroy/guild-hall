/**
 * Heartbeat GM session: runs a constrained Guild Master session on Haiku
 * to evaluate standing orders and dispatch work.
 *
 * Uses prepareSdkSession + runSdkSession with a custom tool set that
 * provides only coordination tools (create_commission, dispatch_commission,
 * initiate_meeting) and read-only tools (read_memory, project_briefing).
 * System toolboxes are stripped so the GM cannot use worker-level tools.
 *
 * Commission creation injects a `source` description identifying the
 * heartbeat standing order (REQ-HBT-22).
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { AppConfig, DiscoveredPackage } from "@/lib/types";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { EventBus } from "@/daemon/lib/event-bus";
import { noopEventBus } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import {
  prepareSdkSession,
  runSdkSession,
  prefixLocalModelError,
  type SessionPrepDeps,
  type SessionPrepSpec,
  type SdkQueryOptions,
} from "@/daemon/lib/agent-sdk/sdk-runner";
import { collectRunnerText } from "@/daemon/lib/sdk-text";
import { MANAGER_WORKER_NAME } from "@/daemon/services/manager/worker";
import { integrationWorktreePath } from "@/lib/paths";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import {
  makeInitiateMeetingHandler,
  type ManagerToolboxDeps,
} from "@/daemon/services/manager/toolbox";
import type { CommissionId } from "@/daemon/types";
import type { GitOps } from "@/daemon/lib/git";

// -- Types --

export interface HeartbeatSessionDeps {
  queryFn: (params: {
    prompt: string;
    options: SdkQueryOptions;
  }) => AsyncGenerator<import("@anthropic-ai/claude-agent-sdk").SDKMessage>;
  prepDeps: SessionPrepDeps;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  commissionSession: CommissionSessionForRoutes;
  eventBus: EventBus;
  gitOps: GitOps;
  getProjectConfig: (name: string) => Promise<import("@/lib/types").ProjectConfig | undefined>;
  log?: Log;
}

export interface HeartbeatSessionResult {
  success: boolean;
  error?: string;
  isRateLimit?: boolean;
  /** Number of commissions created during this session. */
  commissionsCreated: number;
}

// -- System prompt (REQ-HBT-9) --

/**
 * Heartbeat dispatcher mode constraints. Overrides the standard GM prompt
 * so the session evaluates standing orders rather than acting as an
 * interactive assistant.
 */
export const HEARTBEAT_SYSTEM_PROMPT = `You are the Guild Master operating in heartbeat dispatcher mode. Your only job is to evaluate the standing orders in this heartbeat file and decide whether any of them warrant immediate action.

Instructions:
1. Read the standing orders and recent activity sections carefully.
2. For each standing order, decide whether it warrants a new commission right now.
3. Consider watch items and context notes when making decisions, but do not create commissions from watch items directly.
4. If an order is ambiguous (the instruction itself is unclear or contradictory), skip it entirely. Do not guess at intent.
5. If no standing orders exist, take no action.
6. Do not propose architectural changes or expand scope beyond what the standing orders request.
7. Check recent activity for evidence that an order has already been acted on. If a commission for the same order was created recently, skip it.
8. If the heartbeat file has grown unwieldy (too many standing orders, redundant entries, watch items that have been resolved), commission a cleanup. The cleanup commission should consolidate, prune, and reorganize the file while preserving the user's intent.

When creating a commission, always include a source_description that identifies which standing order triggered it. Be specific enough that the source can be traced back.

Do not explain your reasoning. Just act: create commissions for orders that need action, skip the rest.`;

// -- Rate limit detection --

function isRateLimitError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  );
}

// -- Session runner --

/**
 * Runs a single heartbeat GM session for a project.
 *
 * Returns success/failure with rate-limit distinction so the caller
 * can decide whether to continue or abort the loop.
 */
export async function runHeartbeatSession(
  deps: HeartbeatSessionDeps,
  projectName: string,
  heartbeatContent: string,
  tickTimestamp: number,
): Promise<HeartbeatSessionResult> {
  const log = deps.log ?? nullLog("heartbeat-session");

  const project = deps.config.projects.find((p) => p.name === projectName);
  if (!project) {
    return { success: false, error: `Project "${projectName}" not found in config`, commissionsCreated: 0 };
  }

  // Mutable counter incremented by create_commission tool handler
  const counter = { commissionsCreated: 0 };

  const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);
  const model = deps.config.systemModels?.heartbeat ?? "haiku";
  const contextId = `heartbeat-${projectName}-${tickTimestamp}`;

  const abortController = new AbortController();

  const spec: SessionPrepSpec = {
    workerName: MANAGER_WORKER_NAME,
    packages: deps.packages,
    config: deps.config,
    guildHallHome: deps.guildHallHome,
    projectName,
    projectPath: project.path,
    workspaceDir: integrationPath,
    contextId,
    contextType: "heartbeat",
    eventBus: noopEventBus,
    abortController,
    resourceOverrides: { model },
    activationExtras: { managerContext: "" },
  };

  // Wrap resolveToolSet to strip system toolboxes and inject heartbeat tools
  const wrappedPrepDeps: SessionPrepDeps = {
    ...deps.prepDeps,
    resolveToolSet: makeHeartbeatResolveToolSet(
      deps.prepDeps.resolveToolSet,
      deps,
      projectName,
      counter,
    ),
  };

  try {
    const prepResult = await prepareSdkSession(spec, wrappedPrepDeps);
    if (!prepResult.ok) {
      log.error(`Session prep failed for "${projectName}": ${prepResult.error}`);
      return { success: false, error: prepResult.error, commissionsCreated: 0 };
    }

    const options = prepResult.result.options;
    options.maxTurns = 30;
    options.systemPrompt = HEARTBEAT_SYSTEM_PROMPT;
    const generator = runSdkSession(deps.queryFn, heartbeatContent, options);
    await collectRunnerText(generator);

    return { success: true, commissionsCreated: counter.commissionsCreated };
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      const reason = errorMessage(err);
      log.warn(`Rate limit hit for "${projectName}": ${reason}`);
      return { success: false, error: reason, isRateLimit: true, commissionsCreated: counter.commissionsCreated };
    }

    const reason = prefixLocalModelError(errorMessage(err), undefined);
    log.error(`Heartbeat session failed for "${projectName}": ${reason}`);
    return { success: false, error: reason, commissionsCreated: counter.commissionsCreated };
  }
}

// -- Tool set construction --

/**
 * Wraps the injected resolveToolSet to strip system toolboxes and provide
 * heartbeat-specific coordination tools. The GM gets:
 * - create_commission (with source auto-injection)
 * - dispatch_commission
 * - initiate_meeting
 * - read_memory, project_briefing (from the resolved tool set, read-only)
 */
function makeHeartbeatResolveToolSet(
  original: SessionPrepDeps["resolveToolSet"],
  deps: HeartbeatSessionDeps,
  projectName: string,
  counter: { commissionsCreated: number },
): SessionPrepDeps["resolveToolSet"] {
  return async (worker, packages, context) => {
    // Get the base tool set with system toolboxes stripped
    const resolved = await original(
      { ...worker, systemToolboxes: [] },
      packages,
      context,
    );

    // Build heartbeat coordination MCP server
    const heartbeatServer = createHeartbeatToolServer(deps, projectName, counter);

    // Replace MCP servers: keep only read-only base tools, add heartbeat server
    return {
      ...resolved,
      mcpServers: [
        ...resolved.mcpServers,
        heartbeatServer,
      ],
    };
  };
}

/**
 * Creates an MCP server with heartbeat-specific coordination tools.
 * Commission creation automatically injects `source` with the GM's description.
 */
function createHeartbeatToolServer(
  deps: HeartbeatSessionDeps,
  projectName: string,
  counter: { commissionsCreated: number },
): McpSdkServerConfigWithInstance {
  const log = deps.log ?? nullLog("heartbeat-tools");

  // Reuse dispatch and initiate_meeting from manager toolbox
  const managerDeps: ManagerToolboxDeps = {
    projectName,
    guildHallHome: deps.guildHallHome,
    callRoute: () => Promise.resolve({ ok: false, error: "Not available in heartbeat mode" }),
    eventBus: deps.eventBus,
    gitOps: deps.gitOps,
    config: deps.config,
    getProjectConfig: deps.getProjectConfig,
    log,
  };

  const initiateMeetingHandler = makeInitiateMeetingHandler(managerDeps);

  return createSdkMcpServer({
    name: "guild-hall-heartbeat",
    version: "0.1.0",
    tools: [
      tool(
        "create_commission",
        "Create and dispatch a new commission. Always include a source_description identifying the standing order that triggered this commission.",
        {
          title: z.string().describe("Short title for the commission"),
          workerName: z.string().describe("Name of the worker to assign"),
          prompt: z.string().describe("The work prompt describing what needs to be done"),
          source_description: z.string().describe("Description of the standing order that triggered this commission, e.g. 'Heartbeat: after any Dalton implementation, dispatch a Thorne review'"),
          dependencies: z.array(z.string()).optional().describe("Commission IDs this depends on"),
          resourceOverrides: z.object({
            model: z.string().optional(),
          }).optional().describe("Override the worker's default model"),
          dispatch: z.boolean().optional().describe("Whether to dispatch immediately (default: true)"),
        },
        async (args) => {
          try {
            const result = await deps.commissionSession.createCommission(
              projectName,
              args.title,
              args.workerName,
              args.prompt,
              args.dependencies,
              args.resourceOverrides,
              { source: { description: args.source_description } },
            );
            counter.commissionsCreated++;

            const shouldDispatch = args.dispatch !== false;
            if (shouldDispatch) {
              try {
                const id = result.commissionId as import("@/daemon/types").CommissionId;
                await deps.commissionSession.dispatchCommission(id);
                return {
                  content: [{ type: "text" as const, text: `Commission ${result.commissionId} created and dispatched.` }],
                };
              } catch (dispatchErr: unknown) {
                return {
                  content: [{ type: "text" as const, text: `Commission ${result.commissionId} created but dispatch failed: ${errorMessage(dispatchErr)}` }],
                };
              }
            }

            return {
              content: [{ type: "text" as const, text: `Commission ${result.commissionId} created (not dispatched).` }],
            };
          } catch (err: unknown) {
            log.error(`Failed to create commission "${args.title}":`, errorMessage(err));
            return {
              content: [{ type: "text" as const, text: errorMessage(err) }],
              isError: true,
            };
          }
        },
      ),
      tool(
        "dispatch_commission",
        "Dispatch an existing pending commission to its assigned worker.",
        {
          commissionId: z.string().describe("The commission ID to dispatch"),
        },
        async (args) => {
          try {
            const id = args.commissionId as CommissionId;
            await deps.commissionSession.dispatchCommission(id);
            return {
              content: [{ type: "text" as const, text: `Commission ${args.commissionId} dispatched.` }],
            };
          } catch (err: unknown) {
            log.error(`Failed to dispatch commission "${args.commissionId}":`, errorMessage(err));
            return {
              content: [{ type: "text" as const, text: errorMessage(err) }],
              isError: true,
            };
          }
        },
      ),
      tool(
        "initiate_meeting",
        "Create a meeting request with a specialist worker.",
        {
          workerName: z.string().describe("Name of the worker to meet with"),
          reason: z.string().describe("Why the meeting is needed"),
          referencedArtifacts: z.array(z.string()).optional().describe("Artifact paths to reference"),
        },
        (args) => initiateMeetingHandler(args),
      ),
    ],
  });
}
