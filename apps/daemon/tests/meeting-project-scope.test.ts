/**
 * Tests for project-scoped meetings (REQ-PSM-1 through REQ-PSM-18).
 *
 * Project-scoped meetings operate directly in the integration worktree
 * instead of creating an isolated activity worktree. The Guild Master
 * is the first worker to use this scope.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createMeetingSession,
  type MeetingSessionDeps,
} from "@/apps/daemon/services/meeting/orchestrator";
import type { SdkQueryOptions } from "@/apps/daemon/lib/agent-sdk/sdk-runner";
import type { GuildHallEvent } from "@/apps/daemon/types";
import { asMeetingId } from "@/apps/daemon/types";
import { MeetingRegistry } from "@/apps/daemon/services/meeting/registry";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import type { GitOps } from "@/apps/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import { createManagerPackage } from "@/apps/daemon/services/manager/worker";

// -- Test fixtures --

/** Activity-scoped worker (no meetingScope, defaults to "activity") */
const WORKER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "Assistant",
    description: "A test assistant.",
    displayTitle: "Guild Assistant",
  },
  posture: "You are a helpful assistant.",
  domainToolboxes: [],
  builtInTools: ["Read", "Glob"],
  checkoutScope: "sparse",
};

const WORKER_PKG: DiscoveredPackage = {
  name: "test-assistant",
  path: "/packages/sample-assistant",
  metadata: WORKER_META,
};

/** Project-scoped worker (meetingScope: "project"), mirrors Guild Master */
const MANAGER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "Guild Master",
    description: "Coordination specialist.",
    displayTitle: "Guild Master",
  },
  posture: "You are the Guild Master.",
  systemToolboxes: ["manager"],
  domainToolboxes: [],
  builtInTools: ["Read", "Glob", "Grep"],
  checkoutScope: "full",
  meetingScope: "project",
};

const MANAGER_PKG: DiscoveredPackage = {
  name: "guild-hall-manager",
  path: "",
  metadata: MANAGER_META,
};

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: "", // Filled in by test setup
        meetingCap: 5,
      },
    ],
    ...overrides,
  };
}

function makeActivationResult(): ActivationResult {
  return {
    systemPrompt: "You are a helpful assistant.",
    sessionContext: "",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Glob"],
      builtInTools: [],
    },
  };
}

// -- Mock SDK messages --

function makeInitMessage(sessionId = "sdk-session-123"): SDKMessage {
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
    session_id: "sdk-session-123",
  } as unknown as SDKMessage;
}

function makeResultSuccess(cost = 0.01): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: cost,
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
    session_id: "sdk-session-123",
  } as unknown as SDKMessage;
}

// -- Mock factories --

function makeMockQueryFn(
  messages: SDKMessage[] = [
    makeInitMessage(),
    makeTextDelta("Hello"),
    makeResultSuccess(),
  ],
) {
  const calls: Array<{ prompt: string; options: SdkQueryOptions }> = [];

  async function* mockQuery(params: {
    prompt: string;
    options: SdkQueryOptions;
  }): AsyncGenerator<SDKMessage> {
    await Promise.resolve();
    calls.push(params);
    for (const msg of messages) {
      yield msg;
    }
  }

  return { queryFn: mockQuery, calls };
}

function makeMockActivateFn(result?: ActivationResult) {
  const calls: Array<{ pkg: DiscoveredPackage; context: ActivationContext }> = [];

  function mockActivate(
    pkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    calls.push({ pkg, context });
    return Promise.resolve(result ?? makeActivationResult());
  }

  return { activateFn: mockActivate, calls };
}

