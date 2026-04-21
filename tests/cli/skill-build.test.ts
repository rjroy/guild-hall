import { describe, test, expect } from "bun:test";
import { runCli, type CliDeps } from "@/cli/index";
import { CLI_SURFACE, type CliGroupNode, type CliNode } from "@/cli/surface";
import { leafNodes, pathForNode } from "@/cli/surface-utils";

/**
 * REQ-CLI-AGENT-20: Skill-builder harness.
 *
 * This test simulates an external agent discovering Guild Hall's CLI surface
 * purely through `guild-hall <path> help --json` invocations. No source
 * reading, no catalog fetch, no REST /help probing — the CLI must be a
 * self-contained skill source.
 *
 * The harness walks the tree: at each group node it invokes `help --json`,
 * consumes the returned `children` array, then recurses into every child.
 * At each leaf node it invokes `help --json` and records the skill rep.
 *
 * The final skill rep is compared against every leaf in `CLI_SURFACE`; any
 * missing leaf, or any leaf missing a required field, fails the test with a
 * diagnostic naming the offender.
 */

type JsonNode = Record<string, unknown>;

interface SkillRep {
  path: string;
  description: string;
  args: unknown[];
  flags: unknown[];
  example: string;
  outputShape: string;
}

/** daemonFetch that throws loudly — help paths must never touch the daemon. */
function throwingDeps(): CliDeps {
  return {
    daemonFetch: () => {
      throw new Error("help path must not reach the daemon");
    },
    streamOperation: () => {
      throw new Error("help path must not stream");
    },
  };
}

/** Invoke `runCli(argv, deps)` and capture the single JSON line written to stdout. */
async function invokeHelpJson(argv: string[]): Promise<JsonNode> {
  const logs: string[] = [];
  const originalLog = console.log.bind(console);
  console.log = (msg: string) => logs.push(msg);
  try {
    await runCli(argv, throwingDeps());
  } finally {
    console.log = originalLog;
  }
  if (logs.length === 0) {
    throw new Error(
      `No stdout produced for argv=${JSON.stringify(argv)}. ` +
        `runCli should have printed JSON help.`,
    );
  }
  // runCli emits help as a single JSON blob. `JSON.parse` on the joined output
  // keeps the harness robust to internal formatting choices.
  return JSON.parse(logs.join("\n")) as JsonNode;
}

/**
 * Walks the CLI tree using only `<path> help` invocations.
 * Starts at the root (empty path) and recurses into every child returned by
 * the help response. Records a skill rep for each leaf encountered.
 */
async function walkSurfaceViaHelp(): Promise<Map<string, SkillRep>> {
  const skillReps = new Map<string, SkillRep>();

  async function visit(pathSegments: string[]): Promise<void> {
    // `help` terminator tells the CLI we want help for this scope; empty path
    // is handled as root-help by dispatch. `--json` forces JSON output even
    // when the test harness's stdout is momentarily interactive.
    const argv =
      pathSegments.length === 0
        ? ["help", "--json"]
        : [...pathSegments, "help", "--json"];
    const json = await invokeHelpJson(argv);

    if (json.kind === "group") {
      const children = Array.isArray(json.children) ? json.children : [];
      for (const child of children as JsonNode[]) {
        const childName = typeof child.name === "string" ? child.name : "";
        if (!childName) continue;
        await visit([...pathSegments, childName]);
      }
      return;
    }

    if (json.kind === "leaf") {
      const pathString = typeof json.path === "string" ? json.path : "";
      skillReps.set(pathString, {
        path: pathString,
        description: typeof json.description === "string" ? json.description : "",
        args: Array.isArray(json.args) ? json.args : [],
        flags: Array.isArray(json.flags) ? json.flags : [],
        example: typeof json.example === "string" ? json.example : "",
        outputShape: typeof json.outputShape === "string" ? json.outputShape : "",
      });
      return;
    }

    throw new Error(
      `Unexpected help payload kind at path=${pathSegments.join("/")}: ${JSON.stringify(json.kind)}`,
    );
  }

  await visit([]);
  return skillReps;
}

