import { describe, expect, it, mock } from "bun:test";
import {
  createJsonRpcClient,
  JsonRpcHttpError,
  JsonRpcProtocolError,
  JsonRpcTimeoutError,
  JsonRpcToolExecutionError,
  type InitializeResponse,
  type ToolInfo,
  type ToolResult,
} from "../../lib/json-rpc-client";

/** Structural type for parsed JSON-RPC request bodies in tests */
type JsonRpcBody = {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: unknown;
};

function parseBody(options?: RequestInit): JsonRpcBody {
  return JSON.parse(options?.body as string) as JsonRpcBody;
}

/** Let pending async rejections settle before asserting side effects. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("JsonRpcClient", () => {
  describe("initialize", () => {
    it("sends initialize request and initialized notification", async () => {
      const mockResponse: InitializeResponse = {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "test-server", version: "1.0.0" },
      };

      const calls: Array<{ url: string; body: JsonRpcBody; headers: Headers }> = [];
      const mockFetch = mock((url: string, options?: RequestInit) => {
        const body = parseBody(options);
        calls.push({ url, body, headers: new Headers(options?.headers) });

        // First call is initialize request, second is notification
        if (calls.length === 1) {
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: mockResponse,
            }),
          ));
        } else {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      const result = await client.initialize({
        name: "test-client",
        version: "1.0.0",
      });

      expect(result).toEqual(mockResponse);
      expect(calls).toHaveLength(2);

      expect(calls[0].body).toMatchObject({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });
      expect(calls[0].headers.get("Origin")).toBe("http://localhost");

      // Verify initialized notification (no id field)
      expect(calls[1].body).toEqual({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      expect(calls[1].headers.get("Origin")).toBe("http://localhost");
    });

    it("throws JsonRpcTimeoutError on timeout", async () => {
      const mockFetch = mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            // Listen for abort signal
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                const error = new Error("Request aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
            // Never resolve (simulates long-running request)
          }),
      );

      // Use fast timer (1ms instead of 5000ms) to avoid waiting
      const mockSetTimeout = mock((fn: () => void) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      expect(
        client.initialize({ name: "test", version: "1.0" }),
      ).rejects.toThrow(JsonRpcTimeoutError);

      await settle();

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("listTools", () => {
    it("parses tool array from response", async () => {
      const mockTools: ToolInfo[] = [
        {
          name: "test-tool",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: { arg1: { type: "string" } },
            required: ["arg1"],
          },
        },
      ];

      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: mockTools },
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      const result = await client.listTools();

      expect(result).toEqual(mockTools);
    });

    it("includes required headers", async () => {
      let capturedHeaders: Headers | undefined;
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        capturedHeaders = new Headers(options?.headers);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { tools: [] },
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await client.listTools();

      expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
      expect(capturedHeaders?.get("MCP-Protocol-Version")).toBe("2025-06-18");
      expect(capturedHeaders?.get("Origin")).toBe("http://localhost");
    });
  });

  describe("invokeTool", () => {
    it("returns result on success", async () => {
      const mockResult: ToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };

      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: mockResult,
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      const result = await client.invokeTool("test-tool", { arg1: "value1" });

      expect(result).toEqual(mockResult);
    });

    it("throws JsonRpcToolExecutionError on isError: true", async () => {
      const mockResult: ToolResult = {
        content: [{ type: "text", text: "Tool failed" }],
        isError: true,
      };

      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: mockResult,
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      expect(
        client.invokeTool("test-tool", { arg1: "value1" }),
      ).rejects.toThrow(JsonRpcToolExecutionError);

      await settle();
    });

    it("sends correct request format", async () => {
      let capturedBody: JsonRpcBody | undefined;
      let capturedHeaders: Headers | undefined;
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        capturedBody = parseBody(options);
        capturedHeaders = new Headers(options?.headers);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [], isError: false },
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await client.invokeTool("test-tool", { arg1: "value1" });

      expect(capturedBody).toMatchObject({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "test-tool",
          arguments: { arg1: "value1" },
        },
      });
      expect(capturedHeaders?.get("Origin")).toBe("http://localhost");
    });
  });

  describe("error handling", () => {
    it("throws JsonRpcHttpError on HTTP error status", async () => {
      const mockFetch = mock(
        () => Promise.resolve(new Response("Internal Server Error", { status: 500 })),
      );

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      expect(client.listTools()).rejects.toThrow(JsonRpcHttpError);

      await settle();
    });

    it("throws JsonRpcProtocolError on JSON-RPC error object", async () => {
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32601,
              message: "Method not found",
              data: { method: "unknown/method" },
            },
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      expect(client.listTools()).rejects.toThrow(JsonRpcProtocolError);

      await settle();
    });

    it("throws JsonRpcTimeoutError on timeout", async () => {
      const mockFetch = mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            // Listen for abort signal
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                const error = new Error("Request aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
            // Never resolve (simulates long-running request)
          }),
      );

      // Use fast timer (1ms instead of 30000ms) to avoid waiting
      const mockSetTimeout = mock((fn: () => void) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      expect(client.listTools()).rejects.toThrow(JsonRpcTimeoutError);

      await settle();

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout cleanup", () => {
    it("clears timeout on successful request", async () => {
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [] },
          }),
        ));
      });

      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        clearTimeout: mockClearTimeout,
      });

      await client.listTools();

      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });

    it("clears timeout on error", async () => {
      const mockFetch = mock(
        () => Promise.resolve(new Response("Error", { status: 500 })),
      );

      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        clearTimeout: mockClearTimeout,
      });

      expect(client.listTools()).rejects.toThrow(JsonRpcHttpError);

      await settle();

      // Verify clearTimeout was called even on error
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });

    it("clears timeout on abort", async () => {
      const mockFetch = mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            // Listen for abort signal
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                const error = new Error("Request aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
            // Never resolve (simulates long-running request that gets aborted)
          }),
      );

      // Use fast timer to avoid waiting
      const mockSetTimeout = mock((fn: () => void) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      expect(client.listTools()).rejects.toThrow(JsonRpcTimeoutError);

      await settle();

      // Verify clearTimeout was called even on timeout
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe("request/response correlation", () => {
    it("uses monotonically increasing IDs", async () => {
      const capturedIds: number[] = [];
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        if (body.id !== undefined) {
          capturedIds.push(body.id);
        }
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [] },
          }),
        ));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      // Make two sequential calls
      await client.listTools();
      await client.listTools();

      // Verify we got two different IDs in increasing order
      expect(capturedIds).toHaveLength(2);
      expect(capturedIds[0]).toBe(1);
      expect(capturedIds[1]).toBe(2);
    });

    it("notifications omit id field", async () => {
      let notificationBody: unknown;
      const mockFetch = mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);

        // First call is initialize request with id
        if (body.method === "initialize") {
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                serverInfo: { name: "test", version: "1.0" },
              },
            }),
          ));
        }

        // Second call is notification without id
        notificationBody = body;
        return Promise.resolve(new Response(null, { status: 204 }));
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await client.initialize({ name: "test", version: "1.0" });

      expect(notificationBody).toBeDefined();
      expect(notificationBody).not.toHaveProperty("id");
      expect(notificationBody).toHaveProperty("method");
      expect(notificationBody).toHaveProperty("jsonrpc");
    });
  });

  describe("worker protocol methods", () => {
    function protocolErrorFetch() {
      return mock((_url: string, options?: RequestInit) => {
        const body = parseBody(options);
        return Promise.resolve(new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32601, message: "Method not found" },
          }),
        ));
      });
    }

    function httpErrorFetch() {
      return mock(
        () => Promise.resolve(new Response("Internal Server Error", { status: 500 })),
      );
    }

    function hangingFetch() {
      return mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                const error = new Error("Request aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
          }),
      );
    }

    function fastTimers() {
      const mockSetTimeout = mock((fn: () => void) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);
      return { mockSetTimeout, mockClearTimeout };
    }

    type ClientMethod = (client: ReturnType<typeof createJsonRpcClient>) => Promise<unknown>;

    /**
     * Generates timeout, protocol error, and HTTP error tests for a worker method.
     * Every worker method shares identical error handling; only the invocation differs.
     */
    function describeWorkerErrors(invoke: ClientMethod): void {
      it("throws JsonRpcTimeoutError on timeout", async () => {
        const { mockSetTimeout, mockClearTimeout } = fastTimers();
        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: hangingFetch(),
          setTimeout: mockSetTimeout,
          clearTimeout: mockClearTimeout,
        });

        expect(invoke(client)).rejects.toThrow(JsonRpcTimeoutError);

        await settle();
        expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
        expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      });

      it("throws JsonRpcProtocolError on JSON-RPC error", async () => {
        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: protocolErrorFetch(),
        });

        expect(invoke(client)).rejects.toThrow(JsonRpcProtocolError);

        await settle();
      });

      it("throws JsonRpcHttpError on HTTP error", async () => {
        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: httpErrorFetch(),
        });

        expect(invoke(client)).rejects.toThrow(JsonRpcHttpError);

        await settle();
      });
    }

    describe("dispatchWorker", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: { jobId: "job-123" },
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.dispatchWorker({
          description: "Run analysis",
          task: "Analyze the codebase",
          config: { maxTokens: 1000 },
        });

        expect(result).toEqual({ jobId: "job-123" });
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/dispatch",
          params: {
            description: "Run analysis",
            task: "Analyze the codebase",
            config: { maxTokens: 1000 },
          },
        });
      });

      describeWorkerErrors((c) => c.dispatchWorker({ description: "test", task: "test" }));
    });

    describe("listWorkers", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockJobs = [
          { jobId: "job-1", status: "running" as const },
          { jobId: "job-2", status: "completed" as const },
        ];
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: { jobs: mockJobs },
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.listWorkers({ detail: "detailed", filter: "running" });

        expect(result).toEqual({ jobs: mockJobs });
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/list",
          params: { detail: "detailed", filter: "running" },
        });
      });

      it("sends empty params when called without arguments", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: { jobs: [] },
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.listWorkers();

        expect(result).toEqual({ jobs: [] });
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/list",
          params: {},
        });
      });

      describeWorkerErrors((c) => c.listWorkers());
    });

    describe("workerStatus", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockStatus = {
          jobId: "job-123",
          status: "running" as const,
          description: "Analysis task",
          summary: null,
          questions: null,
          decisions: null,
          error: null,
          startedAt: "2026-02-17T10:00:00Z",
          completedAt: null,
        };
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: mockStatus,
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.workerStatus({ jobId: "job-123" });

        expect(result).toEqual(mockStatus);
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/status",
          params: { jobId: "job-123" },
        });
      });

      describeWorkerErrors((c) => c.workerStatus({ jobId: "job-123" }));
    });

    describe("workerResult", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockResult = {
          jobId: "job-123",
          output: "Analysis complete. Found 3 issues.",
          artifacts: ["report.md", "issues.json"],
        };
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: mockResult,
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.workerResult({ jobId: "job-123" });

        expect(result).toEqual(mockResult);
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/result",
          params: { jobId: "job-123" },
        });
      });

      describeWorkerErrors((c) => c.workerResult({ jobId: "job-123" }));
    });

    describe("cancelWorker", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: { jobId: "job-123", status: "cancelled" as const },
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.cancelWorker({ jobId: "job-123" });

        expect(result).toEqual({ jobId: "job-123", status: "cancelled" as const });
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/cancel",
          params: { jobId: "job-123" },
        });
      });

      describeWorkerErrors((c) => c.cancelWorker({ jobId: "job-123" }));
    });

    describe("deleteWorker", () => {
      it("sends correct method and params", async () => {
        let capturedBody: JsonRpcBody | undefined;
        const mockFetch = mock((_url: string, options?: RequestInit) => {
          capturedBody = parseBody(options);
          return Promise.resolve(new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: capturedBody.id,
              result: { jobId: "job-123", deleted: true },
            }),
          ));
        });

        const client = createJsonRpcClient("http://localhost:50000/mcp", {
          fetch: mockFetch,
        });

        const result = await client.deleteWorker({ jobId: "job-123" });

        expect(result).toEqual({ jobId: "job-123", deleted: true });
        expect(capturedBody).toMatchObject({
          jsonrpc: "2.0",
          method: "worker/delete",
          params: { jobId: "job-123" },
        });
      });

      describeWorkerErrors((c) => c.deleteWorker({ jobId: "job-123" }));
    });
  });
});
