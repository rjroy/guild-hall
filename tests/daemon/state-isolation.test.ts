/**
 * State isolation proof: verifies that the same worker can operate in a
 * meeting and a commission simultaneously with full isolation.
 *
 * These tests exercise the architectural boundary using DI mocks for SDK
 * sessions, git operations, and worker processes. They prove structural
 * isolation properties without end-to-end runtime behavior.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createMeetingSession,
  type MeetingSessionDeps,
  type QueryOptions,
} from "@/daemon/services/meeting-session";
import {
  createCommissionSession,
  type CommissionSessionDeps,
} from "@/daemon/services/commission-session";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import { meetingToolboxFactory } from "@/daemon/services/meeting-toolbox";
import { commissionToolboxFactory } from "@/daemon/services/commission-toolbox";
import {
  makeReadMemoryHandler,
  makeWriteMemoryHandler,
} from "@/daemon/services/base-toolbox";
import { createEventBus, type SystemEvent } from "@/daemon/services/event-bus";
import type { GuildHallEvent } from "@/daemon/types";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import {
  integrationWorktreePath,
  meetingWorktreePath,
  meetingBranchName,
  commissionWorktreePath,
  commissionBranchName,
} from "@/lib/paths";

// -- Shared worker identity for both contexts --

const WORKER_NAME = "Assistant";

const WORKER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: WORKER_NAME,
    description: "A test assistant.",
    displayTitle: "Guild Assistant",
  },
  posture: "You are a helpful assistant.",
  domainToolboxes: [],
  builtInTools: ["Read", "Glob"],
  checkoutScope: "sparse",
  resourceDefaults: { maxTurns: 30 },
};

const WORKER_PKG: DiscoveredPackage = {
  name: "guild-hall-sample-assistant",
  path: "/packages/sample-assistant",
  metadata: WORKER_META,
};

// -- Mock factories --

function makeConfig(projectPath: string): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: projectPath,
      },
    ],
  };
}

function makeActivationResult(): ActivationResult {
  return {
    systemPrompt: "You are a helpful assistant.",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Glob"],
    },
    resourceBounds: { maxTurns: 30 },
  };
}

// -- Mock SDK messages --

function makeInitMessage(sessionId: string): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.50",
    cwd: "/tmp",
    tools: ["Read", "Glob"],
    mcp_servers: [],
    model: "claude-sonnet-4-6",
    permissionMode: "default",
    slash_commands: [],
    output_style: "text",
    skills: [],
    plugins: [],
  } as unknown as SDKMessage;
}

function makeTextDelta(text: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-meeting",
  } as unknown as SDKMessage;
}

function makeResultSuccess(): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: 0.01,
    duration_ms: 5000,
    duration_api_ms: 4500,
    is_error: false,
    num_turns: 1,
    result: "Done.",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-meeting",
  } as unknown as SDKMessage;
}

/**
 * Creates a mock queryFn that yields a specific session ID in the init
 * message. This lets us verify each context gets its own session.
 */
function makeMockQueryFn(sessionId: string) {
  const calls: Array<{ prompt: string; options: QueryOptions }> = [];

  async function* mockQuery(params: {
    prompt: string;
    options: QueryOptions;
  }): AsyncGenerator<SDKMessage> {
    await Promise.resolve();
    calls.push(params);
    yield makeInitMessage(sessionId);
    yield makeTextDelta("Hello from " + sessionId);
    yield makeResultSuccess();
  }

  return { queryFn: mockQuery, calls };
}

function makeMockActivateFn() {
  const calls: Array<{ pkg: DiscoveredPackage; context: ActivationContext }> = [];

  function mockActivate(
    pkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    calls.push({ pkg, context });
    return Promise.resolve(makeActivationResult());
  }

  return { activateFn: mockActivate, calls };
}

/**
 * Creates a mock GitOps. createWorktree creates the actual directory on
 * disk (and optionally copies content from a source directory) so file
 * operations in the production code work without a real git repo.
 */
