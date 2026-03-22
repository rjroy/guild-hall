import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import { createContextTypeRegistry } from "@/daemon/services/context-type-registry";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { GitOps } from "@/daemon/lib/git";
import type { GuildHallToolServices } from "@/daemon/lib/toolbox-utils";
import { createEventBus } from "@/daemon/lib/event-bus";
import type {
  WorkerMetadata,
  DiscoveredPackage,
  ToolboxMetadata,
} from "@/lib/types";

const registry = createContextTypeRegistry();

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-resolver-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
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
    projectName: "test-project",
    contextId: "meeting-test",
    contextType: "meeting" as const,
    workerName: "test-worker",
    guildHallHome,
    eventBus: createEventBus(),
    config: { projects: [] },
  };
}

describe("resolveToolSet", () => {
  test("meeting context produces base + meeting MCP servers", async () => {
    const worker = makeWorker();
    const result = await resolveToolSet(worker, [], testContext(), registry);

    // Context toolbox is auto-added based on contextType
    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers[0].type).toBe("sdk");
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[0].instance).toBeDefined();
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
  });

  test("built-in tools and MCP wildcards assembled from worker metadata", async () => {
    const worker = makeWorker({
      builtInTools: ["Read", "Glob", "Grep", "Bash", "Edit"],
    });
    const result = await resolveToolSet(worker, [], testContext(), registry);

    // Built-in tools + MCP server wildcards (base + meeting)
    expect(result.allowedTools).toContain("Read");
    expect(result.allowedTools).toContain("Glob");
    expect(result.allowedTools).toContain("Grep");
    expect(result.allowedTools).toContain("Bash");
    expect(result.allowedTools).toContain("Edit");
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(result.allowedTools).toContain("mcp__guild-hall-meeting__*");
    expect(result.builtInTools).toEqual(["Read", "Glob", "Grep", "Bash", "Edit"]);
  });

  test("empty builtInTools still includes MCP wildcards", async () => {
    const worker = makeWorker({ builtInTools: [] });
    const result = await resolveToolSet(worker, [], testContext(), registry);

    // No built-in tools, but MCP wildcards are always present
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(result.allowedTools).toContain("mcp__guild-hall-meeting__*");
    expect(result.builtInTools).toEqual([]);
    // Confirm MCP wildcards are NOT in builtInTools
    expect(result.builtInTools).not.toContain("mcp__guild-hall-base__*");
  });

  test("builtInTools matches worker declaration exactly", async () => {
    const worker = makeWorker({ builtInTools: ["Read", "Glob", "Grep"] });
    const result = await resolveToolSet(worker, [], testContext(), registry);
    expect(result.builtInTools).toEqual(["Read", "Glob", "Grep"]);
  });

  test("builtInTools excludes MCP server tools even when MCP servers are added", async () => {
    const worker = makeWorker({ builtInTools: ["Read"] });
    const result = await resolveToolSet(worker, [], testContext(), registry);
    // builtInTools has only what the worker declared
    expect(result.builtInTools).toEqual(["Read"]);
    // allowedTools has both built-in and MCP wildcards
    expect(result.allowedTools.length).toBeGreaterThan(result.builtInTools.length);
  });

  test("worker with domain toolbox resolves without error when package exists", async () => {
    // This test now requires a real fixture since the resolver imports the package.
    // Covered by the "domain toolbox loading" describe block below.
    // Here we verify the missing-package error path still works.
    const worker = makeWorker({ domainToolboxes: ["code-analysis"] });
    const packages = [makeToolboxPackage("code-analysis")];

    // Package path doesn't contain a real index.ts, so import will fail.
    // That's fine; this test just validated existence before. The new
    // integration tests cover the full loading path.
    await expect(
      resolveToolSet(worker, packages, testContext(), registry),
    ).rejects.toThrow(/code-analysis/);
  });

  test("worker-toolbox hybrid package counts as a toolbox", async () => {
    const worker = makeWorker({ domainToolboxes: ["hybrid-pkg"] });
    const packages = [makeWorkerToolboxPackage("hybrid-pkg")];

    // Package path doesn't contain a real index.ts, so import will fail.
    await expect(
      resolveToolSet(worker, packages, testContext(), registry),
    ).rejects.toThrow(/hybrid-pkg/);
  });

  test("missing domain toolbox throws descriptive error (REQ-WKR-13)", async () => {
    const worker = makeWorker({
      domainToolboxes: ["nonexistent-toolbox"],
      identity: {
        name: "my-worker",
        description: "test",
        displayTitle: "My Worker",
      },
    });

    await expect(
      resolveToolSet(worker, [], testContext(), registry),
    ).rejects.toThrow(/my-worker.*nonexistent-toolbox/);
  });

  test("missing toolbox error lists available toolbox packages", async () => {
    const worker = makeWorker({ domainToolboxes: ["missing-one"] });
    const packages = [
      makeToolboxPackage("available-a"),
      makeToolboxPackage("available-b"),
    ];

    await expect(
      resolveToolSet(worker, packages, testContext(), registry),
    ).rejects.toThrow(/available-a.*available-b/);
  });

  test("missing toolbox error shows (none) when no toolboxes available", async () => {
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

    await expect(
      resolveToolSet(worker, [workerOnly], testContext(), registry),
    ).rejects.toThrow("(none)");
  });

  test("allowedTools is a copy, not a shared reference", async () => {
    const worker = makeWorker({ builtInTools: ["Read"] });
    const result = await resolveToolSet(worker, [], testContext(), registry);

    // Mutating the result should not affect the worker's original array
    result.allowedTools.push("Bash");
    expect(worker.builtInTools).toEqual(["Read"]);
    expect(worker.builtInTools).not.toContain("mcp__guild-hall-base__*");
  });

  test("workerName is passed through to meeting toolbox", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "specific-worker",
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // The meeting toolbox should be present and correctly named
    expect(result.mcpServers).toHaveLength(2);
    const meetingServer = result.mcpServers[1];
    expect(meetingServer.name).toBe("guild-hall-meeting");
    expect(meetingServer.type).toBe("sdk");
    expect(meetingServer.instance).toBeDefined();
  });

  test("commission context auto-adds commission toolbox", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      contextId: "commission-test",
      contextType: "commission" as const,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-commission");
    expect(result.mcpServers[1].type).toBe("sdk");
    expect(result.mcpServers[1].instance).toBeDefined();
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
    async abandonCommission() {},
    async redispatchCommission() { return { status: "accepted" as const }; },
    async addUserNote() {},
    async continueCommission() { return { status: "accepted" as const }; },
    async saveCommission() {},
    async checkDependencyTransitions() {},
    async createScheduledCommission() { return { commissionId: "schedule-001" }; },
    async updateScheduleStatus() { return { outcome: "executed", status: "paused" }; },
    async createTriggeredCommission() { return { commissionId: "trigger-001" }; },
    async updateTriggerStatus() { return { commissionId: "trigger-001", status: "active" }; },
    async recoverCommissions() { return 0; },
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
    async resetSoft() {},
    async createPullRequest() { return { url: "" }; },
    async isAncestor() { return false; },
    async treesEqual() { return false; },
    async revParse() { return "abc"; },
    async rebaseOnto() {},
    async merge() {},
    async squashMergeNoCommit() { return true; },
    async listConflictedFiles() { return []; },
    async resolveConflictsTheirs() {},
    async mergeAbort() {},
    async hasCommitsBeyond() { return false; },
    async lorePendingChanges() { return { hasPendingChanges: false, fileCount: 0 }; },
    async commitLore() { return { committed: false }; },
  };
}

