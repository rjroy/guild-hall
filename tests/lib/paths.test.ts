import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import {
  getGuildHallHome,
  getConfigPath,
  projectLorePath,
} from "@/lib/paths";

describe("getGuildHallHome", () => {
  test("returns override path when provided", () => {
    const result = getGuildHallHome("/tmp/test-home");
    expect(result).toBe("/tmp/test-home/.guild-hall");
  });

  test("uses HOME env var when no override", () => {
    const result = getGuildHallHome();
    expect(result).toBe(path.join(process.env.HOME!, ".guild-hall"));
  });
});

describe("getConfigPath", () => {
  test("returns config.yaml under guild-hall home", () => {
    const result = getConfigPath("/tmp/test-home");
    expect(result).toBe("/tmp/test-home/.guild-hall/config.yaml");
  });

  test("uses HOME env var when no override", () => {
    const result = getConfigPath();
    expect(result).toBe(
      path.join(process.env.HOME!, ".guild-hall", "config.yaml")
    );
  });
});

describe("projectLorePath", () => {
  test("appends .lore to project path", () => {
    expect(projectLorePath("/home/user/my-project")).toBe(
      "/home/user/my-project/.lore"
    );
  });

  test("handles trailing slash in project path", () => {
    const result = projectLorePath("/home/user/my-project/");
    expect(result).toBe("/home/user/my-project/.lore");
  });
});
