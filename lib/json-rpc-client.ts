/**
 * JSON-RPC HTTP Client for MCP Server Communication
 *
 * Implements JSON-RPC 2.0 protocol over HTTP for communicating with MCP servers.
 * Follows Guild Hall's dependency injection pattern for testability.
 */

export interface InitializeResponse {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class JsonRpcTimeoutError extends Error {
  constructor(method: string, timeout: number) {
    super(`JSON-RPC call ${method} timed out after ${timeout}ms`);
    this.name = "JsonRpcTimeoutError";
  }
}

export class JsonRpcHttpError extends Error {
  constructor(
    public status: number,
    statusText: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = "JsonRpcHttpError";
  }
}

export class JsonRpcProtocolError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(`JSON-RPC error ${code}: ${message}`);
    this.name = "JsonRpcProtocolError";
  }
}

export class JsonRpcToolExecutionError extends Error {
  constructor(
    public toolName: string,
    public result: ToolResult,
  ) {
    const errorText =
      result.content.find((c) => c.type === "text")?.text ?? "Unknown error";
    super(`Tool ${toolName} execution failed: ${errorText}`);
    this.name = "JsonRpcToolExecutionError";
  }
}

export interface JsonRpcClientDeps {
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  setTimeout?: (callback: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
}

/**
 * Factory function for creating JsonRpcClient instances.
 * Uses dependency injection pattern for testability.
 */
export function createJsonRpcClient(
  baseUrl: string,
  deps: JsonRpcClientDeps = {
    fetch: global.fetch,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  },
): JsonRpcClient {
  return new JsonRpcClient(baseUrl, deps);
}

export class JsonRpcClient {
  private readonly baseUrl: string;
  private readonly fetch: (url: string, options?: RequestInit) => Promise<Response>;
  private readonly setTimeoutFn: (callback: () => void, ms: number) => number;
  private readonly clearTimeoutFn: (id: number) => void;
  private nextId = 1;

  constructor(baseUrl: string, deps: JsonRpcClientDeps) {
    this.baseUrl = baseUrl;
    this.fetch = deps.fetch;
    this.setTimeoutFn = deps.setTimeout ?? ((cb, ms) => global.setTimeout(cb, ms) as unknown as number);
    this.clearTimeoutFn = deps.clearTimeout ?? ((id) => global.clearTimeout(id));
  }

  /**
   * Perform 3-step initialize handshake with MCP server.
   * 1. Send initialize request
   * 2. Receive response
   * 3. Send initialized notification
   *
   * Entire handshake must complete within 5 seconds per REQ-MCP-HTTP-14.
   *
   * @param clientInfo Client name and version
   * @returns InitializeResponse from server
   * @throws JsonRpcTimeoutError if handshake exceeds 5s
   * @throws JsonRpcHttpError on HTTP error status
   * @throws JsonRpcProtocolError on JSON-RPC error response
   */
  async initialize(
    clientInfo: { name: string; version: string },
    options?: { timeoutMs?: number },
  ): Promise<InitializeResponse> {
    const timeoutMs = options?.timeoutMs ?? 5000;
    const controller = new AbortController();
    const timeoutId = this.setTimeoutFn(() => controller.abort(), timeoutMs);

    try {
      const response = await this.call(
        "initialize",
        {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo,
        },
        controller.signal,
      );

      // Send initialized notification (no response expected)
      await this.notify("notifications/initialized", controller.signal);

      return response as InitializeResponse;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new JsonRpcTimeoutError("initialize handshake", timeoutMs);
      }
      throw error;
    } finally {
      this.clearTimeoutFn(timeoutId);
    }
  }

  /**
   * List available tools from MCP server.
   *
   * @returns Array of tool definitions
   * @throws JsonRpcTimeoutError if request exceeds 30s
   * @throws JsonRpcHttpError on HTTP error status
   * @throws JsonRpcProtocolError on JSON-RPC error response
   */
  async listTools(): Promise<ToolInfo[]> {
    const controller = new AbortController();
    const timeoutId = this.setTimeoutFn(() => controller.abort(), 30000);

    try {
      const response = await this.call("tools/list", {}, controller.signal);
      const result = response as { tools: ToolInfo[] };
      return result.tools;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new JsonRpcTimeoutError("tools/list", 30000);
      }
      throw error;
    } finally {
      this.clearTimeoutFn(timeoutId);
    }
  }

  /**
   * Invoke a tool on the MCP server.
   *
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool result content
   * @throws JsonRpcToolExecutionError if tool returns isError: true
   * @throws JsonRpcTimeoutError if request exceeds 30s
   * @throws JsonRpcHttpError on HTTP error status
   * @throws JsonRpcProtocolError on JSON-RPC error response
   */
  async invokeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const controller = new AbortController();
    const timeoutId = this.setTimeoutFn(() => controller.abort(), 30000);

    try {
      const response = await this.call(
        "tools/call",
        {
          name,
          arguments: args,
        },
        controller.signal,
      );

      const result = response as ToolResult;

      if (result.isError) {
        throw new JsonRpcToolExecutionError(name, result);
      }

      return result;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new JsonRpcTimeoutError("tools/call", 30000);
      }
      throw error;
    } finally {
      this.clearTimeoutFn(timeoutId);
    }
  }

  /**
   * Send JSON-RPC request with abort signal for timeout enforcement.
   *
   * @param method JSON-RPC method name
   * @param params Method parameters
   * @param signal AbortSignal for timeout/cancellation
   * @returns Response result object
   * @throws JsonRpcHttpError on HTTP error status
   * @throws JsonRpcProtocolError on JSON-RPC error response
   * @throws Error with name "AbortError" if request is aborted
   */
  private async call(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId++,
      method,
      params,
    };

    const response = await this.fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
        "Origin": "http://localhost",
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw new JsonRpcHttpError(response.status, response.statusText);
    }

    const jsonResponse = (await response.json()) as JsonRpcResponse;

    if (jsonResponse.error) {
      throw new JsonRpcProtocolError(
        jsonResponse.error.code,
        jsonResponse.error.message,
        jsonResponse.error.data,
      );
    }

    return jsonResponse.result;
  }

  /**
   * Send JSON-RPC notification (no response expected).
   *
   * @param method Notification method name
   * @param signal AbortSignal for timeout/cancellation
   * @throws JsonRpcHttpError on HTTP error status
   * @throws Error with name "AbortError" if request is aborted
   */
  private async notify(method: string, signal: AbortSignal): Promise<void> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
    };

    const response = await this.fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
        "Origin": "http://localhost",
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw new JsonRpcHttpError(response.status, response.statusText);
    }
  }
}