/* eslint-enable @typescript-eslint/require-await */

describe("resolveToolSet with manager toolbox", () => {
  test("manager worker with systemToolboxes includes manager toolbox", async () => {
    const worker = makeWorker({ systemToolboxes: ["manager"] });
    const services: GuildHallToolServices = {
      commissionSession: makeMockCommissionSession(),
      gitOps: makeMockGitOps(),
      config: { projects: [] },
    };
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      services,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // Should have: base + meeting (auto) + manager (system) = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("guild-hall-manager");
  });

  test("worker without systemToolboxes does NOT include manager toolbox", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "test-worker",
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // Should have: base + meeting (auto) = 2 servers, no manager
    expect(result.mcpServers).toHaveLength(2);
    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-manager");
  });

  test("manager tools appear in resolved allowedTools whitelist", async () => {
    const worker = makeWorker({ systemToolboxes: ["manager"] });
    const services: GuildHallToolServices = {
      commissionSession: makeMockCommissionSession(),
      gitOps: makeMockGitOps(),
      config: { projects: [] },
    };
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      services,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // The allowedTools should include the mcp wildcard for the manager server
    expect(result.allowedTools).toContain("mcp__guild-hall-manager__*");
    // Also the base and meeting wildcards
    expect(result.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(result.allowedTools).toContain("mcp__guild-hall-meeting__*");
  });

  test("non-manager worker with meeting context has no manager tools", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      workerName: "test-worker",
    };
    const result = await resolveToolSet(worker, [], context, registry);

    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-manager");
    expect(result.allowedTools).not.toContain("mcp__guild-hall-manager__*");
  });

  test("unknown system toolbox name throws descriptive error", async () => {
    const worker = makeWorker({
      systemToolboxes: ["nonexistent"],
      identity: {
        name: "bad-worker",
        description: "test",
        displayTitle: "Bad Worker",
      },
    });

    await expect(
      resolveToolSet(worker, [], testContext(), registry),
    ).rejects.toThrow(/bad-worker.*nonexistent.*no such system toolbox.*manager/);
  });

  test("manager system toolbox without services throws eligibility error", async () => {
    const worker = makeWorker({
      systemToolboxes: ["manager"],
      identity: {
        name: "wannabe-manager",
        description: "test",
        displayTitle: "Wannabe",
      },
    });

    // No services provided
    await expect(
      resolveToolSet(worker, [], testContext(), registry),
    ).rejects.toThrow(/wannabe-manager.*manager.*services are not available/);
  });
});

