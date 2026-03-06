import * as path from "node:path";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  AppConfig,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import type { EventBus } from "@/daemon/lib/event-bus";
import { baseToolboxFactory } from "./base-toolbox";
import { meetingToolboxFactory } from "./meeting/toolbox";
import { commissionToolboxFactory } from "./commission/toolbox";
import { managerToolboxFactory } from "./manager/toolbox";
import type {
  GuildHallToolboxDeps,
  ToolboxFactory,
  ToolboxOutput,
} from "./toolbox-types";

// -- System toolbox registry --

const SYSTEM_TOOLBOX_REGISTRY: Record<string, ToolboxFactory> = {
  meeting: meetingToolboxFactory,
  commission: commissionToolboxFactory,
  manager: managerToolboxFactory,
};

// -- Types --

export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  workerPortraitUrl?: string;
  eventBus: EventBus;
  config: AppConfig;
  /** Services for the manager toolbox (commission session + git ops). */
  services?: GuildHallToolServices;
}

// -- Resolver --

/**
 * Assembles the complete tool set for a worker activation.
 *
 * 1. Base toolbox (always present, provides memory/artifact/decision tools)
 * 2. Context toolbox (auto-added from registry based on contextType)
 * 3. System toolboxes (from worker.systemToolboxes, looked up in registry)
 * 4. Domain toolboxes (resolved from worker.domainToolboxes against discovered packages)
 * 5. Built-in tool names (from worker.builtInTools, passed through as allowedTools)
 *
 * Throws if a worker references a domain toolbox that doesn't exist in the
 * discovered packages (REQ-WKR-13).
 */
export async function resolveToolSet(
  worker: WorkerMetadata,
  packages: DiscoveredPackage[],
  context: ToolboxResolverContext,
): Promise<ResolvedToolSet> {
  const mcpServers: McpSdkServerConfigWithInstance[] = [];

  // Build shared deps from context fields
  const deps: GuildHallToolboxDeps = {
    guildHallHome: context.guildHallHome,
    projectName: context.projectName,
    contextId: context.contextId,
    contextType: context.contextType,
    workerName: context.workerName,
    workerPortraitUrl: context.workerPortraitUrl,
    eventBus: context.eventBus,
    config: context.config,
    services: context.services,
  };

  // 1. Base toolbox (always present: memory + decision tools)
  const baseOutput = baseToolboxFactory(deps);
  mcpServers.push(baseOutput.server);

  // 2. Context toolbox (auto-added based on context type)
  const contextFactory = SYSTEM_TOOLBOX_REGISTRY[context.contextType];
  mcpServers.push(contextFactory(deps).server);

  // 3. Worker's system toolboxes (e.g. manager)
  for (const name of worker.systemToolboxes ?? []) {
    const factory = SYSTEM_TOOLBOX_REGISTRY[name];
    if (!factory) {
      throw new Error(
        `Worker "${worker.identity.name}" declares system toolbox "${name}" ` +
          `but no such system toolbox exists. ` +
          `Available: ${Object.keys(SYSTEM_TOOLBOX_REGISTRY).join(", ")}`,
      );
    }
    if (name === "manager" && !deps.services) {
      throw new Error(
        `Worker "${worker.identity.name}" declares system toolbox "manager" ` +
          `but required services are not available. ` +
          `Only the Guild Master worker may use the manager toolbox.`,
      );
    }
    mcpServers.push(factory(deps).server);
  }

  // 4. Domain toolboxes
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
    const output = await loadDomainToolbox(pkg, deps);
    mcpServers.push(output.server);
  }

  // 5. Built-in tools + MCP server tool wildcards.
  //    allowedTools is a whitelist for ALL tools including MCP tools.
  //    MCP tools follow the naming convention mcp__<server>__<tool>.
  //    Without wildcards, MCP tools are silently filtered out.
  const allowedTools = [
    ...worker.builtInTools,
    ...mcpServers.map((s) => `mcp__${s.name}__*`),
  ];

  return { mcpServers, allowedTools };
}

// -- Helpers --

async function loadDomainToolbox(
  pkg: DiscoveredPackage,
  deps: GuildHallToolboxDeps,
): Promise<ToolboxOutput> {
  const entryPoint = path.resolve(pkg.path, "index.ts");
  let mod: Record<string, unknown>;
  try {
    mod = (await import(entryPoint)) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `Failed to import domain toolbox "${pkg.name}" from ${entryPoint}`,
      { cause },
    );
  }

  if (typeof mod.toolboxFactory !== "function") {
    const available = Object.keys(mod).join(", ") || "(none)";
    throw new Error(
      `Domain toolbox "${pkg.name}" does not export a toolboxFactory function. ` +
        `Available exports: ${available}`,
    );
  }

  return (mod.toolboxFactory as ToolboxFactory)(deps);
}

function isToolboxPackage(pkg: DiscoveredPackage): boolean {
  const type = pkg.metadata.type;
  if (type === "toolbox") return true;
  if (Array.isArray(type) && type.includes("toolbox")) return true;
  return false;
}

function listToolboxNames(packages: DiscoveredPackage[]): string[] {
  return packages.filter(isToolboxPackage).map((p) => p.name);
}
