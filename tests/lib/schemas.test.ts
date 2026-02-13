import { describe, expect, it } from "bun:test";

import {
  GuildMemberManifestSchema,
  SessionMetadataSchema,
  SSEEventSchema,
} from "@/lib/schemas";

// -- Fixtures --

function validManifest() {
  return {
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
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

// -- GuildMemberManifestSchema --

describe("GuildMemberManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const result = GuildMemberManifestSchema.parse(validManifest());
    expect(result.name).toBe("test-member");
    expect(result.displayName).toBe("Test Member");
    expect(result.mcp.command).toBe("node");
    expect(result.mcp.args).toEqual(["server.js"]);
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
    expect(result.mcp.env).toEqual({ NODE_ENV: "production" });
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
});

// -- SessionMetadataSchema --

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

// -- SSEEventSchema --

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
