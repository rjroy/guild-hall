import { describe, expect, it, afterEach } from "bun:test";
import { createServer, type Server as HttpServerType } from "node:http";

import {
  createResearcherServer,
  createMcpServer,
  createDefaultWorkerHandlers,
  parsePort,
  HttpTransport,
} from "@/guild-members/researcher/server";
import { HandlerError } from "@/guild-members/researcher/handlers";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

// -- Test helpers --

/** Sends a JSON-RPC request to a local server and returns the parsed response. */
async function sendJsonRpc(
  port: number,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return (await response.json()) as Record<string, unknown>;
}

/** Finds an available port for testing. */
function getTestPort(): number {
  // Use a range unlikely to conflict with the main port registry (50000-51000)
  return 52000 + Math.floor(Math.random() * 1000);
}

// -- Tests --

describe("parsePort", () => {
  it("parses --port with space separator", () => {
    expect(parsePort(["node", "server.ts", "--port", "3000"])).toBe(3000);
  });

  it("parses --port with equals separator", () => {
    expect(parsePort(["node", "server.ts", "--port=4000"])).toBe(4000);
  });

  it("returns null when --port is missing", () => {
    expect(parsePort(["node", "server.ts"])).toBeNull();
  });

  it("returns null for invalid port", () => {
    expect(parsePort(["node", "server.ts", "--port", "0"])).toBeNull();
    expect(parsePort(["node", "server.ts", "--port", "99999"])).toBeNull();
    expect(parsePort(["node", "server.ts", "--port", "abc"])).toBeNull();
  });
});

describe("createDefaultWorkerHandlers", () => {
  it("returns handlers for all worker methods", () => {
    const handlers = createDefaultWorkerHandlers();

    expect(Object.keys(handlers)).toEqual([
      "worker/dispatch",
      "worker/list",
      "worker/status",
      "worker/result",
      "worker/cancel",
      "worker/delete",
    ]);
  });

  it("all handlers throw 'not implemented'", async () => {
    const handlers = createDefaultWorkerHandlers();

    for (const [method, handler] of Object.entries(handlers)) {
      await expect(handler(undefined)).rejects.toThrow("not implemented");
    }
  });
});

describe("createMcpServer", () => {
  it("creates a server with name 'researcher'", () => {
    const server = createMcpServer();
    // The Server class stores server info, but we can't easily inspect it
    // without connecting. Verify it doesn't throw.
    expect(server).toBeDefined();
  });
});

describe("HttpTransport", () => {
  it("routes worker/* methods to handlers instead of MCP SDK", async () => {
    let receivedParams: Record<string, unknown> | undefined;
    const transport = new HttpTransport({
      "worker/dispatch": async (params) => {
        receivedParams = params;
        return { jobId: "test-123" };
      },
    });

    // Simulate an incoming HTTP request/response pair
    const { req, res, getResponse } = createMockHttpPair({
      jsonrpc: "2.0",
      id: 1,
      method: "worker/dispatch",
      params: { description: "test", task: "do stuff" },
    });

    // If onmessage is called, it means the message leaked to MCP SDK
    let mcpReceived = false;
    transport.onmessage = () => {
      mcpReceived = true;
    };

    await transport.handleRequest(req, res);
    const response = getResponse();

    expect(mcpReceived).toBe(false);
    expect(response.result).toEqual({ jobId: "test-123" });
    expect(receivedParams).toEqual({ description: "test", task: "do stuff" });
  });

  it("returns error for unregistered worker/* methods", async () => {
    const transport = new HttpTransport({});

    const { req, res, getResponse } = createMockHttpPair({
      jsonrpc: "2.0",
      id: 2,
      method: "worker/unknown",
      params: {},
    });

    await transport.handleRequest(req, res);
    const response = getResponse();

    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32601);
    expect(error.message).toContain("not implemented");
  });

  it("forwards non-worker methods to MCP SDK via onmessage", async () => {
    const transport = new HttpTransport({});

    const { req, res } = createMockHttpPair({
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });

    let forwardedMessage: JSONRPCMessage | null = null;
    transport.onmessage = (msg) => {
      forwardedMessage = msg;
    };

    await transport.handleRequest(req, res);

    expect(forwardedMessage).not.toBeNull();
    const fwd = forwardedMessage as unknown as Record<string, unknown>;
    expect(fwd.method).toBe("initialize");
  });
});