/** Build the set of expected leaf paths from CLI_SURFACE (ignoring root). */
function expectedLeafPaths(root: CliGroupNode = CLI_SURFACE): Map<string, CliNode> {
  const out = new Map<string, CliNode>();
  for (const leaf of leafNodes(root)) {
    const segments = pathForNode(leaf, root);
    if (!segments) continue;
    out.set("/" + segments.join("/"), leaf);
  }
  return out;
}

describe("skill-builder harness (REQ-CLI-AGENT-20)", () => {
  test("every leaf in CLI_SURFACE is reachable via --json help", async () => {
    const skillReps = await walkSurfaceViaHelp();
    const expected = expectedLeafPaths();

    const missing: string[] = [];
    for (const expectedPath of expected.keys()) {
      if (!skillReps.has(expectedPath)) missing.push(expectedPath);
    }

    if (missing.length > 0) {
      throw new Error(
        `Skill harness failed to reach ${missing.length} leaf path(s) via help:\n` +
          missing.map((p) => `  - ${p}`).join("\n"),
      );
    }

    expect(skillReps.size).toBeGreaterThanOrEqual(expected.size);
  });

  test("every emitted skill rep has a non-empty path, description, example, outputShape", async () => {
    const skillReps = await walkSurfaceViaHelp();

    const problems: string[] = [];
    for (const [p, rep] of skillReps) {
      if (!rep.path) problems.push(`${p}: missing path`);
      if (!rep.description) problems.push(`${p}: missing description`);
      if (!rep.example) problems.push(`${p}: missing example`);
      if (!rep.outputShape) problems.push(`${p}: missing outputShape`);
      if (!Array.isArray(rep.args)) problems.push(`${p}: args is not an array`);
      if (!Array.isArray(rep.flags)) problems.push(`${p}: flags is not an array`);
    }

    if (problems.length > 0) {
      throw new Error(
        `Skill rep missing required fields:\n` +
          problems.map((line) => `  - ${line}`).join("\n"),
      );
    }

    expect(problems).toEqual([]);
  });

  test("harness makes zero daemon calls", async () => {
    let daemonCalls = 0;
    let streamCalls = 0;
    const countingDeps: CliDeps = {
      daemonFetch: () => {
        daemonCalls += 1;
        throw new Error("help must not call daemonFetch");
      },
      streamOperation: () => {
        streamCalls += 1;
        throw new Error("help must not stream");
      },
    };

    // Spot-check a handful of representative scopes (root, group, leaf).
    const scopes: string[][] = [
      ["help"],
      ["commission", "help"],
      ["commission", "list", "help"],
      ["meeting", "list", "help"],
      ["artifact", "image", "help"],
      ["package-op", "help"],
      ["migrate-content", "help"],
    ];

    const originalLog = console.log.bind(console);
    console.log = () => {};
    try {
      for (const scope of scopes) {
        await runCli(scope, countingDeps);
      }
    } finally {
      console.log = originalLog;
    }

    expect(daemonCalls).toBe(0);
    expect(streamCalls).toBe(0);
  });

  test("skill rep args and flags reflect the leaf's own contract (sample: commission create)", async () => {
    // Contract check: the skill rep's `args` and `flags` mirror the leaf
    // definition in the surface. This guards against the renderer silently
    // dropping or reordering fields during skill extraction.
    const skillReps = await walkSurfaceViaHelp();
    const rep = skillReps.get("/commission/create");
    if (!rep) throw new Error("commission/create not in skill map");

    const argNames = (rep.args as Array<{ name?: unknown }>).map((a) =>
      typeof a.name === "string" ? a.name : "",
    );
    expect(argNames).toEqual(["projectName", "worker", "title", "prompt"]);
    expect(rep.example).toMatch(/^guild-hall commission create /);
    expect(rep.outputShape.length).toBeGreaterThan(0);
  });

  test("local-only leaf (migrate-content) shows up with its flags", async () => {
    const skillReps = await walkSurfaceViaHelp();
    const rep = skillReps.get("/migrate-content");
    if (!rep) throw new Error("migrate-content not in skill map");

    const flagNames = (rep.flags as Array<{ name?: unknown }>).map((f) =>
      typeof f.name === "string" ? f.name : "",
    );
    expect(flagNames).toContain("apply");
  });
});
