import { describe, test, expect } from "bun:test";
import {
  resolveCommand,
  buildQueryString,
  buildBody,
  validateArgs,
  type CliOperation,
} from "@/cli/resolve";
import {
  AGGREGATE_SENTINEL,
  PACKAGE_OP_SENTINEL,
  type CliGroupNode,
  type CliLeafNode,
} from "@/cli/surface";

function makeOperation(overrides: Partial<CliOperation> = {}): CliOperation {
  return {
    operationId: "test.op",
    invocation: { method: "GET", path: "/test" },
    ...overrides,
  };
}

function leaf(node: Partial<CliLeafNode> & Pick<CliLeafNode, "name" | "operationId">): CliLeafNode {
  return {
    kind: "leaf",
    description: node.description ?? "",
    args: node.args ?? [],
    example: node.example ?? "",
    outputShape: node.outputShape ?? "",
    ...node,
  };
}

function group(name: string, children: CliGroupNode["children"]): CliGroupNode {
  return { kind: "group", name, description: "", children };
}

// A small surface that exercises leaf/aggregate/package-op branches without
// depending on the (large) real surface.
const testSurface: CliGroupNode = group("guild-hall", [
  group("system", [
    group("runtime", [
      group("daemon", [
        leaf({
          name: "health",
          operationId: "system.runtime.daemon.health",
        }),
      ]),
    ]),
    group("config", [
      group("project", [
        leaf({
          name: "list",
          operationId: "system.config.project.list",
        }),
        leaf({
          name: "read",
          operationId: "system.config.project.read",
          args: [
            { name: "projectName", required: true, type: "string", description: "" },
          ],
        }),
        leaf({
          name: "group",
          operationId: "system.config.project.group",
          args: [
            { name: "name", required: true, type: "string", description: "" },
            { name: "group", required: true, type: "string", description: "" },
          ],
        }),
        leaf({
          name: "deregister",
          operationId: "system.config.project.deregister",
          args: [
            { name: "name", required: true, type: "string", description: "" },
          ],
        }),
      ]),
    ]),
  ]),
  group("workspace", [
    group("artifact", [
      group("document", [
        leaf({
          name: "list",
          operationId: "workspace.artifact.document.list",
          args: [
            { name: "projectName", required: true, type: "string", description: "" },
          ],
        }),
        leaf({
          name: "read",
          operationId: "workspace.artifact.document.read",
          args: [
            { name: "projectName", required: true, type: "string", description: "" },
            { name: "path", required: true, type: "string", description: "" },
          ],
        }),
      ]),
    ]),
    group("git", [
      group("branch", [
        leaf({
          name: "rebase",
          operationId: "workspace.git.branch.rebase",
          args: [
            { name: "projectName", required: false, type: "string", description: "" },
          ],
        }),
      ]),
    ]),
  ]),
  group("commission", [
    group("run", [
      leaf({
        name: "dispatch",
        operationId: "commission.run.dispatch",
        args: [
          { name: "commissionId", required: true, type: "string", description: "" },
        ],
      }),
    ]),
  ]),
  group("meeting", [
    leaf({
      name: "list",
      operationId: AGGREGATE_SENTINEL,
      aggregate: {
        operationIds: [
          "meeting.request.meeting.list",
          "meeting.session.meeting.list",
        ],
        justification: "test aggregate",
      },
    }),
  ]),
  group("package-op", [
    leaf({
      name: "invoke",
      operationId: PACKAGE_OP_SENTINEL,
      args: [
        { name: "operationId", required: true, type: "string", description: "" },
      ],
    }),
  ]),
]);

describe("resolveCommand — help branch", () => {
  test("empty segments returns root help", () => {
    const result = resolveCommand([], testSurface);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([]);
      expect(result.help.node).toBe(testSurface);
    }
  });

  test("'help' alone returns root help", () => {
    const result = resolveCommand(["help"], testSurface);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([]);
    }
  });

  test("'system help' returns group help", () => {
    const result = resolveCommand(["system", "help"], testSurface);
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual(["system"]);
      expect(result.help.node?.kind).toBe("group");
    }
  });

  test("'system runtime daemon health help' returns leaf help", () => {
    const result = resolveCommand(
      ["system", "runtime", "daemon", "health", "help"],
      testSurface,
    );
    expect(result.type).toBe("help");
    if (result.type === "help") {
      expect(result.help.segments).toEqual([
        "system", "runtime", "daemon", "health",
      ]);
      expect(result.help.node?.kind).toBe("leaf");
    }
  });
});

