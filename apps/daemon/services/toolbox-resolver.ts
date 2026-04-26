import * as path from "node:path";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  AppConfig,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerIdentity,
  WorkerMetadata,
} from "@/lib/types";
import type { GuildHallToolServices } from "@/apps/daemon/lib/toolbox-utils";
import type { EventBus } from "@/apps/daemon/lib/event-bus";
import type { BriefingResult } from "./briefing-generator";
import { baseToolboxFactory } from "./base-toolbox";
import { managerToolboxFactory } from "./manager/toolbox";
import { gitReadonlyToolboxFactory } from "./git-readonly-toolbox";
import type {
  ContextTypeRegistry,
  GuildHallToolboxDeps,
  ToolboxFactory,
  ToolboxOutput,
} from "./toolbox-types";

// -- System toolbox registry (non-context-type system toolboxes only) --

const SYSTEM_TOOLBOX_REGISTRY: Record<string, ToolboxFactory> = {
  manager: managerToolboxFactory,
  "git-readonly": gitReadonlyToolboxFactory,
};

// -- Types --

export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  contextId: string;
  contextType: string;
  workerName: string;
  eventBus: EventBus;
  config: AppConfig;
  /** Services for the manager toolbox (commission session + git ops). */
  services?: GuildHallToolServices;
  /** Cache-only briefing lookup. Optional; absent contexts degrade gracefully. */
  getCachedBriefing?: (projectName: string) => Promise<BriefingResult | null>;
  /** Working directory for git-readonly toolbox. Typically the session's workspace dir. */
  workingDirectory?: string;
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
  contextTypeRegistry: ContextTypeRegistry,
): Promise<ResolvedToolSet> {
  // Runtime validation: reject unknown context types (REQ-CXTR-6)
  if (!contextTypeRegistry.has(context.contextType)) {
    const valid = [...contextTypeRegistry.keys()].join(", ");
    throw new Error(
      `Unknown context type "${context.contextType}". Valid types: ${valid}`,
    );
  }

  const registration = contextTypeRegistry.get(context.contextType);
  const mcpServers: McpSdkServerConfigWithInstance[] = [];

  // Build shared deps from context fields
  const deps: GuildHallToolboxDeps = {
    guildHallHome: context.guildHallHome,
    projectName: context.projectName,
    contextId: context.contextId,
    contextType: context.contextType,
    workerName: context.workerName,
    eventBus: context.eventBus,
    config: context.config,
    services: context.services,
    knownWorkerNames: packages
      .filter(isWorkerPackage)
      .map((p) => (p.metadata as WorkerMetadata).identity?.name)
      .filter((name): name is string => typeof name === "string"),
    getWorkerIdentities: () =>
      packages
        .filter(isWorkerPackage)
        .map((p) => (p.metadata as WorkerMetadata).identity)
        .filter((id): id is WorkerIdentity => id != null),
    getCachedBriefing: context.getCachedBriefing,
    stateSubdir: registration?.stateSubdir,
    workingDirectory: context.workingDirectory,
  };

  // 1. Base toolbox (always present: memory + decision tools)
  const baseOutput = baseToolboxFactory(deps);
  mcpServers.push(baseOutput.server);

  // 2. Context toolbox (auto-added from registry based on contextType)
  if (registration?.toolboxFactory) {
    mcpServers.push(registration.toolboxFactory(deps).server);
  }

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

  return { mcpServers, allowedTools, builtInTools: worker.builtInTools };
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

function isWorkerPackage(pkg: DiscoveredPackage): boolean {
  const type = pkg.metadata.type;
  return type === "worker" || (Array.isArray(type) && type.includes("worker"));
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
