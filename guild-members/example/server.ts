#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";

/**
 * HTTP transport for MCP server.
 * Receives JSON-RPC requests via POST /mcp and sends responses back.
 */
class HttpTransport implements Transport {
  private _responseMap = new Map<string | number, ServerResponse>();

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // No initial connection setup needed for HTTP
  }

  close(): Promise<void> {
    this._responseMap.clear();
    this.onclose?.();
    return Promise.resolve();
  }

  send(message: JSONRPCMessage): Promise<void> {
    // Get the response object for this message ID
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
   * Handle an incoming HTTP request
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Read request body
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();

      // Parse JSON-RPC message
      const message = JSON.parse(body) as JSONRPCMessage;

      // Store response object for this request ID
      if ("id" in message && message.id !== undefined) {
        this._responseMap.set(message.id, res);
      } else {
        // Notification (no id): send immediate 200 OK response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end();
      }

      // Forward message to protocol handler
      this.onmessage?.(message);
    } catch (error) {
      // Send error response
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error",
          },
          id: null,
        })
      );
    }
  }
}

const server = new Server(
  {
    name: "example-echo-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "echo",
      description: "Echoes back the input message",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to echo back",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "reverse",
      description: "Reverses the input text",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to reverse",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "sleep",
      description: "Sleep for N seconds",
      inputSchema: {
        type: "object",
        properties: {
          seconds: {
            type: "number",
            description: "Number of seconds to sleep",
          },
        },
        required: ["seconds"],
      },
    },
    {
      name: "read-file",
      description: "Read a file by relative path",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to file",
          },
        },
        required: ["path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "echo") {
    const message = typeof args?.message === "string" ? args.message : "";
    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  }

  if (name === "reverse") {
    const text = typeof args?.text === "string" ? args.text : "";
    const reversed = text.split("").reverse().join("");
    return {
      content: [
        {
          type: "text",
          text: reversed,
        },
      ],
    };
  }

  if (name === "sleep") {
    const seconds = Number(args?.seconds ?? 0);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return {
      content: [
        {
          type: "text",
          text: `Slept for ${seconds}s`,
        },
      ],
    };
  }

  if (name === "read-file") {
    const path = typeof args?.path === "string" ? args.path : "";
    const content = await readFile(path, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  // Parse port from command line arguments
  const portArg = process.argv.find((arg) => arg.startsWith("--port"));
  if (!portArg) {
    console.error("Error: --port argument required");
    process.exit(1);
  }

  const port = parseInt(
    portArg.split("=")[1] || process.argv[process.argv.indexOf(portArg) + 1],
    10
  );
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Error: Invalid port ${port}`);
    process.exit(1);
  }

  // Create HTTP transport
  const transport = new HttpTransport();

  // Connect MCP server to transport
  await server.connect(transport);

  // Create HTTP server
  const httpServer = createServer((req, res) => {
    // Only handle POST requests to /mcp
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }

    void transport.handleRequest(req, res);
  });

  // Handle server errors
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${port} is already in use`);
      process.exit(2);
    }
    console.error("Server error:", err);
    process.exit(1);
  });

  // Bind to localhost only
  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`Example MCP server listening on http://127.0.0.1:${port}/mcp`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
