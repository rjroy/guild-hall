import { describe, test, expect } from "bun:test";
import {
  renderRootHelp,
  renderGroupHelp,
  renderLeafHelp,
  renderHelp,
} from "@/cli/help";
import { runCli, type CliDeps } from "@/cli/index";
import { CLI_SURFACE, type CliGroupNode, type CliLeafNode } from "@/cli/surface";
import { findNodeByPath } from "@/cli/surface-utils";

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

function group(name: string, description: string, children: CliGroupNode["children"]): CliGroupNode {
  return { kind: "group", name, description, children };
}

describe("renderRootHelp", () => {
  test("includes Guild Hall CLI title and top-level children", () => {
    const { text, json } = renderRootHelp(CLI_SURFACE);
    expect(text).toContain("Guild Hall CLI");
    expect(text).toContain("commission");
    expect(text).toContain("meeting");
    expect(text).toContain("Run 'guild-hall <command> help'");
    expect(text).toContain("Example: guild-hall commission list --state=requested");

    expect(json.kind).toBe("group");
    expect(json.path).toBe("/");
    expect(json.example).toBe("guild-hall commission list --state=requested");
    expect(Array.isArray(json.children)).toBe(true);
  });

  test("surfaces migrate-content as a top-level command (REQ-CLI-AGENT-14)", () => {
    const { text } = renderRootHelp(CLI_SURFACE);
    expect(text).toContain("migrate-content");
  });
});

describe("renderGroupHelp", () => {
  test("lists immediate children of an intermediate group (REQ-CLI-AGENT-15)", () => {
    const commission = findNodeByPath(["commission"]);
    if (!commission || commission.kind !== "group") {
      throw new Error("Expected commission group in surface");
    }
    const { text, json } = renderGroupHelp(commission, ["commission"]);
    expect(text).toContain("guild-hall commission");
    expect(text).toContain("list");
    expect(text).not.toContain("migrate-content");

    expect(json.kind).toBe("group");
    expect(json.path).toBe("/commission");
    expect(json.name).toBe("commission");
    expect(json).not.toHaveProperty("example");
  });
});

describe("renderLeafHelp", () => {
  test("shows command, method, path, args, flags, example, outputShape (REQ-CLI-AGENT-16)", () => {
    const leafNode = leaf({
      name: "list",
      operationId: "workspace.artifact.document.list",
      description: "List artifacts for a project",
      args: [
        { name: "projectName", required: true, type: "string", description: "Project name." },
      ],
      flags: [
        { name: "type", type: "string", description: "Filter by type." },
      ],
      example: "guild-hall workspace artifact document list my-project",
      outputShape: "{ artifacts: [...] }",
    });
    const { text, json } = renderLeafHelp(leafNode, [
      "workspace",
      "artifact",
      "document",
      "list",
    ]);

    expect(text).toContain("guild-hall workspace artifact document list");
    expect(text).toContain("List artifacts for a project");
    expect(text).toContain("Method:  GET");
    expect(text).toContain("Path:    /workspace/artifact/document/list");
    expect(text).toContain("Arguments:");
    expect(text).toContain("projectName");
    expect(text).toContain("(required)");
    expect(text).toContain("Flags:");
    expect(text).toContain("--type");
    expect(text).toContain("Example: guild-hall workspace artifact document list my-project");
    expect(text).toContain("Output:  { artifacts: [...] }");

    expect(json.kind).toBe("leaf");
    expect(json.path).toBe("/workspace/artifact/document/list");
    expect(Array.isArray(json.args)).toBe(true);
    expect(Array.isArray(json.flags)).toBe(true);
    expect(json.example).toBe("guild-hall workspace artifact document list my-project");
    expect(json.outputShape).toBe("{ artifacts: [...] }");
  });

  test("flags aggregate leaves with their fan-out operations", () => {
    const meeting = findNodeByPath(["meeting", "list"]);
    if (!meeting || meeting.kind !== "leaf") {
      throw new Error("Expected meeting list leaf");
    }
    const { text } = renderLeafHelp(meeting, ["meeting", "list"]);
    expect(text).toContain("Aggregates:");
    expect(text).toContain("meeting.request.meeting.list");
    expect(text).toContain("meeting.session.meeting.list");
    expect(text).toContain("Reason:");
  });

  test("streaming operations include a Stream line with event types", () => {
    const streamingLeaf = leaf({
      name: "create",
      operationId: "meeting.request.meeting.create",
      description: "Create a meeting and stream response",
      args: [],
      example: "",
      outputShape: "",
    });
    const { text } = renderLeafHelp(streamingLeaf, ["meeting", "create"]);
    expect(text).toContain("Stream:");
    expect(text).toContain("meeting_message");
  });
});

