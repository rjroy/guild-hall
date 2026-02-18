import { describe, expect, it, mock } from "bun:test";

import {
  createDispatchBridge,
  createDispatchTools,
  textResult,
  errorResult,
} from "@/lib/dispatch-bridge";
import type { JsonRpcClientFactory } from "@/lib/dispatch-bridge";
import type { JsonRpcClient } from "@/lib/json-rpc-client";
import type {
  WorkerJobStatus,
  WorkerJobResult,
  WorkerJobSummary,
} from "@/lib/types";

// -- Mock JsonRpcClient --

type MockClientMethods = {
  dispatchWorker: ReturnType<typeof mock>;
  listWorkers: ReturnType<typeof mock>;
  workerStatus: ReturnType<typeof mock>;
  workerResult: ReturnType<typeof mock>;
  cancelWorker: ReturnType<typeof mock>;
  deleteWorker: ReturnType<typeof mock>;
};

function createMockClient(): JsonRpcClient & MockClientMethods {
  return {
    dispatchWorker: mock(() => Promise.resolve({ jobId: "job-1" })),
    listWorkers: mock(() => Promise.resolve({ jobs: [] as WorkerJobSummary[] })),
    workerStatus: mock(() => Promise.resolve({
      jobId: "job-1",
      status: "running",
      description: "test",
      summary: null,
      questions: null,
      decisions: null,
      error: null,
      startedAt: "2026-02-17T12:00:00Z",
      completedAt: null,
    } satisfies WorkerJobStatus)),
    workerResult: mock(() => Promise.resolve({
      jobId: "job-1",
      output: "done",
      artifacts: null,
    } satisfies WorkerJobResult)),
    cancelWorker: mock(() => Promise.resolve({ jobId: "job-1", status: "cancelled" })),
    deleteWorker: mock(() => Promise.resolve({ jobId: "job-1", deleted: true as const })),
    // Required by JsonRpcClient interface but not used by dispatch tools
    initialize: mock(() => Promise.resolve({ protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "test", version: "1.0" } })),
    listTools: mock(() => Promise.resolve([])),
    invokeTool: mock(() => Promise.resolve({ content: [] })),
  } as unknown as JsonRpcClient & MockClientMethods;
}

/**
 * Creates a client factory that returns the provided mock client.
 * Also tracks the baseUrl passed to the factory.
 */
function createMockClientFactory(mockClient: JsonRpcClient & MockClientMethods): {
  factory: JsonRpcClientFactory;
  calls: string[];
} {
  const calls: string[] = [];
  const factory: JsonRpcClientFactory = (baseUrl: string) => {
    calls.push(baseUrl);
    return mockClient;
  };
  return { factory, calls };
}

/** Result type from MCP tool handlers */
type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Flattened tool representation for test ergonomics. The SDK's
 * SdkMcpToolDefinition uses generic schemas that make handler arg
 * types unwieldy in tests. This strips the generics so tests can
 * call handlers with plain objects.
 */
type TestTool = {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>;
};

/**
 * Helper to find a tool by name from the array returned by createDispatchTools.
 * Casts to TestTool for ergonomic handler invocation in tests.
 */
