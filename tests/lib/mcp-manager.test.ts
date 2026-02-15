import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { MCPManager } from "@/lib/mcp-manager";
import type {
  MCPEvent,
  MCPServerFactory,
  MCPServerHandle,
  MCPToolInfo,
} from "@/lib/mcp-manager";
import type { GuildMember } from "@/lib/types";

// -- Fixtures --

function makeGuildMember(overrides: Partial<GuildMember> = {}): GuildMember {
  return {
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
    transport: "http",
    mcp: { command: "node", args: ["server.js"] },
    status: "disconnected",
    tools: [],
    pluginDir: "/test/plugin/dir",
    ...overrides,
  };
}

function createMockProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return emitter as ChildProcess;
}

const defaultTools: MCPToolInfo[] = [
  {
    name: "read_file",
    description: "Reads a file",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "write_file",
    description: "Writes a file",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
    },
  },
];

function createMockHandle(options: {
  tools?: MCPToolInfo[];
  invokeResult?: unknown;
  stopError?: Error;
} = {}): MCPServerHandle & { stopped: boolean } {
  const tools = options.tools ?? defaultTools;
  const invokeResult = options.invokeResult ?? { success: true };

  return {
    stopped: false,
    stop() {
      if (options.stopError) return Promise.reject(options.stopError);
      this.stopped = true;
      return Promise.resolve();
    },
    listTools() {
      return Promise.resolve(tools);
    },
    invokeTool() {
      return Promise.resolve(invokeResult);
    },
  };
}

type SpawnConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
  pluginDir: string;
};

function createMockFactory(options: {
  handles?: Map<string, MCPServerHandle & { stopped: boolean }>;
  spawnError?: Error;
  processes?: Map<string, ChildProcess>;
} = {}): MCPServerFactory & { spawnCount: number; spawnCalls: SpawnConfig[] } {
  const handles = options.handles ?? new Map<string, MCPServerHandle & { stopped: boolean }>();
  const processes = options.processes ?? new Map<string, ChildProcess>();

  const factory = {
    spawnCount: 0,
    spawnCalls: [] as SpawnConfig[],
    spawn(config: SpawnConfig): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }> {
      factory.spawnCount++;
      factory.spawnCalls.push(config);

      if (options.spawnError) return Promise.reject(options.spawnError);

      // Check if a specific handle was provided for this command
      const entries = Array.from(handles.entries());
      for (const [key, handle] of entries) {
        if (config.command === key || config.args.includes(key)) {
          const proc = processes.get(key) ?? createMockProcess();
          return Promise.resolve({ process: proc, handle, port: 50000 });
        }
      }

      // Return a default mock handle
      const proc = createMockProcess();
      return Promise.resolve({ process: proc, handle: createMockHandle(), port: 50000 });
    },
  };

  return factory;
}

function createRoster(
  members: Array<[string, GuildMember]>,
): Map<string, GuildMember> {
  return new Map(members);
}

function collectEvents(manager: MCPManager): MCPEvent[] {
  const events: MCPEvent[] = [];
  manager.subscribe((event) => events.push(event));
  return events;
}

// -- Tests --

