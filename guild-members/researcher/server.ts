#!/usr/bin/env node
/**
 * Researcher plugin HTTP server.
 *
 * Hosts an MCP server for standard protocol methods (initialize, tools/list,
 * tools/call) and intercepts worker/* JSON-RPC methods at the transport level
 * before they reach the MCP SDK Server. All six worker methods (dispatch, list,
 * status, result, cancel, delete) are backed by real handlers.
 *
 * Transport-level interception is necessary because worker/* methods are not
 * part of the MCP protocol. The SDK Server only routes standard MCP methods
 * and would reject or ignore worker/* requests.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHandlers, HandlerError, type DispatchParams, type ListParams, type StatusParams, type ResultParams, type CancelParams, type DeleteParams } from "./handlers.js";
import type { JobStore } from "./job-store.js";
import type { FullMemoryStore } from "./memory.js";
import type { QueryFn } from "@/lib/agent";
import { createWorkerTools } from "./worker-tools.js";
import { buildWorkerPrompt } from "./worker-prompt.js";
import { spawnWorkerAgent } from "./worker-agent.js";

// -- Types --

/** JSON-RPC request shape (subset of JSONRPCMessage that carries a method) */
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC response for successful results */
type JsonRpcSuccessResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
};

/** JSON-RPC response for errors */
type JsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: string | number;
  error: { code: number; message: string; data?: unknown };
};

/** Handler for a single worker/* method */
type WorkerMethodHandler = (
  params: Record<string, unknown> | undefined,
) => Promise<unknown>;

/** Dependencies for agent dispatch, enabling DI for testing. */
export type WorkerDispatchDeps = {
  queryFn: QueryFn;
  memoryStore: FullMemoryStore;
  clock: { now: () => string };
};

/** Dependencies for createResearcherServer, enabling DI for testing. */
export type ResearcherServerDeps = {
  createHttpServer: typeof createServer;
  workerHandlers?: Record<string, WorkerMethodHandler>;
  jobStore?: JobStore;
  dispatchDeps?: WorkerDispatchDeps;
};

// -- HTTP Transport --

/**
 * HTTP transport for MCP server.
 * Receives JSON-RPC requests via POST /mcp and sends responses back.
 * Intercepts worker/* methods before forwarding to the MCP SDK Server.
 */
export class HttpTransport implements Transport {
  private _responseMap = new Map<string | number, ServerResponse>();
  private _workerHandlers: Record<string, WorkerMethodHandler>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(workerHandlers: Record<string, WorkerMethodHandler> = {}) {
    this._workerHandlers = workerHandlers;
  }

  async start(): Promise<void> {
    // No initial connection setup needed for HTTP
  }

  close(): Promise<void> {
    this._responseMap.clear();
    this.onclose?.();
    return Promise.resolve();
  }

  send(message: JSONRPCMessage): Promise<void> {
    const id = "id" in message ? message.id : null;
    if (id !== null && id !== undefined) {
      const res = this._responseMap.get(id);
      if (res) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(message));
        this._responseMap.delete(id);
      }
    }
    return Promise.resolve();
  }

  /**
   * Handle an incoming HTTP request. Intercepts worker/* methods and routes
   * them to local handlers. All other methods pass through to the MCP SDK.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Uint8Array);
      }
      const body = Buffer.concat(chunks).toString();
      const message = JSON.parse(body) as JSONRPCMessage;

      // Check if this is a worker/* method request
      if (isJsonRpcRequest(message) && message.method.startsWith("worker/")) {
        await this._handleWorkerMethod(message, res);
        return;
      }

      // Standard MCP path: store response for SDK to send via send()
      if ("id" in message && message.id !== undefined) {
        this._responseMap.set(message.id, res);
      } else {
        // Notification (no id): immediate 200 OK
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end();
      }

      // Forward to MCP SDK Server
      this.onmessage?.(message);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error",
          },
          id: null,
        }),
      );
    }
  }

  /**
   * Routes a worker/* method to its handler and writes the JSON-RPC
   * response directly, bypassing the MCP SDK.
   */
  private async _handleWorkerMethod(
    request: JsonRpcRequest,
    res: ServerResponse,
  ): Promise<void> {
    const handler = this._workerHandlers[request.method];

    let response: JsonRpcSuccessResponse | JsonRpcErrorResponse;

    if (!handler) {
      response = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `not implemented: ${request.method}`,
        },
      };
    } else {
      try {
        const result = await handler(request.params as Record<string, unknown> | undefined);
        response = {
          jsonrpc: "2.0",
          id: request.id,
          result,
        };
      } catch (err) {
        const code = err instanceof HandlerError ? err.code : -32603;
        response = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code,
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }
}

/** Type guard: checks if a JSONRPCMessage is a request (has method and id). */
function isJsonRpcRequest(message: JSONRPCMessage): message is JSONRPCMessage & JsonRpcRequest {
  return "method" in message && "id" in message;
}

// -- MCP Server Setup --

/**
 * Creates the MCP SDK Server. Declares tools capability so the SDK
 * accepts tools/list and tools/call handlers, even though this
 * worker-only plugin returns an empty tool list.
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "researcher",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // tools/list returns empty (no standard MCP tools)
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [],
  }));

  // tools/call returns an error (no standard MCP tools)
  server.setRequestHandler(CallToolRequestSchema, () => {
    throw new Error("No tools available. This plugin operates as a worker only.");
  });

  return server;
}

// -- Default worker handlers --

/**
 * Creates the worker method handlers. All six methods are backed by a
 * JobStore via the handlers module.
 *
 * When dispatchDeps is provided, the dispatch handler spawns a real worker
 * agent in the background and the cancel handler aborts running agents.
 * Without dispatchDeps, dispatch creates the job but does not spawn an
 * agent (useful for unit tests of handler logic only).
 */