describe("createResearcherServer (integration)", () => {
  let stopServer: (() => Promise<void>) | null = null;
  let testPort: number;

  afterEach(async () => {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  });

  it("responds to initialize", async () => {
    testPort = getTestPort();
    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
    });
    await server.start();
    stopServer = server.stop;

    const response = await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    const result = response.result as Record<string, unknown>;
    expect(result.protocolVersion).toBeDefined();
    expect(result.serverInfo).toBeDefined();
    const serverInfo = result.serverInfo as Record<string, unknown>;
    expect(serverInfo.name).toBe("researcher");
  });

  it("routes worker/* methods to stub handlers", async () => {
    testPort = getTestPort();
    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
    });
    await server.start();
    stopServer = server.stop;

    // First, initialize the server (required by MCP protocol)
    await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    });

    // Send a worker/dispatch request
    const response = await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 2,
      method: "worker/dispatch",
      params: { description: "Test research", task: "Find stuff" },
    });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(2);
    // Default handlers throw "not implemented"
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.message).toContain("not implemented");
  });

  it("returns empty tools list via standard MCP", async () => {
    testPort = getTestPort();
    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
    });
    await server.start();
    stopServer = server.stop;

    // Initialize first
    await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    });

    // Send initialized notification
    await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    const response = await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });

    expect(response.result).toBeDefined();
    const result = response.result as { tools: unknown[] };
    expect(result.tools).toEqual([]);
  });

  it("returns 404 for non-POST or non-/mcp requests", async () => {
    testPort = getTestPort();
    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
    });
    await server.start();
    stopServer = server.stop;

    const getResponse = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(404);

    const wrongPath = await fetch(`http://127.0.0.1:${testPort}/other`, {
      method: "POST",
    });
    expect(wrongPath.status).toBe(404);
  });

  it("accepts custom worker handlers via deps", async () => {
    testPort = getTestPort();

    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
      workerHandlers: {
        "worker/dispatch": async (params) => ({
          jobId: "custom-job-1",
          params,
        }),
      },
    });
    await server.start();
    stopServer = server.stop;

    const response = await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 5,
      method: "worker/dispatch",
      params: { description: "Custom test" },
    });

    expect(response.result).toBeDefined();
    const result = response.result as Record<string, unknown>;
    expect(result.jobId).toBe("custom-job-1");
  });

  it("preserves HandlerError code in JSON-RPC error response", async () => {
    testPort = getTestPort();

    const server = createResearcherServer(testPort, {
      createHttpServer: createServer,
      workerHandlers: {
        "worker/dispatch": async () => {
          throw new HandlerError(-32602, "test error");
        },
      },
    });
    await server.start();
    stopServer = server.stop;

    const response = await sendJsonRpc(testPort, {
      jsonrpc: "2.0",
      id: 10,
      method: "worker/dispatch",
      params: { description: "test" },
    });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(10);
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32602);
    expect(error.message).toBe("test error");
  });
});

// -- Mock HTTP request/response pair for unit testing HttpTransport --

/**
 * Creates a mock IncomingMessage and ServerResponse pair for testing
 * HttpTransport.handleRequest without a real HTTP server.
 */
function createMockHttpPair(body: Record<string, unknown>): {
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
  getResponse: () => Record<string, unknown>;
} {
  const bodyStr = JSON.stringify(body);
  let responseBody = "";
  let headWritten = false;

  // Minimal mock of IncomingMessage: an async iterable that yields the body
  const req = {
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(bodyStr);
    },
  } as unknown as import("node:http").IncomingMessage;

  const res = {
    writeHead: (_status: number, _headers?: Record<string, string>) => {
      headWritten = true;
    },
    end: (data?: string) => {
      if (data) responseBody = data;
    },
  } as unknown as import("node:http").ServerResponse;

  return {
    req,
    res,
    getResponse: () => {
      if (!responseBody) return {};
      return JSON.parse(responseBody) as Record<string, unknown>;
    },
  };
}
