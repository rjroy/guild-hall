import { describe, test, expect } from "bun:test";
import {
  resolveCommand,
  buildQueryString,
  buildBody,
  validateArgs,
} from "@/cli/resolve";
import type { CliOperation } from "@/cli/resolve";

function makeOperation(overrides: Partial<CliOperation> = {}): CliOperation {
  return {
    operationId: "test.skill",
    name: "test",
    description: "Test operation",
    invocation: { method: "GET", path: "/test" },
    context: {},
    idempotent: true,
    ...overrides,
  };
}

describe("resolveCommand", () => {
  const skills: CliOperation[] = [
    makeOperation({
      operationId: "workspace.artifact.document.list",
      name: "list",
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    }),
    makeOperation({
      operationId: "workspace.artifact.document.read",
      name: "read",
      invocation: { method: "GET", path: "/workspace/artifact/document/read" },
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    }),
    makeOperation({
      operationId: "system.runtime.daemon.health",
      name: "health",
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
    }),
    makeOperation({
      operationId: "workspace.git.branch.rebase",
      name: "rebase",
      invocation: { method: "POST", path: "/workspace/git/branch/rebase" },
      parameters: [{ name: "projectName", required: false, in: "body" }],
    }),
    makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      parameters: [{ name: "commissionId", required: true, in: "body" }],
    }),
    makeOperation({
      operationId: "system.config.project.group",
      name: "group",
      invocation: { method: "POST", path: "/system/config/project/group" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "group", required: true, in: "body" },
      ],
    }),
    makeOperation({
      operationId: "system.config.project.deregister",
      name: "deregister",
      invocation: { method: "POST", path: "/system/config/project/deregister" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "clean", required: false, in: "body" },
      ],
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
      expect(result.command.operation.operationId).toBe(
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
      expect(result.command.operation.operationId).toBe(
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
      expect(result.command.operation.operationId).toBe(
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
      expect(result.command.operation.operationId).toBe(
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
      expect(result.command.operation.operationId).toBe(
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
      expect(result.command.operation.operationId).toBe("commission.run.dispatch");
      expect(result.command.positionalArgs).toEqual(["abc123"]);
    }
  });

  // p3-group-cmd: routing for group command
  test("routes 'system config project group <name> <group>' correctly", () => {
    const result = resolveCommand(
      ["system", "config", "project", "group", "my-project", "my-team"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.operation.operationId).toBe("system.config.project.group");
      expect(result.command.positionalArgs).toEqual(["my-project", "my-team"]);
    }
  });

  // p3-deregister-cmd: routing for deregister command (--clean already stripped by extractFlags)
  test("routes 'system config project deregister <name>' correctly", () => {
    const result = resolveCommand(
      ["system", "config", "project", "deregister", "my-project"],
      skills,
    );
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command.operation.operationId).toBe("system.config.project.deregister");
      expect(result.command.positionalArgs).toEqual(["my-project"]);
    }
  });
});

describe("buildQueryString", () => {
  test("builds query string from positional args for GET parameters", () => {
    const skill = makeOperation({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    });
    const qs = buildQueryString(skill, ["my-project", "foo/bar.md"]);
    expect(qs).toBe("?projectName=my-project&path=foo%2Fbar.md");
  });

  test("returns empty string with no query params", () => {
    const skill = makeOperation({
      parameters: [{ name: "name", required: true, in: "body" }],
    });
    expect(buildQueryString(skill, ["test"])).toBe("");
  });

  test("returns empty string with no parameters", () => {
    const skill = makeOperation();
    expect(buildQueryString(skill, [])).toBe("");
  });

  test("handles fewer args than params", () => {
    const skill = makeOperation({
      parameters: [
        { name: "a", required: true, in: "query" },
        { name: "b", required: false, in: "query" },
      ],
    });
    expect(buildQueryString(skill, ["val1"])).toBe("?a=val1");
  });

  test("skips empty string positional arguments", () => {
    const skill = makeOperation({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "status", required: false, in: "query" },
        { name: "worker", required: false, in: "query" },
      ],
    });
    // Skip status (empty string) but include worker
    expect(buildQueryString(skill, ["myproject", "", "guild-hall-developer"]))
      .toBe("?projectName=myproject&worker=guild-hall-developer");
  });

  test("skips all empty string arguments", () => {
    const skill = makeOperation({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "status", required: false, in: "query" },
        { name: "worker", required: false, in: "query" },
      ],
    });
    expect(buildQueryString(skill, ["myproject", "", ""]))
      .toBe("?projectName=myproject");
  });
});

