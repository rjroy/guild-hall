/**
 * Shared types for the toolbox factory interface.
 *
 * All toolboxes conform to the same ToolboxFactory signature, allowing the
 * resolver to execute them uniformly. Toolboxes that need extra dependencies
 * (callbacks, services) use partial application: bind extras first, return
 * a ToolboxFactory.
 */

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

export interface GuildHallToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  contextType: "meeting" | "commission";
  workerName: string;
}

export interface ToolboxOutput {
  server: McpSdkServerConfigWithInstance;
  wasResultSubmitted?: () => boolean;
}

export type ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput;