describe("resolveCommand — leaf command branch", () => {
  test("resolves full path with no positional args", () => {
    const result = resolveCommand(
      ["system", "runtime", "daemon", "health"],
      testSurface,
    );
    expect(result.type).toBe("command");
    if (result.type === "command" && result.command.type === "leaf") {
      expect(result.command.operation.operationId).toBe("system.runtime.daemon.health");
      expect(result.command.positionalArgs).toEqual([]);
    }
  });

  test("resolves with positional args", () => {
    const result = resolveCommand(
      ["workspace", "artifact", "document", "list", "my-project"],
      testSurface,
    );
    expect(result.type).toBe("command");
    if (result.type === "command" && result.command.type === "leaf") {
      expect(result.command.operation.operationId).toBe("workspace.artifact.document.list");
      expect(result.command.positionalArgs).toEqual(["my-project"]);
    }
  });

  test("derives parameter location from HTTP method (GET → query)", () => {
    const result = resolveCommand(
      ["workspace", "artifact", "document", "list", "my-project"],
      testSurface,
    );
    if (result.type === "command" && result.command.type === "leaf") {
      expect(result.command.operation.invocation.method).toBe("GET");
      const params = result.command.operation.parameters ?? [];
      expect(params[0].in).toBe("query");
    }
  });

  test("derives parameter location from HTTP method (POST → body)", () => {
    const result = resolveCommand(
      ["commission", "run", "dispatch", "abc123"],
      testSurface,
    );
    if (result.type === "command" && result.command.type === "leaf") {
      expect(result.command.operation.invocation.method).toBe("POST");
      const params = result.command.operation.parameters ?? [];
      expect(params[0].in).toBe("body");
    }
  });

  test("greedy leaf match consumes segments up to leaf", () => {
    const result = resolveCommand(
      ["commission", "run", "dispatch", "abc123"],
      testSurface,
    );
    expect(result.type).toBe("command");
    if (result.type === "command" && result.command.type === "leaf") {
      expect(result.command.operation.operationId).toBe("commission.run.dispatch");
      expect(result.command.positionalArgs).toEqual(["abc123"]);
    }
  });

  test("threads flags through to command result", () => {
    const result = resolveCommand(
      ["commission", "run", "dispatch", "abc123"],
      testSurface,
      { force: true, reason: "test" },
    );
    if (result.type === "command") {
      expect(result.command.flags).toEqual({ force: true, reason: "test" });
    }
  });
});

describe("resolveCommand — aggregate branch", () => {
  test("meeting list resolves to aggregate", () => {
    const result = resolveCommand(["meeting", "list"], testSurface);
    expect(result.type).toBe("command");
    if (result.type === "command" && result.command.type === "aggregate") {
      expect(result.command.operations.map((o) => o.operationId)).toEqual([
        "meeting.request.meeting.list",
        "meeting.session.meeting.list",
      ]);
      expect(result.command.positionalArgs).toEqual([]);
    }
  });

  test("aggregate carries flags for --state filtering", () => {
    const result = resolveCommand(
      ["meeting", "list"],
      testSurface,
      { state: "active" },
    );
    if (result.type === "command" && result.command.type === "aggregate") {
      expect(result.command.flags).toEqual({ state: "active" });
    }
  });
});

describe("resolveCommand — package-op branch", () => {
  test("routes to package-op with targetOperationId", () => {
    const result = resolveCommand(
      ["package-op", "invoke", "custom.operation.id", "arg1", "arg2"],
      testSurface,
    );
    expect(result.type).toBe("command");
    if (result.type === "command" && result.command.type === "package-op") {
      expect(result.command.targetOperationId).toBe("custom.operation.id");
      expect(result.command.positionalArgs).toEqual(["arg1", "arg2"]);
    }
  });

  test("package-op without targetOperationId is unknown", () => {
    const result = resolveCommand(
      ["package-op", "invoke"],
      testSurface,
    );
    expect(result.type).toBe("unknown");
  });
});

