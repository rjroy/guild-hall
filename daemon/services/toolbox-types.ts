/**
 * Shared types for the toolbox factory interface.
 *
 * All toolboxes conform to the same ToolboxFactory signature, allowing the
 * resolver to execute them uniformly. The shared deps include eventBus so
 * all toolbox factories (base, context, and domain) have uniform access to
 * system-wide event emission.
 */

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AppConfig, WorkerIdentity } from "@/lib/types";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { BriefingResult } from "./briefing-generator";

export interface GuildHallToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: string;
  workerName: string;
  eventBus: EventBus;
  config: AppConfig;
  services?: GuildHallToolServices;
  knownWorkerNames?: string[];
  getCachedBriefing?: (projectName: string) => Promise<BriefingResult | null>;
  getWorkerIdentities?: () => WorkerIdentity[];
  stateSubdir?: string;
}

export interface ToolboxOutput {
  server: McpSdkServerConfigWithInstance;
}

export type ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput;

export interface ContextTypeRegistration {
  name: string;
  toolboxFactory?: ToolboxFactory;
  stateSubdir: string;
}

export type ContextTypeRegistry = Map<string, ContextTypeRegistration>;
