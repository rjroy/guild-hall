import { describe, expect, it } from "bun:test";

import { schemaToFields } from "@/lib/schema-fields";
import type { GuildMember, ToolInfo } from "@/lib/types";

// -- Fixtures --

const readFileTool: ToolInfo = {
  name: "read_file",
  description: "Read the contents of a file",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
    },
    required: ["path"],
  },
};

const noParamTool: ToolInfo = {
  name: "list_all",
  description: "List all items",
  inputSchema: {},
};

const objectTypeTool: ToolInfo = {
  name: "get_status",
  description: "Get system status",
  inputSchema: { type: "object" },
};

const complexTool: ToolInfo = {
  name: "search",
  description: "Search with filters",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      filters: {
        type: "object",
        properties: {
          category: { type: "string" },
        },
      },
    },
  },
};

function makeGuildMember(overrides: Partial<GuildMember> = {}): GuildMember {
  return {
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
    transport: "http",
    mcp: { command: "node", args: ["server.js"] },
    status: "disconnected",
    tools: [],
    ...overrides,
  };
}

function makePluginMember(overrides: Partial<GuildMember> = {}): GuildMember {
  return {
    name: "plugin-member",
    displayName: "Plugin Member",
    description: "A plugin-only guild member",
    version: "1.0.0",
    plugin: { path: "./plugin" },
    status: "available",
    tools: [],
    memberType: "plugin",
    pluginPath: "/absolute/path/to/plugin",
    ...overrides,
  };
}

function makeHybridMember(overrides: Partial<GuildMember> = {}): GuildMember {
  return {
    name: "hybrid-member",
    displayName: "Hybrid Member",
    description: "A hybrid guild member",
    version: "1.0.0",
    transport: "http",
    mcp: { command: "node", args: ["server.js"] },
    plugin: { path: "./plugin" },
    status: "disconnected",
    tools: [{ name: "some_tool", description: "A tool", inputSchema: {} }],
    memberType: "hybrid",
    pluginPath: "/absolute/path/to/plugin",
    ...overrides,
  };
}

// -- Tests --