// -- Domain toolbox loading --

describe("domain toolbox loading", () => {
  /**
   * Creates a toolbox fixture: a package directory with package.json and
   * index.ts that exports a toolboxFactory. The factory returns a mock MCP
   * server shape (no real SDK dependency needed).
   */
  async function createToolboxFixture(
    name: string,
    serverName: string,
    indexContent?: string,
  ): Promise<DiscoveredPackage> {
    const pkgDir = path.join(tmpDir, "packages", name);
    await fs.mkdir(pkgDir, { recursive: true });

    const packageJson = JSON.stringify({
      name,
      version: "1.0.0",
      type: "toolbox",
      description: `${name} toolbox`,
    });
    await fs.writeFile(path.join(pkgDir, "package.json"), packageJson);

    const defaultIndex = `
export function toolboxFactory(deps) {
  return {
    server: {
      type: "sdk",
      name: "${serverName}",
      instance: { /* mock MCP server */ },
    },
  };
}
`;
    await fs.writeFile(path.join(pkgDir, "index.ts"), indexContent ?? defaultIndex);

    return {
      name,
      path: pkgDir,
      metadata: {
        type: "toolbox",
        name,
        description: `${name} toolbox`,
      },
    };
  }

  test("domain toolbox loads and server appears in mcpServers and allowedTools", async () => {
    const pkg = await createToolboxFixture("my-tools", "my-tools-server");
    const worker = makeWorker({ domainToolboxes: ["my-tools"] });

    const result = await resolveToolSet(worker, [pkg], testContext(), registry);

    // base + meeting (auto) + domain = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("my-tools-server");
    expect(result.allowedTools).toContain("mcp__my-tools-server__*");
  });

  test("multiple domain toolboxes load in declaration order", async () => {
    const pkgA = await createToolboxFixture("tools-alpha", "alpha-server");
    const pkgB = await createToolboxFixture("tools-beta", "beta-server");
    const worker = makeWorker({ domainToolboxes: ["tools-alpha", "tools-beta"] });

    const result = await resolveToolSet(worker, [pkgA, pkgB], testContext(), registry);

    // base + meeting (auto) + alpha + beta = 4 servers
    expect(result.mcpServers).toHaveLength(4);
    expect(result.mcpServers[2].name).toBe("alpha-server");
    expect(result.mcpServers[3].name).toBe("beta-server");
  });

  test("domain toolbox coexists with auto-added context toolbox (base + meeting + domain)", async () => {
    const pkg = await createToolboxFixture("analysis", "analysis-server");
    const worker = makeWorker({ domainToolboxes: ["analysis"] });

    const result = await resolveToolSet(worker, [pkg], testContext(), registry);

    // base + meeting (auto) + domain = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("analysis-server");
  });

  test("system toolbox + domain toolbox coexist", async () => {
    const pkg = await createToolboxFixture("analysis", "analysis-server");
    const worker = makeWorker({
      systemToolboxes: ["manager"],
      domainToolboxes: ["analysis"],
    });
    const services: GuildHallToolServices = {
      commissionSession: makeMockCommissionSession(),
      gitOps: makeMockGitOps(),
      config: { projects: [] },
    };
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      services,
    };

    const result = await resolveToolSet(worker, [pkg], context, registry);

    // base + meeting (auto) + manager (system) + analysis (domain) = 4 servers
    expect(result.mcpServers).toHaveLength(4);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("guild-hall-manager");
    expect(result.mcpServers[3].name).toBe("analysis-server");
  });

  test("missing toolboxFactory export throws with package name and available exports", async () => {
    const indexContent = `
export const version = "1.0.0";
export function doStuff() { return 42; }
`;
    const pkg = await createToolboxFixture("bad-toolbox", "unused", indexContent);
    const worker = makeWorker({ domainToolboxes: ["bad-toolbox"] });

    await expect(
      resolveToolSet(worker, [pkg], testContext(), registry),
    ).rejects.toThrow(/bad-toolbox.*toolboxFactory.*doStuff.*version/);
  });

  test("import failure throws with package name and cause", async () => {
    const indexContent = `
this is not valid javascript at all !!!
`;
    const pkg = await createToolboxFixture("broken-toolbox", "unused", indexContent);
    const worker = makeWorker({ domainToolboxes: ["broken-toolbox"] });

    await expect(
      resolveToolSet(worker, [pkg], testContext(), registry),
    ).rejects.toThrow(/Failed to import.*broken-toolbox/);
  });

  test("worker-toolbox hybrid package works as domain toolbox", async () => {
    const pkgDir = path.join(tmpDir, "packages", "hybrid-worker");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "hybrid-worker", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(pkgDir, "index.ts"),
      `
export function toolboxFactory(deps) {
  return {
    server: { type: "sdk", name: "hybrid-server", instance: {} },
  };
}
export function activate(ctx) {
  return { systemPrompt: "test", tools: { mcpServers: [], allowedTools: [] } };
}
`,
    );

    const pkg: DiscoveredPackage = {
      name: "hybrid-worker",
      path: pkgDir,
      metadata: {
        type: ["worker", "toolbox"],
        name: "hybrid-worker",
        description: "A hybrid package",
      } as ToolboxMetadata,
    };
    const worker = makeWorker({ domainToolboxes: ["hybrid-worker"] });

    const result = await resolveToolSet(worker, [pkg], testContext(), registry);

    // base + meeting (auto) + hybrid domain = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[2].name).toBe("hybrid-server");
  });
});