export function createDefaultWorkerHandlers(
  jobStore?: JobStore,
  dispatchDeps?: WorkerDispatchDeps,
): Record<string, WorkerMethodHandler> {
  const notImplemented = (_params: Record<string, unknown> | undefined): Promise<unknown> => {
    return Promise.reject(new Error("not implemented"));
  };

  // When no JobStore is provided, all handlers are stubs (for tests that
  // don't need real dispatch/list behavior).
  if (!jobStore) {
    return {
      "worker/dispatch": notImplemented,
      "worker/list": notImplemented,
      "worker/status": notImplemented,
      "worker/result": notImplemented,
      "worker/cancel": notImplemented,
      "worker/delete": notImplemented,
    };
  }

  // Map of running job abort controllers, keyed by jobId.
  // The dispatch handler adds entries; the cancel handler and the
  // .finally() cleanup remove them.
  const runningAbortControllers = new Map<string, AbortController>();

  const onCancel = (jobId: string) => {
    const controller = runningAbortControllers.get(jobId);
    if (controller) {
      controller.abort();
      runningAbortControllers.delete(jobId);
    }
  };

  const handlers = createHandlers(jobStore, onCancel);

  // Wrap dispatch to spawn the agent after creating the job
  const dispatchWithAgent = async (params: DispatchParams) => {
    const result = await handlers.dispatch(params);

    if (dispatchDeps) {
      const { queryFn, memoryStore, clock } = dispatchDeps;
      const { jobId } = result;
      const { task, config } = params;

      const internalTools = createWorkerTools(jobId, jobStore, memoryStore);
      const memories = await memoryStore.loadMemories(8000);
      const systemPrompt = buildWorkerPrompt(task, memories);
      const abortController = new AbortController();

      runningAbortControllers.set(jobId, abortController);

      // Fire-and-forget: spawn agent in background
      spawnWorkerAgent(task, systemPrompt, internalTools, config, queryFn, abortController)
        .then(async (output) => {
          await jobStore.writeResult(jobId, output);
          await jobStore.updateStatus(jobId, "completed", clock.now());
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          try {
            await jobStore.setError(jobId, message);
          } catch (storeErr) {
            console.error(`Failed to record error for job ${jobId}:`, storeErr);
          }
        })
        .finally(() => {
          runningAbortControllers.delete(jobId);
        });
    }

    return result;
  };

  return {
    "worker/dispatch": (params) =>
      dispatchWithAgent(params as unknown as DispatchParams),
    "worker/list": (params) =>
      handlers.list(params as unknown as ListParams),
    "worker/status": (params) =>
      handlers.status(params as unknown as StatusParams),
    "worker/result": (params) =>
      handlers.result(params as unknown as ResultParams),
    "worker/cancel": (params) =>
      handlers.cancel(params as unknown as CancelParams),
    "worker/delete": (params) =>
      handlers.delete(params as unknown as DeleteParams),
  };
}

// -- Server factory --

/** Port parsing helper. Returns the port number or null if invalid. */
export function parsePort(argv: string[]): number | null {
  const portArg = argv.find((arg) => arg.startsWith("--port"));
  if (!portArg) return null;

  const port = parseInt(
    portArg.split("=")[1] || argv[argv.indexOf(portArg) + 1],
    10,
  );

  if (isNaN(port) || port < 1 || port > 65535) return null;
  return port;
}

/**
 * Creates and starts the researcher HTTP server.
 * Returns a cleanup function that stops the server.
 */
export function createResearcherServer(
  port: number,
  deps: ResearcherServerDeps = { createHttpServer: createServer },
): {
  start: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const workerHandlers = deps.workerHandlers ?? createDefaultWorkerHandlers(deps.jobStore, deps.dispatchDeps);
  const transport = new HttpTransport(workerHandlers);
  const mcpServer = createMcpServer();

  let httpServer: ReturnType<typeof createServer> | null = null;

  return {
    async start() {
      await mcpServer.connect(transport);

      httpServer = deps.createHttpServer((req, res) => {
        if (req.method !== "POST" || req.url !== "/mcp") {
          res.writeHead(404);
          res.end();
          return;
        }
        void transport.handleRequest(req, res);
      });

      httpServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`Error: Port ${port} is already in use`);
          process.exit(2);
        }
        console.error("Server error:", err);
        process.exit(1);
      });

      await new Promise<void>((resolve) => {
        httpServer!.listen(port, "127.0.0.1", () => { // eslint-disable-line @typescript-eslint/no-non-null-assertion -- httpServer assigned on the line above
          console.log(`Researcher MCP server listening on http://127.0.0.1:${port}/mcp`);
          resolve();
        });
      });
    },

    async stop() {
      await transport.close();
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer!.close((err) => { // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guarded by if
            if (err) reject(err);
            else resolve();
          });
        });
      }
    },
  };
}

// -- Main entrypoint --

async function main() {
  const port = parsePort(process.argv);
  if (port === null) {
    console.error("Error: --port argument required (valid range: 1-65535)");
    process.exit(1);
  }

  const server = createResearcherServer(port);
  await server.start();
}

// Only run when executed directly, not when imported by tests.
// Bun sets import.meta.main to true for the entry module.
if (import.meta.main) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
