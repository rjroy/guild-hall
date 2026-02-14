import { describe, expect, it } from "bun:test";

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
    mcp: { command: "node", args: ["server.js"] },
    status: "disconnected",
    tools: [],
    ...overrides,
  };
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
};

function createMockFactory(options: {
  handles?: Map<string, MCPServerHandle & { stopped: boolean }>;
  spawnError?: Error;
} = {}): MCPServerFactory & { spawnCount: number; spawnCalls: SpawnConfig[] } {
  const handles = options.handles ?? new Map<string, MCPServerHandle & { stopped: boolean }>();

  const factory = {
    spawnCount: 0,
    spawnCalls: [] as SpawnConfig[],
    spawn(config: SpawnConfig): Promise<MCPServerHandle> {
      factory.spawnCount++;
      factory.spawnCalls.push(config);

      if (options.spawnError) return Promise.reject(options.spawnError);

      // Check if a specific handle was provided for this command
      const entries = Array.from(handles.entries());
      for (const [key, handle] of entries) {
        if (config.command === key || config.args.includes(key)) {
          return Promise.resolve(handle);
        }
      }

      // Return a default mock handle
      return Promise.resolve(createMockHandle());
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
    it("returns Record keyed by member name with correct config shape", () => {
      const roster = createRoster([
        [
          "alpha",
          makeGuildMember({
            name: "alpha",
            mcp: { command: "node", args: ["alpha.js"], env: { PORT: "5050" } },
          }),
        ],
        [
          "beta",
          makeGuildMember({
            name: "beta",
            mcp: { command: "python", args: ["beta.py", "--verbose"] },
          }),
        ],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const configs = manager.getServerConfigs(["alpha", "beta"]);

      expect(configs).toEqual({
        alpha: { command: "node", args: ["alpha.js"], env: { PORT: "5050" } },
        beta: { command: "python", args: ["beta.py", "--verbose"] },
      });
    });

    it("skips members not in the roster", () => {
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha" })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      const configs = manager.getServerConfigs(["alpha", "nonexistent"]);

      expect(Object.keys(configs)).toHaveLength(1);
      expect(configs["alpha"].command).toBe("node");
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
      const roster = createRoster([
        ["alpha", makeGuildMember({ name: "alpha", mcp: { command: "node", args: ["alpha.js"] } })],
        ["beta", makeGuildMember({ name: "beta", mcp: { command: "python", args: ["beta.py"] } })],
      ]);
      const factory = createMockFactory();
      const manager = new MCPManager(roster, factory);

      await manager.startServersForSession("session-1", ["alpha", "beta"]);

      expect(manager.isRunning("alpha")).toBe(true);
      expect(manager.isRunning("beta")).toBe(true);

      await manager.shutdown();

      expect(manager.isRunning("alpha")).toBe(false);
      expect(manager.isRunning("beta")).toBe(false);

      // Roster members set to disconnected
      expect(roster.get("alpha")!.status).toBe("disconnected");
      expect(roster.get("beta")!.status).toBe("disconnected");
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