function createMockGitOps(): GitOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createBranch: () => { calls.push("createBranch"); return Promise.resolve(); },
    branchExists: () => { calls.push("branchExists"); return Promise.resolve(false); },
    deleteBranch: () => { calls.push("deleteBranch"); return Promise.resolve(); },
    createWorktree: async (_repoPath, worktreePath) => {
      calls.push("createWorktree");
      await fs.mkdir(worktreePath, { recursive: true });
    },
    removeWorktree: () => { calls.push("removeWorktree"); return Promise.resolve(); },
    configureSparseCheckout: () => { calls.push("configureSparseCheckout"); return Promise.resolve(); },
    commitAll: () => { calls.push("commitAll"); return Promise.resolve(false); },
    squashMerge: () => { calls.push("squashMerge"); return Promise.resolve(); },
    hasUncommittedChanges: () => { calls.push("hasUncommittedChanges"); return Promise.resolve(false); },
    rebase: () => { calls.push("rebase"); return Promise.resolve(); },
    currentBranch: () => { calls.push("currentBranch"); return Promise.resolve("main"); },
    listWorktrees: () => { calls.push("listWorktrees"); return Promise.resolve([]); },
    initClaudeBranch: () => { calls.push("initClaudeBranch"); return Promise.resolve(); },
    detectDefaultBranch: () => { calls.push("detectDefaultBranch"); return Promise.resolve("main"); },
    fetch: () => { calls.push("fetch"); return Promise.resolve(); },
    push: () => { calls.push("push"); return Promise.resolve(); },
    resetHard: () => { calls.push("resetHard"); return Promise.resolve(); },
    resetSoft: () => { calls.push("resetSoft"); return Promise.resolve(); },
    createPullRequest: () => { calls.push("createPullRequest"); return Promise.resolve({ url: "" }); },
    isAncestor: () => { calls.push("isAncestor"); return Promise.resolve(false); },
    treesEqual: () => { calls.push("treesEqual"); return Promise.resolve(false); },
    revParse: () => { calls.push("revParse"); return Promise.resolve("abc"); },
    rebaseOnto: () => { calls.push("rebaseOnto"); return Promise.resolve(); },
    merge: async () => {},
    squashMergeNoCommit: () => { calls.push("squashMergeNoCommit"); return Promise.resolve(true); },
    listConflictedFiles: () => { calls.push("listConflictedFiles"); return Promise.resolve([]); },
    resolveConflictsTheirs: () => { calls.push("resolveConflictsTheirs"); return Promise.resolve(); },
    mergeAbort: () => { calls.push("mergeAbort"); return Promise.resolve(); },
    hasCommitsBeyond: () => { calls.push("hasCommitsBeyond"); return Promise.resolve(false); },
    lorePendingChanges: () => { calls.push("lorePendingChanges"); return Promise.resolve({ hasPendingChanges: false, fileCount: 0 }); },
    commitLore: () => { calls.push("commitLore"); return Promise.resolve({ committed: false }); },
  };
}

// -- Helpers --

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
let ghHomeDir: string;
let integrationDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-psm-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");
  integrationDir = integrationWorktreePath(ghHomeDir, "test-project");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHomeDir, { recursive: true });
  await fs.mkdir(integrationDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<MeetingSessionDeps> = {}): MeetingSessionDeps {
  const config = makeConfig();
  config.projects[0].path = projectDir;

  const mock = makeMockQueryFn();
  const activateMock = makeMockActivateFn();
  const mockGit = createMockGitOps();

  return {
    packages: [WORKER_PKG, MANAGER_PKG],
    config,
    guildHallHome: ghHomeDir,
    queryFn: mock.queryFn,
    activateFn: activateMock.activateFn,
    gitOps: mockGit,
    ...overrides,
  };
}

// -- Tests --

