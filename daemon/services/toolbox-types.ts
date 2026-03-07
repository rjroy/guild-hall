/**
 * Shared types for the toolbox factory interface.
 *
 * All toolboxes conform to the same ToolboxFactory signature, allowing the
 * resolver to execute them uniformly. The shared deps include eventBus so
 * all toolbox factories (base, context, and domain) have uniform access to
 * system-wide event emission.
 */

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AppConfig } from "@/lib/types";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import type { EventBus } from "@/daemon/lib/event-bus";

export interface GuildHallToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: "meeting" | "commission" | "mail";
  workerName: string;
  workerPortraitUrl?: string;
  eventBus: EventBus;
  config: AppConfig;
  services?: GuildHallToolServices;
  knownWorkerNames?: string[];
}

export interface ToolboxOutput {
  server: McpSdkServerConfigWithInstance;
}

export type ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput;
