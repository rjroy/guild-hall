import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { createBaseToolbox } from "./base-toolbox";
import { createCommissionToolbox } from "./commission-toolbox";
import { createMeetingToolbox } from "./meeting-toolbox";
import { createManagerToolbox, type ManagerToolboxDeps } from "./manager-toolbox";

// -- Types --

export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  meetingId?: string;
  commissionId?: string;
  workerName?: string;
  /** When true, the manager-exclusive toolbox is injected. */
  isManager?: boolean;
  /** Dependencies for the manager toolbox. Required when isManager is true. */
  managerToolboxDeps?: ManagerToolboxDeps;
  /** Commission callbacks. Required when commissionId is set. */
  onProgress?: (summary: string) => void;
  onResult?: (summary: string, artifacts?: string[]) => void;
  onQuestion?: (question: string) => void;
}

// -- Resolver --

/**
 * Assembles the complete tool set for a worker activation.
 *
 * 1. Base toolbox (always present, provides memory/artifact/decision tools)
 * 2. Context toolbox slot (empty in Phase 2, reserved for future use)
 * 3. Domain toolboxes (resolved from worker.domainToolboxes against discovered packages)
 * 4. Built-in tool names (from worker.builtInTools, passed through as allowedTools)
 *
 * Throws if a worker references a domain toolbox that doesn't exist in the
 * discovered packages (REQ-WKR-13).
 */
export function resolveToolSet(
  worker: WorkerMetadata,
  packages: DiscoveredPackage[],
  context: ToolboxResolverContext,
): ResolvedToolSet {
  const mcpServers: McpSdkServerConfigWithInstance[] = [];

  // Determine context identity for the base toolbox
  const contextId = context.meetingId ?? context.commissionId;
  if (!contextId) {
    throw new Error("ToolboxResolverContext requires either meetingId or commissionId");
  }
  const contextType: "meeting" | "commission" = context.meetingId ? "meeting" : "commission";

  const resolvedWorkerName = context.workerName ?? worker.identity.name;

  // 1. Base toolbox (always present: memory + decision tools)
  mcpServers.push(
    createBaseToolbox({
      contextId,
      contextType,
      workerName: resolvedWorkerName,
      projectName: context.projectName,
      guildHallHome: context.guildHallHome,
    }),
  );

  // 2. Context toolbox (meeting or commission, mutually exclusive)
  let wasResultSubmitted: (() => boolean) | undefined;

  if (context.meetingId && context.workerName) {
    mcpServers.push(
      createMeetingToolbox({
        guildHallHome: context.guildHallHome,
        projectName: context.projectName,
        contextId: context.meetingId,
        workerName: context.workerName,
      }),
    );
  } else if (context.commissionId) {
    if (!context.onProgress || !context.onResult || !context.onQuestion) {
      throw new Error(
        `Commission context requires onProgress, onResult, and onQuestion callbacks. ` +
        `CommissionId "${context.commissionId}" was provided without callbacks.`,
      );
    }
    const commissionToolbox = createCommissionToolbox({
      guildHallHome: context.guildHallHome,
      projectName: context.projectName,
      contextId: context.commissionId,
      onProgress: context.onProgress,
      onResult: context.onResult,
      onQuestion: context.onQuestion,
    });
    mcpServers.push(commissionToolbox.server);
    wasResultSubmitted = commissionToolbox.wasResultSubmitted;
  }

  // 2b. Manager toolbox (exclusive to the Guild Master, injected after context toolbox)
  if (context.isManager && context.managerToolboxDeps) {
    mcpServers.push(createManagerToolbox(context.managerToolboxDeps));
  }

  // 3. Domain toolboxes
  for (const toolboxName of worker.domainToolboxes) {
    const pkg = packages.find(
      (p) => p.name === toolboxName && isToolboxPackage(p),
    );
    if (!pkg) {
      throw new Error(
        `Worker "${worker.identity.name}" requires domain toolbox "${toolboxName}" ` +
          `but no matching toolbox package was found. ` +
          `Available toolbox packages: ${listToolboxNames(packages).join(", ") || "(none)"}`,
      );
    }
    // Domain toolbox MCP servers will be created by the toolbox package itself
    // in a later phase. For now, we validate that the package exists.
    // The actual MCP server creation from toolbox packages is a Phase 3+ concern.
  }

  // 4. Built-in tools + MCP server tool wildcards.
  //    allowedTools is a whitelist for ALL tools including MCP tools.
  //    MCP tools follow the naming convention mcp__<server>__<tool>.
  //    Without wildcards, MCP tools are silently filtered out.
  const allowedTools = [
    ...worker.builtInTools,
    ...mcpServers.map((s) => `mcp__${s.name}__*`),
  ];

  return { mcpServers, allowedTools, wasResultSubmitted };
}

// -- Helpers --

function isToolboxPackage(pkg: DiscoveredPackage): boolean {
  const type = pkg.metadata.type;
  if (type === "toolbox") return true;
  if (Array.isArray(type) && type.includes("toolbox")) return true;
  return false;
}

function listToolboxNames(packages: DiscoveredPackage[]): string[] {
  return packages.filter(isToolboxPackage).map((p) => p.name);
}
