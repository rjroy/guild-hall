import { describe, test, expect } from "bun:test";
import {
  resolveCommand,
  buildQueryString,
  buildBody,
  validateArgs,
} from "@/cli/resolve";
import type { CliSkill } from "@/cli/resolve";

function makeSkill(overrides: Partial<CliSkill> = {}): CliSkill {
  return {
    skillId: "test.skill",
    name: "test",
    description: "Test skill",
    invocation: { method: "GET", path: "/test" },
    context: {},
    idempotent: true,
    ...overrides,
  };
}

describe("resolveCommand", () => {
  const skills: CliSkill[] = [
    makeSkill({
      skillId: "workspace.artifact.document.list",
      name: "list",
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    }),
    makeSkill({
      skillId: "workspace.artifact.document.read",
      name: "read",
      invocation: { method: "GET", path: "/workspace/artifact/document/read" },
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    }),
    makeSkill({
      skillId: "system.runtime.daemon.health",
      name: "health",
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
    }),
    makeSkill({
      skillId: "workspace.git.branch.rebase",
      name: "rebase",
      invocation: { method: "POST", path: "/workspace/git/branch/rebase" },
      parameters: [{ name: "projectName", required: false, in: "body" }],
    }),
    makeSkill({
      skillId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      parameters: [{ name: "commissionId", required: true, in: "body" }],
    }),
  ];

  test("empty segments returns help", () => {
    const result = resolveCommand([], skills);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([]);
    }
  });

  test("'help' returns root help", () => {
    const result = resolveCommand(["help"], skills);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([]);
    }
  });

  test("'system help' returns scoped help", () => {
    const result = resolveCommand(["system", "help"], skills);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual(["system"]);
    }
  });

  test("'system runtime daemon health help' returns leaf help", () => {
    const result = resolveCommand(
      ["system", "runtime", "daemon", "health", "help"],
      skills,
    );
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([
        "system",
        "runtime",
        "daemon",
        "health",
      ]);
    }
  });

  test("resolves command by invocation path segments", () => {
    const result = resolveCommand(
      ["system", "runtime", "daemon", "health"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe(
        "system.runtime.daemon.health",
      );
      expect(result.command.positionalArgs).toEqual([]);
    }
  });

  test("resolves command with positional args", () => {
    const result = resolveCommand(
      ["workspace", "artifact", "document", "list", "my-project"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe(
        "workspace.artifact.document.list",
      );
      expect(result.command.positionalArgs).toEqual(["my-project"]);
    }
  });

  test("resolves command with multiple positional args", () => {
    const result = resolveCommand(
      [
        "workspace",
        "artifact",
        "document",
        "read",
        "my-project",
        "specs/foo.md",
      ],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe(
        "workspace.artifact.document.read",
      );
      expect(result.command.positionalArgs).toEqual([
        "my-project",
        "specs/foo.md",
      ]);
    }
  });

  test("resolves command with optional arg present", () => {
    const result = resolveCommand(
      ["workspace", "git", "branch", "rebase", "my-project"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe(
        "workspace.git.branch.rebase",
      );
      expect(result.command.positionalArgs).toEqual(["my-project"]);
    }
  });

  test("resolves command with optional arg absent", () => {
    const result = resolveCommand(
      ["workspace", "git", "branch", "rebase"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe(
        "workspace.git.branch.rebase",
      );
      expect(result.command.positionalArgs).toEqual([]);
    }
  });

  test("returns unknown for unmatched segments", () => {
    const result = resolveCommand(["foo", "bar"], skills);
    expect(result.type).toBe("unknown");
    if (result.type === "unknown") {
      expect(result.segments).toEqual(["foo", "bar"]);
    }
  });

  test("greedy match: longer prefix wins", () => {
    const result = resolveCommand(
      ["commission", "run", "dispatch", "abc123"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.skill.skillId).toBe("commission.run.dispatch");
      expect(result.command.positionalArgs).toEqual(["abc123"]);
    }
  });
});

describe("buildQueryString", () => {
  test("builds query string from positional args for GET parameters", () => {
    const skill = makeSkill({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    });
    const qs = buildQueryString(skill, ["my-project", "foo/bar.md"]);
    expect(qs).toBe("?projectName=my-project&path=foo%2Fbar.md");
  });

  test("returns empty string with no query params", () => {
    const skill = makeSkill({
      parameters: [{ name: "name", required: true, in: "body" }],
    });
    expect(buildQueryString(skill, ["test"])).toBe("");
  });

  test("returns empty string with no parameters", () => {
    const skill = makeSkill();
    expect(buildQueryString(skill, [])).toBe("");
  });

  test("handles fewer args than params", () => {
    const skill = makeSkill({
      parameters: [
        { name: "a", required: true, in: "query" },
        { name: "b", required: false, in: "query" },
      ],
    });
    expect(buildQueryString(skill, ["val1"])).toBe("?a=val1");
  });
});

describe("buildBody", () => {
  test("builds JSON body from positional args for POST parameters", () => {
    const skill = makeSkill({
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "path", required: true, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project", "/some/path"]);
    expect(JSON.parse(body!)).toEqual({
      name: "my-project",
      path: "/some/path",
    });
  });

  test("returns undefined when no body params and no args", () => {
    const skill = makeSkill({
      parameters: [{ name: "a", required: true, in: "query" }],
    });
    expect(buildBody(skill, [])).toBeUndefined();
  });

  test("ignores query params", () => {
    const skill = makeSkill({
      parameters: [
        { name: "q", required: true, in: "query" },
        { name: "b", required: true, in: "body" },
      ],
    });
    const body = buildBody(skill, ["qval", "bval"]);
    // Only body params are included, and args map to body params only
    expect(JSON.parse(body!)).toEqual({ b: "qval" });
  });
});

describe("validateArgs", () => {
  test("passes when all required args provided", () => {
    const skill = makeSkill({
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    expect(validateArgs(skill, ["my-project"])).toBeNull();
  });

  test("passes when optional args are missing", () => {
    const skill = makeSkill({
      invocation: { method: "POST", path: "/workspace/git/branch/rebase" },
      parameters: [{ name: "projectName", required: false, in: "body" }],
    });
    expect(validateArgs(skill, [])).toBeNull();
  });

  test("fails when required arg is missing", () => {
    const skill = makeSkill({
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    const error = validateArgs(skill, []);
    expect(error).not.toBeNull();
    expect(error).toContain("projectName");
    expect(error).toContain("Usage:");
  });

  test("fails when multiple required args are missing", () => {
    const skill = makeSkill({
      invocation: { method: "GET", path: "/workspace/artifact/document/read" },
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    });
    const error = validateArgs(skill, []);
    expect(error).toContain("projectName");
    expect(error).toContain("path");
  });

  test("passes with no parameters defined", () => {
    const skill = makeSkill({
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
    });
    expect(validateArgs(skill, [])).toBeNull();
  });
});
