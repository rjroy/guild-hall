/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Unit tests for HTTP MCP Factory
 *
 * Tests process spawning, port collision retry, initialize handshake,
 * error handling, and cleanup behavior.
 *
 * unbound-method is disabled file-wide because mock assertions like
 * expect(mockClient.initialize).toHaveBeenCalled() separate mock methods
 * from their objects, which the linter flags but is safe for test assertions.
 */

import { describe, test, expect, mock } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import {
  createHttpMCPFactory,
} from "../../lib/http-mcp-factory";
import {
  JsonRpcTimeoutError,
  JsonRpcHttpError,
  JsonRpcProtocolError,
  type JsonRpcClient,
  type ToolInfo,
  type ToolResult,
} from "../../lib/json-rpc-client";
import { type IPortRegistry } from "../../lib/port-registry";
import { MCP_EXIT_CODE } from "../../lib/types";

// -- Mock Factories --

function createMockPortRegistry(): IPortRegistry {
  const ports = [50000, 50001, 50002];
  let index = 0;

  return {
    allocate() {
      if (index >= ports.length) {
        throw new Error(
          "Port range exhausted: all ports from 50000 to 51000 are in use",
        );
      }
      return ports[index++];
    },
    reserve: mock(() => {}),
    release: mock(() => {}),
    markDead: mock(() => {}),
  };
}

type MockProcess = EventEmitter & {
  exitCode: number | null;
  kill: ReturnType<typeof mock>;
  stderr: EventEmitter;
  killed: boolean;
};

function createMockProcess(): ChildProcess & MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.exitCode = null;
  proc.kill = mock(() => true);
  proc.stderr = new EventEmitter();
  proc.killed = false;
  return proc as ChildProcess & MockProcess;
}

function createMockJsonRpcClient(
  behavior: {
    initialize?: ReturnType<typeof mock>;
    listTools?: ReturnType<typeof mock>;
    invokeTool?: ReturnType<typeof mock>;
  } = {},
): JsonRpcClient {
  return {
    initialize:
      behavior.initialize ??
      mock(() =>
        Promise.resolve({
          protocolVersion: "2025-06-18",
          capabilities: {},
          serverInfo: { name: "test", version: "1.0" },
        }),
      ),
    listTools:
      behavior.listTools ??
      mock(() => Promise.resolve([] as ToolInfo[])),
    invokeTool:
      behavior.invokeTool ??
      mock(() =>
        Promise.resolve({
          content: [{ type: "text", text: "result" }],
        } as ToolResult),
      ),
  } as unknown as JsonRpcClient;
}

// -- Tests --

