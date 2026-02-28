import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { baseToolboxFactory } from "./base-toolbox";
import type { ToolboxFactory } from "./toolbox-types";

// -- Types --

export interface ToolboxResolverContext {
  projectName: string;
  guildHallHome: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  /** Pre-bound context factories (meeting, commission, manager). */
  contextFactories?: ToolboxFactory[];
}

// -- Resolver --

/**
 * Assembles the complete tool set for a worker activation.
 *
 * 1. Base toolbox (always present, provides memory/artifact/decision tools)
 * 2. Context factories (meeting, commission, manager, bound by caller)
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

  // Build shared deps from context fields
  const deps = {
    guildHallHome: context.guildHallHome,
    projectName: context.projectName,
    contextId: context.contextId,
    contextType: context.contextType,
    workerName: context.workerName,
  };

  // 1. Base toolbox (always present: memory + decision tools)
  const baseOutput = baseToolboxFactory(deps);
  mcpServers.push(baseOutput.server);

  // 2. Context factories (meeting, commission, manager)
  for (const factory of context.contextFactories ?? []) {
    const output = factory(deps);
    mcpServers.push(output.server);
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
  }

  // 4. Built-in tools + MCP server tool wildcards.
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

function isToolboxPackage(pkg: DiscoveredPackage): boolean {
  const type = pkg.metadata.type;
  if (type === "toolbox") return true;
  if (Array.isArray(type) && type.includes("toolbox")) return true;
  return false;
}

function listToolboxNames(packages: DiscoveredPackage[]): string[] {
  return packages.filter(isToolboxPackage).map((p) => p.name);
}