describe("renderHelp dispatch", () => {
  test("renders root help when at surface root", () => {
    const { json } = renderHelp(CLI_SURFACE, []);
    expect(json.path).toBe("/");
    expect(json).toHaveProperty("example");
  });

  test("renders group help for intermediate group", () => {
    const commission = findNodeByPath(["commission"]);
    if (!commission) throw new Error("no commission");
    const { json } = renderHelp(commission, ["commission"]);
    expect(json.kind).toBe("group");
    expect(json).not.toHaveProperty("example");
  });

  test("renders leaf help for leaf", () => {
    const health = findNodeByPath(["system", "health"]);
    if (!health) throw new Error("no health leaf");
    const { json } = renderHelp(health, ["system", "health"]);
    expect(json.kind).toBe("leaf");
  });
});

describe("CLI help path issues zero daemon requests (REQ-CLI-AGENT-26)", () => {
  // Plan Gate 2 required: "CLI issues zero requests to removed help endpoints
  // (test asserts this)". The deeper guarantee is that no help invocation of
  // runCli reaches the daemon at all — help is rendered entirely from the
  // in-process CLI_SURFACE. These tests wire a throwing spy as `daemonFetch`
  // and assert runCli returns without ever calling it.

  function throwingDeps(): { deps: CliDeps; fetchCount: { n: number } } {
    const fetchCount = { n: 0 };
    const deps: CliDeps = {
      daemonFetch: () => {
        fetchCount.n += 1;
        throw new Error("help path must not reach the daemon");
      },
      streamOperation: () => {
        throw new Error("help path must not stream");
      },
    };
    return { deps, fetchCount };
  }

  function captureStdout(): { logs: string[]; restore: () => void } {
    const logs: string[] = [];
    const orig = console.log.bind(console);
    console.log = (msg: string) => logs.push(msg);
    return { logs, restore: () => { console.log = orig; } };
  }

  // Tests capture stdout which makes isTTY false, so runCli defaults to JSON.
  // We pass --tty to force text rendering so we can assert on the human form.

  test("root: runCli(['help','--tty']) renders without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["help", "--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("Guild Hall CLI");
  });

  test("empty argv with --tty renders root help without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("Guild Hall CLI");
  });

  test("group: runCli(['commission','help','--tty']) renders without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["commission", "help", "--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("guild-hall commission");
  });

  test("leaf: runCli(['commission','list','help','--tty']) renders without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["commission", "list", "help", "--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("Example:");
  });

  test("nested group: runCli(['artifact','image','help','--tty']) renders without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["artifact", "image", "help", "--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("guild-hall artifact image");
  });

  test("local-only leaf: runCli(['migrate-content','help','--tty']) renders without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["migrate-content", "help", "--tty"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    expect(logs.join("\n")).toContain("migrate-content");
  });

  test("group: JSON mode (no --tty) emits group JSON without calling daemonFetch", async () => {
    const { deps, fetchCount } = throwingDeps();
    const { logs, restore } = captureStdout();
    try {
      await runCli(["commission", "help"], deps);
    } finally {
      restore();
    }
    expect(fetchCount.n).toBe(0);
    const parsed = JSON.parse(logs[0]) as { kind: string; path: string };
    expect(parsed.kind).toBe("group");
    expect(parsed.path).toBe("/commission");
  });
});

describe("renderRootHelp with a scoped surface", () => {
  test("renders a minimal custom surface", () => {
    const surface = group("guild-hall", "Test description", [
      group("foo", "Foo group", [
        leaf({ name: "bar", operationId: "foo.bar" }),
      ]),
    ]);
    const { text, json } = renderRootHelp(surface);
    expect(text).toContain("foo");
    expect(text).toContain("Foo group");
    expect(json.description).toBe("Test description");
  });
});
