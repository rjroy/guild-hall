import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import type { ManagerToolboxDeps } from "@/daemon/services/manager-toolbox";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";
import type { GitOps } from "@/daemon/lib/git";
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

  // Create project .lore directory for context-specific toolboxes
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
    meetingId: "meeting-test" as string,
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

  test("built-in tools and MCP wildcards assembled from worker metadata", () => {
    const worker = makeWorker({
      builtInTools: ["Read", "Glob", "Grep", "Bash", "Edit"],
    });
    const result = resolveToolSet(worker, [], testContext());

    // Built-in tools + MCP server wildcards (base only, no workerName = no meeting toolbox)
    expect(result.allowedTools).toContain("Read");
    expect(result.allowedTools).toContain("Glob");
    expect(result.allowedTools).toContain("Grep");
    expect(result.allowedTools).toContain("Bash");
    expect(result.allowedTools).toContain("Edit");
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
  });

  test("empty builtInTools still includes MCP wildcards", () => {
    const worker = makeWorker({ builtInTools: [] });
    const result = resolveToolSet(worker, [], testContext());

    // No built-in tools, but MCP wildcards are always present
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
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
    expect(worker.builtInTools).not.toContain("mcp__guild-hall-base__*");
  });

  test("meeting context with workerName produces base + meeting MCP servers", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "test-worker",
    };
    const result = resolveToolSet(worker, [], context);

    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
  });

  test("context without workerName produces base only (no meeting toolbox)", () => {
    const worker = makeWorker();
    const result = resolveToolSet(worker, [], testContext());

    expect(result.mcpServers).toHaveLength(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });

  test("workerName is passed through to meeting toolbox", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "specific-worker",
    };
    const result = resolveToolSet(worker, [], context);

    // The meeting toolbox should be present and correctly named
    expect(result.mcpServers).toHaveLength(2);
    const meetingServer = result.mcpServers[1];
    expect(meetingServer.name).toBe("guild-hall-meeting");
    expect(meetingServer.type).toBe("sdk");
    expect(meetingServer.instance).toBeDefined();
  });

  test("commission context with daemonSocketPath produces base + commission MCP servers", () => {
    const worker = makeWorker();
    const context = {
      projectPath,
      commissionId: "commission-test",
      guildHallHome,
      daemonSocketPath: "/tmp/fake.sock",
    };
    const result = resolveToolSet(worker, [], context);

    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-commission");
    expect(result.mcpServers[1].type).toBe("sdk");
    expect(result.mcpServers[1].instance).toBeDefined();
    expect(result.wasResultSubmitted).toBeFunction();
    expect(result.wasResultSubmitted!()).toBe(false);
  });

  test("commission context without daemonSocketPath throws", () => {
    const worker = makeWorker();
    const context = {
      projectPath,
      commissionId: "commission-test",
      guildHallHome,
    };

    expect(() => resolveToolSet(worker, [], context)).toThrow(
      /Commission context requires daemonSocketPath/,
    );
  });

  test("context with neither meetingId nor commissionId throws", () => {
    const worker = makeWorker();
    const context = {
      projectPath,
      guildHallHome,
    };

    expect(() => resolveToolSet(worker, [], context)).toThrow(
      /requires either meetingId or commissionId/,
    );
  });
});

// -- Manager toolbox integration --

/* eslint-disable @typescript-eslint/require-await */

function makeMockCommissionSession(): CommissionSessionForRoutes {
  return {
    async createCommission() { return { commissionId: "test" }; },
    async updateCommission() {},
    async dispatchCommission() { return { status: "accepted" as const }; },
    async cancelCommission() {},
    async redispatchCommission() { return { status: "accepted" as const }; },
    reportProgress() {},
    reportResult() {},
    reportQuestion() {},
    async addUserNote() {},
    getActiveCommissions() { return 0; },
    shutdown() {},
  };
}

function makeMockGitOps(): GitOps {
  return {
    async createBranch() {},
    async branchExists() { return false; },
    async deleteBranch() {},
    async createWorktree() {},
    async removeWorktree() {},
    async configureSparseCheckout() {},
    async commitAll() { return false; },
    async squashMerge() {},
    async hasUncommittedChanges() { return false; },
    async rebase() {},
    async currentBranch() { return "claude/main"; },
    async listWorktrees() { return []; },
    async initClaudeBranch() {},
    async detectDefaultBranch() { return "main"; },
    async fetch() {},
    async push() {},
    async resetHard() {},
    async createPullRequest() { return { url: "" }; },
    async isAncestor() { return false; },
    async treesEqual() { return false; },
    async revParse() { return "abc"; },
  };
}

/* eslint-enable @typescript-eslint/require-await */

function makeManagerToolboxDeps(): ManagerToolboxDeps {
  return {
    integrationPath: path.join(tmpDir, "integration"),
    projectName: "test-project",
    guildHallHome,
    commissionSession: makeMockCommissionSession(),
    eventBus: { emit() {}, subscribe() { return () => {}; } },
    gitOps: makeMockGitOps(),
    projectRepoPath: projectPath,
    defaultBranch: "main",
  };
}

describe("resolveToolSet with manager toolbox", () => {
  test("isManager=true includes manager toolbox MCP server", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      isManager: true,
      managerToolboxDeps: makeManagerToolboxDeps(),
    };
    const result = resolveToolSet(worker, [], context);

    // Should have: base + meeting + manager = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("guild-hall-manager");
  });

  test("isManager=false does NOT include manager toolbox", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "test-worker",
      isManager: false,
    };
    const result = resolveToolSet(worker, [], context);

    // Should have: base + meeting = 2 servers, no manager
    expect(result.mcpServers).toHaveLength(2);
    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-manager");
  });

  test("manager tools appear in resolved allowedTools whitelist", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      isManager: true,
      managerToolboxDeps: makeManagerToolboxDeps(),
    };
    const result = resolveToolSet(worker, [], context);

    // The allowedTools should include the mcp wildcard for the manager server
    expect(result.allowedTools).toContain("mcp__guild-hall-manager__*");
    // Also the base and meeting wildcards
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(result.allowedTools).toContain("mcp__guild-hall-meeting__*");
  });

  test("non-manager worker with meeting context has no manager tools", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "test-worker",
    };
    const result = resolveToolSet(worker, [], context);

    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-manager");
    expect(result.allowedTools).not.toContain("mcp__guild-hall-manager__*");
  });

  test("isManager=true without managerToolboxDeps does not inject manager toolbox", () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      isManager: true,
      // managerToolboxDeps intentionally omitted
    };
    const result = resolveToolSet(worker, [], context);

    // Only base + meeting, no manager (guard against undefined deps)
    expect(result.mcpServers).toHaveLength(2);
    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-manager");
  });
});