describe("resolveCommand — unknown branch", () => {
  test("returns unknown for unmatched segments", () => {
    const result = resolveCommand(["foo", "bar"], testSurface);
    expect(result.type).toBe("unknown");
    if (result.type === "unknown") {
      expect(result.segments).toEqual(["foo", "bar"]);
    }
  });

  test("returns unknown when a group is typed without a leaf verb", () => {
    const result = resolveCommand(["system", "runtime"], testSurface);
    expect(result.type).toBe("unknown");
  });
});

describe("buildQueryString", () => {
  test("builds query string from positional args for GET parameters", () => {
    const op = makeOperation({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "path", required: true, in: "query" },
      ],
    });
    const qs = buildQueryString(op, ["my-project", "foo/bar.md"]);
    expect(qs).toBe("?projectName=my-project&path=foo%2Fbar.md");
  });

  test("returns empty string with only body params", () => {
    const op = makeOperation({
      parameters: [{ name: "name", required: true, in: "body" }],
    });
    expect(buildQueryString(op, ["test"])).toBe("");
  });

  test("returns empty string with no parameters", () => {
    expect(buildQueryString(makeOperation(), [])).toBe("");
  });

  test("handles fewer args than params", () => {
    const op = makeOperation({
      parameters: [
        { name: "a", required: true, in: "query" },
        { name: "b", required: false, in: "query" },
      ],
    });
    expect(buildQueryString(op, ["val1"])).toBe("?a=val1");
  });

  test("skips empty string positional arguments", () => {
    const op = makeOperation({
      parameters: [
        { name: "projectName", required: true, in: "query" },
        { name: "status", required: false, in: "query" },
        { name: "worker", required: false, in: "query" },
      ],
    });
    expect(
      buildQueryString(op, ["myproject", "", "guild-hall-developer"]),
    ).toBe("?projectName=myproject&worker=guild-hall-developer");
  });
});

describe("buildBody", () => {
  test("builds JSON body from positional args for POST parameters", () => {
    const op = makeOperation({
      invocation: { method: "POST", path: "/test" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "path", required: true, in: "body" },
      ],
    });
    const body = buildBody(op, ["my-project", "/some/path"]);
    expect(JSON.parse(body!)).toEqual({
      name: "my-project",
      path: "/some/path",
    });
  });

  test("returns undefined when no body params and no args", () => {
    const op = makeOperation({
      parameters: [{ name: "a", required: true, in: "query" }],
    });
    expect(buildBody(op, [])).toBeUndefined();
  });

  test("extraFields do not overwrite positionally-mapped params", () => {
    const op = makeOperation({
      invocation: { method: "POST", path: "/test" },
      parameters: [{ name: "name", required: true, in: "body" }],
    });
    const body = buildBody(op, ["explicit-name"], { name: "should-not-win" });
    expect(JSON.parse(body!)).toEqual({ name: "explicit-name" });
  });

  test("deregister --clean flag merges into body", () => {
    const op = makeOperation({
      invocation: { method: "POST", path: "/system/config/project/deregister" },
      parameters: [
        { name: "name", required: true, in: "body" },
        { name: "clean", required: false, in: "body" },
      ],
    });
    const body = buildBody(op, ["my-project"], { clean: true });
    expect(JSON.parse(body!)).toEqual({ name: "my-project", clean: true });
  });
});

describe("validateArgs", () => {
  test("passes when all required args provided", () => {
    const op = makeOperation({
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    expect(validateArgs(op, ["my-project"])).toBeNull();
  });

  test("fails when required arg is missing", () => {
    const op = makeOperation({
      commandPath: ["workspace", "artifact", "document", "list"],
      parameters: [{ name: "projectName", required: true, in: "query" }],
    });
    const error = validateArgs(op, []);
    expect(error).not.toBeNull();
    expect(error).toContain("projectName");
    expect(error).toContain("Usage:");
    expect(error).toContain("workspace artifact document list");
  });

  test("passes with no parameters defined", () => {
    expect(validateArgs(makeOperation(), [])).toBeNull();
  });
});