function findTool(tools: ReturnType<typeof createDispatchTools>, name: string): TestTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool "${name}" not found`);
  return found as unknown as TestTool;
}

// -- Tests --

describe("createDispatchBridge", () => {
  it("creates a server config with correct name", () => {
    const config = createDispatchBridge("researcher", 50000, {
      createClient: () => createMockClient(),
    });

    expect(config.type).toBe("sdk");
    expect(config.name).toBe("researcher-dispatch");
    expect(config.instance).toBeDefined();
  });

  it("names the server using the member name with -dispatch suffix", () => {
    const config = createDispatchBridge("my-plugin", 51234, {
      createClient: () => createMockClient(),
    });

    expect(config.name).toBe("my-plugin-dispatch");
  });
});

describe("createDispatchTools", () => {
  it("creates six tools with correct names", () => {
    const mockClient = createMockClient();
    const tools = createDispatchTools(
      "test-member",
      "http://localhost:50000/mcp",
      () => mockClient,
    );

    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain("dispatch");
    expect(names).toContain("list");
    expect(names).toContain("status");
    expect(names).toContain("result");
    expect(names).toContain("cancel");
    expect(names).toContain("delete");
  });

  describe("dispatch tool", () => {
    it("calls dispatchWorker with correct params", async () => {
      const mockClient = createMockClient();
      const { factory, calls } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const dispatchTool = findTool(tools, "dispatch");

      const result = await dispatchTool.handler(
        { description: "Research topic X", task: "Find all papers about X", config: undefined },
        {},
      );

      expect(calls).toEqual(["http://localhost:50000/mcp"]);
      expect(mockClient.dispatchWorker).toHaveBeenCalledWith({
        description: "Research topic X",
        task: "Find all papers about X",
        config: undefined,
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("job-1");
    });

    it("passes config when provided", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const dispatchTool = findTool(tools, "dispatch");

      await dispatchTool.handler(
        { description: "test", task: "test task", config: { timeout: 300 } },
        {},
      );

      expect(mockClient.dispatchWorker).toHaveBeenCalledWith({
        description: "test",
        task: "test task",
        config: { timeout: 300 },
      });
    });

    it("returns error result when dispatchWorker fails", async () => {
      const mockClient = createMockClient();
      mockClient.dispatchWorker.mockImplementation(() =>
        Promise.reject(new Error("Connection refused")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const dispatchTool = findTool(tools, "dispatch");

      const result = await dispatchTool.handler(
        { description: "test", task: "test task", config: undefined },
        {},
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection refused");
    });
  });

  describe("list tool", () => {
    it("calls listWorkers with no params when none provided", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const listTool = findTool(tools, "list");

      const result = await listTool.handler({ detail: undefined, filter: undefined }, {});

      expect(mockClient.listWorkers).toHaveBeenCalledWith(undefined);
      expect(result.isError).toBeUndefined();
    });

    it("passes detail and filter params", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const listTool = findTool(tools, "list");

      await listTool.handler({ detail: "detailed", filter: "running" }, {});

      expect(mockClient.listWorkers).toHaveBeenCalledWith({
        detail: "detailed",
        filter: "running",
      });
    });

    it("returns error result when listWorkers fails", async () => {
      const mockClient = createMockClient();
      mockClient.listWorkers.mockImplementation(() =>
        Promise.reject(new Error("Server unavailable")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const listTool = findTool(tools, "list");

      const result = await listTool.handler({ detail: undefined, filter: undefined }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Server unavailable");
    });
  });

  describe("status tool", () => {
    it("calls workerStatus with correct jobId", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const statusTool = findTool(tools, "status");

      const result = await statusTool.handler({ jobId: "job-42" }, {});

      expect(mockClient.workerStatus).toHaveBeenCalledWith({ jobId: "job-42" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("job-1");
    });

    it("returns error result when workerStatus fails", async () => {
      const mockClient = createMockClient();
      mockClient.workerStatus.mockImplementation(() =>
        Promise.reject(new Error("Job not found")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const statusTool = findTool(tools, "status");

      const result = await statusTool.handler({ jobId: "nonexistent" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Job not found");
    });
  });

  describe("result tool", () => {
    it("calls workerResult with correct jobId", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const resultTool = findTool(tools, "result");

      const result = await resultTool.handler({ jobId: "job-42" }, {});

      expect(mockClient.workerResult).toHaveBeenCalledWith({ jobId: "job-42" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("done");
    });

    it("returns error result when workerResult fails", async () => {
      const mockClient = createMockClient();
      mockClient.workerResult.mockImplementation(() =>
        Promise.reject(new Error("Job still running")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const resultTool = findTool(tools, "result");

      const result = await resultTool.handler({ jobId: "job-42" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Job still running");
    });
  });

  describe("cancel tool", () => {
    it("calls cancelWorker with correct jobId", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const cancelTool = findTool(tools, "cancel");

      const result = await cancelTool.handler({ jobId: "job-42" }, {});

      expect(mockClient.cancelWorker).toHaveBeenCalledWith({ jobId: "job-42" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("cancelled");
    });

    it("returns error result when cancelWorker fails", async () => {
      const mockClient = createMockClient();
      mockClient.cancelWorker.mockImplementation(() =>
        Promise.reject(new Error("Already completed")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const cancelTool = findTool(tools, "cancel");

      const result = await cancelTool.handler({ jobId: "job-42" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Already completed");
    });
  });

  describe("delete tool", () => {
    it("calls deleteWorker with correct jobId", async () => {
      const mockClient = createMockClient();
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const deleteTool = findTool(tools, "delete");

      const result = await deleteTool.handler({ jobId: "job-42" }, {});

      expect(mockClient.deleteWorker).toHaveBeenCalledWith({ jobId: "job-42" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("deleted");
    });

    it("returns error result when deleteWorker fails", async () => {
      const mockClient = createMockClient();
      mockClient.deleteWorker.mockImplementation(() =>
        Promise.reject(new Error("Permission denied")),
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const deleteTool = findTool(tools, "delete");

      const result = await deleteTool.handler({ jobId: "job-42" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Permission denied");
    });
  });

  describe("client factory targeting", () => {
    it("creates client with correct baseUrl for the given port", async () => {
      const mockClient = createMockClient();
      const { factory, calls } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:51234/mcp", factory);
      const statusTool = findTool(tools, "status");

      await statusTool.handler({ jobId: "job-1" }, {});

      expect(calls).toEqual(["http://localhost:51234/mcp"]);
    });

    it("creates a new client for each tool invocation", async () => {
      const mockClient = createMockClient();
      const { factory, calls } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);

      await findTool(tools, "status").handler({ jobId: "job-1" }, {});
      await findTool(tools, "cancel").handler({ jobId: "job-2" }, {});

      expect(calls).toHaveLength(2);
    });
  });

  describe("non-Error exceptions", () => {
    it("handles non-Error throw values in tool handlers", async () => {
      const mockClient = createMockClient();
      mockClient.workerStatus.mockImplementation(() =>
        Promise.reject("string error"), // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
      );
      const { factory } = createMockClientFactory(mockClient);
      const tools = createDispatchTools("researcher", "http://localhost:50000/mcp", factory);
      const statusTool = findTool(tools, "status");

      const result = await statusTool.handler({ jobId: "job-1" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("string error");
    });
  });
});

describe("textResult", () => {
  it("wraps data as JSON text content", () => {
    const result = textResult({ jobId: "job-1" });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ jobId: "job-1" });
    expect(result.isError).toBeUndefined();
  });
});

describe("errorResult", () => {
  it("wraps message as error text content", () => {
    const result = errorResult("Something broke");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Something broke");
    expect(result.isError).toBe(true);
  });
});
