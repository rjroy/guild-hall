/**
 * Server-side singleton wiring for API routes.
 *
 * Creates and holds references to MCPManager, EventBus, and AgentManager
 * so that all API routes share the same instances. Lazily initialized on
 * first access because guild member discovery requires async filesystem reads.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

import { createEventBus } from "./agent";
import type { EventBus, QueryFn } from "./agent";
import { AgentManager } from "./agent-manager";
import { MCPManager } from "./mcp-manager";
import type { MCPServerFactory } from "./mcp-manager";
import { sessionStore, sessionsDir } from "./node-session-store";
import { discoverGuildMembers } from "./plugin-discovery";
import type { FileSystem } from "./plugin-discovery";
import type { GuildMember } from "./types";

// -- Configuration --

const guildMembersDir =
  process.env.GUILD_MEMBERS_DIR ?? path.resolve("./guild-members");

const nodeFs: FileSystem = {
  readdir: (dirPath: string) => fs.readdir(dirPath),
  readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
  stat: (filePath: string) => fs.stat(filePath),
};

// -- Singletons (lazily initialized) --

let eventBus: EventBus | null = null;
let mcpManagerInstance: MCPManager | null = null;
let rosterInstance: Map<string, GuildMember> | null = null;
let agentManager: AgentManager | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the shared event bus instance.
 */
export function getEventBus(): EventBus {
  if (!eventBus) {
    eventBus = createEventBus();
  }
  return eventBus;
}

/**
 * Get the shared agent manager instance. Initializes lazily on first call
 * since guild member discovery is async.
 */
export async function getAgentManager(): Promise<AgentManager> {
  if (agentManager) return agentManager;

  if (!initPromise) {
    initPromise = initialize();
  }

  await initPromise;

  // Non-null safe: initialize() sets agentManager before resolving
  return agentManager!;
}

/**
 * Get the shared MCPManager instance. Initializes lazily on first call.
 */
export async function getMCPManager(): Promise<MCPManager> {
  if (mcpManagerInstance) return mcpManagerInstance;

  if (!initPromise) {
    initPromise = initialize();
  }

  await initPromise;

  // Non-null safe: initialize() sets mcpManagerInstance before resolving
  return mcpManagerInstance!;
}

/**
 * Get the roster Map (keyed by member name). Initializes lazily on first call.
 */
export async function getRosterMap(): Promise<Map<string, GuildMember>> {
  if (rosterInstance) return rosterInstance;

  if (!initPromise) {
    initPromise = initialize();
  }

  await initPromise;

  // Non-null safe: initialize() sets rosterInstance before resolving
  return rosterInstance!;
}

async function initialize(): Promise<void> {
  const roster = await discoverGuildMembers(guildMembersDir, nodeFs);

  // MCPManager needs a factory for spawning server processes.
  // For now, we use a placeholder that rejects (MCP server spawning is
  // implemented in a later phase). The agent SDK manages MCP servers
  // itself via the mcpServers config, so we don't need to spawn them
  // separately for agent queries.
  const stubFactory: MCPServerFactory = {
    spawn() {
      return Promise.reject(
        new Error("MCP server spawning not yet implemented for agent queries"),
      );
    },
  };

  rosterInstance = roster;
  mcpManagerInstance = new MCPManager(roster, stubFactory);
  const bus = getEventBus();

  agentManager = new AgentManager({
    queryFn: query as QueryFn,
    sessionStore,
    mcpManager: mcpManagerInstance,
    eventBus: bus,
    clock: () => new Date(),
    sessionsDir,
  });
}
