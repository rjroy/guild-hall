import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type {
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { createBaseToolbox } from "./base-toolbox";
import { createMeetingToolbox } from "./meeting-toolbox";

// -- Types --

export interface ToolboxResolverContext {
  projectPath: string;
  meetingId: string;
  workerName?: string;
  guildHallHome?: string;
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

  // 1. Base toolbox (always present)
  mcpServers.push(
    createBaseToolbox({
      projectPath: context.projectPath,
      meetingId: context.meetingId,
      guildHallHome: context.guildHallHome,
    }),
  );

  // 2. Context toolbox (meeting toolbox when in meeting context)
  if (context.meetingId && context.workerName) {
    mcpServers.push(
      createMeetingToolbox({
        projectPath: context.projectPath,
        meetingId: context.meetingId,
        workerName: context.workerName,
        guildHallHome: context.guildHallHome,
      }),
    );
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

  // 4. Built-in tools
  const allowedTools = [...worker.builtInTools];

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
