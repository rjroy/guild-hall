import type { ChildProcess } from "node:child_process";

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

import type { GuildMember, ToolInfo } from "./types";
import type { PidFileManager } from "./pid-file-manager";
import type { IPortRegistry } from "./port-registry";
import { createDispatchBridge } from "./dispatch-bridge";
import type { DispatchBridgeDeps } from "./dispatch-bridge";

// -- MCP server abstractions --

/** Tool descriptor returned by an MCP server's listTools call. */
export type MCPToolInfo = ToolInfo;

/** A running MCP server process. Injected via MCPServerFactory. */
export interface MCPServerHandle {
  stop(): Promise<void>;
  listTools(): Promise<MCPToolInfo[]>;
  invokeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<unknown>;
}

/**
 * Factory for creating server handles. Injected for testability.
 *
 * Working Directory Contract:
 * Implementations MUST set the current working directory to the plugin's
 * directory before spawning the process. This allows plugins to use relative
 * paths in their command/args and server code without knowing their install path.
 *
 * Example: For a plugin at `guild-members/example/`, the implementation should:
 * - Set cwd to `guild-members/example/`
 * - Then spawn the process with the given command/args
 * - Plugin can use `bun run server.ts` instead of `bun run guild-members/example/server.ts`
 */
export interface MCPServerFactory {
  spawn(config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    pluginDir: string;
  }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }>;
  connect(config: { port: number }): Promise<{ handle: MCPServerHandle }>;
}

/**
 * MCP server config in the format the Agent SDK expects for query().
 * HTTP transport: { type: "http", url: "..." }
 */
export interface MCPServerConfig {
  type: "http";
  url: string;
}

// -- Events --

export type MCPEvent =
  | { type: "started"; memberName: string }
  | { type: "stopped"; memberName: string }
  | { type: "error"; memberName: string; error: string }
  | { type: "tools_updated"; memberName: string; tools: MCPToolInfo[] };

// -- MCPManager --

/**
 * Manages MCP server lifecycles with reference counting.
 *
 * Servers are started when a session needs them and stopped when no sessions
 * reference them. The actual process spawning is delegated to an injected
 * MCPServerFactory, keeping this class testable without mock.module().
 */
export class MCPManager {
  private references = new Map<string, Set<string>>();
  private servers = new Map<string, MCPServerHandle>();
  private processes = new Map<string, ChildProcess>();
  private subscribers = new Set<(event: MCPEvent) => void>();
  private dispatchBridges = new Map<string, McpSdkServerConfigWithInstance>();
  // Servers started by initializeRoster live for the process lifetime.
  // releaseServersForSession skips them; only shutdown() stops them.
  private rosterServers = new Set<string>();

  constructor(
    private roster: Map<string, GuildMember>,
    private serverFactory: MCPServerFactory,
    private pidFiles?: PidFileManager,
    private portRegistry?: IPortRegistry,
  ) {}

  /**
   * Eagerly start all HTTP transport servers. Called during backend initialization.
   * Uses Promise.allSettled to continue even if some servers fail.
   */
  async initializeRoster(): Promise<void> {
    const httpMembers = Array.from(this.roster.entries()).filter(
      ([, member]) => member.transport === "http",
    );

    console.log(`[MCP] Initializing roster: ${httpMembers.length} HTTP server(s) to spawn`);

    const results = await Promise.allSettled(
      httpMembers.map(async ([name, member]) => {
        await this.spawnServer(name, member);
        this.rosterServers.add(name);
      }),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`[MCP] Roster initialization complete: ${succeeded} connected, ${failed} failed`);
  }

