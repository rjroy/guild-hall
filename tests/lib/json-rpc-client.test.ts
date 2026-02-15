/**
 * Unit tests for JsonRpcClient
 *
 * Uses dependency injection to mock fetch for isolation.
 * Verifies JSON-RPC protocol implementation, timeout behavior, and error handling.
 */

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

describe("JsonRpcClient", () => {
  describe("initialize", () => {
    it("sends initialize request and initialized notification", async () => {
      const mockResponse: InitializeResponse = {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "test-server", version: "1.0.0" },
      };

      const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];
      const mockFetch = mock(async (url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        calls.push({ url, body, headers: new Headers(options?.headers) });

        // First call is initialize request, second is notification
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: mockResponse,
            }),
          );
        } else {
          return new Response(null, { status: 204 });
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

      // Verify initialize request
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
          new Promise((resolve, reject) => {
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
      const mockSetTimeout = mock((fn: () => void, _ms: number) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      await expect(
        client.initialize({ name: "test", version: "1.0" }),
      ).rejects.toThrow(JsonRpcTimeoutError);

      // Verify timeout was set and cleared
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

      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: mockTools },
          }),
        );
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      const result = await client.listTools();

      expect(result).toEqual(mockTools);
    });

    it("includes required headers", async () => {
      let capturedHeaders: Headers | undefined;
      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        capturedHeaders = new Headers(options?.headers);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { tools: [] },
          }),
        );
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

      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: mockResult,
          }),
        );
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

      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: mockResult,
          }),
        );
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await expect(
        client.invokeTool("test-tool", { arg1: "value1" }),
      ).rejects.toThrow(JsonRpcToolExecutionError);
    });

    it("sends correct request format", async () => {
      let capturedBody: unknown;
      let capturedHeaders: Headers | undefined;
      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        capturedBody = JSON.parse(options?.body as string);
        capturedHeaders = new Headers(options?.headers);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [], isError: false },
          }),
        );
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
        async () => new Response("Internal Server Error", { status: 500 }),
      );

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await expect(client.listTools()).rejects.toThrow(JsonRpcHttpError);
    });

    it("throws JsonRpcProtocolError on JSON-RPC error object", async () => {
      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32601,
              message: "Method not found",
              data: { method: "unknown/method" },
            },
          }),
        );
      });

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
      });

      await expect(client.listTools()).rejects.toThrow(JsonRpcProtocolError);
    });

    it("throws JsonRpcTimeoutError on timeout", async () => {
      const mockFetch = mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((resolve, reject) => {
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
      const mockSetTimeout = mock((fn: () => void, _ms: number) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      await expect(client.listTools()).rejects.toThrow(JsonRpcTimeoutError);

      // Verify timeout was set and cleared
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout cleanup", () => {
    it("clears timeout on successful request", async () => {
      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [] },
          }),
        );
      });

      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        clearTimeout: mockClearTimeout,
      });

      await client.listTools();

      // Verify clearTimeout was called exactly once with the timeout ID
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });

    it("clears timeout on error", async () => {
      const mockFetch = mock(
        async () => new Response("Error", { status: 500 }),
      );

      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        clearTimeout: mockClearTimeout,
      });

      await expect(client.listTools()).rejects.toThrow(JsonRpcHttpError);

      // Verify clearTimeout was called even on error
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });

    it("clears timeout on abort", async () => {
      const mockFetch = mock(
        (_url: string, options?: RequestInit): Promise<Response> =>
          new Promise((resolve, reject) => {
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
      const mockSetTimeout = mock((fn: () => void, _ms: number) => {
        return global.setTimeout(fn, 1) as unknown as number;
      });
      const mockClearTimeout = mock(global.clearTimeout);

      const client = createJsonRpcClient("http://localhost:50000/mcp", {
        fetch: mockFetch,
        setTimeout: mockSetTimeout,
        clearTimeout: mockClearTimeout,
      });

      await expect(client.listTools()).rejects.toThrow(JsonRpcTimeoutError);

      // Verify clearTimeout was called even on timeout
      expect(mockClearTimeout).toHaveBeenCalledTimes(1);
      expect(mockClearTimeout).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe("request/response correlation", () => {
    it("uses monotonically increasing IDs", async () => {
      const capturedIds: number[] = [];
      const mockFetch = mock(async (_url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        if (body.id !== undefined) {
          capturedIds.push(body.id);
        }
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: [] },
          }),
        );
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
      const mockFetch = mock(async (url: string, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);

        // First call is initialize request with id
        if (body.method === "initialize") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                serverInfo: { name: "test", version: "1.0" },
              },
            }),
          );
        }

        // Second call is notification without id
        notificationBody = body;
        return new Response(null, { status: 204 });
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
});