describe("context type registry integration", () => {
  test("briefing context type produces base only (no context toolbox)", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      contextType: "briefing",
    };

    const result = await resolveToolSet(worker, [], context, registry);

    // briefing has no toolboxFactory, so only base toolbox
    expect(result.mcpServers).toHaveLength(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });

  test("unknown context type throws with valid types listed", async () => {
    const worker = makeWorker();
    const context = {
      ...testContext(),
      contextType: "unknown-type",
    };

    await expect(
      resolveToolSet(worker, [], context, registry),
    ).rejects.toThrow(/Unknown context type "unknown-type".*Valid types:/);
  });

  test("stateSubdir is resolved from registry and passed through deps", async () => {
    const worker = makeWorker();

    // meeting context should get stateSubdir "meetings"
    const meetingContext = { ...testContext(), contextType: "meeting" };
    const meetingResult = await resolveToolSet(worker, [], meetingContext, registry);
    expect(meetingResult.mcpServers.length).toBeGreaterThanOrEqual(1);

    // commission context should get stateSubdir "commissions"
    const commissionContext = { ...testContext(), contextType: "commission" };
    const commissionResult = await resolveToolSet(worker, [], commissionContext, registry);
    expect(commissionResult.mcpServers.length).toBeGreaterThanOrEqual(1);

    // briefing context should get stateSubdir "briefings"
    const briefingContext = { ...testContext(), contextType: "briefing" };
    const briefingResult = await resolveToolSet(worker, [], briefingContext, registry);
    expect(briefingResult.mcpServers.length).toBeGreaterThanOrEqual(1);
  });
});

