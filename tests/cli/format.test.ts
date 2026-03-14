import { describe, test, expect } from "bun:test";
import {
  shouldOutputJson,
  formatResponse,
  formatHelpTree,
  formatSkillHelp,
  suggestCommand,
  extractFlags,
} from "@/cli/format";
import type { CliSkill } from "@/cli/resolve";

function makeSkill(overrides: Partial<CliSkill> = {}): CliSkill {
  return {
    skillId: "test.skill",
    name: "test",
    description: "Test skill",
    invocation: { method: "GET", path: "/test" },
    context: {},
    eligibility: { tier: "any", readOnly: true },
    idempotent: true,
    ...overrides,
  };
}

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
    expect(output).toContain("\n"); // pretty-printed
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

describe("formatHelpTree", () => {
  test("formats root help with children", () => {
    const data = {
      name: "Guild Hall API",
      description: "Guild Hall daemon REST API",
      kind: "root",
      children: [
        { name: "system", description: "System operations", kind: "root", path: "/system" },
        { name: "commission", description: "Commission operations", kind: "root", path: "/commission" },
      ],
    };
    const output = formatHelpTree(data, []);
    expect(output).toContain("Guild Hall CLI");
    expect(output).toContain("Commands:");
    expect(output).toContain("system");
    expect(output).toContain("commission");
    expect(output).toContain("guild-hall <command> help");
    // Root level includes migrate-content
    expect(output).toContain("migrate-content");
  });

  test("formats scoped help with prefix", () => {
    const data = {
      name: "commission",
      description: "Commission operations",
      kind: "root",
      children: [
        { name: "run", description: "Run operations", kind: "feature", path: "/commission/run" },
        { name: "request", description: "Request operations", kind: "feature", path: "/commission/request" },
      ],
    };
    const output = formatHelpTree(data, ["commission"]);
    expect(output).toContain("guild-hall commission");
    expect(output).toContain("run");
    expect(output).toContain("request");
    // Scoped help does not include migrate-content
    expect(output).not.toContain("migrate-content");
  });

  test("formats help without children", () => {
    const data = {
      name: "health",
      description: "Check daemon health",
      kind: "operation",
    };
    const output = formatHelpTree(data, ["system", "runtime", "daemon", "health"]);
    expect(output).toContain("guild-hall system runtime daemon health");
    expect(output).toContain("Check daemon health");
    expect(output).not.toContain("Commands:");
  });
});

describe("formatSkillHelp", () => {
  test("formats skill with parameters", () => {
    const skill = makeSkill({
      skillId: "workspace.artifact.document.list",
      name: "list",
      description: "List artifacts for a project",
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });

    const output = formatSkillHelp(skill);
    expect(output).toContain("guild-hall workspace artifact document list");
    expect(output).toContain("List artifacts for a project");
    expect(output).toContain("GET");
    expect(output).toContain("Parameters:");
    expect(output).toContain("projectName");
    expect(output).toContain("(required)");
    expect(output).toContain("Usage:");
  });

  test("formats streaming skill", () => {
    const skill = makeSkill({
      name: "send",
      description: "Send a message",
      invocation: { method: "POST", path: "/meeting/session/message/send" },
      streaming: { eventTypes: ["meeting_message", "meeting_status"] },
      parameters: [{ name: "meetingId", required: true, in: "body" }],
    });

    const output = formatSkillHelp(skill);
    expect(output).toContain("Stream:");
    expect(output).toContain("meeting_message");
  });

  test("formats skill without parameters", () => {
    const skill = makeSkill({
      name: "health",
      description: "Check health",
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
    });

    const output = formatSkillHelp(skill);
    expect(output).not.toContain("Parameters:");
    expect(output).not.toContain("Usage:");
  });
});

describe("suggestCommand", () => {
  const skills: CliSkill[] = [
    makeSkill({ invocation: { method: "GET", path: "/system/runtime/daemon/health" } }),
    makeSkill({ invocation: { method: "POST", path: "/workspace/git/branch/rebase" } }),
    makeSkill({ invocation: { method: "GET", path: "/system/config/application/validate" } }),
  ];

  test("suggests close match", () => {
    // "rebase" is close to "workspace git branch rebase" but not within distance 3
    // "validate" paths are too long for short input
    // This tests the mechanism works with short paths
    const shortSkills = [
      makeSkill({ invocation: { method: "GET", path: "/health" } }),
    ];
    expect(suggestCommand(["helth"], shortSkills)).toBe("health");
  });

  test("returns null for no close match", () => {
    expect(suggestCommand(["xyzzy"], skills)).toBeNull();
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

  test("extracts both flags", () => {
    const { segments, options } = extractFlags([
      "--json",
      "--tty",
      "system",
    ]);
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
});
