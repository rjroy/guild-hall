import type { GuildMember, ToolInfo } from "./types";

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
  }): Promise<MCPServerHandle>;
}

/**
 * MCP server config in the format the Agent SDK expects for query().
 * Placeholder shape, will be confirmed in Phase 7 (Agent SDK verification).
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
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
  private subscribers = new Set<(event: MCPEvent) => void>();

  constructor(
    private roster: Map<string, GuildMember>,
    private serverFactory: MCPServerFactory,
  ) {}

  /**
   * Start MCP servers for the given session. Each member gets the session
   * added to its reference set. Servers that are already running are not
   * restarted.
   */
  async startServersForSession(
    sessionId: string,
    memberNames: string[],
  ): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (!member) continue;

      // Add session to reference set
      let refs = this.references.get(name);
      if (!refs) {
        refs = new Set();
        this.references.set(name, refs);
      }
      refs.add(sessionId);

      // If server is already running, skip spawn
      if (this.servers.has(name)) continue;

      startPromises.push(this.spawnServer(name, member));
    }

    await Promise.all(startPromises);
  }

  /**
   * Remove a session's references from all servers. Servers with no remaining
   * references are stopped.
   */
  async releaseServersForSession(sessionId: string): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    const toRemove: string[] = [];

    for (const [name, refs] of this.references) {
      refs.delete(sessionId);

      if (refs.size === 0) {
        toRemove.push(name);
        const handle = this.servers.get(name);
        if (handle) {
          stopPromises.push(this.stopServer(name, handle));
        }
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
   */
  getServerConfigs(memberNames: string[]): Record<string, MCPServerConfig> {
    const configs: Record<string, MCPServerConfig> = {};

    for (const name of memberNames) {
      const member = this.roster.get(name);
      if (!member) continue;

      const config: MCPServerConfig = {
        command: member.mcp.command,
        args: member.mcp.args,
      };

      if (member.mcp.env) {
        config.env = member.mcp.env;
      }

      configs[name] = config;
    }

    return configs;
  }

  /** Check whether a server is currently running for the given member. */
  isRunning(memberName: string): boolean {
    return this.servers.has(memberName);
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
    const stopPromises: Promise<void>[] = [];

    for (const [name, handle] of this.servers) {
      stopPromises.push(this.stopServer(name, handle));
    }

    await Promise.all(stopPromises);

    this.references.clear();
    this.subscribers.clear();
  }

  // -- Private helpers --

  private async spawnServer(
    name: string,
    member: GuildMember,
  ): Promise<void> {
    try {
      // Note: serverFactory.spawn() is responsible for setting the working
      // directory to the plugin's directory before spawning. See the
      // MCPServerFactory interface documentation for the contract.
      const handle = await this.serverFactory.spawn({
        command: member.mcp.command,
        args: member.mcp.args,
        env: member.mcp.env,
      });

      this.servers.set(name, handle);

      const tools = await handle.listTools();

      // Update the roster entry
      member.status = "connected";
      member.tools = tools;
      delete member.error;

      this.emit({ type: "started", memberName: name });
      this.emit({ type: "tools_updated", memberName: name, tools });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);

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
    this.servers.delete(name);

    try {
      await handle.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
