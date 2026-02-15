/**
 * Server-side singleton wiring for API routes.
 *
 * Creates and holds references to MCPManager, EventBus, and AgentManager
 * so that all API routes share the same instances. Lazily initialized on
 * first access because guild member discovery requires async filesystem reads.
 *
 * The createServerContext() factory enables testing by injecting dependencies.
 * The module-level exports (getEventBus, etc.) use a default instance wired
 * to real dependencies for production.
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
import type { SessionStore, Clock } from "./session-store";
import type { GuildMember } from "./types";

// -- Factory types --

export type ServerContextDeps = {
  guildMembersDir: string;
  fs: FileSystem;
  queryFn: QueryFn;
  sessionStore: SessionStore;
  sessionsDir: string;
  serverFactory?: MCPServerFactory;
  clock?: Clock;
};

export type ServerContext = {
  getEventBus: () => EventBus;
  getAgentManager: () => Promise<AgentManager>;
  getMCPManager: () => Promise<MCPManager>;
  getRosterMap: () => Promise<Map<string, GuildMember>>;
};

// -- Factory --

export function createServerContext(deps: ServerContextDeps): ServerContext & {
  getInitPromise?: () => Promise<void> | null;
} {
  let eventBus: EventBus | null = null;
  let mcpManagerInstance: MCPManager | null = null;
  let rosterInstance: Map<string, GuildMember> | null = null;
  let agentManager: AgentManager | null = null;
  let initPromise: Promise<void> | null = null;

  async function initialize(): Promise<void> {
    const roster = await discoverGuildMembers(deps.guildMembersDir, deps.fs);

    const factory: MCPServerFactory = deps.serverFactory ?? {
      spawn() {
        return Promise.reject(
          new Error(
            "MCP server spawning not yet implemented for agent queries",
          ),
        );
      },
    };

    rosterInstance = roster;
    mcpManagerInstance = new MCPManager(roster, factory);

    // Eagerly start all HTTP transport servers
    await mcpManagerInstance.initializeRoster();

    const bus = contextGetEventBus();

    agentManager = new AgentManager({
      queryFn: deps.queryFn,
      sessionStore: deps.sessionStore,
      mcpManager: mcpManagerInstance,
      eventBus: bus,
      clock: deps.clock ?? (() => new Date()),
      sessionsDir: deps.sessionsDir,
    });
  }

  function ensureInit(): Promise<void> {
    if (!initPromise) {
      initPromise = initialize();
    }
    return initPromise;
  }

  function contextGetEventBus(): EventBus {
    if (!eventBus) {
      eventBus = createEventBus();
    }
    return eventBus;
  }

  return {
    getEventBus: contextGetEventBus,

    async getAgentManager(): Promise<AgentManager> {
      if (agentManager) return agentManager;
      await ensureInit();
      // Non-null safe: initialize() sets agentManager before resolving
      return agentManager!;
    },

    async getMCPManager(): Promise<MCPManager> {
      if (mcpManagerInstance) return mcpManagerInstance;
      await ensureInit();
      // Non-null safe: initialize() sets mcpManagerInstance before resolving
      return mcpManagerInstance!;
    },

    async getRosterMap(): Promise<Map<string, GuildMember>> {
      if (rosterInstance) return rosterInstance;
      await ensureInit();
      // Non-null safe: initialize() sets rosterInstance before resolving
      return rosterInstance!;
    },

    getInitPromise: () => initPromise,
  };
}

// -- Node.js filesystem adapter --

/** Creates a FileSystem backed by Node.js fs/promises. */
export function createNodePluginFs(): FileSystem {
  return {
    readdir: (dirPath: string) => fs.readdir(dirPath),
    readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
    stat: (filePath: string) => fs.stat(filePath),
  };
}

// -- Graceful shutdown --

let shutdownInProgress = false;

// Expose a way to check if initialization has started
// Declared as let so it can be reassigned after defaultContext is created
let initPromiseGetter: (() => Promise<void> | null) | null = null;

// -- Default instance for production --

const defaultContext = createServerContext({
  guildMembersDir:
    process.env.GUILD_MEMBERS_DIR ?? path.resolve("./guild-members"),
  fs: createNodePluginFs(),
  queryFn: query as QueryFn,
  sessionStore,
  sessionsDir,
});

// Wire up the initPromise getter for graceful shutdown
if (defaultContext.getInitPromise) {
  initPromiseGetter = defaultContext.getInitPromise;
}

export const { getEventBus, getAgentManager, getMCPManager, getRosterMap } =
  defaultContext;

// Eagerly initialize roster on backend startup per REQ-MCP-HTTP-10
// This starts all MCP servers immediately when Next.js loads this module
void getMCPManager().catch((err) => {
  console.error("[MCP] Failed to initialize roster on startup:", err);
});

async function gracefulShutdown(signal: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    // Only shutdown if already initialized
    // Check via the factory's internal initPromise to avoid triggering lazy init
    const hasInit = initPromiseGetter && initPromiseGetter() !== null;
    if (hasInit) {
      const mcpManager = await getMCPManager();
      await mcpManager.shutdown();
      console.log("All MCP servers stopped");
    } else {
      console.log("No servers initialized, skipping shutdown");
    }
  } catch (err) {
    console.error("Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
