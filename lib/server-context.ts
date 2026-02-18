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
import { createRequire } from "node:module";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

import { createEventBus } from "./agent";
import type { EventBus, QueryFn } from "./agent";
import { AgentManager } from "./agent-manager";
import { MCPManager } from "./mcp-manager";
import type { MCPServerFactory } from "./mcp-manager";
import { createHttpMCPFactory } from "./http-mcp-factory";
import { PortRegistry } from "./port-registry";
import { createNodePidFileManager } from "./pid-file-manager";
import { sessionStore, sessionsDir } from "./node-session-store";
import { discoverGuildMembers } from "./plugin-discovery";
import type { FileSystem } from "./plugin-discovery";
import type { SessionStore, Clock } from "./session-store";
import type { GuildMember } from "./types";
import type { PidFileManager } from "./pid-file-manager";
import type { IPortRegistry } from "./port-registry";

// -- Factory types --

export type ServerContextDeps = {
  guildMembersDir: string;
  fs: FileSystem;
  queryFn: QueryFn;
  sessionStore: SessionStore;
  sessionsDir: string;
  serverFactory?: MCPServerFactory;
  clock?: Clock;
  pidFileManager?: PidFileManager;
  portRegistry?: IPortRegistry;
  bootCleanup?: boolean;
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
    const initStart = Date.now();
    console.log("[server-context] Initializing: discovering guild members...");

    // Boot cleanup: kill orphaned servers from prior crashes before discovery
    if (deps.bootCleanup && deps.pidFileManager) {
      await deps.pidFileManager.cleanupAll();
    }

    const roster = await discoverGuildMembers(deps.guildMembersDir, deps.fs);
    const memberNames = Array.from(roster.keys());
    console.log(`[server-context] Discovered ${roster.size} guild member(s): [${memberNames.join(", ")}]`);

    const factory: MCPServerFactory = deps.serverFactory ?? {
      spawn() {
        return Promise.reject(
          new Error(
            "MCP server spawning not yet implemented for agent queries",
          ),
        );
      },
      connect() {
        return Promise.reject(
          new Error(
            "MCP server connection not yet implemented for agent queries",
          ),
        );
      },
    };

    rosterInstance = roster;
    mcpManagerInstance = new MCPManager(
      roster,
      factory,
      deps.pidFileManager,
      deps.portRegistry,
    );

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

    const initElapsed = Date.now() - initStart;
    console.log(`[server-context] Initialization complete (${initElapsed}ms)`);
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

// -- Default instance for production --
//
// Turbopack evaluates server-side modules per-route in dev mode. Each route
// compilation gets its own module scope where both globalThis and process
// are sandboxed. Module-level singletons don't survive across routes.
//
// Fix: load a CJS module via Node.js native require() (through createRequire).
// Native require() uses a process-wide module cache keyed by resolved file
// path, which Turbopack cannot sandbox. All route bundles get the same
// exports object from _singleton-cache.cjs.
//
// This ensures ServerContext, EventBus, and AgentManager are shared across
// routes. MCP server processes are coordinated via PID files (pid-file-manager.ts)
// so duplicate module evaluations reconnect to existing servers instead of
// spawning duplicates.

type SingletonCache = {
  context?: ServerContext & { getInitPromise?: () => Promise<void> | null };
  shutdownRegistered?: boolean;
};

// createRequire needs a base path for resolving relative imports.
// We use an absolute path to the cache file, so the base doesn't matter
// beyond needing to be a valid file path.
const nativeRequire = createRequire(
  path.join(process.cwd(), "package.json"),
);
const singletonCache = nativeRequire(
  path.join(process.cwd(), "lib", "_singleton-cache.cjs"),
) as SingletonCache;

if (!singletonCache.context) {
  console.log("[server-context] Creating ServerContext (guildDir=%s, sessionsDir=%s, pidDir=%s)",
    process.env.GUILD_MEMBERS_DIR ?? path.resolve("./guild-members"),
    sessionsDir,
    path.resolve(".mcp-servers"),
  );
  const portRegistry = new PortRegistry();
  singletonCache.context = createServerContext({
    guildMembersDir:
      process.env.GUILD_MEMBERS_DIR ?? path.resolve("./guild-members"),
    fs: createNodePluginFs(),
    queryFn: query as QueryFn,
    sessionStore,
    sessionsDir,
    serverFactory: createHttpMCPFactory({ portRegistry }),
    pidFileManager: createNodePidFileManager(
      path.resolve(".mcp-servers"),
    ),
    portRegistry,
    // bootCleanup is intentionally false here. Turbopack creates multiple
    // module evaluations, each triggering initialize(). Boot cleanup would
    // kill healthy servers spawned by earlier evaluations. The per-member
    // PID file check in spawnServer handles crash recovery: dead PIDs get
    // cleaned up, alive+responsive servers get reconnected.
  });
} else {
  console.log("[server-context] Reusing existing ServerContext from singleton cache");
}

const defaultContext = singletonCache.context;

export const { getEventBus, getAgentManager, getMCPManager, getRosterMap } =
  defaultContext;

// Eagerly initialize roster on backend startup per REQ-MCP-HTTP-10
// Skip in test environment to avoid interference with test isolation
// Skip during Next.js build to avoid noisy worker initialization
const isTest = process.env.NODE_ENV === "test" || typeof (globalThis as Record<string, unknown>).Bun !== "undefined";
const isBuild = process.argv.includes("build") || process.env.NEXT_PHASE === "phase-production-build";

if (!isTest && !isBuild) {
  void getMCPManager().catch((err: unknown) => {
    console.error("[MCP] Failed to initialize roster on startup:", err);
  });
}

// -- Graceful shutdown --
//
// Signal handlers are also guarded via the singleton cache to avoid
// stacking duplicate handlers across module re-evaluations.

if (!singletonCache.shutdownRegistered) {
  singletonCache.shutdownRegistered = true;

  let shutdownInProgress = false;

  async function gracefulShutdown(signal: string) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    try {
      const initPromiseGetter = defaultContext.getInitPromise;
      const hasInit = initPromiseGetter && initPromiseGetter() !== null;
      if (hasInit) {
        console.log(`Received ${signal}, shutting down gracefully...`);
        const mcpManager = await getMCPManager();
        await mcpManager.shutdown();
        console.log("All MCP servers stopped");
      }
    } catch (err) {
      console.error("Error during shutdown:", err);
    }

    process.exit(0);
  }

  process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
  process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
}
