import * as nodeFs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";

import { createServerContext, createNodePluginFs } from "@/lib/server-context";
import type { ServerContextDeps } from "@/lib/server-context";
import type { QueryFn } from "@/lib/agent";
import { SessionStore } from "@/lib/session-store";
import { createMockFs } from "@/tests/helpers/mock-fs";
import { createMockSessionFs } from "@/tests/helpers/mock-session-fs";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// -- Mock query function (same pattern as agent.test.ts) --

function createMockQueryFn(): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      // Yield nothing; we only need the factory to construct without error
      yield await Promise.resolve({
        type: "system",
        subtype: "init",
        session_id: "test-session",
      } as unknown as SDKMessage);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () =>
      Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

// -- Helpers --

function makeDeps(overrides?: Partial<ServerContextDeps>): ServerContextDeps {
  const manifest = JSON.stringify({
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
    mcp: { command: "node", args: ["server.js"] },
  });

  const pluginFs = createMockFs(
    { "/guild/alpha/guild-member.json": manifest },
    new Set(["/guild", "/guild/alpha"]),
  );

  const sessionFs = createMockSessionFs({}, new Set(["/sessions"]));
  const sessionStore = new SessionStore("/sessions", sessionFs);

  return {
    guildMembersDir: "/guild",
    fs: pluginFs,
    queryFn: createMockQueryFn(),
    sessionStore,
    sessionsDir: "/sessions",
    ...overrides,
  };
}

// -- Tests --

describe("createServerContext", () => {
  it("getEventBus returns a consistent instance", () => {
    const ctx = createServerContext(makeDeps());

    const bus1 = ctx.getEventBus();
    const bus2 = ctx.getEventBus();

    expect(bus1).toBe(bus2);
  });

  it("getRosterMap discovers guild members from the provided fs", async () => {
    const ctx = createServerContext(makeDeps());

    const roster = await ctx.getRosterMap();

    expect(roster.size).toBe(1);
    expect(roster.has("alpha")).toBe(true);
  });

  it("getMCPManager returns an MCPManager instance", async () => {
    const ctx = createServerContext(makeDeps());

    const mcp = await ctx.getMCPManager();

    expect(mcp).toBeDefined();
    expect(typeof mcp.invokeTool).toBe("function");
  });

  it("getAgentManager returns an AgentManager instance", async () => {
    const ctx = createServerContext(makeDeps());

    const agent = await ctx.getAgentManager();

    expect(agent).toBeDefined();
    expect(typeof agent.runQuery).toBe("function");
  });

  it("concurrent calls share a single initialization", async () => {
    const deps = makeDeps();
    const ctx = createServerContext(deps);

    // Fire all three getters concurrently
    const [roster1, mcp1, agent1] = await Promise.all([
      ctx.getRosterMap(),
      ctx.getMCPManager(),
      ctx.getAgentManager(),
    ]);

    // Call again; should return cached instances
    const [roster2, mcp2, agent2] = await Promise.all([
      ctx.getRosterMap(),
      ctx.getMCPManager(),
      ctx.getAgentManager(),
    ]);

    expect(roster1).toBe(roster2);
    expect(mcp1).toBe(mcp2);
    expect(agent1).toBe(agent2);
  });

  it("uses empty roster when guild-members directory is empty", async () => {
    const emptyFs = createMockFs({}, new Set(["/empty-guild"]));
    const ctx = createServerContext(
      makeDeps({ guildMembersDir: "/empty-guild", fs: emptyFs }),
    );

    const roster = await ctx.getRosterMap();

    expect(roster.size).toBe(0);
  });

  it("uses stub server factory when none is provided", async () => {
    // makeDeps() doesn't include serverFactory, so the stub is used
    const ctx = createServerContext(makeDeps());

    const mcpManager = await ctx.getMCPManager();

    // The stub factory rejects on spawn. MCPManager.spawnServer catches
    // the error and sets member status to "error".
    await mcpManager.startServersForSession("test", ["alpha"]);

    const roster = await ctx.getRosterMap();
    const member = roster.get("alpha");
    expect(member).toBeDefined();
    expect(member!.status).toBe("error");
    expect(member!.error).toContain("MCP server spawning not yet implemented");
  });
});

describe("createServerContext boot cleanup", () => {
  it("boot cleanup runs when bootCleanup is true", async () => {
    const pidFileManager = {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      isAlive: () => false,
      cleanupAll: mock(() => Promise.resolve()),
      shutdownAll: () => Promise.resolve(),
    };

    const ctx = createServerContext(makeDeps({
      bootCleanup: true,
      pidFileManager,
    }));

    // Trigger initialization
    await ctx.getRosterMap();

    expect(pidFileManager.cleanupAll).toHaveBeenCalled();
  });

  it("boot cleanup does not run when bootCleanup is false/undefined", async () => {
    const pidFileManager = {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      isAlive: () => false,
      cleanupAll: mock(() => Promise.resolve()),
      shutdownAll: () => Promise.resolve(),
    };

    // bootCleanup not set (undefined)
    const ctx1 = createServerContext(makeDeps({ pidFileManager }));
    await ctx1.getRosterMap();
    expect(pidFileManager.cleanupAll).not.toHaveBeenCalled();

    // bootCleanup explicitly false
    const cleanupAll2 = mock(() => Promise.resolve());
    const pidFileManager2 = { ...pidFileManager, cleanupAll: cleanupAll2 };
    const ctx2 = createServerContext(makeDeps({
      bootCleanup: false,
      pidFileManager: pidFileManager2,
    }));
    await ctx2.getRosterMap();
    expect(cleanupAll2).not.toHaveBeenCalled();
  });
});

describe("createNodePluginFs", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await nodeFs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("readdir lists directory contents", async () => {
    tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "guild-fs-test-"));
    await nodeFs.writeFile(path.join(tmpDir, "test.txt"), "hello");

    const pluginFs = createNodePluginFs();
    const entries = await pluginFs.readdir(tmpDir);

    expect(entries).toEqual(["test.txt"]);
  });

  it("readFile reads file contents as utf-8", async () => {
    tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "guild-fs-test-"));
    const filePath = path.join(tmpDir, "data.txt");
    await nodeFs.writeFile(filePath, "content here");

    const pluginFs = createNodePluginFs();
    const content = await pluginFs.readFile(filePath);

    expect(content).toBe("content here");
  });

  it("stat identifies directories and files", async () => {
    tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "guild-fs-test-"));
    const filePath = path.join(tmpDir, "file.txt");
    await nodeFs.writeFile(filePath, "x");

    const pluginFs = createNodePluginFs();

    const dirStat = await pluginFs.stat(tmpDir);
    expect(dirStat.isDirectory()).toBe(true);

    const fileStat = await pluginFs.stat(filePath);
    expect(fileStat.isDirectory()).toBe(false);
  });
});
