import { describe, expect, it } from "bun:test";

import {
  GuildMemberManifestSchema,
  SessionMetadataSchema,
  SSEEventSchema,
} from "@/lib/schemas";

function validManifest() {
  return {
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
    transport: "http" as const,
    mcp: {
      command: "node",
      args: ["server.js"],
    },
  };
}

function validSessionMetadata(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "session-1",
    name: "Test Session",
    status: "idle" as const,
    guildMembers: ["test-member"],
    sdkSessionId: null,
    createdAt: "2026-02-12T00:00:00Z",
    lastActivityAt: "2026-02-12T00:00:00Z",
    messageCount: 0,
    ...overrides,
  };
}

describe("GuildMemberManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const result = GuildMemberManifestSchema.parse(validManifest());
    expect(result.name).toBe("test-member");
    expect(result.displayName).toBe("Test Member");
    expect(result.mcp?.command).toBe("node");
    expect(result.mcp?.args).toEqual(["server.js"]);
  });

  it("accepts a manifest with optional env", () => {
    const manifest = {
      ...validManifest(),
      mcp: {
        ...validManifest().mcp,
        env: { NODE_ENV: "production" },
      },
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.mcp?.env).toEqual({ NODE_ENV: "production" });
  });

  it("rejects a manifest missing required top-level fields", () => {
    const fields = ["name", "displayName", "description", "version"] as const;

    for (const field of fields) {
      const manifest: Record<string, unknown> = { ...validManifest() };
      delete manifest[field];
      expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow();
    }
  });

  it("rejects a manifest missing mcp.command", () => {
    const manifest = {
      ...validManifest(),
      mcp: { args: ["server.js"] },
    };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow();
  });

  it("rejects wrong field types", () => {
    expect(() =>
      GuildMemberManifestSchema.parse({ ...validManifest(), name: 123 }),
    ).toThrow();

    expect(() =>
      GuildMemberManifestSchema.parse({
        ...validManifest(),
        mcp: { command: 42, args: [] },
      }),
    ).toThrow();

    expect(() =>
      GuildMemberManifestSchema.parse({
        ...validManifest(),
        mcp: { command: "node", args: "not-an-array" },
      }),
    ).toThrow();
  });

  it("strips extra fields", () => {
    const manifest = { ...validManifest(), extraField: "should-be-removed" };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect("extraField" in result).toBe(false);
  });

  it("accepts manifest with transport: http", () => {
    const result = GuildMemberManifestSchema.parse(validManifest());
    expect(result.transport).toBe("http");
  });

  it("rejects mcp manifest missing transport field", () => {
    const manifest: Record<string, unknown> = { ...validManifest() };
    delete manifest.transport;
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow(
      "'transport' and 'mcp' must be both present or both absent",
    );
  });

  it("rejects manifest with invalid transport value", () => {
    const manifest = { ...validManifest(), transport: "stdio" };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow();

    const manifest2 = { ...validManifest(), transport: "websocket" };
    expect(() => GuildMemberManifestSchema.parse(manifest2)).toThrow();

    const manifest3 = { ...validManifest(), transport: 42 };
    expect(() => GuildMemberManifestSchema.parse(manifest3)).toThrow();
  });

  it("accepts manifest with capabilities: ['worker']", () => {
    const manifest = { ...validManifest(), capabilities: ["worker"] };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.capabilities).toEqual(["worker"]);
  });

  it("accepts manifest with multiple capabilities (hybrid)", () => {
    const manifest = {
      ...validManifest(),
      capabilities: ["worker", "tools"],
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.capabilities).toEqual(["worker", "tools"]);
  });

  it("accepts manifest without capabilities", () => {
    const result = GuildMemberManifestSchema.parse(validManifest());
    expect(result.capabilities).toBeUndefined();
  });

  // -- Plugin-only manifests --

  it("accepts a plugin-only manifest", () => {
    const manifest = {
      name: "plugin-member",
      displayName: "Plugin Member",
      description: "A plugin-only guild member",
      version: "1.0.0",
      plugin: { path: "./plugin" },
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.name).toBe("plugin-member");
    expect(result.plugin?.path).toBe("./plugin");
    expect(result.mcp).toBeUndefined();
    expect(result.transport).toBeUndefined();
  });

  it("accepts a hybrid manifest with both mcp and plugin", () => {
    const manifest = {
      ...validManifest(),
      plugin: { path: "./plugin" },
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.mcp?.command).toBe("node");
    expect(result.plugin?.path).toBe("./plugin");
    expect(result.transport).toBe("http");
  });

  // -- Invalid combinations --

  it("rejects manifest with neither mcp nor plugin", () => {
    const manifest = {
      name: "empty-member",
      displayName: "Empty Member",
      description: "Has neither mcp nor plugin",
      version: "1.0.0",
    };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow(
      "At least one of 'mcp' or 'plugin' must be present",
    );
  });

  it("rejects transport without mcp", () => {
    const manifest = {
      name: "bad-member",
      displayName: "Bad Member",
      description: "Has transport but no mcp",
      version: "1.0.0",
      transport: "http" as const,
      plugin: { path: "./plugin" },
    };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow(
      "'transport' and 'mcp' must be both present or both absent",
    );
  });

  it("rejects mcp without transport", () => {
    const manifest = {
      name: "bad-member",
      displayName: "Bad Member",
      description: "Has mcp but no transport",
      version: "1.0.0",
      mcp: { command: "node", args: ["server.js"] },
    };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow(
      "'transport' and 'mcp' must be both present or both absent",
    );
  });

  it("rejects worker capability without mcp", () => {
    const manifest = {
      name: "worker-plugin",
      displayName: "Worker Plugin",
      description: "Plugin with worker capability but no mcp",
      version: "1.0.0",
      plugin: { path: "./plugin" },
      capabilities: ["worker"],
    };
    expect(() => GuildMemberManifestSchema.parse(manifest)).toThrow(
      "'worker' capability requires 'mcp' configuration",
    );
  });

  // -- Edge cases --

  it("accepts hybrid manifest with worker capability", () => {
    const manifest = {
      ...validManifest(),
      plugin: { path: "./plugin" },
      capabilities: ["worker"],
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.capabilities).toEqual(["worker"]);
    expect(result.mcp?.command).toBe("node");
    expect(result.plugin?.path).toBe("./plugin");
  });

  it("accepts plugin-only manifest with empty capabilities", () => {
    const manifest = {
      name: "plugin-member",
      displayName: "Plugin Member",
      description: "Plugin with empty capabilities",
      version: "1.0.0",
      plugin: { path: "./plugin" },
      capabilities: [],
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.capabilities).toEqual([]);
  });

  it("accepts plugin-only manifest with non-worker capabilities", () => {
    const manifest = {
      name: "plugin-member",
      displayName: "Plugin Member",
      description: "Plugin with non-worker capabilities",
      version: "1.0.0",
      plugin: { path: "./plugin" },
      capabilities: ["tools", "custom"],
    };
    const result = GuildMemberManifestSchema.parse(manifest);
    expect(result.capabilities).toEqual(["tools", "custom"]);
  });
});

