import { describe, test, expect } from "bun:test";
import {
  shouldOutputJson,
  formatResponse,
  suggestCommand,
  extractFlags,
} from "@/cli/format";
import type { CliGroupNode, CliLeafNode } from "@/cli/surface";

function leaf(name: string, operationId: string): CliLeafNode {
  return {
    kind: "leaf",
    name,
    description: "",
    operationId,
    args: [],
    example: "",
    outputShape: "",
  };
}

function group(name: string, children: CliGroupNode["children"]): CliGroupNode {
  return { kind: "group", name, description: "", children };
}

const testSurface: CliGroupNode = group("guild-hall", [
  group("system", [
    group("runtime", [
      group("daemon", [leaf("health", "system.runtime.daemon.health")]),
    ]),
  ]),
  group("workspace", [
    group("git", [
      group("branch", [leaf("rebase", "workspace.git.branch.rebase")]),
    ]),
  ]),
]);

describe("shouldOutputJson", () => {
  test("--json forces JSON", () => {
    expect(shouldOutputJson({ json: true, tty: false })).toBe(true);
  });

  test("--tty forces human-readable", () => {
    expect(shouldOutputJson({ json: false, tty: true })).toBe(false);
  });

  test("--json takes precedence over --tty", () => {
    expect(shouldOutputJson({ json: true, tty: true })).toBe(true);
  });
});

describe("formatResponse", () => {
  test("JSON mode returns formatted JSON", () => {
    const data = { foo: "bar", count: 42 };
    const output = formatResponse(data, true);
    expect(JSON.parse(output)).toEqual(data);
    expect(output).toContain("\n");
  });

  test("formats string data as-is", () => {
    expect(formatResponse("hello world", false)).toBe("hello world");
  });

  test("formats array as table", () => {
    const data = [
      { name: "alpha", status: "active" },
      { name: "beta", status: "pending" },
    ];
    const output = formatResponse(data, false);
    expect(output).toContain("name");
    expect(output).toContain("status");
    expect(output).toContain("alpha");
    expect(output).toContain("beta");
    expect(output).toContain("----");
  });

  test("formats empty array", () => {
    expect(formatResponse([], false)).toBe("(empty)");
  });

  test("formats object as key-value", () => {
    const data = { name: "test", version: "1.0" };
    const output = formatResponse(data, false);
    expect(output).toContain("name: test");
    expect(output).toContain("version: 1.0");
  });

  test("formats object with nested array", () => {
    const data = { items: ["a", "b", "c"] };
    const output = formatResponse(data, false);
    expect(output).toContain("items:");
    expect(output).toContain("- a");
  });
});

describe("suggestCommand", () => {
  test("suggests close match from surface", () => {
    expect(suggestCommand(["system", "runtime", "daemon", "healt"], testSurface)).toBe(
      "system runtime daemon health",
    );
  });

  test("returns null for no close match", () => {
    expect(suggestCommand(["xyzzy"], testSurface)).toBeNull();
  });
});

describe("extractFlags", () => {
  test("extracts --json flag", () => {
    const { segments, options } = extractFlags([
      "system",
      "models",
      "--json",
      "catalog",
    ]);
    expect(segments).toEqual(["system", "models", "catalog"]);
    expect(options.json).toBe(true);
    expect(options.tty).toBe(false);
  });

  test("extracts --tty flag", () => {
    const { segments, options } = extractFlags(["system", "--tty"]);
    expect(segments).toEqual(["system"]);
    expect(options.tty).toBe(true);
  });

  test("extracts both --json and --tty", () => {
    const { segments, options } = extractFlags(["--json", "--tty", "system"]);
    expect(segments).toEqual(["system"]);
    expect(options.json).toBe(true);
    expect(options.tty).toBe(true);
  });

  test("no flags returns defaults", () => {
    const { segments, options } = extractFlags(["system", "runtime"]);
    expect(segments).toEqual(["system", "runtime"]);
    expect(options.json).toBe(false);
    expect(options.tty).toBe(false);
  });

  test("--clean is captured as a boolean flag and removed from segments", () => {
    const { segments, options, flags } = extractFlags([
      "system", "config", "project", "deregister", "my-project", "--clean",
    ]);
    expect(segments).toEqual(["system", "config", "project", "deregister", "my-project"]);
    expect(options.json).toBe(false);
    expect(flags).toEqual({ clean: true });
  });

  test("unknown boolean flags are collected without affecting segments", () => {
    const { segments, flags } = extractFlags(["some", "--dry-run", "command"]);
    expect(segments).toEqual(["some", "command"]);
    expect(flags).toEqual({ "dry-run": true });
  });

  test("--name=value form yields a string flag", () => {
    const { segments, flags } = extractFlags([
      "meeting", "list", "--state=active",
    ]);
    expect(segments).toEqual(["meeting", "list"]);
    expect(flags).toEqual({ state: "active" });
  });

  test("no flags returns empty flags record", () => {
    const { flags } = extractFlags(["system", "runtime"]);
    expect(flags).toEqual({});
  });
});