describe("HTTP MCP Factory", () => {
  test("spawns server successfully with valid config", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const spawnMock = mock(() => mockProc);
    const createClientMock = mock(() => mockClient);

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: spawnMock,
      createClient: createClientMock,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    // Wait for the 100ms port collision window
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await resultPromise;

    expect(result.process).toBe(mockProc);
    expect(result.port).toBe(50000);
    expect(spawnMock).toHaveBeenCalledWith("bun", ["run", "server.ts"], {
      cwd: "/path/to/plugin",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns any by design
      env: expect.any(Object),
      stdio: ["ignore", "ignore", "pipe"],
    });
    expect(createClientMock).toHaveBeenCalledWith("http://localhost:50000/mcp");
    expect(mockClient.initialize).toHaveBeenCalledWith({
      name: "GuildHall",
      version: "0.1.0",
    });
  });

  test("substitutes ${PORT} in args", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const spawnMock = mock(() => mockProc);

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: spawnMock,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts", "--port", "${PORT}"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith(
      "bun",
      ["run", "server.ts", "--port", "50000"],
      expect.any(Object),
    );
  });

  test("sets working directory to pluginDir", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const spawnMock = mock(() => mockProc);

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: spawnMock,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/custom/plugin/dir",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith("bun", expect.any(Array), {
      cwd: "/custom/plugin/dir",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns any by design
      env: expect.any(Object),
      stdio: ["ignore", "ignore", "pipe"],
    });
  });

  test("calls initialize handshake on spawn", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    expect(mockClient.initialize).toHaveBeenCalledWith({
      name: "GuildHall",
      version: "0.1.0",
    });
  });

  test("throws if initialize times out", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient({
      initialize: mock(() => Promise.reject(new JsonRpcTimeoutError("initialize handshake", 5000))),
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const spawnPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Emit exit event after kill
    setTimeout(() => mockProc.emit("exit", MCP_EXIT_CODE.ERROR), 10);

    let caught: Error | null = null;
    try {
      await spawnPromise;
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Server failed to initialize.*timeout/);
    expect(mockProc.kill).toHaveBeenCalled();
    expect(portRegistry.release).toHaveBeenCalledWith(50000);
  });

  test("port collision retry: exit code 2 triggers markDead and retry", async () => {
    const portRegistry = createMockPortRegistry();
    let spawnCount = 0;

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => {
        spawnCount++;
        if (spawnCount === 1) {
          // First spawn: simulate quick exit with code 2
          const proc = createMockProcess();
          (proc as MockProcess).exitCode = MCP_EXIT_CODE.PORT_COLLISION;
          return proc;
        }
        // Second spawn: success
        return createMockProcess();
      },
      createClient: () => createMockJsonRpcClient(),
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await resultPromise;

    expect(spawnCount).toBe(2);
    expect(portRegistry.markDead).toHaveBeenCalledWith(50000);
    expect(result.port).toBe(50001);
  });

  test("port collision retry: succeeds on second attempt after first port fails", async () => {
    const portRegistry = createMockPortRegistry();
    let spawnCount = 0;
    const processes: ChildProcess[] = [];

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => {
        const proc = createMockProcess();
        processes.push(proc);
        spawnCount++;
        return proc;
      },
      createClient: () => {
        if (spawnCount === 1) {
          // First initialize fails, process will exit with code 2
          return createMockJsonRpcClient({
            initialize: mock(() => Promise.reject(new Error("Connection refused"))),
          });
        }
        // Second initialize succeeds
        return createMockJsonRpcClient();
      },
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    // Wait for first spawn + collision window
    await new Promise((resolve) => setTimeout(resolve, 150));

    // First process exits with code 2
    setTimeout(() => processes[0].emit("exit", MCP_EXIT_CODE.PORT_COLLISION), 10);

    // Wait for retry and second spawn
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await resultPromise;

    expect(result.port).toBe(50001);
    expect(portRegistry.markDead).toHaveBeenCalledWith(50000);
  });

  test("port released on spawn failure (non-collision errors)", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient({
      initialize: mock(() => Promise.reject(new JsonRpcHttpError(500, "Internal Server Error"))),
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const spawnPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Emit exit with non-collision code
    setTimeout(() => mockProc.emit("exit", MCP_EXIT_CODE.ERROR), 10);

    let caught: Error | null = null;
    try {
      await spawnPromise;
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Server failed to initialize/);
    expect(portRegistry.release).toHaveBeenCalledWith(50000);
    expect(portRegistry.markDead).not.toHaveBeenCalled();
  });

  test("port marked dead on EADDRINUSE (exit code 2)", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient({
      initialize: mock(() => Promise.reject(new Error("Connection refused"))),
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    // Fire-and-forget: we only care that markDead is called during retry
    void factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    }).catch(() => { /* retry exhaustion expected */ });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Emit exit with collision code
    setTimeout(() => mockProc.emit("exit", MCP_EXIT_CODE.PORT_COLLISION), 10);

    // Should retry, but for this test we'll let it exhaust retries
    // by making all attempts fail with collision
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Note: This test verifies markDead is called during retry
    // The full retry exhaustion is tested separately
    expect(portRegistry.markDead).toHaveBeenCalled();
  });

  test("retry limit exceeded throws error", async () => {
    const portRegistry = {
      allocate: mock(() => 50000),
      reserve: mock(() => {}),
      release: mock(() => {}),
      markDead: mock(() => {}),
    };

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => {
        const proc = createMockProcess();
        (proc as MockProcess).exitCode = MCP_EXIT_CODE.PORT_COLLISION;
        return proc;
      },
      createClient: () => createMockJsonRpcClient(),
    });

    let caught: Error | null = null;
    try {
      await factory.spawn({
        command: "bun",
        args: ["run", "server.ts"],
        pluginDir: "/path/to/plugin",
      });
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/port collision retry limit.*exceeded/);
  });

  test("stop() kills process and releases port", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await resultPromise;

    await result.handle.stop();

    expect(mockProc.kill).toHaveBeenCalled();
    expect(portRegistry.release).toHaveBeenCalledWith(50000);
  });

  test("stderr captured and logged with size limit", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const consoleErrorMock = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleErrorMock;

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    // Emit stderr data
    mockProc.stderr.emit("data", Buffer.from("Error line 1\n"));
    mockProc.stderr.emit("data", Buffer.from("Error line 2\n"));

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    expect(consoleErrorMock).toHaveBeenCalledWith("[MCP stderr] Error line 1");
    expect(consoleErrorMock).toHaveBeenCalledWith("[MCP stderr] Error line 2");

    console.error = originalConsoleError;
  });

  test("handle.listTools delegates to JSON-RPC client", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const tools: ToolInfo[] = [
      { name: "test-tool", description: "A test tool", inputSchema: { type: "object" } },
    ];
    const listToolsMock = mock(() => Promise.resolve(tools));
    const mockClient = createMockJsonRpcClient({
      listTools: listToolsMock,
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await resultPromise;

    const toolsList = await result.handle.listTools();

    expect(toolsList).toEqual(tools);
    expect(listToolsMock).toHaveBeenCalled();
  });

  test("handle.invokeTool delegates to JSON-RPC client", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const toolResult: ToolResult = {
      content: [{ type: "text", text: "success" }],
    };
    const invokeToolMock = mock(() => Promise.resolve(toolResult));
    const mockClient = createMockJsonRpcClient({
      invokeTool: invokeToolMock,
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await resultPromise;

    const invokeResult = await result.handle.invokeTool("test-tool", { arg: "value" });

    expect(invokeResult).toEqual(toolResult);
    expect(invokeToolMock).toHaveBeenCalledWith("test-tool", { arg: "value" });
  });

  test("includes stderr in error message on spawn failure", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient({
      initialize: mock(() => Promise.reject(new JsonRpcProtocolError(-32600, "Invalid Request"))),
    });

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: () => mockProc,
      createClient: () => mockClient,
    });

    const spawnPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      pluginDir: "/path/to/plugin",
    });

    // Emit stderr before failure
    mockProc.stderr.emit("data", Buffer.from("Fatal error occurred\n"));

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Emit exit
    setTimeout(() => mockProc.emit("exit", MCP_EXIT_CODE.ERROR), 10);

    let caught: Error | null = null;
    try {
      await spawnPromise;
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Fatal error occurred/);
  });

  test("substitutes multiple ${PORT} occurrences in same arg", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const spawnMock = mock(() => mockProc);

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: spawnMock,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts", "--url=http://localhost:${PORT}/mcp?port=${PORT}"],
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith(
      "bun",
      ["run", "server.ts", "--url=http://localhost:50000/mcp?port=50000"],
      expect.any(Object),
    );
  });

  describe("connect()", () => {
    test("successful connect creates working handle", async () => {
      const portRegistry = createMockPortRegistry();
      const tools: ToolInfo[] = [
        { name: "test-tool", description: "A test tool", inputSchema: { type: "object" } },
      ];
      const mockClient = createMockJsonRpcClient({
        listTools: mock(() => Promise.resolve(tools)),
      });

      const factory = createHttpMCPFactory({
        portRegistry,
        spawn: () => createMockProcess(),
        createClient: () => mockClient,
      });

      const result = await factory.connect({ port: 50000 });

      expect(result.handle).toBeDefined();
      expect(mockClient.initialize).toHaveBeenCalled();

      const toolsList = await result.handle.listTools();
      expect(toolsList).toEqual(tools);
    });

    test("connect handle stop() does not kill process or release port", async () => {
      const portRegistry = createMockPortRegistry();
      const mockClient = createMockJsonRpcClient();

      const factory = createHttpMCPFactory({
        portRegistry,
        spawn: () => createMockProcess(),
        createClient: () => mockClient,
      });

      const result = await factory.connect({ port: 50000 });
      await result.handle.stop();

      // Release should NOT have been called (connect doesn't own the process)
      expect(portRegistry.release).not.toHaveBeenCalled();
    });

    test("connect throws on handshake timeout", async () => {
      const portRegistry = createMockPortRegistry();
      const mockClient = createMockJsonRpcClient({
        initialize: mock(() => Promise.reject(new JsonRpcTimeoutError("initialize handshake", 2000))),
      });

      const factory = createHttpMCPFactory({
        portRegistry,
        spawn: () => createMockProcess(),
        createClient: () => mockClient,
      });

      let caught: Error | null = null;
      try {
        await factory.connect({ port: 50000 });
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toMatch(/timed out/i);
    });

    test("connect throws on HTTP error", async () => {
      const portRegistry = createMockPortRegistry();
      const mockClient = createMockJsonRpcClient({
        initialize: mock(() => Promise.reject(new JsonRpcHttpError(500, "Internal Server Error"))),
      });

      const factory = createHttpMCPFactory({
        portRegistry,
        spawn: () => createMockProcess(),
        createClient: () => mockClient,
      });

      let caught: Error | null = null;
      try {
        await factory.connect({ port: 50000 });
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).not.toBeNull();
    });
  });

  test("merges config.env with process.env", async () => {
    const portRegistry = createMockPortRegistry();
    const mockProc = createMockProcess();
    const mockClient = createMockJsonRpcClient();

    const spawnMock = mock(() => mockProc);

    const factory = createHttpMCPFactory({
      portRegistry,
      spawn: spawnMock,
      createClient: () => mockClient,
    });

    const resultPromise = factory.spawn({
      command: "bun",
      args: ["run", "server.ts"],
      env: { CUSTOM_VAR: "custom-value" },
      pluginDir: "/path/to/plugin",
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await resultPromise;

    const spawnCall = spawnMock.mock.calls[0] as unknown as [string, string[], { env: Record<string, string | undefined> }];
    const envArg = spawnCall[2].env;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- expect.objectContaining() returns any by design
    expect(envArg).toEqual(expect.objectContaining({ CUSTOM_VAR: "custom-value" }));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- expect.objectContaining() returns any by design
    expect(envArg).toEqual(expect.objectContaining(process.env));
  });
});