describe("Project-Scoped Meetings", () => {
  // Scenario 1: Scope resolution
  describe("scope resolution", () => {
    test("Guild Master resolves to project scope", () => {
      const pkg = createManagerPackage();
      const meta = pkg.metadata as WorkerMetadata;
      expect(meta.meetingScope).toBe("project");
    });

    test("worker without meetingScope defaults to activity scope", () => {
      expect(WORKER_META.meetingScope).toBeUndefined();
    });

    test("worker with explicit meetingScope: 'activity' resolves to activity", () => {
      const meta: WorkerMetadata = { ...WORKER_META, meetingScope: "activity" };
      expect(meta.meetingScope).toBe("activity");
    });

    test("createMeeting with Guild Master sets scope to project on the entry", async () => {
      const mockGit = createMockGitOps();
      const activateMock = makeMockActivateFn();
      const mock = makeMockQueryFn();
      const registry = new MeetingRegistry();

      const session = createMeetingSession({
        ...makeDeps({ gitOps: mockGit, activateFn: activateMock.activateFn, queryFn: mock.queryFn, registry }),
      });

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      expect(meetings[0].scope).toBe("project");
    });

    test("createMeeting with regular worker sets scope to activity on the entry", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "test-assistant", "Hello"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      expect(meetings[0].scope).toBe("activity");
    });
  });

  // Scenario 2: Project-scoped creation
  describe("project-scoped creation (createMeeting)", () => {
    test("no branch or worktree created for project scope", async () => {
      const mockGit = createMockGitOps();
      const session = createMeetingSession(makeDeps({ gitOps: mockGit }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // No workspace provisioning calls
      expect(mockGit.calls).not.toContain("createBranch");
      expect(mockGit.calls).not.toContain("createWorktree");
    });

    test("worktreeDir equals integration path, branchName is empty", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings[0].worktreeDir).toBe(integrationDir);
      expect(meetings[0].branchName).toBe("");
    });

    test("artifact written once to integration worktree", async () => {
      const session = createMeetingSession(makeDeps());

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      expect(files).toHaveLength(1);

      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain("status: open");
      expect(content).toContain("worker: Guild Master");
    });

    test("SDK session receives integration path as workspaceDir", async () => {
      // buildMeetingPrepSpec sets workspaceDir = meeting.worktreeDir.
      // Verify via registry that worktreeDir is the integration path,
      // which confirms the SDK session would receive the correct workspaceDir.
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      // workspaceDir in SessionPrepSpec is set from meeting.worktreeDir
      expect(meetings[0].worktreeDir).toBe(integrationDir);
    });

    test("state file includes scope: project", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      const meetingId = meetings[0].meetingId as string;

      const stateFile = path.join(ghHomeDir, "state", "meetings", `${meetingId}.json`);
      const state = JSON.parse(await fs.readFile(stateFile, "utf-8"));
      expect(state.scope).toBe("project");
      expect(state.branchName).toBe("");
      expect(state.worktreeDir).toBe(integrationDir);
    });
  });

  // Scenario 3: Project-scoped close
  describe("project-scoped close", () => {
    test("no squash-merge or worktree removal, commitAll called on integration path", async () => {
      const mockGit = createMockGitOps();
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ gitOps: mockGit, registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // Reset git call tracking from creation
      mockGit.calls.length = 0;

      const meetings = registry.listForProject("test-project");
      const meetingId = meetings[0].meetingId;

      await session.closeMeeting(meetingId);

      // commitAll should be called (direct commit to integration worktree)
      expect(mockGit.calls).toContain("commitAll");
      // No squash-merge or worktree removal
      expect(mockGit.calls).not.toContain("squashMerge");
      expect(mockGit.calls).not.toContain("squashMergeNoCommit");
      expect(mockGit.calls).not.toContain("removeWorktree");
    });

    test("state file deleted after close", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      const meetingId = meetings[0].meetingId;

      // Verify state file exists before close
      const stateFile = path.join(ghHomeDir, "state", "meetings", `${meetingId as string}.json`);
      const exists = await fs.access(stateFile).then(() => true, () => false);
      expect(exists).toBe(true);

      await session.closeMeeting(meetingId);

      // State file should be gone
      const existsAfter = await fs.access(stateFile).then(() => true, () => false);
      expect(existsAfter).toBe(false);
    });

    test("meeting deregistered after close", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      const meetingId = meetings[0].meetingId;

      await session.closeMeeting(meetingId);

      expect(registry.listForProject("test-project")).toHaveLength(0);
    });

    test("meeting_ended event emitted on close", async () => {
      const emittedEvents: Array<{ type: string }> = [];
      const eventBus = {
        emit: (event: { type: string }) => { emittedEvents.push(event); },
        subscribe: () => () => {},
      };
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ eventBus, registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      const meetingId = meetings[0].meetingId;

      // Clear events from creation
      emittedEvents.length = 0;

      await session.closeMeeting(meetingId);

      expect(emittedEvents.some(e => e.type === "meeting_ended")).toBe(true);
    });
  });

  // Scenario 4: Live visibility
  describe("live visibility", () => {
    test("meeting workspaceDir is the integration path, sees live content", async () => {
      const activateMock = makeMockActivateFn();
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({
        activateFn: activateMock.activateFn,
        registry,
      }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // The integration worktree is the meeting's workspace
      const meetings = registry.listForProject("test-project");
      expect(meetings[0].worktreeDir).toBe(integrationDir);

      // Simulate a commission merge by writing a file to the integration worktree
      const commissionFile = path.join(integrationDir, ".lore", "commissions", "test-commission.md");
      await fs.mkdir(path.dirname(commissionFile), { recursive: true });
      await fs.writeFile(commissionFile, "# Commission Result\n\nDone.", "utf-8");

      // The file should be visible at the meeting's worktreeDir
      const content = await fs.readFile(
        path.join(meetings[0].worktreeDir, ".lore", "commissions", "test-commission.md"),
        "utf-8",
      );
      expect(content).toContain("Commission Result");
    });
  });

  // Scenario 5: Failed creation cleanup
  describe("failed creation cleanup", () => {
    test("deregisters but does not remove integration worktree", async () => {
      const mockGit = createMockGitOps();
      const registry = new MeetingRegistry();

      // Make the state directory a file so writeStateFile (inside
      // setupTranscriptAndState) throws, triggering cleanupFailedEntry
      // in the project-scope creation path.
      await fs.mkdir(path.join(ghHomeDir, "state"), { recursive: true });
      await fs.writeFile(path.join(ghHomeDir, "state", "meetings"), "not a directory");

      const session = createMeetingSession(makeDeps({
        gitOps: mockGit,
        registry,
      }));

      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // Should have an error event from the failed setup
      expect(events.some(e => e.type === "error")).toBe(true);

      // Meeting should be deregistered after cleanup
      expect(registry.listForProject("test-project")).toHaveLength(0);

      // No worktree removal attempted (project scope cleanup is deregister-only)
      expect(mockGit.calls).not.toContain("removeWorktree");

      // Integration worktree still exists
      const exists = await fs.access(integrationDir).then(() => true, () => false);
      expect(exists).toBe(true);
    });
  });

  // Scenario 6: Recovery with project-scoped state file
  describe("recovery", () => {
    test("project-scoped meeting re-registered without worktree existence check", async () => {
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });

      const meetingId = "audience-Guild-Master-20260304-120000";
      const state = {
        meetingId,
        projectName: "test-project",
        workerName: "Guild Master",
        packageName: "guild-hall-manager",
        sdkSessionId: null,
        worktreeDir: integrationDir,
        branchName: "",
        status: "open",
        scope: "project",
      };
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify(state, null, 2),
        "utf-8",
      );

      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(1);
      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      expect(meetings[0].scope).toBe("project");
      expect(meetings[0].worktreeDir).toBe(integrationDir);
      expect(meetings[0].branchName).toBe("");
      expect(meetings[0].sdkSessionId).toBeNull();
    });

    test("project-scoped recovery does not check worktree existence", async () => {
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });

      // Point worktreeDir to a path that doesn't exist. For project scope,
      // this should still recover (no fs.access check).
      const nonExistentPath = path.join(tmpRoot, "does-not-exist");
      const meetingId = "audience-Guild-Master-20260304-120001";
      const state = {
        meetingId,
        projectName: "test-project",
        workerName: "Guild Master",
        packageName: "guild-hall-manager",
        sdkSessionId: null,
        worktreeDir: nonExistentPath,
        branchName: "",
        status: "open",
        scope: "project",
      };
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify(state, null, 2),
        "utf-8",
      );

      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      const recovered = await session.recoverMeetings();

      // Should recover even though worktreeDir doesn't exist on disk
      expect(recovered).toBe(1);
    });
  });

  // Scenario 7: Backward compatibility
  describe("backward compatibility", () => {
    test("state files without scope field treated as activity-scoped", async () => {
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });

      // Create a worktree directory so the activity scope recovery doesn't
      // close it as stale
      const worktreeDir = path.join(tmpRoot, "old-worktree");
      await fs.mkdir(worktreeDir, { recursive: true });

      const meetingId = "audience-Assistant-20260304-110000";
      const state = {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "test-assistant",
        sdkSessionId: null,
        worktreeDir,
        branchName: "claude/meeting/" + meetingId,
        status: "open",
        // No scope field (pre-existing state file)
      };
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify(state, null, 2),
        "utf-8",
      );

      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(1);
      const meetings = registry.listForProject("test-project");
      expect(meetings[0].scope).toBe("activity");
    });
  });

  // Scenario 8: Concurrent close
  describe("concurrent close", () => {
    test("two project-scoped meetings close successfully", async () => {
      const registry = new MeetingRegistry();
      const mockGit = createMockGitOps();
      // Need two separate meeting IDs. Create two meetings sequentially.
      const session = createMeetingSession(makeDeps({ registry, gitOps: mockGit }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan A"),
      );
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan B"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(2);
      expect(meetings[0].scope).toBe("project");
      expect(meetings[1].scope).toBe("project");

      // Close both concurrently
      const [result1, result2] = await Promise.all([
        session.closeMeeting(meetings[0].meetingId),
        session.closeMeeting(meetings[1].meetingId),
      ]);

      // Both should succeed
      expect(result1.notes).toBeDefined();
      expect(result2.notes).toBeDefined();

      // Both should be deregistered
      expect(registry.listForProject("test-project")).toHaveLength(0);
    });
  });

  // Scenario 9: Mixed scope
  describe("mixed scope", () => {
    test("project and activity scoped meetings coexist and count toward cap", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      // Create one project-scoped meeting (Guild Master)
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // Create one activity-scoped meeting (regular worker)
      await collectEvents(
        session.createMeeting("test-project", "test-assistant", "Help with code"),
      );

      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(2);

      // Verify different scopes
      const projectMeeting = meetings.find(m => m.scope === "project");
      const activityMeeting = meetings.find(m => m.scope === "activity");
      expect(projectMeeting).toBeDefined();
      expect(activityMeeting).toBeDefined();

      // Project meeting uses integration path
      expect(projectMeeting!.worktreeDir).toBe(integrationDir);
      expect(projectMeeting!.branchName).toBe("");

      // Activity meeting has its own worktree and branch
      expect(activityMeeting!.worktreeDir).not.toBe(integrationDir);
      expect(activityMeeting!.branchName).not.toBe("");
    });

    test("cap enforcement counts both scopes equally", async () => {
      const config = makeConfig();
      config.projects[0].path = projectDir;
      config.projects[0].meetingCap = 2;

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const registry = new MeetingRegistry();

      const session = createMeetingSession({
        packages: [WORKER_PKG, MANAGER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
        registry,
      });

      // Fill to cap: one project, one activity
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan"),
      );
      await collectEvents(
        session.createMeeting("test-project", "test-assistant", "Help"),
      );

      expect(registry.countForProject("test-project")).toBe(2);

      // Third meeting should fail (cap reached)
      const events = await collectEvents(
        session.createMeeting("test-project", "test-assistant", "More help"),
      );
      expect(events.some(e => e.type === "error" && "reason" in e && (e as { reason: string }).reason.includes("cap reached"))).toBe(true);
    });
  });

  // Scenario 10: Toolbox test
  describe("toolbox behavior", () => {
    test("meeting artifact accessible at integration worktreeDir", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      // Get meetingId from registry (session events may not fire if SDK prep fails)
      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      const meetingId = meetings[0].meetingId as string;

      // Verify the artifact is at the integration worktree (not an activity worktree)
      const artifactPath = path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`);
      const exists = await fs.access(artifactPath).then(() => true, () => false);
      expect(exists).toBe(true);

      // Simulate what link_artifact / summarize_progress would do:
      // write to the meeting artifact using the worktreeDir
      const content = await fs.readFile(artifactPath, "utf-8");
      expect(content).toContain("status: open");
    });

    test("propose_followup writes to integration worktree naturally", async () => {
      const registry = new MeetingRegistry();
      const session = createMeetingSession(makeDeps({ registry }));

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Plan work"),
      );

      const meetings = registry.listForProject("test-project");
      const worktreeDir = meetings[0].worktreeDir;

      // Simulate a tool writing to the worktreeDir (which is the integration path)
      const followupPath = path.join(worktreeDir, ".lore", "meetings", "followup-test.md");
      await fs.writeFile(followupPath, "# Follow-up\n\nSuggested next meeting.", "utf-8");

      // File should be at the integration worktree
      const content = await fs.readFile(
        path.join(integrationDir, ".lore", "meetings", "followup-test.md"),
        "utf-8",
      );
      expect(content).toContain("Follow-up");
    });
  });

  // Additional: acceptMeetingRequest with project scope
  describe("project-scoped acceptMeetingRequest", () => {
    test("accepts request without provisioning workspace", async () => {
      const mockGit = createMockGitOps();
      const registry = new MeetingRegistry();

      // First create a meeting request artifact on the integration worktree
      const meetingId = asMeetingId("audience-Guild-Master-20260304-130000");
      const artifactDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(artifactDir, { recursive: true });

      const artifactContent = [
        "---",
        'title: "Audience with Guild Master"',
        "status: requested",
        "tags: [meeting]",
        "worker: Guild Master",
        'workerDisplayTitle: "Guild Master"',
        'agenda: "Discuss strategy"',
        'deferred_until: ""',
        "---",
        "",
        "## Log",
        "",
        "- requested: Meeting requested",
        "",
      ].join("\n");
      await fs.writeFile(
        path.join(artifactDir, `${meetingId as string}.md`),
        artifactContent,
        "utf-8",
      );

      const session = createMeetingSession(makeDeps({ gitOps: mockGit, registry }));

      await collectEvents(
        session.acceptMeetingRequest(meetingId, "test-project", "Let's go"),
      );

      // No workspace provisioning calls
      expect(mockGit.calls).not.toContain("createBranch");
      expect(mockGit.calls).not.toContain("createWorktree");

      // Entry should be project-scoped with correct paths
      const meetings = registry.listForProject("test-project");
      expect(meetings).toHaveLength(1);
      expect(meetings[0].scope).toBe("project");
      expect(meetings[0].worktreeDir).toBe(integrationDir);
      expect(meetings[0].branchName).toBe("");
    });
  });

  // Additional: serialization includes scope
  describe("state serialization", () => {
    test("activity-scoped meetings have scope: activity in state file", async () => {
      const session = createMeetingSession(makeDeps());

      const events = await collectEvents(
        session.createMeeting("test-project", "test-assistant", "Hello"),
      );

      const sessionEvent = events.find((e) => e.type === "session");
      let meetingId = "";
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const stateFile = path.join(ghHomeDir, "state", "meetings", `${meetingId}.json`);
      const state = JSON.parse(await fs.readFile(stateFile, "utf-8"));
      expect(state.scope).toBe("activity");
    });
  });
});
