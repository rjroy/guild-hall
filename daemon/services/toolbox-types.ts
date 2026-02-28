/**
 * Shared types for the toolbox factory interface.
 *
 * All toolboxes conform to the same ToolboxFactory signature, allowing the
 * resolver to execute them uniformly. The shared deps include eventBus so
 * all toolbox factories (base, context, and domain) have uniform access to
 * system-wide event emission.
 */

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { EventBus } from "./event-bus";

export interface GuildHallToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
  eventBus: EventBus;
}

export interface ToolboxOutput {
  server: McpSdkServerConfigWithInstance;
}

export type ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput;
