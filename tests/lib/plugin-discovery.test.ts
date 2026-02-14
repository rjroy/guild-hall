import { describe, expect, it } from "bun:test";

import { discoverGuildMembers } from "@/lib/plugin-discovery";
import { createMockFs } from "@/tests/helpers/mock-fs";

// -- Fixtures --

function validManifestJson(): string {
  return JSON.stringify({
    name: "test-member",
    displayName: "Test Member",
    description: "A test guild member",
    version: "1.0.0",
    mcp: {
      command: "node",
      args: ["server.js"],
    },
  });
}

// -- Tests --

describe("createMockFs", () => {
  it("stat returns isDirectory: false for a file path", async () => {
    const fs = createMockFs(
      { "/files/readme.txt": "hello" },
      new Set(["/files"]),
    );

    const result = await fs.stat("/files/readme.txt");
    expect(result.isDirectory()).toBe(false);
  });

  it("stat rejects with ENOENT for a nonexistent path", async () => {
    const fs = createMockFs({}, new Set());

    expect(fs.stat("/no/such/path")).rejects.toThrow("ENOENT");
  });
});

describe("discoverGuildMembers", () => {
  const basePath = "/guild-members";

  it("finds and parses valid manifests with disconnected status", async () => {
    const fs = createMockFs(
      { [`${basePath}/alpha/guild-member.json`]: validManifestJson() },
      new Set([basePath, `${basePath}/alpha`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);

    const member = result.get("alpha");
    expect(member).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(member!.name).toBe("test-member"); // name from manifest, not dir
    expect(member!.displayName).toBe("Test Member");
    expect(member!.status).toBe("disconnected");
    expect(member!.tools).toEqual([]);
    expect(member!.error).toBeUndefined();
  });

  it("handles invalid JSON gracefully with error status", async () => {
    const fs = createMockFs(
      { [`${basePath}/broken/guild-member.json`]: "{ not valid json !!!" },
      new Set([basePath, `${basePath}/broken`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);

    const member = result.get("broken");
    expect(member).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(member!.status).toBe("error");
    expect(member!.error).toContain("Invalid JSON");
    expect(member!.tools).toEqual([]);
  });

  it("handles missing required fields with error status and Zod message", async () => {
    const incomplete = JSON.stringify({
      name: "incomplete",
      // missing displayName, description, version, mcp
    });
    const fs = createMockFs(
      { [`${basePath}/incomplete/guild-member.json`]: incomplete },
      new Set([basePath, `${basePath}/incomplete`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);

    const member = result.get("incomplete");
    expect(member).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(member!.status).toBe("error");
    expect(typeof member!.error).toBe("string");
    expect(member!.error!.length).toBeGreaterThan(0);
    expect(member!.tools).toEqual([]);
  });

  it("returns an empty map for an empty directory", async () => {
    const fs = createMockFs(
      {},
      new Set([basePath]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(0);
  });

  it("returns an empty map for a nonexistent directory", async () => {
    const fs = createMockFs({}, new Set());

    const result = await discoverGuildMembers("/does-not-exist", fs);

    expect(result.size).toBe(0);
  });

  it("discovers multiple guild members in the directory", async () => {
    const manifest1 = JSON.stringify({
      name: "member-one",
      displayName: "Member One",
      description: "First member",
      version: "1.0.0",
      mcp: { command: "node", args: ["one.js"] },
    });
    const manifest2 = JSON.stringify({
      name: "member-two",
      displayName: "Member Two",
      description: "Second member",
      version: "2.0.0",
      mcp: { command: "python", args: ["two.py"] },
    });

    const fs = createMockFs(
      {
        [`${basePath}/one/guild-member.json`]: manifest1,
        [`${basePath}/two/guild-member.json`]: manifest2,
      },
      new Set([basePath, `${basePath}/one`, `${basePath}/two`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(2);

    const first = result.get("one");
    expect(first).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(first!.name).toBe("member-one");
    expect(first!.status).toBe("disconnected");

    const second = result.get("two");
    expect(second).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(second!.name).toBe("member-two");
    expect(second!.status).toBe("disconnected");
  });

  it("skips subdirectories without guild-member.json", async () => {
    const fs = createMockFs(
      { [`${basePath}/valid/guild-member.json`]: validManifestJson() },
      new Set([basePath, `${basePath}/valid`, `${basePath}/empty-dir`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);
    expect(result.has("valid")).toBe(true);
    expect(result.has("empty-dir")).toBe(false);
  });

  it("keys by directory name, not manifest name", async () => {
    const manifest = JSON.stringify({
      name: "internal-name",
      displayName: "Display Name",
      description: "Test",
      version: "1.0.0",
      mcp: { command: "echo", args: [] },
    });

    const fs = createMockFs(
      { [`${basePath}/dir-name/guild-member.json`]: manifest },
      new Set([basePath, `${basePath}/dir-name`]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.has("dir-name")).toBe(true);
    expect(result.has("internal-name")).toBe(false);
    // Non-null safe: has() above confirms presence
    expect(result.get("dir-name")!.name).toBe("internal-name");
  });

  it("discovers nested plugins in plugin collections", async () => {
    const manifest = JSON.stringify({
      name: "nested-plugin",
      displayName: "Nested Plugin",
      description: "Plugin in a collection",
      version: "1.0.0",
      mcp: { command: "node", args: ["nested.js"] },
    });

    const fs = createMockFs(
      { [`${basePath}/guild-founders/aegis-of-focus/guild-member.json`]: manifest },
      new Set([
        basePath,
        `${basePath}/guild-founders`,
        `${basePath}/guild-founders/aegis-of-focus`,
      ]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);
    expect(result.has("guild-founders/aegis-of-focus")).toBe(true);

    const member = result.get("guild-founders/aegis-of-focus");
    expect(member).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(member!.name).toBe("nested-plugin");
    expect(member!.status).toBe("disconnected");
  });

  it("discovers both flat and nested plugins together", async () => {
    const flatManifest = JSON.stringify({
      name: "flat-plugin",
      displayName: "Flat Plugin",
      description: "Standalone plugin",
      version: "1.0.0",
      mcp: { command: "node", args: ["flat.js"] },
    });

    const nestedManifest = JSON.stringify({
      name: "nested-plugin",
      displayName: "Nested Plugin",
      description: "Plugin in collection",
      version: "2.0.0",
      mcp: { command: "python", args: ["nested.py"] },
    });

    const fs = createMockFs(
      {
        [`${basePath}/standalone/guild-member.json`]: flatManifest,
        [`${basePath}/guild-founders/echo-server/guild-member.json`]: nestedManifest,
      },
      new Set([
        basePath,
        `${basePath}/standalone`,
        `${basePath}/guild-founders`,
        `${basePath}/guild-founders/echo-server`,
      ]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(2);

    expect(result.has("standalone")).toBe(true);
    expect(result.get("standalone")!.name).toBe("flat-plugin");

    expect(result.has("guild-founders/echo-server")).toBe(true);
    expect(result.get("guild-founders/echo-server")!.name).toBe("nested-plugin");
  });

  it("skips plugin collections without valid manifests", async () => {
    const fs = createMockFs(
      { [`${basePath}/valid/guild-member.json`]: validManifestJson() },
      new Set([
        basePath,
        `${basePath}/valid`,
        `${basePath}/empty-collection`,
        `${basePath}/empty-collection/no-manifest-here`,
      ]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);
    expect(result.has("valid")).toBe(true);
    expect(result.has("empty-collection")).toBe(false);
  });

  it("discovers multiple plugins in the same collection", async () => {
    const manifest1 = JSON.stringify({
      name: "plugin-one",
      displayName: "Plugin One",
      description: "First in collection",
      version: "1.0.0",
      mcp: { command: "node", args: ["one.js"] },
    });

    const manifest2 = JSON.stringify({
      name: "plugin-two",
      displayName: "Plugin Two",
      description: "Second in collection",
      version: "2.0.0",
      mcp: { command: "node", args: ["two.js"] },
    });

    const fs = createMockFs(
      {
        [`${basePath}/guild-founders/echo/guild-member.json`]: manifest1,
        [`${basePath}/guild-founders/inspector/guild-member.json`]: manifest2,
      },
      new Set([
        basePath,
        `${basePath}/guild-founders`,
        `${basePath}/guild-founders/echo`,
        `${basePath}/guild-founders/inspector`,
      ]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(2);
    expect(result.has("guild-founders/echo")).toBe(true);
    expect(result.has("guild-founders/inspector")).toBe(true);
  });

  it("handles invalid manifests in nested plugins", async () => {
    const fs = createMockFs(
      { [`${basePath}/collection/broken/guild-member.json`]: "{ invalid json" },
      new Set([
        basePath,
        `${basePath}/collection`,
        `${basePath}/collection/broken`,
      ]),
    );

    const result = await discoverGuildMembers(basePath, fs);

    expect(result.size).toBe(1);

    const member = result.get("collection/broken");
    expect(member).toBeDefined();
    // Non-null safe: toBeDefined() above confirms presence
    expect(member!.status).toBe("error");
    expect(member!.error).toContain("Invalid JSON");
  });
});
