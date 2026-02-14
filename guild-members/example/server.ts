#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "echo") {
    const message = String(args?.message ?? "");
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
    const text = String(args?.text ?? "");
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

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