describe("SessionMetadataSchema", () => {
  it("accepts valid metadata", () => {
    const result = SessionMetadataSchema.parse(validSessionMetadata());
    expect(result.id).toBe("session-1");
    expect(result.status).toBe("idle");
    expect(result.sdkSessionId).toBeNull();
  });

  it("accepts all valid session statuses", () => {
    const statuses = [
      "idle",
      "running",
      "completed",
      "expired",
      "error",
    ] as const;

    for (const status of statuses) {
      const result = SessionMetadataSchema.parse(
        validSessionMetadata({ status }),
      );
      expect(result.status).toBe(status);
    }
  });

  it("accepts non-null sdkSessionId", () => {
    const result = SessionMetadataSchema.parse(
      validSessionMetadata({ sdkSessionId: "sdk-abc-123" }),
    );
    expect(result.sdkSessionId).toBe("sdk-abc-123");
  });

  it("rejects invalid status values", () => {
    expect(() =>
      SessionMetadataSchema.parse(
        validSessionMetadata({ status: "paused" }),
      ),
    ).toThrow();
  });

  it("rejects invalid datetime strings", () => {
    expect(() =>
      SessionMetadataSchema.parse(
        validSessionMetadata({ createdAt: "not-a-date" }),
      ),
    ).toThrow();
  });
});

describe("SSEEventSchema", () => {
  it("parses a processing event", () => {
    const result = SSEEventSchema.parse({ type: "processing" });
    expect(result.type).toBe("processing");
  });

  it("parses an assistant_text event", () => {
    const result = SSEEventSchema.parse({
      type: "assistant_text",
      text: "Hello",
    });
    expect(result.type).toBe("assistant_text");
    if (result.type === "assistant_text") {
      expect(result.text).toBe("Hello");
    }
  });

  it("parses a tool_use event", () => {
    const result = SSEEventSchema.parse({
      type: "tool_use",
      toolName: "readFile",
      toolInput: { path: "/tmp/foo" },
      toolUseId: "tu-1",
    });
    expect(result.type).toBe("tool_use");
    if (result.type === "tool_use") {
      expect(result.toolName).toBe("readFile");
      expect(result.toolUseId).toBe("tu-1");
    }
  });

  it("parses a tool_result event", () => {
    const result = SSEEventSchema.parse({
      type: "tool_result",
      toolUseId: "tu-1",
      result: { content: "file contents" },
    });
    expect(result.type).toBe("tool_result");
    if (result.type === "tool_result") {
      expect(result.toolUseId).toBe("tu-1");
    }
  });

  it("parses a status_change event", () => {
    const result = SSEEventSchema.parse({
      type: "status_change",
      status: "completed",
    });
    expect(result.type).toBe("status_change");
    if (result.type === "status_change") {
      expect(result.status).toBe("completed");
    }
  });

  it("parses an error event", () => {
    const result = SSEEventSchema.parse({
      type: "error",
      message: "Something went wrong",
      recoverable: true,
    });
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toBe("Something went wrong");
      expect(result.recoverable).toBe(true);
    }
  });

  it("parses a done event", () => {
    const result = SSEEventSchema.parse({ type: "done" });
    expect(result.type).toBe("done");
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      SSEEventSchema.parse({ type: "unknown_event" }),
    ).toThrow();
  });

  it("rejects an event missing required fields", () => {
    expect(() =>
      SSEEventSchema.parse({ type: "assistant_text" }),
    ).toThrow();

    expect(() =>
      SSEEventSchema.parse({ type: "error", message: "oops" }),
    ).toThrow();
  });
});