describe("buildBody", () => {
  test("builds JSON body from positional args for POST parameters", () => {
    const skill = makeOperation({
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
    const skill = makeOperation({
      parameters: [{ name: "a", required: true, in: "query" }],
    });
    expect(buildBody(skill, [])).toBeUndefined();
  });

  test("ignores query params", () => {
    const skill = makeOperation({
      parameters: [
        { name: "q", required: true, in: "query" },
        { name: "b", required: true, in: "body" },
      ],
    });
    const body = buildBody(skill, ["qval", "bval"]);
    // Only body params are included, and args map to body params only
    expect(JSON.parse(body!)).toEqual({ b: "qval" });
  });

  // p3-register-group: optional third positional arg maps to group
  test("register with 3 positional args maps name, path, group", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/register" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "path", required: true, in: "body" },
        { name: "group", required: false, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project", "/resolved/path", "my-team"]);
    expect(JSON.parse(body!)).toEqual({
      name: "my-project",
      path: "/resolved/path",
      group: "my-team",
    });
  });

  // p3-register-group: without third arg, group is absent from body
  test("register with 2 positional args omits group", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/register" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "path", required: true, in: "body" },
        { name: "group", required: false, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project", "/resolved/path"]);
    expect(JSON.parse(body!)).toEqual({
      name: "my-project",
      path: "/resolved/path",
    });
  });

  // p3-group-cmd: group command maps name and group
  test("group command maps name and new-group positional args", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/group" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "group", required: true, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project", "my-team"]);
    expect(JSON.parse(body!)).toEqual({ name: "my-project", group: "my-team" });
  });

  // p3-deregister-cmd: deregister without --clean has no clean field
  test("deregister without extraFields omits clean from body", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/deregister" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "clean", required: false, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project"]);
    expect(JSON.parse(body!)).toEqual({ name: "my-project" });
  });

  // p3-deregister-cmd: deregister with --clean flag → clean: true in body
  test("deregister with extraFields { clean: true } sets clean boolean", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/deregister" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "clean", required: false, in: "body" },
      ],
    });
    const body = buildBody(skill, ["my-project"], { clean: true });
    expect(JSON.parse(body!)).toEqual({ name: "my-project", clean: true });
  });

  // extraFields do not override positional args
  test("extraFields do not overwrite positionally-mapped params", () => {
    const skill = makeOperation({
      parameters: [{ name: "name", required: true, in: "body" }],
    });
    const body = buildBody(skill, ["explicit-name"], { name: "should-not-win" });
    expect(JSON.parse(body!)).toEqual({ name: "explicit-name" });
  });
});

describe("validateArgs", () => {
  test("passes when all required args provided", () => {
    const skill = makeOperation({
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    expect(validateArgs(skill, ["my-project"])).toBeNull();
  });

  test("passes when optional args are missing", () => {
    const skill = makeOperation({
      invocation: { method: "POST", path: "/workspace/git/branch/rebase" },
      parameters: [{ name: "projectName", required: false, in: "body" }],
    });
    expect(validateArgs(skill, [])).toBeNull();
  });

  test("fails when required arg is missing", () => {
    const skill = makeOperation({
      invocation: { method: "GET", path: "/workspace/artifact/document/list" },
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    const error = validateArgs(skill, []);
    expect(error).not.toBeNull();
    expect(error).toContain("projectName");
    expect(error).toContain("Usage:");
  });

  test("fails when multiple required args are missing", () => {
    const skill = makeOperation({
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
    const skill = makeOperation({
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
    });
    expect(validateArgs(skill, [])).toBeNull();
  });
});
