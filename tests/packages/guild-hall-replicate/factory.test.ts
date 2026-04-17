import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createEventBus } from "@/daemon/lib/event-bus";
import type { GuildHallToolboxDeps } from "@/daemon/services/toolbox-types";
import type { AppConfig } from "@/lib/types";

// Internal MCP server type for testing tool invocation
interface RegisteredTool {
  handler: (...args: unknown[]) => unknown;
  inputSchema?: unknown;
}

interface McpServerInstance {
  _registeredTools: Record<string, RegisteredTool>;
  executeToolHandler(
    tool: RegisteredTool,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

const TOOL_NAMES = [
  "generate_image",
  "edit_image",
  "remove_background",
  "upscale_image",
  "list_models",
  "get_model_params",
  "check_prediction",
  "cancel_prediction",
] as const;

function makeDeps(): GuildHallToolboxDeps {
  const config: AppConfig = { projects: [] };
  return {
    guildHallHome: "/tmp/gh-test",
    projectName: "test-project",
    contextId: "commission-test",
    contextType: "commission",
    workerName: "test-worker",
    eventBus: createEventBus(),
    config,
  };
}

let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.REPLICATE_API_TOKEN;
});

afterEach(() => {
  if (savedToken === undefined) {
    delete process.env.REPLICATE_API_TOKEN;
  } else {
    process.env.REPLICATE_API_TOKEN = savedToken;
  }
});

async function loadFactory() {
  const mod = await import("@/packages/guild-hall-replicate/index");
  return mod.toolboxFactory;
}

describe("replicate toolbox factory", () => {
  describe("unconfigured state (no REPLICATE_API_TOKEN)", () => {
    test("server name is guild-hall-replicate", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      expect(server.name).toBe("guild-hall-replicate");
    });

    test("server type is sdk", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      expect(server.type).toBe("sdk");
    });

    test("all 8 tools are registered", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      const instance = server.instance as unknown as McpServerInstance;

      for (const name of TOOL_NAMES) {
        expect(instance._registeredTools[name]).toBeDefined();
      }
    });

    test("every tool returns isError with REPLICATE_API_TOKEN message", async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      const instance = server.instance as unknown as McpServerInstance;

      for (const name of TOOL_NAMES) {
        const registeredTool = instance._registeredTools[name];
        const result = await instance.executeToolHandler(registeredTool, {}, {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("REPLICATE_API_TOKEN");
      }
    });

    test("empty string token is treated as unconfigured", async () => {
      process.env.REPLICATE_API_TOKEN = "";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      const instance = server.instance as unknown as McpServerInstance;

      const registeredTool = instance._registeredTools["generate_image"];
      const result = await instance.executeToolHandler(registeredTool, {}, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("REPLICATE_API_TOKEN");
    });
  });

  describe("configured state (REPLICATE_API_TOKEN present)", () => {
    test("server name is guild-hall-replicate", async () => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      expect(server.name).toBe("guild-hall-replicate");
    });

    test("server type is sdk", async () => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      expect(server.type).toBe("sdk");
    });

    test("all 8 tools are registered", async () => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      const { server } = factory(makeDeps());
      const instance = server.instance as unknown as McpServerInstance;

      for (const name of TOOL_NAMES) {
        expect(instance._registeredTools[name]).toBeDefined();
      }
    });

    test("factory creates without error", async () => {
      process.env.REPLICATE_API_TOKEN = "test-token-123";
      const factory = await loadFactory();
      expect(() => factory(makeDeps())).not.toThrow();
    });
  });
});