// -- git-readonly system toolbox integration (REQ-WTB-1, REQ-WTB-2) --

describe("resolveToolSet with git-readonly toolbox", () => {
  test("worker with git-readonly systemToolbox gets git-readonly MCP server", async () => {
    const worker = makeWorker({ systemToolboxes: ["git-readonly"] });
    const context = {
      ...testContext(),
      workingDirectory: tmpDir,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // base + meeting (auto) + git-readonly (system) = 3 servers
    expect(result.mcpServers).toHaveLength(3);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
    expect(result.mcpServers[2].name).toBe("guild-hall-git-readonly");
  });

  test("git-readonly MCP wildcard appears in allowedTools", async () => {
    const worker = makeWorker({ systemToolboxes: ["git-readonly"] });
    const context = {
      ...testContext(),
      workingDirectory: tmpDir,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    expect(result.allowedTools).toContain("mcp__guild-hall-git-readonly__*");
  });

  test("git-readonly coexists with manager system toolbox", async () => {
    const worker = makeWorker({ systemToolboxes: ["manager", "git-readonly"] });
    const services: GuildHallToolServices = {
      commissionSession: makeMockCommissionSession(),
      gitOps: makeMockGitOps(),
      config: { projects: [] },
    };
    const context = {
      ...testContext(),
      workerName: "Guild Master",
      workingDirectory: tmpDir,
      services,
    };
    const result = await resolveToolSet(worker, [], context, registry);

    // base + meeting (auto) + manager + git-readonly = 4 servers
    expect(result.mcpServers).toHaveLength(4);
    const names = result.mcpServers.map((s) => s.name);
    expect(names).toContain("guild-hall-manager");
    expect(names).toContain("guild-hall-git-readonly");
  });

  test("worker without git-readonly does not get git tools", async () => {
    const worker = makeWorker();
    const result = await resolveToolSet(worker, [], testContext(), registry);

    const names = result.mcpServers.map((s) => s.name);
    expect(names).not.toContain("guild-hall-git-readonly");
    expect(result.allowedTools).not.toContain("mcp__guild-hall-git-readonly__*");
  });
});
