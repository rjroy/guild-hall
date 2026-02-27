import * as path from "node:path";
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
  projectPath: string;
  projectName?: string;
  meetingId?: string;
  commissionId?: string;
  workerName?: string;
  guildHallHome?: string;
  daemonSocketPath?: string;
  /** Integration worktree path, used by meeting toolbox for propose_followup. */
  integrationPath?: string;
  /** Activity worktree path. Commission/meeting toolbox writes go here. */
  workingDirectory?: string;
  /** When true, the manager-exclusive toolbox is injected. */
  isManager?: boolean;
  /** Dependencies for the manager toolbox. Required when isManager is true. */
  managerToolboxDeps?: ManagerToolboxDeps;
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

  // Resolve worker and project identity for the base toolbox's memory
  // access control. workerName comes from the activation context (identity
  // name); projectName from explicit context or path.basename() fallback.
  const resolvedWorkerName = context.workerName ?? worker.identity.name;
  const resolvedProjectName = context.projectName ?? path.basename(context.projectPath);

  // 1. Base toolbox (always present: memory + decision tools)
  mcpServers.push(
    createBaseToolbox({
      contextId,
      contextType,
      workerName: resolvedWorkerName,
      projectName: resolvedProjectName,
      guildHallHome: context.guildHallHome,
    }),
  );

  // 2. Context toolbox (meeting or commission, mutually exclusive)
  let wasResultSubmitted: (() => boolean) | undefined;

  if (context.meetingId && context.workerName) {
    mcpServers.push(
      createMeetingToolbox({
        projectPath: context.projectPath,
        integrationPath: context.integrationPath,
        worktreeDir: context.workingDirectory,
        meetingId: context.meetingId,
        workerName: context.workerName,
        guildHallHome: context.guildHallHome,
      }),
    );
  } else if (context.commissionId) {
    if (!context.daemonSocketPath) {
      throw new Error(
        `Commission context requires daemonSocketPath. CommissionId "${context.commissionId}" was provided without a socket path.`,
      );
    }
    const commissionToolbox = createCommissionToolbox({
      projectPath: context.workingDirectory ?? context.projectPath,
      commissionId: context.commissionId,
      daemonSocketPath: context.daemonSocketPath,
      guildHallHome: context.guildHallHome,
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