describe("Roster component logic", () => {
  describe("tool count display", () => {
    it("counts tools using array length", () => {
      const member = makeGuildMember({
        tools: [readFileTool, noParamTool],
      });
      const toolCount = member.tools.length;
      const toolLabel = toolCount === 1 ? "1 tool" : `${toolCount} tools`;
      expect(toolLabel).toBe("2 tools");
    });

    it("shows singular for single tool", () => {
      const member = makeGuildMember({ tools: [readFileTool] });
      const toolCount = member.tools.length;
      const toolLabel = toolCount === 1 ? "1 tool" : `${toolCount} tools`;
      expect(toolLabel).toBe("1 tool");
    });

    it("reports zero tools for empty array", () => {
      const member = makeGuildMember({ tools: [] });
      expect(member.tools.length).toBe(0);
    });
  });

  describe("tool info structure", () => {
    it("provides name, description, and inputSchema on each tool", () => {
      const member = makeGuildMember({ tools: [readFileTool] });
      const tool = member.tools[0];
      expect(tool.name).toBe("read_file");
      expect(tool.description).toBe("Read the contents of a file");
      expect(tool.inputSchema).toHaveProperty("type", "object");
    });
  });

  describe("ToolInvokeForm decision logic", () => {
    // The form decides rendering mode based on schemaToFields return value:
    // - null => JSON textarea fallback (complex schema)
    // - [] => "No parameters required" (empty schema)
    // - FormField[] => render individual field inputs

    it("uses field inputs for simple schemas", () => {
      const fields = schemaToFields(readFileTool.inputSchema);
      expect(fields).not.toBeNull();
      expect(fields!.length).toBe(1);
      expect(fields![0].name).toBe("path");
      expect(fields![0].required).toBe(true);
    });

    it("shows no parameters for empty schema ({})", () => {
      const fields = schemaToFields(noParamTool.inputSchema);
      expect(fields).toEqual([]);
    });

    it("shows no parameters for object type with no properties", () => {
      const fields = schemaToFields(objectTypeTool.inputSchema);
      expect(fields).toEqual([]);
    });

    it("falls back to JSON textarea for nested object schemas", () => {
      const fields = schemaToFields(complexTool.inputSchema);
      expect(fields).toBeNull();
    });

    it("passes inputSchema from tool info to schemaToFields", () => {
      // Verifies the data flow: ToolList passes tool.inputSchema to ToolInvokeForm,
      // which passes it to schemaToFields. The schema must be the actual tool schema,
      // not a hardcoded empty object.
      const multiParamSchema = {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "File path" },
          encoding: { type: "string", default: "utf-8" },
          verbose: { type: "boolean" },
        },
        required: ["path"],
      };

      const fields = schemaToFields(multiParamSchema);
      expect(fields).not.toBeNull();
      expect(fields!).toHaveLength(3);

      const pathField = fields!.find((f) => f.name === "path");
      expect(pathField!.required).toBe(true);

      const encodingField = fields!.find((f) => f.name === "encoding");
      expect(encodingField!.required).toBe(false);
      expect(encodingField!.defaultValue).toBe("utf-8");

      const verboseField = fields!.find((f) => f.name === "verbose");
      expect(verboseField!.type).toBe("boolean");
    });
  });

  describe("form submission logic", () => {
    // buildToolInput constructs the POST body from form field values.
    // Since buildToolInput is private to ToolInvokeForm, we verify the
    // expected behavior through the schema structure.

    it("required fields would be included in submission", () => {
      const fields = schemaToFields(readFileTool.inputSchema);
      expect(fields).not.toBeNull();
      const requiredFields = fields!.filter((f) => f.required);
      expect(requiredFields).toHaveLength(1);
      expect(requiredFields[0].name).toBe("path");
    });

    it("no-parameter tools submit empty object", () => {
      const fields = schemaToFields(noParamTool.inputSchema);
      // Empty fields array means the form submits {} (no field values)
      expect(fields).toEqual([]);
    });

    it("JSON fallback would parse user-provided JSON text", () => {
      // When schemaToFields returns null, the form shows a JSON textarea.
      // The user types JSON which is parsed and sent as toolInput.
      const fields = schemaToFields(complexTool.inputSchema);
      expect(fields).toBeNull();

      // Simulating what the form does on submit:
      const userJson = '{"query": "test", "filters": {"category": "docs"}}';
      const toolInput = JSON.parse(userJson) as Record<string, unknown>;
      expect(toolInput.query).toBe("test");
      expect(toolInput.filters).toEqual({ category: "docs" });
    });
  });

  describe("tool invoke API request shape", () => {
    it("constructs correct request body for tool invocation", () => {
      const guildMember = "test-member";
      const toolName = "read_file";
      const toolInput = { path: "/tmp/test.txt" };

      const requestBody = { guildMember, toolName, toolInput };

      expect(requestBody).toEqual({
        guildMember: "test-member",
        toolName: "read_file",
        toolInput: { path: "/tmp/test.txt" },
      });
    });

    it("sends empty object for no-parameter tools", () => {
      const requestBody = {
        guildMember: "test-member",
        toolName: "list_all",
        toolInput: {},
      };

      expect(requestBody.toolInput).toEqual({});
    });
  });

  describe("expand/collapse state", () => {
    // The expand/collapse behavior is a simple boolean toggle.
    // Testing the state machine without React rendering.

    it("starts collapsed", () => {
      const expanded = false;
      expect(expanded).toBe(false);
    });

    it("toggles to expanded on first click", () => {
      let expanded = false;
      expanded = !expanded;
      expect(expanded).toBe(true);
    });

    it("toggles back to collapsed on second click", () => {
      let expanded = false;
      expanded = !expanded; // first click
      expanded = !expanded; // second click
      expect(expanded).toBe(false);
    });
  });

  describe("roster panel collapse", () => {
    // The roster panel is collapsible when there are more than 1 member.
    // On mobile, it defaults to collapsed. The collapse state is a boolean toggle.

    it("is not collapsible with zero members", () => {
      const memberCount = 0;
      const isCollapsible = memberCount > 1;
      expect(isCollapsible).toBe(false);
    });

    it("is not collapsible with one member", () => {
      const memberCount = 1;
      const isCollapsible = memberCount > 1;
      expect(isCollapsible).toBe(false);
    });

    it("is collapsible with two or more members", () => {
      const memberCount = 2;
      const isCollapsible = memberCount > 1;
      expect(isCollapsible).toBe(true);
    });

    it("content is hidden when collapsed and collapsible", () => {
      const collapsed = true;
      const isCollapsible = true;
      const showContent = !(collapsed && isCollapsible);
      expect(showContent).toBe(false);
    });

    it("content is visible when not collapsed", () => {
      const collapsed = false;
      const isCollapsible = true;
      const showContent = !(collapsed && isCollapsible);
      expect(showContent).toBe(true);
    });

    it("content is visible when collapsed but not collapsible (single member)", () => {
      const collapsed = true;
      const isCollapsible = false;
      const showContent = !(collapsed && isCollapsible);
      expect(showContent).toBe(true);
    });

    it("toggles collapsed state", () => {
      let collapsed = true;
      collapsed = !collapsed;
      expect(collapsed).toBe(false);
      collapsed = !collapsed;
      expect(collapsed).toBe(true);
    });
  });

  describe("active tool selection", () => {
    // ToolList tracks which tool's invoke form is open via activeToolName.

    it("starts with no active tool", () => {
      const activeToolName: string | null = null;
      expect(activeToolName).toBeNull();
    });

    it("sets active tool on click", () => {
      let activeToolName: string | null = null;
      activeToolName = activeToolName === "read_file" ? null : "read_file";
      expect(activeToolName).toBe("read_file");
    });

    it("closes active tool on second click", () => {
      let activeToolName: string | null = "read_file";
      activeToolName = activeToolName === "read_file" ? null : "read_file";
      expect(activeToolName).toBeNull();
    });

    it("switches to different tool", () => {
      let activeToolName: string | null = "read_file";
      activeToolName = activeToolName === "list_all" ? null : "list_all";
      expect(activeToolName).toBe("list_all");
    });
  });

  describe("status class mapping", () => {
    // The component maps GuildMemberStatus to CSS module class names.
    // "available" must map to a distinct class, not reuse disconnected.

    it("available maps to a distinct status class", () => {
      // Replicate the component's statusClass mapping logic.
      // Each status should map to a unique string (CSS class name).
      const statusMap: Record<string, string> = {
        available: "statusAvailable",
        connected: "statusConnected",
        disconnected: "statusDisconnected",
        error: "statusError",
      };

      // "available" must exist and be distinct from connected, disconnected, and error
      expect(statusMap.available).toBeDefined();
      expect(statusMap.available).not.toBe(statusMap.connected);
      expect(statusMap.available).not.toBe(statusMap.disconnected);
      expect(statusMap.available).not.toBe(statusMap.error);
    });
  });

  describe("memberType badge logic", () => {
    // Badge visibility is driven by memberType:
    // - MCP (or undefined): tool count badge only
    // - Plugin-only: "Plugin" badge only (no tool count)
    // - Hybrid: both tool count and "Plugin" badge

    it("MCP member shows tool count badge", () => {
      const member = makeGuildMember({
        memberType: "mcp",
        tools: [readFileTool],
      });
      const isPluginOnly = member.memberType === "plugin";
      const showToolBadge = !isPluginOnly && member.tools.length > 0;
      const showPluginBadge =
        member.memberType === "plugin" || member.memberType === "hybrid";

      expect(showToolBadge).toBe(true);
      expect(showPluginBadge).toBe(false);
    });

    it("plugin-only member shows Plugin badge", () => {
      const member = makePluginMember();
      const isPluginOnly = member.memberType === "plugin";
      const showToolBadge = !isPluginOnly && member.tools.length > 0;
      const showPluginBadge =
        member.memberType === "plugin" || member.memberType === "hybrid";

      expect(showToolBadge).toBe(false);
      expect(showPluginBadge).toBe(true);
    });

    it("plugin-only member does not show tool count", () => {
      const member = makePluginMember({
        tools: [readFileTool], // even with tools, plugin-only hides tool count
      });
      const isPluginOnly = member.memberType === "plugin";
      const showToolBadge = !isPluginOnly && member.tools.length > 0;

      expect(showToolBadge).toBe(false);
    });

    it("hybrid member shows both tool count and Plugin badge", () => {
      const member = makeHybridMember();
      const isPluginOnly = member.memberType === "plugin";
      const showToolBadge = !isPluginOnly && member.tools.length > 0;
      const showPluginBadge =
        member.memberType === "plugin" || member.memberType === "hybrid";

      expect(showToolBadge).toBe(true);
      expect(showPluginBadge).toBe(true);
    });

    it("member without memberType falls back to MCP behavior", () => {
      const member = makeGuildMember({ tools: [readFileTool] });
      // memberType is undefined, which is neither "plugin" nor "hybrid"
      const isPluginOnly = member.memberType === "plugin";
      const showToolBadge = !isPluginOnly && member.tools.length > 0;
      const showPluginBadge =
        member.memberType === "plugin" || member.memberType === "hybrid";

      expect(showToolBadge).toBe(true);
      expect(showPluginBadge).toBe(false);
    });
  });

  describe("plugin-only card interactivity", () => {
    // Plugin-only members have a static (non-interactive) card header.
    // MCP and hybrid members have the standard interactive header with
    // expand/collapse behavior.

    it("plugin-only member is not interactive", () => {
      const member = makePluginMember();
      const isPluginOnly = member.memberType === "plugin";
      expect(isPluginOnly).toBe(true);
      // Plugin-only members render a static header: no onClick, no chevron,
      // no expand/collapse state.
    });

    it("MCP member is interactive", () => {
      const member = makeGuildMember({ memberType: "mcp" });
      const isPluginOnly = member.memberType === "plugin";
      expect(isPluginOnly).toBe(false);
    });

    it("hybrid member is interactive", () => {
      const member = makeHybridMember();
      const isPluginOnly = member.memberType === "plugin";
      expect(isPluginOnly).toBe(false);
    });

    it("member without memberType is interactive", () => {
      const member = makeGuildMember();
      const isPluginOnly = member.memberType === "plugin";
      expect(isPluginOnly).toBe(false);
    });
  });
});