  /**
   * Start MCP servers for the given session. Each member gets the session
   * added to its reference set. Servers that are already running are not
   * restarted.
   */
  async startServersForSession(
    sessionId: string,
    memberNames: string[],
  ): Promise<void> {
    console.log(`[MCP] startServersForSession: session=${sessionId}, members=[${memberNames.join(", ")}]`);
    const startPromises: Promise<void>[] = [];

    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (!member) {
        console.log(`[MCP:${name}] Not in roster, skipping`);
        continue;
      }

      // Add session to reference set
      let refs = this.references.get(name);
      if (!refs) {
        refs = new Set();
        this.references.set(name, refs);
      }
      refs.add(sessionId);

      // If server is already running, skip spawn
      if (this.servers.has(name)) {
        console.log(`[MCP:${name}] Already running, added session ref (${refs.size} total refs)`);
        continue;
      }

      startPromises.push(this.spawnServer(name, member));
    }

    await Promise.all(startPromises);
  }

  /**
   * Remove a session's references from all servers. Servers with no remaining
   * references are stopped, UNLESS they were started by initializeRoster.
   * Roster servers live for the process lifetime (only shutdown() stops them).
   */
  async releaseServersForSession(sessionId: string): Promise<void> {
    console.log(`[MCP] releaseServersForSession: session=${sessionId}`);
    const stopPromises: Promise<void>[] = [];
    const toRemove: string[] = [];

    for (const [name, refs] of this.references) {
      refs.delete(sessionId);

      if (refs.size === 0) {
        toRemove.push(name);
        // Roster servers stay running between sessions
        if (this.rosterServers.has(name)) {
          console.log(`[MCP:${name}] Session refs cleared, keeping alive (roster server)`);
        } else {
          const handle = this.servers.get(name);
          if (handle) {
            console.log(`[MCP:${name}] No remaining session refs, stopping server`);
            stopPromises.push(this.stopServer(name, handle));
          }
        }
      } else {
        console.log(`[MCP:${name}] Released session ref (${refs.size} remaining)`);
      }
    }

    for (const name of toRemove) {
      this.references.delete(name);
    }

    await Promise.all(stopPromises);
  }

  /**
   * Return MCP configs for the named members, suitable for passing to the
   * Agent SDK's query() call. Keyed by member name, matching the SDK's
   * expected Record<string, McpServerConfig> shape.
   *
   * Only connected HTTP transport members are included. Worker-only plugins
   * (capabilities includes "worker" but NOT "tools") are excluded since they
   * have no direct tools for the main agent. Hybrid plugins (both "worker"
   * and "tools") are included. Plugins without capabilities are included
   * for backwards compatibility.
   */
  getServerConfigs(memberNames: string[]): Record<string, MCPServerConfig> {
    const configs: Record<string, MCPServerConfig> = {};

    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (!member || member.status !== "connected") continue;

      // Skip worker-only plugins: has "worker" but not "tools" capability
      if (this.isWorkerOnly(member)) continue;

      if (member.transport === "http") {
        configs[name] = {
          type: "http",
          url: `http://localhost:${member.port}/mcp`,
        };
      }
    }

    return configs;
  }

  /**
   * Return dispatch MCP server configs for worker-capable plugins. Each config
   * is an in-process SDK server that proxies dispatch/list/status/result/cancel/delete
   * tool calls to the plugin's worker/* JSON-RPC endpoints.
   *
   * Keyed as `${memberName}-dispatch`. Only connected members with "worker"
   * capability are included. Dispatch bridges are created lazily on first call.
   */
  getDispatchConfigs(
    memberNames: string[],
    deps?: Partial<DispatchBridgeDeps>,
  ): Record<string, McpSdkServerConfigWithInstance> {
    const configs: Record<string, McpSdkServerConfigWithInstance> = {};

    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (!member || member.status !== "connected") continue;
      if (!member.capabilities?.includes("worker")) continue;
      if (member.port === undefined) continue;

      const key = `${name}-dispatch`;

      // Check cache first
      let config = this.dispatchBridges.get(key);
      if (!config) {
        config = createDispatchBridge(name, member.port, deps);
        this.dispatchBridges.set(key, config);
      }

      configs[key] = config;
    }

    return configs;
  }

  /** Check whether a server is currently running for the given member. */
  isRunning(memberName: string): boolean {
    return this.servers.has(memberName);
  }

  /**
   * Return the subset of the given member names that have "worker" in their
   * capabilities. Used by the system prompt builder to add dispatch guidance
   * only when worker-capable plugins are present in the session.
   */
  getWorkerCapableMembers(memberNames: string[]): GuildMember[] {
    const result: GuildMember[] = [];
    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (member?.capabilities?.includes("worker")) {
        result.push(member);
      }
    }
    return result;
  }

  /**
   * Invoke a tool on a member's MCP server. If the server isn't running,
   * start it with a temporary reference, invoke the tool, then release
   * the temporary reference (which stops the server if no other sessions
   * need it).
   */
  async invokeTool(
    memberName: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<unknown> {
    const handle = this.servers.get(memberName);

    if (handle) {
      return handle.invokeTool(toolName, toolInput);
    }

    // Server not running: start with temporary reference, invoke, release
    const tempSessionId = `__tool_invoke_${Date.now()}`;
    await this.startServersForSession(tempSessionId, [memberName]);

    try {
      const tempHandle = this.servers.get(memberName);
      if (!tempHandle) {
        throw new Error(
          `Failed to start server for member "${memberName}"`,
        );
      }
      return await tempHandle.invokeTool(toolName, toolInput);
    } finally {
      await this.releaseServersForSession(tempSessionId);
    }
  }

  /** Subscribe to MCP lifecycle events. Returns an unsubscribe function. */
  subscribe(callback: (event: MCPEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** Stop all running servers and clear all state. */
  async shutdown(): Promise<void> {
    console.log(`[MCP] Shutting down ${this.servers.size} server(s)...`);

    const shutdownPromises = Array.from(this.servers.entries()).map(
      async ([name, handle]) => {
        try {
          console.log(`[MCP:${name}] Stopping server...`);
          await handle.stop();
          const member = this.roster.get(name);
          if (member) {
            member.status = "disconnected";
            delete member.error;
          }
          console.log(`[MCP:${name}] Stopped successfully`);
          this.emit({ type: "stopped", memberName: name });
        } catch (err) {
          console.error(`[MCP:${name}] Failed to stop:`, err);
          const member = this.roster.get(name);
          if (member) {
            member.status = "error";
            member.error = err instanceof Error ? err.message : String(err);
          }
          const message = err instanceof Error ? err.message : String(err);
          this.emit({ type: "error", memberName: name, error: message });
        }
      },
    );

    await Promise.allSettled(shutdownPromises);
    this.servers.clear();
    this.processes.clear();
    this.references.clear();
    this.subscribers.clear();
    this.dispatchBridges.clear();
    this.rosterServers.clear();

    if (this.pidFiles) {
      await this.pidFiles.shutdownAll();
    }

    console.log(`[MCP] Shutdown complete`);
  }

  // -- Private helpers --

  /**
   * A worker-only plugin has "worker" in capabilities but NOT "tools".
   * These plugins expose no direct tools for the main agent; they're
   * accessed exclusively through the dispatch bridge.
   *
   * Plugins without capabilities are NOT worker-only (backwards compatible
   * as tool-only).
   */
  private isWorkerOnly(member: GuildMember): boolean {
    const caps = member.capabilities;
    if (!caps) return false;
    return caps.includes("worker") && !caps.includes("tools");
  }

  private async spawnServer(
    name: string,
    member: GuildMember,
  ): Promise<void> {
    try {
      // Ensure pluginDir is present
      if (!member.pluginDir) {
        throw new Error(`Plugin directory not set for member "${name}"`);
      }

      console.log(`[MCP:${name}] Starting server (transport=${member.transport}, capabilities=[${member.capabilities?.join(", ") ?? "none"}])...`);

      // Check PID file for existing server
      if (this.pidFiles) {
        const pidData = await this.pidFiles.read(name);
        if (pidData) {
          console.log(`[MCP:${name}] Found PID file: pid=${pidData.pid}, port=${pidData.port}`);
          if (this.pidFiles.isAlive(pidData.pid)) {
            try {
              const { handle } = await this.serverFactory.connect({ port: pidData.port });
              this.servers.set(name, handle);
              this.portRegistry?.reserve(pidData.port);

              const tools = await handle.listTools();
              member.status = "connected";
              member.tools = tools;
              member.port = pidData.port;
              delete member.error;

              console.log(`[MCP:${name}] Reconnected to existing server on port ${pidData.port} (pid=${pidData.pid}, ${tools.length} tools)`);
              this.emit({ type: "started", memberName: name });
              this.emit({ type: "tools_updated", memberName: name, tools });
              return;
            } catch {
              console.log(`[MCP:${name}] PID ${pidData.pid} alive but not responsive, treating as stale`);
            }
          } else {
            console.log(`[MCP:${name}] PID ${pidData.pid} is dead, removing stale PID file`);
          }
          await this.pidFiles.remove(name);
        } else {
          console.log(`[MCP:${name}] No PID file found, spawning fresh`);
        }
      }

      // Note: serverFactory.spawn() is responsible for setting the working
      // directory to the plugin's directory before spawning. See the
      // MCPServerFactory interface documentation for the contract.
      const { process, handle, port } = await this.serverFactory.spawn({
        name,
        command: member.mcp.command,
        args: member.mcp.args,
        env: member.mcp.env,
        pluginDir: member.pluginDir,
      });

      this.servers.set(name, handle);
      this.processes.set(name, process);

      // Write PID file after successful spawn
      if (this.pidFiles) {
        console.log(`[MCP:${name}] Writing PID file: pid=${process.pid ?? 0}, port=${port}`);
        await this.pidFiles.write(name, { pid: process.pid ?? 0, port });
      }

      // Attach crash detection listener
      process.on("exit", (code, signal) => {
        // Only handle crashes if the server was expected to be running
        if (!this.servers.has(name)) {
          return;
        }

        const errorMsg = signal
          ? `Process killed with signal ${signal}`
          : `Process exited with code ${code ?? "unknown"}`;

        console.error(`[MCP:${name}] Server crashed: ${errorMsg}`);

        member.status = "error";
        member.error = errorMsg;

        this.servers.delete(name);
        this.processes.delete(name);

        this.emit({ type: "error", memberName: name, error: errorMsg });
      });

      const tools = await handle.listTools();

      // Update the roster entry
      member.status = "connected";
      member.tools = tools;
      member.port = port;
      delete member.error;

      console.log(`[MCP:${name}] Initialized successfully (${tools.length} tools, port ${port})`);

      this.emit({ type: "started", memberName: name });
      this.emit({ type: "tools_updated", memberName: name, tools });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      console.error(`[MCP:${name}] Failed to start: ${message}`);

      // Update the roster entry with error status
      member.status = "error";
      member.error = message;

      this.emit({ type: "error", memberName: name, error: message });
    }
  }

  private async stopServer(
    name: string,
    handle: MCPServerHandle,
  ): Promise<void> {
    console.log(`[MCP:${name}] Stopping server...`);
    this.servers.delete(name);
    this.processes.delete(name);

    try {
      await handle.stop();
      console.log(`[MCP:${name}] Server stopped`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[MCP:${name}] Error stopping server: ${message}`);
      this.emit({ type: "error", memberName: name, error: message });
    }

    const member = this.roster.get(name);
    if (member) {
      member.status = "disconnected";
      delete member.error;
    }

    this.emit({ type: "stopped", memberName: name });
  }

  private emit(event: MCPEvent): void {
    for (const callback of this.subscribers) {
      callback(event);
    }
  }
}
