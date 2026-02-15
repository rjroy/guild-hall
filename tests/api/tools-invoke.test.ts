import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import { MCPManager } from "@/lib/mcp-manager";
import type {
  MCPServerFactory,
  MCPServerHandle,
  MCPToolInfo,
} from "@/lib/mcp-manager";
import type { GuildMember } from "@/lib/types";
import { handleInvokeTool, createPOST } from "@/app/api/tools/invoke/route";
import type { InvokeToolDeps } from "@/app/api/tools/invoke/route";

// -- Response type for typed JSON parsing --

type ApiResponse = {
  result?: unknown;
  error?: string;
  details?: string;
};

async function parseJson(response: Response): Promise<ApiResponse> {
  return response.json() as Promise<ApiResponse>;
}

// -- Fixtures --

function createMockProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return emitter as ChildProcess;
}

function makeGuildMember(name: string): GuildMember {
  return {
    name,
    displayName: name,
    description: `The ${name} member`,
    version: "1.0.0",
    transport: "http",
    mcp: { command: "node", args: [`${name}.js`] },
    status: "disconnected",
    tools: [],
    pluginDir: `/test/${name}`,
  };
}

const defaultTools: MCPToolInfo[] = [
  {
    name: "read_file",
    description: "Reads a file",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
];

function createMockHandle(options: {
  tools?: MCPToolInfo[];
  invokeResult?: unknown;
  invokeError?: Error;
} = {}): MCPServerHandle {
  const tools = options.tools ?? defaultTools;
  const hasExplicitResult = "invokeResult" in options;
  const invokeResult = hasExplicitResult ? options.invokeResult : { success: true };

  return {
    stop: () => Promise.resolve(),
    listTools: () => Promise.resolve(tools),
    invokeTool() {
      if (options.invokeError) return Promise.reject(options.invokeError);
      return Promise.resolve(invokeResult);
    },
  };
}

function createMockFactory(handle: MCPServerHandle): MCPServerFactory {
  return {
    spawn: () => Promise.resolve({
      process: createMockProcess(),
      handle,
      port: 50000,
    }),
  };
}

function createDeps(options: {
  invokeResult?: unknown;
  invokeError?: Error;
  members?: string[];
} = {}): InvokeToolDeps {
  const memberNames = options.members ?? ["alpha"];
  const roster = new Map<string, GuildMember>();
  for (const name of memberNames) {
    roster.set(name, makeGuildMember(name));
  }

  const handle = createMockHandle({
    invokeResult: options.invokeResult,
    invokeError: options.invokeError,
  });
  const factory = createMockFactory(handle);
  const mcpManager = new MCPManager(roster, factory);

  return { mcpManager, roster };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/tools/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): Request {
  return new Request("http://localhost/api/tools/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
}

// -- Tests --

describe("POST /api/tools/invoke", () => {
  describe("successful invocation", () => {
    it("returns the tool result in { result: ... } shape", async () => {
      const deps = createDeps({ invokeResult: { content: "hello world" } });

      // Start the server so invokeTool doesn't need to spawn
      await deps.mcpManager.startServersForSession("test", ["alpha"]);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: { path: "/tmp/test" },
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: { content: "hello world" } });
    });

    it("auto-starts a stopped server and returns the result", async () => {
      const deps = createDeps({ invokeResult: { data: 42 } });

      // Server not pre-started; invokeTool handles the temporary start/stop
      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: { data: 42 } });
    });

    it("passes toolInput through to the MCP server", async () => {
      let capturedInput: Record<string, unknown> = {};
      const handle: MCPServerHandle = {
        stop: () => Promise.resolve(),
        listTools: () => Promise.resolve(defaultTools),
        invokeTool(...args: [string, Record<string, unknown>]) {
          capturedInput = args[1];
          return Promise.resolve({ ok: true });
        },
      };
      const factory = createMockFactory(handle);
      const roster = new Map<string, GuildMember>([
        ["alpha", makeGuildMember("alpha")],
      ]);
      const mcpManager = new MCPManager(roster, factory);
      await mcpManager.startServersForSession("test", ["alpha"]);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: { path: "/etc/hosts", encoding: "utf-8" },
      });

      await handleInvokeTool(request, { mcpManager, roster });

      expect(capturedInput).toEqual({ path: "/etc/hosts", encoding: "utf-8" });
    });
  });

  describe("validation errors (400)", () => {
    it("returns 400 for invalid JSON body", async () => {
      const deps = createDeps();
      const request = makeInvalidJsonRequest();

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 when guildMember is missing", async () => {
      const deps = createDeps();
      const request = makeRequest({
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });

    it("returns 400 when toolName is missing", async () => {
      const deps = createDeps();
      const request = makeRequest({
        guildMember: "alpha",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 when toolInput is missing", async () => {
      const deps = createDeps();
      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 when guildMember is an empty string", async () => {
      const deps = createDeps();
      const request = makeRequest({
        guildMember: "",
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 when toolName is an empty string", async () => {
      const deps = createDeps();
      const request = makeRequest({
        guildMember: "alpha",
        toolName: "",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe("Validation failed");
    });
  });

  describe("guild member not found (404)", () => {
    it("returns 404 when guild member is not in the roster", async () => {
      const deps = createDeps({ members: ["alpha"] });
      const request = makeRequest({
        guildMember: "nonexistent",
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(404);
      expect(body.error).toContain("nonexistent");
      expect(body.error).toContain("not found");
    });

    it("returns 404 with empty roster", async () => {
      const roster = new Map<string, GuildMember>();
      const factory: MCPServerFactory = {
        spawn: () => Promise.resolve({
          process: createMockProcess(),
          handle: createMockHandle(),
          port: 50000,
        }),
      };
      const mcpManager = new MCPManager(roster, factory);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, { mcpManager, roster });

      expect(response.status).toBe(404);
    });
  });

  describe("tool execution error (500)", () => {
    it("returns 500 when invokeTool throws an Error", async () => {
      const deps = createDeps({
        invokeError: new Error("Tool execution failed: timeout"),
      });

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: { path: "/tmp/test" },
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toContain("Tool execution failed: timeout");
    });

    it("returns 500 with server start failure message", async () => {
      // Use a factory that rejects on spawn to simulate server start failure
      const roster = new Map<string, GuildMember>([
        ["alpha", makeGuildMember("alpha")],
      ]);
      const failFactory: MCPServerFactory = {
        spawn: () => Promise.reject(new Error("Connection refused")),
      };
      const mcpManager = new MCPManager(roster, failFactory);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "read_file",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, { mcpManager, roster });
      const body = await parseJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toBeDefined();
    });
  });

  describe("response shape", () => {
    it("successful response has exactly { result } key", async () => {
      const deps = createDeps({ invokeResult: "plain string result" });
      await deps.mcpManager.startServersForSession("test", ["alpha"]);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "echo",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(Object.keys(body)).toEqual(["result"]);
      expect(body.result).toBe("plain string result");
    });

    it("error response has { error } key", async () => {
      const deps = createDeps();
      const request = makeRequest({ incomplete: true });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });

    it("handles null result from tool", async () => {
      const deps = createDeps({ invokeResult: null });
      await deps.mcpManager.startServersForSession("test", ["alpha"]);

      const request = makeRequest({
        guildMember: "alpha",
        toolName: "void_tool",
        toolInput: {},
      });

      const response = await handleInvokeTool(request, deps);
      const body = await parseJson(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: null });
    });
  });
});

describe("createPOST", () => {
  it("calls resolveDeps and delegates to handleInvokeTool", async () => {
    const deps = createDeps({ invokeResult: { created: true } });
    await deps.mcpManager.startServersForSession("test", ["alpha"]);

    const post = createPOST(async () => deps);
    const request = makeRequest({
      guildMember: "alpha",
      toolName: "read_file",
      toolInput: { path: "/tmp" },
    });

    const response = await post(request);
    const body = await parseJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ result: { created: true } });
  });

  it("returns errors from the delegated handler", async () => {
    const deps = createDeps({ invokeError: new Error("boom") });

    const post = createPOST(async () => deps);
    const request = makeRequest({
      guildMember: "alpha",
      toolName: "read_file",
      toolInput: {},
    });

    const response = await post(request);
    const body = await parseJson(response);

    expect(response.status).toBe(500);
    expect(body.error).toContain("boom");
  });
});