describe("MCPManager", () => {
  describe("initializeRoster", () => {
    it("starts all HTTP transport plugins", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", pluginDir: "/test/alpha" })],
        ["beta", makeGuildMember({ name: "beta", transport: "http", pluginDir: "/test/beta" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      expect(factory.spawnCount).toBe(2);
      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("beta")).toBe(true);
      expect(roster.get("alpha")!.status).toBe("connected");
      expect(roster.get("beta")!.status).toBe("connected");
    });

    it("populates member.port with allocated port", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      expect(roster.get("alpha")!.port).toBe(50000);
    });

    it("populates member.tools from listTools", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      expect(roster.get("alpha")!.tools).toEqual(defaultTools);
    });

    it("emits started and tools_updated events for each server", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.initializeRoster();

      const types = events.map((e) => e.type);
      expect(types).toContain("started");
      expect(types).toContain("tools_updated");
    });

    it("sets status to error when spawn fails and doesn't block other servers", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", mcp: { command: "fail", args: [] } })],
        ["beta", makeGuildMember({ name: "beta", transport: "http", mcp: { command: "succeed", args: [] } })],
      ]);
      // Create a factory that fails for "fail" command but succeeds for others
      const factory: MCPServerFactory & { spawnCount: number; spawnCalls: SpawnConfig[] } = {
        spawnCount: 0,
        spawnCalls: [],
        spawn(config: SpawnConfig) {
          factory.spawnCount++;
          factory.spawnCalls.push(config);

          if (config.command === "fail") {
            return Promise.reject(new Error("Connection refused"));
          }

          return Promise.resolve({
            process: createMockProcess(),
            handle: createMockHandle(),
            port: 50000,
          });
        },
      };

      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.initializeRoster();

      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toBe("Connection refused");
      expect(roster.get("beta")!.status).toBe("connected");

      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(1);
    });

    it("skips non-HTTP plugins", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
        ["beta", makeGuildMember({ name: "beta", transport: "stdio" as "http" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      // Only HTTP plugin started
      expect(factory.spawnCount).toBe(1);
      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("beta")).toBe(false);
    });

    it("passes pluginDir to factory", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", pluginDir: "/custom/path" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      expect(factory.spawnCalls[0].pluginDir).toBe("/custom/path");
    });

    it("attaches exit listener that triggers on process crash", async () => {
      const mockProc = createMockProcess();
      const mockHandle = createMockHandle();
      const handles = new Map([["alpha", mockHandle]]);
      const processes = new Map([["alpha", mockProc]]);
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", mcp: { command: "alpha", args: [] } })],
      ]);
      const factory = createMockFactory({ handles, processes });
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.initializeRoster();

      expect(roster.get("alpha")!.status).toBe("connected");

      // Simulate process crash
      mockProc.emit("exit", 1, null);

      // Wait for event loop to process the exit event
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toContain("Process exited with code 1");

      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it("handles listTools failure by setting status to error", async () => {
      const failHandle = createMockHandle();
      failHandle.listTools = () => Promise.reject(new Error("Tools list failed"));

      const handles = new Map([["alpha", failHandle]]);
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", mcp: { command: "alpha", args: [] } })],
      ]);
      const factory = createMockFactory({ handles });
      const manager = new MCPManager(roster, factory);

      await manager.initializeRoster();

      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toContain("Tools list failed");
    });
  });

  describe("startServersForSession", () => {
    it("starts servers for all requested members and sets status to connected", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
        ["beta", makeGuildMember({ name: "beta", mcp: { command: "python", args: ["beta.py"] } })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha", "beta"]);

      expect(factory.spawnCount).toBe(2);
      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("beta")).toBe(true);

      // Roster entries updated to connected
      // Non-null safe: roster was built with these keys
      expect(roster.get("alpha")!.status).toBe("connected");
      expect(roster.get("beta")!.status).toBe("connected");

      // Tools populated from listTools() as full MCPToolInfo objects
      expect(roster.get("alpha")!.tools).toEqual(defaultTools);
      expect(roster.get("beta")!.tools).toEqual(defaultTools);
    });

    it("does not start a duplicate server when a second session references the same member", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);
      await manager.startServersForSession("session-2", ["alpha"]);

      // spawn called only once despite two sessions
      expect(factory.spawnCount).toBe(1);
      expect(manager.isRunning("alpha")).toBe(true);
    });

    it("skips members not in the roster", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", [
        "alpha",
        "nonexistent",
      ]);

      expect(factory.spawnCount).toBe(1);
      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("nonexistent")).toBe(false);
    });
  });

  describe("releaseServersForSession", () => {
    it("keeps a shared server running when one session releases", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);
      await manager.startServersForSession("session-2", ["alpha"]);

      await manager.releaseServersForSession("session-1");

      // Server still running because session-2 holds a reference
      expect(manager.isRunning("alpha")).toBe(true);
      expect(roster.get("alpha")!.status).toBe("connected");
    });

    it("stops the server when the last session releases", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);
      await manager.startServersForSession("session-2", ["alpha"]);

      await manager.releaseServersForSession("session-1");
      await manager.releaseServersForSession("session-2");

      expect(manager.isRunning("alpha")).toBe(false);
      expect(roster.get("alpha")!.status).toBe("disconnected");
    });

    it("is a no-op for an unknown session", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      // Should not throw
      await manager.releaseServersForSession("unknown-session");

      expect(manager.isRunning("alpha")).toBe(false);
    });
  });

  describe("getServerConfigs", () => {
    it("returns HTTP config with correct URL format for connected members", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
        ["beta", makeGuildMember({ name: "beta", transport: "http" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      // Start servers to get them connected with ports
      await manager.initializeRoster();

      const configs = manager.getServerConfigs(["alpha", "beta"]);

      expect(configs).toEqual({
        alpha: { type: "http", url: "http://localhost:50000/mcp" },
        beta: { type: "http", url: "http://localhost:50000/mcp" },
      });
    });

    it("port number matches allocated port", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http" })],
      ]);

      // Custom factory that returns a specific port
      const factory: MCPServerFactory & { spawnCount: number } = {
        spawnCount: 0,
        spawn() {
          factory.spawnCount++;
          return Promise.resolve({
            process: createMockProcess(),
            handle: createMockHandle(),
            port: 50123,
          });
        },
      };

      const manager = new MCPManager(roster, factory);
      await manager.initializeRoster();

      const configs = manager.getServerConfigs(["alpha"]);

      expect(configs["alpha"].url).toBe("http://localhost:50123/mcp");
      expect(roster.get("alpha")!.port).toBe(50123);
    });

    it("excludes disconnected members", () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", status: "connected", port: 50000 })],
        ["beta", makeGuildMember({ name: "beta", transport: "http", status: "disconnected" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const configs = manager.getServerConfigs(["alpha", "beta"]);

      expect(Object.keys(configs)).toHaveLength(1);
      expect(configs["alpha"]).toEqual({ type: "http", url: "http://localhost:50000/mcp" });
      expect(configs["beta"]).toBeUndefined();
    });

    it("only includes status=connected members", () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", status: "connected", port: 50000 })],
        ["beta", makeGuildMember({ name: "beta", transport: "http", status: "error", port: 50001 })],
        ["gamma", makeGuildMember({ name: "gamma", transport: "http", status: "disconnected" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const configs = manager.getServerConfigs(["alpha", "beta", "gamma"]);

      expect(Object.keys(configs)).toHaveLength(1);
      expect(configs["alpha"]).toEqual({ type: "http", url: "http://localhost:50000/mcp" });
    });

    it("skips members not in the roster", () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", transport: "http", status: "connected", port: 50000 })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const configs = manager.getServerConfigs(["alpha", "nonexistent"]);

      expect(Object.keys(configs)).toHaveLength(1);
      expect(configs["alpha"]).toEqual({ type: "http", url: "http://localhost:50000/mcp" });
    });
  });

  describe("invokeTool", () => {
    it("invokes a tool on a running server and returns the result", async () => {
      const mockHandle = createMockHandle({
        invokeResult: { content: "hello world" },
      });
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
      ]);
      const factory = createMockFactory({
        handles: new Map([["alpha.js", mockHandle]]),
      });
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);

      const result = await manager.invokeTool("alpha", "read_file", {
        path: "/tmp/test",
      });

      expect(result).toEqual({ content: "hello world" });
      // Server still running (not stopped by invokeTool)
      expect(manager.isRunning("alpha")).toBe(true);
    });

    it("starts a stopped server, invokes the tool, then stops it", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      // Server not running
      expect(manager.isRunning("alpha")).toBe(false);

      const result = await manager.invokeTool("alpha", "read_file", {
        path: "/tmp/test",
      });

      expect(result).toEqual({ success: true });
      // Server should be stopped again after the invocation
      expect(manager.isRunning("alpha")).toBe(false);
      // Should have seen started, tools_updated, then stopped events
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain("started");
      expect(eventTypes).toContain("stopped");
    });
  });

  describe("error handling", () => {
    it("sets member status to error when spawn fails", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory({
        spawnError: new Error("Connection refused"),
      });
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.startServersForSession("session-1", ["alpha"]);

      expect(manager.isRunning("alpha")).toBe(false);
      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toBe("Connection refused");

      // Error event emitted
      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].type === "error" && errorEvents[0].error).toBe(
        "Connection refused",
      );
    });

    it("cleans up and emits error then stopped when handle.stop() throws", async () => {
      const failHandle = createMockHandle({
        stopError: new Error("Process already exited"),
      });
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
      ]);
      const factory = createMockFactory({
        handles: new Map([["alpha.js", failHandle]]),
      });
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.startServersForSession("session-1", ["alpha"]);
      expect(manager.isRunning("alpha")).toBe(true);

      // Release triggers stopServer, which will fail on handle.stop()
      await manager.releaseServersForSession("session-1");

      // Server should be cleaned up despite stop() throwing
      expect(manager.isRunning("alpha")).toBe(false);
      expect(roster.get("alpha")!.status).toBe("disconnected");
      expect(roster.get("alpha")!.error).toBeUndefined();

      // Error event emitted before stopped event
      const eventTypes = events.map((e) => e.type);
      const errorIndex = eventTypes.lastIndexOf("error");
      const stoppedIndex = eventTypes.lastIndexOf("stopped");
      expect(errorIndex).toBeGreaterThan(-1);
      expect(stoppedIndex).toBeGreaterThan(errorIndex);

      const errorEvent = events[errorIndex];
      expect(errorEvent.type === "error" && errorEvent.error).toBe(
        "Process already exited",
      );
    });

    it("sets error message from non-Error throw values", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory: MCPServerFactory & { spawnCount: number } = {
        spawnCount: 0,
        spawn() {
          factory.spawnCount++;
          return Promise.reject("string error"); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
        },
      };
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);

      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toBe("string error");
    });
  });

  describe("shutdown", () => {
    it("stops all running servers and clears state", async () => {
      const alphaHandle = createMockHandle();
      const betaHandle = createMockHandle();
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
        ["beta", makeGuildMember({ name: "beta", mcp: { command: "python", args: ["beta.py"] } })],
      ]);
      const factory = createMockFactory({
        handles: new Map([
          ["alpha.js", alphaHandle],
          ["beta.py", betaHandle],
        ]),
      });
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha", "beta"]);

      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("beta")).toBe(true);

      await manager.shutdown();

      expect(manager.isRunning("alpha")).toBe(false);
      expect(manager.isRunning("beta")).toBe(false);

      // Handles were stopped
      expect(alphaHandle.stopped).toBe(true);
      expect(betaHandle.stopped).toBe(true);
    });

    it("emits stopped event for each server", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
        ["beta", makeGuildMember({ name: "beta", mcp: { command: "python", args: ["beta.py"] } })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.startServersForSession("session-1", ["alpha", "beta"]);

      // Clear startup events
      events.length = 0;

      await manager.shutdown();

      const stoppedEvents = events.filter((e) => e.type === "stopped");
      expect(stoppedEvents).toHaveLength(2);
      expect(stoppedEvents.map((e) => e.type === "stopped" && e.memberName).sort()).toEqual(["alpha", "beta"]);
    });

    it("handles stop() failures gracefully without throwing", async () => {
      const failHandle = createMockHandle({
        stopError: new Error("Process already exited"),
      });
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
      ]);
      const factory = createMockFactory({
        handles: new Map([["alpha.js", failHandle]]),
      });
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);

      // Should not throw despite stop() failure
      const shutdownResult = await manager.shutdown();
      expect(shutdownResult).toBeUndefined();

      // Server still cleaned up
      expect(manager.isRunning("alpha")).toBe(false);
    });

    it("clears all maps (servers, processes, references)", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha"]);

      expect(manager.isRunning("alpha")).toBe(true);

      await manager.shutdown();

      // All state cleared
      expect(manager.isRunning("alpha")).toBe(false);

      // Can start a new session after shutdown (references map was cleared)
      await manager.startServersForSession("session-2", ["alpha"]);
      expect(manager.isRunning("alpha")).toBe(true);
    });

    it("clears subscribers so no events fire after shutdown", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      // Subscribe, then shutdown (which clears subscribers)
      const postShutdownEvents: MCPEvent[] = [];
      manager.subscribe((e) => postShutdownEvents.push(e));

      await manager.startServersForSession("session-1", ["alpha"]);
      // Events from startup are captured
      const startupCount = postShutdownEvents.length;
      expect(startupCount).toBeGreaterThan(0);

      await manager.shutdown();
      // shutdown itself emits "stopped" events before clearing subscribers,
      // so we capture those too. But after shutdown, new operations shouldn't
      // emit to cleared subscribers.

      // Starting a new session after shutdown should not notify old subscribers
      const countAfterShutdown = postShutdownEvents.length;
      await manager.startServersForSession("session-2", ["alpha"]);
      expect(postShutdownEvents.length).toBe(countAfterShutdown);
    });

    it("updates roster member status to disconnected on successful shutdown", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
        ["beta", makeGuildMember({ name: "beta", mcp: { command: "python", args: ["beta.py"] } })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha", "beta"]);

      expect(roster.get("alpha")!.status).toBe("connected");
      expect(roster.get("beta")!.status).toBe("connected");

      await manager.shutdown();

      expect(roster.get("alpha")!.status).toBe("disconnected");
      expect(roster.get("beta")!.status).toBe("disconnected");
      expect(roster.get("alpha")!.error).toBeUndefined();
      expect(roster.get("beta")!.error).toBeUndefined();
    });

    it("updates roster member status to error and emits error event when stop() fails during shutdown", async () => {
      const failHandle = createMockHandle({
        stopError: new Error("Process already exited"),
      });
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
      ]);
      const factory = createMockFactory({
        handles: new Map([["alpha.js", failHandle]]),
      });
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.startServersForSession("session-1", ["alpha"]);

      expect(roster.get("alpha")!.status).toBe("connected");

      // Clear startup events
      events.length = 0;

      await manager.shutdown();

      // Status set to error when stop() fails
      expect(roster.get("alpha")!.status).toBe("error");
      expect(roster.get("alpha")!.error).toBe("Process already exited");

      // Error event emitted
      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].type === "error" && errorEvents[0].error).toBe(
        "Process already exited",
      );
    });
  });

  describe("subscribe", () => {
    it("notifies subscribers of started, tools_updated, and stopped events", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);
      const events = collectEvents(manager);

      await manager.startServersForSession("session-1", ["alpha"]);
      await manager.releaseServersForSession("session-1");

      const types = events.map((e) => e.type);
      expect(types).toEqual(["started", "tools_updated", "stopped"]);

      // Verify event details
      expect(events[0]).toEqual({ type: "started", memberName: "alpha" });
      expect(events[2]).toEqual({ type: "stopped", memberName: "alpha" });

      // tools_updated carries tool info
      const toolsEvent = events[1];
      expect(toolsEvent.type).toBe("tools_updated");
      if (toolsEvent.type === "tools_updated") {
        expect(toolsEvent.memberName).toBe("alpha");
        expect(toolsEvent.tools).toHaveLength(2);
        expect(toolsEvent.tools[0].name).toBe("read_file");
      }
    });

    it("returns an unsubscribe function that stops notifications", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const events: MCPEvent[] = [];
      const unsubscribe = manager.subscribe((e) => events.push(e));

      await manager.startServersForSession("session-1", ["alpha"]);
      const countBefore = events.length;
      expect(countBefore).toBeGreaterThan(0);

      unsubscribe();

      await manager.releaseServersForSession("session-1");
      // No new events after unsubscribe
      expect(events.length).toBe(countBefore);
    });

    it("notifies multiple subscribers independently", async () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const events1: MCPEvent[] = [];
      const events2: MCPEvent[] = [];
      manager.subscribe((e) => events1.push(e));
      const unsub2 = manager.subscribe((e) => events2.push(e));

      await manager.startServersForSession("session-1", ["alpha"]);

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBe(events1.length);

      unsub2();

      await manager.releaseServersForSession("session-1");

      // events1 got the stopped event, events2 did not
      expect(events1.length).toBeGreaterThan(events2.length);
    });
  });

  describe("isRunning", () => {
    it("returns false for a member that has never been started", () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      expect(manager.isRunning("alpha")).toBe(false);
    });

    it("returns false for a member not in the roster", () => {
      const roster = createRoster([]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      expect(manager.isRunning("nonexistent")).toBe(false);
    });
  });
});