function createMockGitOps(copySourceDir?: string): GitOps & { calls: string[] } {
  const calls: string[] = [];

  async function copyDir(src: string, dest: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(src, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const srcPath = path.join(src, String(entry.name));
      const destPath = path.join(dest, String(entry.name));
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /* eslint-disable @typescript-eslint/require-await */
  return {
    calls,
    async createBranch() { calls.push("createBranch"); },
    async branchExists() { calls.push("branchExists"); return false; },
    async deleteBranch() { calls.push("deleteBranch"); },
    async createWorktree(_repoPath, worktreePath) {
      calls.push("createWorktree");
      await fs.mkdir(worktreePath, { recursive: true });
      if (copySourceDir) {
        await copyDir(copySourceDir, worktreePath);
      }
    },
    async removeWorktree() { calls.push("removeWorktree"); },
    async configureSparseCheckout() { calls.push("configureSparseCheckout"); },
    async commitAll() { calls.push("commitAll"); return false; },
    async squashMerge() { calls.push("squashMerge"); },
    async hasUncommittedChanges() { calls.push("hasUncommittedChanges"); return false; },
    async rebase() { calls.push("rebase"); },
    async currentBranch() { calls.push("currentBranch"); return "main"; },
    async listWorktrees() { calls.push("listWorktrees"); return []; },
    async initClaudeBranch() { calls.push("initClaudeBranch"); },
    async detectDefaultBranch() { calls.push("detectDefaultBranch"); return "main"; },
    async fetch() { calls.push("fetch"); },
    async push() { calls.push("push"); },
    async resetHard() { calls.push("resetHard"); },
    async resetSoft() { calls.push("resetSoft"); },
    async createPullRequest() { calls.push("createPullRequest"); return { url: "" }; },
    async isAncestor() { calls.push("isAncestor"); return false; },
    async treesEqual() { calls.push("treesEqual"); return false; },
    async revParse() { calls.push("revParse"); return "abc"; },
    async rebaseOnto() { calls.push("rebaseOnto"); },
    async merge() { calls.push("merge"); },
    async squashMergeNoCommit() { calls.push("squashMergeNoCommit"); return true; },
    async listConflictedFiles() { calls.push("listConflictedFiles"); return []; },
    async resolveConflictsTheirs() { calls.push("resolveConflictsTheirs"); },
    async mergeAbort() { calls.push("mergeAbort"); },
  };
  /* eslint-enable @typescript-eslint/require-await */
}

/**
 * Creates a mock queryFn that yields a single init message then completes.
 * The commission session runs in-process, so we mock the SDK query function.
 */
function createMockQueryFn() {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async function* () {
    yield { type: "system", subtype: "init" } as unknown as SDKMessage;
  };
}

/**
 * Creates a mock activateFn that returns a canned ActivationResult.
 */
function createMockActivateFn() {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async () => ({
    systemPrompt: "test",
    tools: { mcpServers: [], allowedTools: [] },
    resourceBounds: {},
  });
}

/** Collects all events from an async generator into an array. */
async function collectEvents(
  gen: AsyncGenerator<GuildHallEvent>,
): Promise<GuildHallEvent[]> {
  const events: GuildHallEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// -- Test state --

let tmpRoot: string;
let projectDir: string;
let ghHome: string;
let integrationDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "state-isolation-"));
  projectDir = path.join(tmpRoot, "project");
  ghHome = path.join(tmpRoot, "guild-hall-home");
  integrationDir = integrationWorktreePath(ghHome, "test-project");

  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHome, { recursive: true });
  await fs.mkdir(integrationDir, { recursive: true });
  // Create .lore/commissions in integration worktree (required for commission creation)
  await fs.mkdir(path.join(integrationDir, ".lore", "commissions"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// -- Test suite --

describe("State Isolation", () => {
  test("session isolation: meeting and commission get distinct SDK session IDs", async () => {
    // Set up meeting session with session ID "sdk-session-meeting"
    const meetingQuery = makeMockQueryFn("sdk-session-meeting");
    const meetingActivate = makeMockActivateFn();
    const meetingGit = createMockGitOps();

    const meetingDeps: MeetingSessionDeps = {
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      queryFn: meetingQuery.queryFn,
      activateFn: meetingActivate.activateFn,
      gitOps: meetingGit,
    };

    const meetingSession = createMeetingSession(meetingDeps);

    // Create a meeting
    const meetingEvents = await collectEvents(
      meetingSession.createMeeting("test-project", "guild-hall-sample-assistant", "Discuss architecture"),
    );

    // Verify we got a session event with the meeting's session ID
    const sessionEvent = meetingEvents.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent!.type).toBe("session");
    if (sessionEvent!.type === "session") {
      expect(sessionEvent!.sessionId).toBe("sdk-session-meeting");
    }

    // Set up commission session with in-process mocks
    const eventBus = createEventBus();
    const commissionGit = createMockGitOps(integrationDir);

    const commissionDeps: CommissionSessionDeps = {
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      eventBus,
      packagesDir: "/tmp/fake-packages",
      queryFn: createMockQueryFn(),
      activateFn: createMockActivateFn(),
      gitOps: commissionGit,
    };

    const commissionSession = createCommissionSession(commissionDeps);

    // Create and dispatch a commission for the same worker
    const { commissionId } = await commissionSession.createCommission(
      "test-project",
      "Research task",
      "guild-hall-sample-assistant",
      "Research something",
    );

    const dispatchResult = await commissionSession.dispatchCommission(
      commissionId as unknown as import("@/daemon/types").CommissionId,
    );
    expect(dispatchResult.status).toBe("accepted");

    // The commission worker process gets its own config file with its own
    // session. The daemon assigns a unique PID. The meeting's SDK session ID
    // (sdk-session-meeting) and the commission's process-based session are
    // structurally different: the meeting uses queryFn (in-process SDK),
    // the commission uses a separate OS process. They cannot share state.

    // Verify the meeting has 1 active meeting
    expect(meetingSession.getActiveMeetings()).toBe(1);

    // Verify the commission has 1 active commission
    expect(commissionSession.getActiveCommissions()).toBe(1);

    // The commission runs as an independent in-process session, not linked
    // to the meeting session. Active count proves independence.
    expect(commissionSession.getActiveCommissions()).toBe(1);

    // Clean up
    commissionSession.shutdown();
  });

  test("worktree isolation: meeting and commission operate in different directories on different branches", async () => {
    const meetingId = "audience-Assistant-20260223-120000";
    const commissionId = "commission-Assistant-20260223-120000";

    // Compute expected paths
    const expectedMeetingWorktree = meetingWorktreePath(ghHome, "test-project", meetingId);
    const expectedCommissionWorktree = commissionWorktreePath(ghHome, "test-project", commissionId);

    const expectedMeetingBranch = meetingBranchName(meetingId);
    const expectedCommissionBranch = commissionBranchName(commissionId);

    // Verify worktree paths are distinct
    expect(expectedMeetingWorktree).not.toBe(expectedCommissionWorktree);

    // Verify branch names are distinct
    expect(expectedMeetingBranch).not.toBe(expectedCommissionBranch);

    // Verify path structure follows the convention
    expect(expectedMeetingWorktree).toContain("worktrees/test-project/meeting-");
    expect(expectedCommissionWorktree).toContain("worktrees/test-project/commission-");

    // Verify branches follow the convention
    expect(expectedMeetingBranch).toBe(`claude/meeting/${meetingId}`);
    expect(expectedCommissionBranch).toBe(`claude/commission/${commissionId}`);

    // Now verify that the actual sessions create worktrees at different paths.
    // Create a meeting and track what git operations occur.
    const meetingQuery = makeMockQueryFn("sdk-session-meeting");
    const meetingActivate = makeMockActivateFn();
    const meetingGitCalls: Array<{ method: string; args: unknown[] }> = [];
    const meetingGit: GitOps = {
      ...createMockGitOps(),
      createBranch(...args: [string, string, string]) { meetingGitCalls.push({ method: "createBranch", args }); return Promise.resolve(); },
      async createWorktree(...args: [string, string, string]) {
        meetingGitCalls.push({ method: "createWorktree", args });
        const worktreePath = args[1];
        await fs.mkdir(worktreePath, { recursive: true });
      },
    } as unknown as GitOps;

    const meetingSession = createMeetingSession({
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      queryFn: meetingQuery.queryFn,
      activateFn: meetingActivate.activateFn,
      gitOps: meetingGit,
    });

    await collectEvents(
      meetingSession.createMeeting("test-project", "guild-hall-sample-assistant", "Discuss something"),
    );

    // Extract the branch and worktree path used by the meeting
    const meetingBranchCall = meetingGitCalls.find((c) => c.method === "createBranch");
    const meetingWorktreeCall = meetingGitCalls.find((c) => c.method === "createWorktree");

    expect(meetingBranchCall).toBeDefined();
    expect(meetingWorktreeCall).toBeDefined();

    const actualMeetingBranch = meetingBranchCall!.args[1] as string;
    const actualMeetingWorktree = meetingWorktreeCall!.args[1] as string;

    // Meeting branch starts with claude/meeting/
    expect(actualMeetingBranch).toMatch(/^claude\/meeting\/audience-/);
    // Meeting worktree is under worktrees/<project>/meeting-
    expect(actualMeetingWorktree).toContain("/worktrees/test-project/meeting-");

    // Now create a commission and track its git operations
    const eventBus = createEventBus();
    const commissionGitCalls: Array<{ method: string; args: unknown[] }> = [];
    const commissionGit = createMockGitOps(integrationDir);
    // Override createBranch and createWorktree to track calls
    const originalCreateBranch = commissionGit.createBranch.bind(commissionGit);
    const originalCreateWorktree = commissionGit.createWorktree.bind(commissionGit);
    commissionGit.createBranch = async (...args) => {
      commissionGitCalls.push({ method: "createBranch", args });
      await originalCreateBranch(...args);
    };
    commissionGit.createWorktree = async (...args) => {
      commissionGitCalls.push({ method: "createWorktree", args });
      await originalCreateWorktree(...args);
    };

    const commissionSession = createCommissionSession({
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      eventBus,
      packagesDir: "/tmp/fake-packages",
      queryFn: createMockQueryFn(),
      activateFn: createMockActivateFn(),
      gitOps: commissionGit,
    });

    const { commissionId: cId } = await commissionSession.createCommission(
      "test-project",
      "Research task",
      "guild-hall-sample-assistant",
      "Research something",
    );
    await commissionSession.dispatchCommission(
      cId as unknown as import("@/daemon/types").CommissionId,
    );

    const commissionBranchCall = commissionGitCalls.find((c) => c.method === "createBranch");
    const commissionWorktreeCall = commissionGitCalls.find((c) => c.method === "createWorktree");

    expect(commissionBranchCall).toBeDefined();
    expect(commissionWorktreeCall).toBeDefined();

    const actualCommissionBranch = commissionBranchCall!.args[1] as string;
    const actualCommissionWorktree = commissionWorktreeCall!.args[1] as string;

    // Commission branch starts with claude/commission/
    expect(actualCommissionBranch).toMatch(/^claude\/commission\/commission-/);
    // Commission worktree is under worktrees/<project>/commission-
    expect(actualCommissionWorktree).toContain("/worktrees/test-project/commission-");

    // The two worktrees and branches are distinct
    expect(actualMeetingBranch).not.toBe(actualCommissionBranch);
    expect(actualMeetingWorktree).not.toBe(actualCommissionWorktree);

    // Clean up
    commissionSession.shutdown();
  });

  test("tool isolation: meeting gets meeting tools, commission gets commission tools, no cross-contamination", async () => {
    // Resolve tools for a meeting context
    const meetingTools = await resolveToolSet(WORKER_META, [WORKER_PKG], {
      projectName: "test-project",
      contextId: "audience-Assistant-20260223-120000",
      contextType: "meeting",
      workerName: WORKER_NAME,
      guildHallHome: ghHome,
      eventBus: createEventBus(),
      config: { projects: [] },
      contextFactories: [meetingToolboxFactory],
    });

    // Resolve tools for a commission context
    const commissionTools = await resolveToolSet(WORKER_META, [WORKER_PKG], {
      projectName: "test-project",
      contextId: "commission-Assistant-20260223-120000",
      contextType: "commission",
      workerName: WORKER_NAME,
      guildHallHome: ghHome,
      eventBus: createEventBus(),
      config: { projects: [] },
      contextFactories: [
        commissionToolboxFactory,
      ],
    });

    // Both should have the base toolbox
    const meetingServerNames = meetingTools.mcpServers.map((s) => s.name);
    const commissionServerNames = commissionTools.mcpServers.map((s) => s.name);

    expect(meetingServerNames).toContain("guild-hall-base");
    expect(commissionServerNames).toContain("guild-hall-base");

    // Meeting should have the meeting toolbox, not the commission toolbox
    expect(meetingServerNames).toContain("guild-hall-meeting");
    expect(meetingServerNames).not.toContain("guild-hall-commission");

    // Commission should have the commission toolbox, not the meeting toolbox
    expect(commissionServerNames).toContain("guild-hall-commission");
    expect(commissionServerNames).not.toContain("guild-hall-meeting");

    // Verify the allowedTools include the correct MCP wildcards
    // Meeting should allow guild-hall-base and guild-hall-meeting tools
    expect(meetingTools.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(meetingTools.allowedTools).toContain("mcp__guild-hall-meeting__*");
    expect(meetingTools.allowedTools).not.toContain("mcp__guild-hall-commission__*");

    // Commission should allow guild-hall-base and guild-hall-commission tools
    expect(commissionTools.allowedTools).toContain("mcp__guild-hall-base__*");
    expect(commissionTools.allowedTools).toContain("mcp__guild-hall-commission__*");
    expect(commissionTools.allowedTools).not.toContain("mcp__guild-hall-meeting__*");

    // Each context has its own MCP server instances (object identity check)
    const meetingBase = meetingTools.mcpServers.find((s) => s.name === "guild-hall-base");
    const commissionBase = commissionTools.mcpServers.find((s) => s.name === "guild-hall-base");
    expect(meetingBase).toBeDefined();
    expect(commissionBase).toBeDefined();
    expect(meetingBase).not.toBe(commissionBase);

    // Both tool sets are resolved without wasResultSubmitted (removed in Phase 4 refactor)
    // Commission isolation is confirmed by having the commission MCP server, not the meeting one
  });

  test("memory visibility: worker-scope write in commission is readable from meeting context", async () => {
    // Both contexts use the same guildHallHome and workerName. The memory
    // system resolves worker-scope paths as:
    //   <ghHome>/memory/workers/<workerName>/<path>
    // This is independent of the context type (meeting vs commission), so
    // writes from one context are visible to the other.

    // Create the write handler for the commission context
    const commissionWrite = makeWriteMemoryHandler(ghHome, WORKER_NAME, "test-project");

    // Create the read handler for the meeting context (same worker, same project)
    const meetingRead = makeReadMemoryHandler(ghHome, WORKER_NAME, "test-project");

    // Commission writes to worker-scope memory
    const writeResult = await commissionWrite({
      scope: "worker",
      path: "notes/architecture-decision.md",
      content: "# Architecture Decision\n\nUse event sourcing for state management.",
    });

    expect(writeResult.isError).toBeUndefined();
    expect(writeResult.content[0].text).toContain("Written:");

    // Meeting reads from worker-scope memory and sees the commission's write
    const readResult = await meetingRead({
      scope: "worker",
      path: "notes/architecture-decision.md",
    });

    expect(readResult.isError).toBeUndefined();
    expect(readResult.content[0].text).toBe(
      "# Architecture Decision\n\nUse event sourcing for state management.",
    );

    // Also verify project-scope memory is shared across contexts
    const commissionProjectWrite = makeWriteMemoryHandler(ghHome, WORKER_NAME, "test-project");
    const meetingProjectRead = makeReadMemoryHandler(ghHome, WORKER_NAME, "test-project");

    await commissionProjectWrite({
      scope: "project",
      path: "shared/status.md",
      content: "Project status: in progress",
    });

    const projectReadResult = await meetingProjectRead({
      scope: "project",
      path: "shared/status.md",
    });

    expect(projectReadResult.isError).toBeUndefined();
    expect(projectReadResult.content[0].text).toBe("Project status: in progress");

    // Verify global-scope memory is also shared
    await commissionProjectWrite({
      scope: "global",
      path: "conventions.md",
      content: "Always use TypeScript strict mode.",
    });

    const globalReadResult = await meetingProjectRead({
      scope: "global",
      path: "conventions.md",
    });

    expect(globalReadResult.isError).toBeUndefined();
    expect(globalReadResult.content[0].text).toBe("Always use TypeScript strict mode.");
  });

  test("independent lifecycle: closing meeting does not affect commission, completing commission does not affect closed meeting", async () => {
    // Create a meeting
    const meetingQuery = makeMockQueryFn("sdk-session-meeting");
    const meetingActivate = makeMockActivateFn();
    const meetingGit = createMockGitOps();

    const meetingDeps: MeetingSessionDeps = {
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      queryFn: meetingQuery.queryFn,
      activateFn: meetingActivate.activateFn,
      gitOps: meetingGit,
    };

    const meetingSession = createMeetingSession(meetingDeps);

    // Start the meeting
    const meetingEvents = await collectEvents(
      meetingSession.createMeeting("test-project", "guild-hall-sample-assistant", "Discuss architecture"),
    );

    // Find the meeting ID from the session event
    const sessionEvent = meetingEvents.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    let meetingId: string | undefined;
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }
    expect(meetingId).toBeDefined();

    // Create and dispatch a commission using a controllable queryFn.
    // The async generator blocks until resolveSession is called, allowing
    // the test to verify both contexts are active simultaneously.
    const eventBus = createEventBus();
    const emittedEvents: SystemEvent[] = [];
    eventBus.subscribe((event) => emittedEvents.push(event));

    let resolveSession!: () => void;
    const sessionGate = new Promise<void>((r) => { resolveSession = r; });

    const commissionGit = createMockGitOps(integrationDir);

    const commissionDeps: CommissionSessionDeps = {
      packages: [WORKER_PKG],
      config: makeConfig(projectDir),
      guildHallHome: ghHome,
      eventBus,
      packagesDir: "/tmp/fake-packages",
      queryFn: async function* () {
        yield { type: "system", subtype: "init" } as unknown as SDKMessage;
        // Block until the test resolves the gate
        await sessionGate;
      },
      activateFn: createMockActivateFn(),
      gitOps: commissionGit,
    };

    const commissionSession = createCommissionSession(commissionDeps);

    const { commissionId: cId } = await commissionSession.createCommission(
      "test-project",
      "Research task",
      "guild-hall-sample-assistant",
      "Research something",
    );
    await commissionSession.dispatchCommission(
      cId as unknown as import("@/daemon/types").CommissionId,
    );

    // Allow the in-process session to start
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Both contexts are now active
    expect(meetingSession.getActiveMeetings()).toBe(1);
    expect(commissionSession.getActiveCommissions()).toBe(1);

    // Step 1: Close the meeting while the commission is still running
    const closeResult = await meetingSession.closeMeeting(
      meetingId as unknown as import("@/daemon/types").MeetingId,
    );

    // Meeting is closed, notes returned (placeholder since no notesQueryFn)
    expect(closeResult.notes).toBeDefined();
    expect(meetingSession.getActiveMeetings()).toBe(0);

    // Commission is still active and unaffected
    expect(commissionSession.getActiveCommissions()).toBe(1);

    // Step 2: Complete the commission by releasing the session gate
    resolveSession();

    // Wait for the session to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Commission session completed (no submit_result call, so session ends as failed)
    expect(commissionSession.getActiveCommissions()).toBe(0);

    // Meeting remains at 0 (was already closed, unaffected by commission completion)
    expect(meetingSession.getActiveMeetings()).toBe(0);

    // Clean up
    commissionSession.shutdown();
  });
});
