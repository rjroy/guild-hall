/**
 * Dispatch Bridge - Per-plugin in-process MCP servers for worker dispatch
 *
 * Creates an in-process MCP server (via createSdkMcpServer) that exposes
 * six tools for dispatching and managing worker jobs on a plugin's HTTP
 * MCP server. The main agent calls these tools; each tool creates a
 * JsonRpcClient targeting the plugin's worker/* endpoints.
 *
 * Follows the DI factory pattern: createDispatchBridge(memberName, port, deps?)
 * where deps allows injecting a mock JsonRpcClient factory for testing.
 */

import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type {
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";

import { JsonRpcClient } from "./json-rpc-client";
import type { JsonRpcClientDeps } from "./json-rpc-client";

// -- Dependency injection types --

export type JsonRpcClientFactory = (baseUrl: string) => JsonRpcClient;

export type DispatchBridgeDeps = {
  createClient: JsonRpcClientFactory;
};

// -- Tool result helpers --

export function textResult(data: unknown): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

// -- Default client factory --

function defaultCreateClient(baseUrl: string): JsonRpcClient {
  const deps: JsonRpcClientDeps = {
    fetch: global.fetch,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  return new JsonRpcClient(baseUrl, deps);
}

// -- Tool definitions --

/**
 * Create the six dispatch tool definitions. Separated from createDispatchBridge
 * so tests can invoke tool handlers directly without going through the MCP
 * server layer.
 *
 * Each tool's handler is strongly typed via Zod schemas. The return type
 * uses the base SdkMcpToolDefinition (without a type parameter) so tests
 * can call handlers with typed arguments. At the createSdkMcpServer call
 * site, the array is cast to match the SDK's expected `any` parameter.
 */
export function createDispatchTools(
  memberName: string,
  baseUrl: string,
  createClient: JsonRpcClientFactory,
) {
  const dispatchTool = tool(
    "dispatch",
    `Dispatch a new worker task to ${memberName}. Provide a short description and a detailed task prompt.`,
    {
      description: z.string().describe("Short description of what the worker should do"),
      task: z.string().describe("Detailed task prompt for the worker agent"),
      config: z.record(z.string(), z.unknown()).optional().describe("Optional configuration for the worker"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const result = await client.dispatchWorker({
          description: input.description,
          task: input.task,
          config: input.config,
        });
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const listTool = tool(
    "list",
    `List worker jobs on ${memberName}. Optionally filter by status or get detailed info.`,
    {
      detail: z.enum(["simple", "detailed"]).optional().describe("Level of detail in the response"),
      filter: z.string().optional().describe("Filter jobs by status (e.g., 'running', 'completed')"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const params: { detail?: "simple" | "detailed"; filter?: string } = {};
        if (input.detail) params.detail = input.detail;
        if (input.filter) params.filter = input.filter;
        const result = await client.listWorkers(
          Object.keys(params).length > 0 ? params : undefined,
        );
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const statusTool = tool(
    "status",
    `Get the status of a worker job on ${memberName}.`,
    {
      jobId: z.string().describe("The job ID to check"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const result = await client.workerStatus({ jobId: input.jobId });
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const resultTool = tool(
    "result",
    `Get the result of a completed worker job on ${memberName}.`,
    {
      jobId: z.string().describe("The job ID to retrieve results for"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const result = await client.workerResult({ jobId: input.jobId });
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const cancelTool = tool(
    "cancel",
    `Cancel a running worker job on ${memberName}.`,
    {
      jobId: z.string().describe("The job ID to cancel"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const result = await client.cancelWorker({ jobId: input.jobId });
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  const deleteTool = tool(
    "delete",
    `Delete a worker job record on ${memberName}.`,
    {
      jobId: z.string().describe("The job ID to delete"),
    },
    async (input) => {
      try {
        const client = createClient(baseUrl);
        const result = await client.deleteWorker({ jobId: input.jobId });
        return textResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  return [dispatchTool, listTool, statusTool, resultTool, cancelTool, deleteTool];
}

// -- Dispatch bridge factory --

/**
 * Create a dispatch MCP server for a worker-capable plugin. Returns a
 * McpSdkServerConfigWithInstance that can be placed directly into the
 * mcpServers record passed to the Agent SDK's query().
 *
 * The server is named `${memberName}-dispatch` and exposes six tools:
 * dispatch, list, status, result, cancel, delete.
 *
 * Each tool handler creates a JsonRpcClient targeting the plugin's HTTP
 * server at `http://localhost:${port}/mcp` and calls the corresponding
 * worker/* method.
 */
export function createDispatchBridge(
  memberName: string,
  port: number,
  deps?: Partial<DispatchBridgeDeps>,
): McpSdkServerConfigWithInstance {
  const createClient = deps?.createClient ?? defaultCreateClient;
  const baseUrl = `http://localhost:${port}/mcp`;
  const tools = createDispatchTools(memberName, baseUrl, createClient);

  // Cast required: createSdkMcpServer expects SdkMcpToolDefinition<any>[]
  // but our tools are concretely typed per-schema. The SDK accepts both.
  return createSdkMcpServer({
    name: `${memberName}-dispatch`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as SdkMcpToolDefinition<any>[],
  });
}
