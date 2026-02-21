import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import type {
  WorkerMetadata,
  DiscoveredPackage,
  ToolboxMetadata,
} from "@/lib/types";

let tmpDir: string;
let projectPath: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-resolver-"));
  projectPath = path.join(tmpDir, "test-project");
  guildHallHome = path.join(tmpDir, ".guild-hall");

  // Create project .lore directory so artifact tools don't fail on init
  await fs.mkdir(path.join(projectPath, ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeWorker(overrides?: Partial<WorkerMetadata>): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name: "test-worker",
      description: "A test worker",
      displayTitle: "Test Worker",
    },
    posture: "You are a test worker.",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    checkoutScope: "sparse",
    ...overrides,
  };
}

function makeToolboxPackage(
  name: string,
  overrides?: Partial<ToolboxMetadata>,
): DiscoveredPackage {
  return {
    name,
    path: path.join(tmpDir, "packages", name),
    metadata: {
      type: "toolbox",
      name,
      description: `${name} toolbox`,
      ...overrides,
    },
  };
}

function makeWorkerToolboxPackage(name: string): DiscoveredPackage {
  return {
    name,
    path: path.join(tmpDir, "packages", name),
    metadata: {
      type: ["worker", "toolbox"],
      name,
      description: `${name} hybrid package`,
    } as ToolboxMetadata,
  };
}

// Reset paths before each test since they depend on tmpDir
function testContext() {
  return {
    projectPath,
    meetingId: "meeting-test",
    guildHallHome,
  };
}

describe("resolveToolSet", () => {
  test("base only: worker with no domain toolboxes", () => {
    const worker = makeWorker();
    const result = resolveToolSet(worker, [], testContext());

    // Should have exactly one MCP server (the base toolbox)
    expect(result.mcpServers).toHaveLength(1);
    expect(result.mcpServers[0].type).toBe("sdk");
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[0].instance).toBeDefined();
  });

  test("built-in tools assembled from worker metadata", () => {
    const worker = makeWorker({
      builtInTools: ["Read", "Glob", "Grep", "Bash", "Edit"],
    });
    const result = resolveToolSet(worker, [], testContext());

    expect(result.allowedTools).toEqual(["Read", "Glob", "Grep", "Bash", "Edit"]);
  });

  test("empty builtInTools results in empty allowedTools", () => {
    const worker = makeWorker({ builtInTools: [] });
    const result = resolveToolSet(worker, [], testContext());

    expect(result.allowedTools).toEqual([]);
  });

  test("worker with domain toolbox resolves without error when package exists", () => {
    const worker = makeWorker({ domainToolboxes: ["code-analysis"] });
    const packages = [makeToolboxPackage("code-analysis")];

    const result = resolveToolSet(worker, packages, testContext());

    // Base toolbox is always present
    expect(result.mcpServers).toHaveLength(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });

  test("worker-toolbox hybrid package counts as a toolbox", () => {
    const worker = makeWorker({ domainToolboxes: ["hybrid-pkg"] });
    const packages = [makeWorkerToolboxPackage("hybrid-pkg")];

    // Should not throw since the hybrid package has the toolbox role
    const result = resolveToolSet(worker, packages, testContext());
    expect(result.mcpServers).toHaveLength(1);
  });

  test("missing domain toolbox throws descriptive error (REQ-WKR-13)", () => {
    const worker = makeWorker({
      domainToolboxes: ["nonexistent-toolbox"],
      identity: {
        name: "my-worker",
        description: "test",
        displayTitle: "My Worker",
      },
    });

    expect(() =>
      resolveToolSet(worker, [], testContext()),
    ).toThrow(/my-worker.*nonexistent-toolbox/);
  });

  test("missing toolbox error lists available toolbox packages", () => {
    const worker = makeWorker({ domainToolboxes: ["missing-one"] });
    const packages = [
      makeToolboxPackage("available-a"),
      makeToolboxPackage("available-b"),
    ];

    expect(() =>
      resolveToolSet(worker, packages, testContext()),
    ).toThrow(/available-a.*available-b/);
  });

  test("missing toolbox error shows (none) when no toolboxes available", () => {
    const worker = makeWorker({ domainToolboxes: ["missing"] });
    // Only non-toolbox packages available
    const workerOnly: DiscoveredPackage = {
      name: "some-worker",
      path: "/fake",
      metadata: {
        type: "worker",
        identity: { name: "w", description: "w", displayTitle: "W" },
        posture: "p",
        domainToolboxes: [],
        builtInTools: [],
        checkoutScope: "sparse",
      },
    };

    expect(() =>
      resolveToolSet(worker, [workerOnly], testContext()),
    ).toThrow("(none)");
  });

  test("allowedTools is a copy, not a shared reference", () => {
    const worker = makeWorker({ builtInTools: ["Read"] });
    const result = resolveToolSet(worker, [], testContext());

    // Mutating the result should not affect the worker's original array
    result.allowedTools.push("Bash");
    expect(worker.builtInTools).toEqual(["Read"]);
  });
});
