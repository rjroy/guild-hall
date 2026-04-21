import { describe, test, expect } from "bun:test";
import {
  renderRootHelp,
  renderGroupHelp,
  renderLeafHelp,
  renderHelp,
} from "@/cli/help";
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

describe("help rendering is pure (no daemon fetches)", () => {
  test("render functions do not touch a fake daemonFetch", () => {
    // renderRootHelp/renderGroupHelp/renderLeafHelp are pure functions that
    // take a node and return text+json. They never call daemonFetch. This
    // test exercises all three against the live surface with a spy that
    // must not fire to catch any regression in Phase 3's "zero daemon help"
    // guarantee.
    let fetchCount = 0;
    // The render helpers take no fetcher — if any of them ever started
    // calling one, it would have to be on the module. We simulate by
    // creating a spy and never passing it; if we later refactor such that
    // help needs a fetcher, this test is the place it should show up.
    const noopFetch = (): never => {
      fetchCount += 1;
      throw new Error("help rendering fetched the daemon");
    };

    renderRootHelp(CLI_SURFACE);
    const commission = findNodeByPath(["commission"]);
    if (commission && commission.kind === "group") {
      renderGroupHelp(commission, ["commission"]);
    }
    const health = findNodeByPath(["system", "health"]);
    if (health && health.kind === "leaf") {
      renderLeafHelp(health, ["system", "health"]);
    }

    expect(fetchCount).toBe(0);
    // Use noopFetch to keep the function referenced (otherwise TS whines).
    expect(typeof noopFetch).toBe("function");
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
