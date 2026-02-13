import { beforeEach, describe, expect, it } from "bun:test";

import {
  clearRosterCache,
  getRoster,
  type FileSystem,
} from "@/lib/plugin-discovery";
import { createMockFs } from "@/tests/helpers/mock-fs";

// -- Tests --

describe("getRoster", () => {
  const basePath = "/guild-members";

  beforeEach(() => {
    clearRosterCache();
  });

  it("returns an array of discovered guild members", async () => {
    const manifest = JSON.stringify({
      name: "example",
      displayName: "Example",
      description: "Test member",
      version: "1.0.0",
      mcp: { command: "echo", args: ["hello"] },
    });

    const fs = createMockFs(
      { [`${basePath}/example/guild-member.json`]: manifest },
      new Set([basePath, `${basePath}/example`]),
    );

    const roster = await getRoster(basePath, fs);

    expect(Array.isArray(roster)).toBe(true);
    expect(roster.length).toBe(1);
    expect(roster[0].name).toBe("example");
    expect(roster[0].status).toBe("disconnected");
  });

  it("caches the roster after first call", async () => {
    let callCount = 0;
    const manifest = JSON.stringify({
      name: "cached",
      displayName: "Cached",
      description: "Test",
      version: "1.0.0",
      mcp: { command: "echo", args: [] },
    });

    const trackingFs: FileSystem = {
      readdir(dirPath: string) {
        callCount++;
        if (dirPath === basePath) return Promise.resolve(["member"]);
        return Promise.reject(new Error("ENOENT"));
      },
      readFile(filePath: string) {
        if (filePath === `${basePath}/member/guild-member.json`) {
          return Promise.resolve(manifest);
        }
        return Promise.reject(new Error("ENOENT"));
      },
      stat(filePath: string) {
        if (filePath === `${basePath}/member`) {
          return Promise.resolve({ isDirectory: () => true as const });
        }
        return Promise.reject(new Error("ENOENT"));
      },
    };

    const first = await getRoster(basePath, trackingFs);
    const second = await getRoster(basePath, trackingFs);

    expect(first).toBe(second); // Same reference, not just equal
    expect(callCount).toBe(1); // readdir only called once
  });

  it("returns empty array for nonexistent directory", async () => {
    const fs = createMockFs({}, new Set());

    const roster = await getRoster("/nonexistent", fs);

    expect(roster).toEqual([]);
  });

  it("clearRosterCache allows re-discovery", async () => {
    const manifest = JSON.stringify({
      name: "fresh",
      displayName: "Fresh",
      description: "Test",
      version: "1.0.0",
      mcp: { command: "echo", args: [] },
    });

    let callCount = 0;
    const trackingFs: FileSystem = {
      readdir(dirPath: string) {
        callCount++;
        if (dirPath === basePath) return Promise.resolve(["member"]);
        return Promise.reject(new Error("ENOENT"));
      },
      readFile(filePath: string) {
        if (filePath === `${basePath}/member/guild-member.json`) {
          return Promise.resolve(manifest);
        }
        return Promise.reject(new Error("ENOENT"));
      },
      stat(filePath: string) {
        if (filePath === `${basePath}/member`) {
          return Promise.resolve({ isDirectory: () => true as const });
        }
        return Promise.reject(new Error("ENOENT"));
      },
    };

    await getRoster(basePath, trackingFs);
    expect(callCount).toBe(1);

    clearRosterCache();
    await getRoster(basePath, trackingFs);
    expect(callCount).toBe(2);
  });

  it("includes error members in the roster", async () => {
    const fs = createMockFs(
      { [`${basePath}/broken/guild-member.json`]: "not json" },
      new Set([basePath, `${basePath}/broken`]),
    );

    const roster = await getRoster(basePath, fs);

    expect(roster.length).toBe(1);
    expect(roster[0].status).toBe("error");
    expect(roster[0].error).toBeDefined();
  });
});
