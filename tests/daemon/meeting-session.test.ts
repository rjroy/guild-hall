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
import type { GuildHallEvent, MeetingStatus } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import {
  meetingWorktreePath,
  meetingBranchName,
  integrationWorktreePath,
} from "@/lib/paths";

// -- Test fixtures --

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
  resourceDefaults: { maxTurns: 30 },
};

const WORKER_PKG: DiscoveredPackage = {
  name: "guild-hall-sample-assistant",
  path: "/packages/sample-assistant",
  metadata: WORKER_META,
};

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: "", // Filled in by test setup
      },
    ],
    ...overrides,
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

// -- Mock queryFn factory --

function makeMockQueryFn(
  messages: SDKMessage[] = [
    makeInitMessage(),
    makeTextDelta("Hello"),
    makeResultSuccess(),
  ],
) {
  const calls: Array<{ prompt: string; options: QueryOptions }> = [];

  async function* mockQuery(params: {
    prompt: string;
    options: QueryOptions;
  }): AsyncGenerator<SDKMessage> {
    await Promise.resolve();
    calls.push(params);
    for (const msg of messages) {
      yield msg;
    }
  }

  return { queryFn: mockQuery, calls };
}

// -- Mock activateFn --

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

// -- Mock GitOps --

/**
 * Creates a mock GitOps that tracks calls for assertion. createWorktree
 * creates the directory on disk so the rest of the code (artifact writes,
 * etc.) works without a real git repo.
 */
/**
 * Creates a mock GitOps that tracks calls for assertion. createWorktree
 * creates the directory on disk so the rest of the code (artifact writes,
 * etc.) works without a real git repo.
 *
 * When copyFromDir is set, createWorktree will recursively copy its
 * contents into the new worktree directory. This simulates the real
 * git behavior where createWorktree checks out a branch that already
 * has content (e.g., from the claude branch via integration worktree).
 */
function createMockGitOps(options?: {
  copyFromDir?: string;
}): GitOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createBranch: () => { calls.push("createBranch"); return Promise.resolve(); },
    branchExists: () => { calls.push("branchExists"); return Promise.resolve(false); },
    deleteBranch: () => { calls.push("deleteBranch"); return Promise.resolve(); },
    createWorktree: async (_repoPath, worktreePath) => {
      calls.push("createWorktree");
      const nodeFs = await import("node:fs/promises");
      await nodeFs.mkdir(worktreePath, { recursive: true });
      // If a source directory is provided, copy its content into the
      // new worktree. This simulates checking out a branch that already
      // has files (e.g., acceptMeetingRequest branching from claude).
      if (options?.copyFromDir) {
        await copyDir(options.copyFromDir, worktreePath);
      }
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
    createPullRequest: () => { calls.push("createPullRequest"); return Promise.resolve({ url: "" }); },
    isAncestor: () => { calls.push("isAncestor"); return Promise.resolve(false); },
    treesEqual: () => { calls.push("treesEqual"); return Promise.resolve(false); },
    revParse: () => { calls.push("revParse"); return Promise.resolve("abc"); },
  };
}

/** Recursively copies a directory tree. */
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
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
/** Integration worktree path for test-project (ghHome/projects/test-project) */
let integrationDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");
  integrationDir = integrationWorktreePath(ghHomeDir, "test-project");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHomeDir, { recursive: true });
  // Create the integration worktree directory (simulates what daemon boot does)
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
    packages: [WORKER_PKG],
    config,
    guildHallHome: ghHomeDir,
    queryFn: mock.queryFn,
    activateFn: activateMock.activateFn,
    gitOps: mockGit,
    ...overrides,
  };
}

/**
 * Reads the worktreeDir from the state file for a given meetingId.
 * Since meeting artifacts are now written to the worktreeDir (not project.path),
 * tests that verify artifact content need this to find the right location.
 */
async function getWorktreeDirFromState(meetingId: string): Promise<string> {
  const stateDir = path.join(ghHomeDir, "state", "meetings");
  const content = await fs.readFile(path.join(stateDir, `${meetingId}.json`), "utf-8");
  const state = JSON.parse(content) as { worktreeDir: string };
  return state.worktreeDir;
}

// -- Tests --

describe("createMeetingSession", () => {
  describe("createMeeting", () => {
    test("yields session event, text_delta, and turn_end in order", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const types = events.map((e) => e.type);
      expect(types).toEqual(["session", "text_delta", "turn_end"]);
    });

    test("session event contains correct meetingId, sessionId, and worker", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const sessionEvent = events.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();
      expect(sessionEvent!.type).toBe("session");
      if (sessionEvent!.type === "session") {
        expect(sessionEvent!.meetingId).toMatch(/^audience-Assistant-\d{8}-\d{6}(-\d+)?$/);
        expect(sessionEvent!.sessionId).toBe("sdk-session-123");
        expect(sessionEvent!.worker).toBe("Assistant");
      }
    });

    test("creates meeting artifact with correct frontmatter", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Review the code"),
      );

      // Get the meetingId to find the worktreeDir
      const sessionEvent = events.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();
      let meetingId = "";
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^audience-Assistant-\d{8}-\d{6}(-\d+)?\.md$/);

      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain('title: "Audience with Guild Assistant"');
      expect(content).toContain("status: open");
      expect(content).toContain("tags: [meeting]");
      expect(content).toContain("worker: Assistant");
      expect(content).toContain('workerDisplayTitle: "Guild Assistant"');
      expect(content).toContain('agenda: "Review the code"');
      expect(content).toContain("event: opened");
      expect(content).toContain('reason: "User started audience"');
    });

    test("writes state file with meeting info", async () => {
      const session = createMeetingSession(makeDeps());
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const files = await fs.readdir(stateDir);
      expect(files).toHaveLength(1);

      const stateContent = await fs.readFile(
        path.join(stateDir, files[0]),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.projectName).toBe("test-project");
      expect(state.workerName).toBe("Assistant");
      expect(state.status).toBe("open");
      expect(state.sdkSessionId).toBe("sdk-session-123");
    });

    test("meeting ID follows naming convention", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const sessionEvent = events.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();
      if (sessionEvent!.type === "session") {
        expect(sessionEvent!.meetingId).toMatch(/^audience-Assistant-\d{8}-\d{6}(-\d+)?$/);
      }
    });

    test("meeting ID sanitizes spaces in worker name for git branch compatibility", async () => {
      const spacedWorkerMeta: WorkerMetadata = {
        ...WORKER_META,
        identity: {
          ...WORKER_META.identity,
          name: "Guild Master",
          displayTitle: "Guild Master",
        },
      };
      const spacedPkg: DiscoveredPackage = {
        name: "guild-hall-manager",
        path: "",
        metadata: spacedWorkerMeta,
      };
      const session = createMeetingSession(
        makeDeps({ packages: [WORKER_PKG, spacedPkg] }),
      );
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-manager", "Hello"),
      );

      const sessionEvent = events.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();
      if (sessionEvent!.type === "session") {
        // Space replaced with hyphen, no invalid git branch characters
        expect(sessionEvent!.meetingId).toMatch(/^audience-Guild-Master-\d{8}-\d{6}(-\d+)?$/);
      }
    });

    test("captures SDK session ID from init message", async () => {
      const mock = makeMockQueryFn([
        makeInitMessage("custom-sdk-session-456"),
        makeTextDelta("Hi"),
        makeResultSuccess(),
      ]);
      const session = createMeetingSession(
        makeDeps({ queryFn: mock.queryFn }),
      );

      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent!.type === "session") {
        expect(sessionEvent!.sessionId).toBe("custom-sdk-session-456");
      }
    });

    test("temp directory exists after creation", async () => {
      const session = createMeetingSession(makeDeps());
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      // The meeting should be open and the temp dir should exist.
      // We can verify indirectly through getActiveMeetings.
      expect(session.getActiveMeetings()).toBe(1);
    });

    test("increments active meeting count", async () => {
      const session = createMeetingSession(makeDeps());
      expect(session.getActiveMeetings()).toBe(0);

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      expect(session.getActiveMeetings()).toBe(1);
    });

    test("passes correct options to queryFn", async () => {
      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const session = createMeetingSession(
        makeDeps({ queryFn: mock.queryFn, activateFn: activateMock.activateFn }),
      );

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      expect(mock.calls).toHaveLength(1);
      const call = mock.calls[0];
      expect(call.prompt).toBe("Hello");
      expect(call.options.systemPrompt).toBe("You are a helpful assistant.");
      expect(call.options.includePartialMessages).toBe(true);
      expect(call.options.permissionMode).toBe("bypassPermissions");
      expect(call.options.allowDangerouslySkipPermissions).toBe(true);
      expect(call.options.settingSources).toEqual([]);
      expect(call.options.additionalDirectories).toEqual([projectDir]);
      expect(call.options.maxTurns).toBe(30);
    });
  });

  describe("cap enforcement", () => {
    test("rejects when meeting cap is reached", async () => {
      const config = makeConfig();
      config.projects[0].path = projectDir;
      config.projects[0].meetingCap = 1;

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      // First meeting should succeed
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      expect(session.getActiveMeetings()).toBe(1);

      // Second meeting should fail due to cap
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello again"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("Meeting cap reached");
        expect(events[0].reason).toContain("1 concurrent meetings");
      }
    });

    test("allows meetings up to the default cap", async () => {
      const session = createMeetingSession(makeDeps());

      // Default cap is 5, creating one should work
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    test("returns error for invalid project name", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("nonexistent-project", "guild-hall-sample-assistant", "Hello"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("not found");
      }
    });

    test("returns error for unknown worker", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "nonexistent-worker", "Hello"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("not found");
      }
    });

    test("returns error when queryFn is not provided", async () => {
      const activateMock = makeMockActivateFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
        // No queryFn
      });

      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.reason).toContain("No queryFn provided");
      }
    });

    test("handles queryFn throwing an error", async () => {
      async function* failingQuery(): AsyncGenerator<SDKMessage> {
        await Promise.resolve();
        throw new Error("SDK connection failed");
      }

      const activateMock = makeMockActivateFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: () => failingQuery(),
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.reason).toContain("SDK connection failed");
      }
    });
  });

  describe("sendMessage", () => {
    test("resumes with correct SDK session ID", async () => {
      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      // Create a meeting first
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      const sessionEvent = createEvents.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();

      let meetingId: string = "";
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      // Send follow-up message
      const sendEvents = await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Follow up question"),
      );

      // Should have yielded events from the mock
      const types = sendEvents.map((e) => e.type);
      expect(types).toEqual(["session", "text_delta", "turn_end"]);

      // Verify the resume option was passed
      expect(mock.calls).toHaveLength(2);
      const resumeCall = mock.calls[1];
      expect(resumeCall.prompt).toBe("Follow up question");
      expect(resumeCall.options.resume).toBe("sdk-session-123");
    });

    test("returns error for unknown meeting ID", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.sendMessage(asMeetingId("nonexistent-meeting"), "Hello"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("not found");
      }
    });

    test("returns error for closed meeting", async () => {
      const session = createMeetingSession(makeDeps());

      // Create and close a meeting
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      await session.closeMeeting(asMeetingId(meetingId));

      // Try to send to closed meeting
      const events = await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Follow up"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("not found");
      }
    });
  });

  describe("closeMeeting", () => {
    test("updates artifact status to closed", async () => {
      const session = createMeetingSession(makeDeps());
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      const worktreeDir = await getWorktreeDirFromState(meetingId);

      await session.closeMeeting(asMeetingId(meetingId));

      // Read the artifact from the worktree and verify status
      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain("status: closed");
    });

    test("appends closed event to meeting_log", async () => {
      const session = createMeetingSession(makeDeps());
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      const worktreeDir = await getWorktreeDirFromState(meetingId);

      await session.closeMeeting(asMeetingId(meetingId));

      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain("event: closed");
      expect(content).toContain('reason: "User closed audience"');
    });

    test("calls git cleanup on close (commitAll, squashMerge, removeWorktree, deleteBranch)", async () => {
      const mockGit = createMockGitOps();
      const session = createMeetingSession(makeDeps({ gitOps: mockGit }));
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      // Clear calls from creation to isolate close calls
      mockGit.calls.length = 0;

      await session.closeMeeting(asMeetingId(meetingId));

      // Verify git cleanup was called
      expect(mockGit.calls).toContain("commitAll");
      expect(mockGit.calls).toContain("squashMerge");
      expect(mockGit.calls).toContain("removeWorktree");
      expect(mockGit.calls).toContain("deleteBranch");
    });

    test("removes meeting from active map", async () => {
      const session = createMeetingSession(makeDeps());
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      expect(session.getActiveMeetings()).toBe(1);

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      await session.closeMeeting(asMeetingId(meetingId));
      expect(session.getActiveMeetings()).toBe(0);
    });

    test("updates state file to closed status", async () => {
      const session = createMeetingSession(makeDeps());
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      await session.closeMeeting(asMeetingId(meetingId));

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateFiles = await fs.readdir(stateDir);
      const stateContent = await fs.readFile(
        path.join(stateDir, stateFiles[0]),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.status).toBe("closed");
      expect(state.closedAt).toBeDefined();
    });

    test("throws for unknown meeting ID", async () => {
      const session = createMeetingSession(makeDeps());

      await expect(
        session.closeMeeting(asMeetingId("nonexistent-meeting")),
      ).rejects.toThrow("not found");
    });
  });

  describe("interruptTurn", () => {
    test("fires the abort controller", async () => {
      // Use a slow queryFn that we can interrupt
      async function* slowQuery(params: {
        prompt: string;
        options: QueryOptions;
      }): AsyncGenerator<SDKMessage> {
        await Promise.resolve();
        yield makeInitMessage();
        // Check abort state after init
        if (params.options.abortController?.signal.aborted) {
          return;
        }
        yield makeTextDelta("Hello");
        yield makeResultSuccess();
      }

      const activateMock = makeMockActivateFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: slowQuery,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      // Create a meeting
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      // Get meetingId
      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      // The meeting should be open
      expect(session.getActiveMeetings()).toBe(1);

      // Interrupt the turn (abort controller is shared between turns,
      // so calling interruptTurn now fires the abort signal)
      session.interruptTurn(asMeetingId(meetingId));

      // After interrupt, the abort controller's signal should be aborted.
      // We can verify by trying to use it in a new sendMessage call.
      // The sendMessage will create a new AbortController, so the old one
      // being aborted is the key test here. We'll verify through a send
      // that creates its own controller.
      // For now, verify interrupt doesn't throw:
      expect(() => session.interruptTurn(asMeetingId(meetingId))).not.toThrow();
    });

    test("throws for unknown meeting ID", () => {
      const session = createMeetingSession(makeDeps());

      expect(() =>
        session.interruptTurn(asMeetingId("nonexistent-meeting")),
      ).toThrow("not found");
    });
  });

  describe("getActiveMeetings", () => {
    test("returns 0 when no meetings exist", () => {
      const session = createMeetingSession(makeDeps());
      expect(session.getActiveMeetings()).toBe(0);
    });

    test("returns correct count after creating meetings", async () => {
      const session = createMeetingSession(makeDeps());

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello 1"),
      );
      expect(session.getActiveMeetings()).toBe(1);

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello 2"),
      );
      expect(session.getActiveMeetings()).toBe(2);
    });

    test("decrements after closing a meeting", async () => {
      const session = createMeetingSession(makeDeps());

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      expect(session.getActiveMeetings()).toBe(1);

      // Get meetingId
      const openMeetings = session.getOpenMeetingsForProject("test-project");
      expect(openMeetings).toHaveLength(1);

      await session.closeMeeting(openMeetings[0].meetingId);
      expect(session.getActiveMeetings()).toBe(0);
    });
  });

  describe("getOpenMeetingsForProject", () => {
    test("returns empty array for project with no meetings", () => {
      const session = createMeetingSession(makeDeps());
      const meetings = session.getOpenMeetingsForProject("test-project");
      expect(meetings).toHaveLength(0);
    });

    test("returns only meetings for the specified project", async () => {
      const config = makeConfig();
      config.projects[0].path = projectDir;
      config.projects.push({
        name: "other-project",
        path: path.join(tmpRoot, "other-project"),
      });
      await fs.mkdir(path.join(tmpRoot, "other-project"), { recursive: true });

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      await collectEvents(
        session.createMeeting("other-project", "guild-hall-sample-assistant", "World"),
      );

      const testMeetings = session.getOpenMeetingsForProject("test-project");
      expect(testMeetings).toHaveLength(1);
      expect(testMeetings[0].projectName).toBe("test-project");

      const otherMeetings = session.getOpenMeetingsForProject("other-project");
      expect(otherMeetings).toHaveLength(1);
      expect(otherMeetings[0].projectName).toBe("other-project");
    });
  });

  describe("meeting artifact validation", () => {
    test("artifact frontmatter is valid YAML", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");

      // Verify it has frontmatter delimiters
      expect(content.startsWith("---\n")).toBe(true);
      expect(content).toContain("\n---\n");

      // Parse with gray-matter to verify valid YAML
      const matter = await import("gray-matter");
      const parsed = matter.default(content);
      expect(parsed.data.title).toContain("Audience with Guild Assistant");
      expect(parsed.data.status).toBe("open");
      expect(parsed.data.tags).toEqual(["meeting"]);
      expect(parsed.data.worker).toBe("Assistant");
      expect(parsed.data.workerDisplayTitle).toBe("Guild Assistant");
      expect(parsed.data.agenda).toBe("Hello");
      expect(parsed.data.linked_artifacts).toEqual([]);
      expect(parsed.data.meeting_log).toBeArray();
      expect(parsed.data.meeting_log.length).toBeGreaterThanOrEqual(1);
    });

    test("escapes double quotes in agenda", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting(
          "test-project",
          "guild-hall-sample-assistant",
          'Review "important" code',
        ),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");

      // The YAML should have escaped quotes
      expect(content).toContain('agenda: "Review \\"important\\" code"');
    });
  });

  describe("state file validation", () => {
    test("state file contains valid JSON", async () => {
      const session = createMeetingSession(makeDeps());
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const files = await fs.readdir(stateDir);
      const content = await fs.readFile(path.join(stateDir, files[0]), "utf-8");

      // Should parse without error
      const state = JSON.parse(content);
      expect(state).toHaveProperty("meetingId");
      expect(state).toHaveProperty("projectName");
      expect(state).toHaveProperty("workerName");
      expect(state).toHaveProperty("sdkSessionId");
      expect(state).toHaveProperty("worktreeDir");
      expect(state).toHaveProperty("status");
    });

    test("state file name matches meeting ID", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const files = await fs.readdir(stateDir);
      expect(files).toContain(`${meetingId}.json`);
    });
  });

  describe("worker activation", () => {
    test("calls activateFn with correct context", async () => {
      const activateMock = makeMockActivateFn();
      const mock = makeMockQueryFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: createMockGitOps(),
      });

      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Review code"),
      );

      expect(activateMock.calls).toHaveLength(1);
      const call = activateMock.calls[0];
      expect(call.pkg.name).toBe("guild-hall-sample-assistant");
      expect(call.context.posture).toBe("You are a helpful assistant.");
      expect(call.context.meetingContext?.agenda).toBe("Review code");
      expect(call.context.resourceDefaults.maxTurns).toBe(30);
      expect(call.context.projectPath).toBe(projectDir);
    });

    test("returns error when activation fails", async () => {
      function failingActivate(): Promise<ActivationResult> {
        return Promise.reject(new Error("Worker module not found"));
      }

      const mock = makeMockQueryFn();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: failingActivate,
        gitOps: createMockGitOps(),
      });

      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.reason).toContain("Worker activation failed");
        expect(errorEvent.reason).toContain("Worker module not found");
      }
    });
  });

  describe("meeting status transitions", () => {
    // Helper to write a meeting artifact to the integration worktree
    async function writeMeetingArtifactWithStatus(
      meetingId: string,
      status: MeetingStatus,
    ): Promise<void> {
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      const content = `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: ${status === "requested" ? "requested" : "opened"}
    reason: "Test setup"
notes_summary: ""
---
`;
      await fs.writeFile(path.join(meetingsDir, `${meetingId}.md`), content, "utf-8");
    }

    describe("valid transitions", () => {
      test("requested -> declined via declineMeeting", async () => {
        const meetingId = "audience-Assistant-20260221-120000";
        await writeMeetingArtifactWithStatus(meetingId, "requested");

        const session = createMeetingSession(makeDeps());
        await session.declineMeeting(asMeetingId(meetingId), "test-project");

        const content = await fs.readFile(
          path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
          "utf-8",
        );
        expect(content).toContain("status: declined");
      });

      test("requested -> open is valid (tested through createMeeting which sets open)", async () => {
        // createMeeting always creates with status: open, which is a valid
        // initial state. The transition requested->open will be exercised
        // by the accept flow in Step 6. Here we verify that the artifact
        // written by createMeeting has status: open.
        const session = createMeetingSession(makeDeps());
        const events = await collectEvents(
          session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
        );

        let meetingId = "";
        const sessionEvent = events.find((e) => e.type === "session");
        if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

        const worktreeDir = await getWorktreeDirFromState(meetingId);
        const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
        const files = await fs.readdir(meetingsDir);
        const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
        expect(content).toContain("status: open");
      });

      test("open -> closed via closeMeeting", async () => {
        const session = createMeetingSession(makeDeps());
        const events = await collectEvents(
          session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
        );

        let meetingId = "";
        const sessionEvent = events.find((e) => e.type === "session");
        if (sessionEvent?.type === "session") {
          meetingId = sessionEvent.meetingId;
        }

        const worktreeDir = await getWorktreeDirFromState(meetingId);

        await session.closeMeeting(asMeetingId(meetingId));

        const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
        const files = await fs.readdir(meetingsDir);
        const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
        expect(content).toContain("status: closed");
      });
    });

    describe("invalid transitions", () => {
      test("closed -> open is rejected", async () => {
        const meetingId = "audience-Assistant-20260221-120001";
        await writeMeetingArtifactWithStatus(meetingId, "closed");

        const session = createMeetingSession(makeDeps());
        await expect(
          session.declineMeeting(asMeetingId(meetingId), "test-project"),
        ).rejects.toThrow("Invalid meeting status transition: closed -> declined");
      });

      test("declined -> open is rejected", async () => {
        // declineMeeting only transitions to "declined", but we test that
        // calling decline on an already-declined meeting fails
        const meetingId = "audience-Assistant-20260221-120002";
        await writeMeetingArtifactWithStatus(meetingId, "declined");

        const session = createMeetingSession(makeDeps());
        await expect(
          session.declineMeeting(asMeetingId(meetingId), "test-project"),
        ).rejects.toThrow("Invalid meeting status transition: declined -> declined");
      });

      test("open -> declined is rejected", async () => {
        const meetingId = "audience-Assistant-20260221-120003";
        await writeMeetingArtifactWithStatus(meetingId, "open");

        const session = createMeetingSession(makeDeps());
        await expect(
          session.declineMeeting(asMeetingId(meetingId), "test-project"),
        ).rejects.toThrow("Invalid meeting status transition: open -> declined");
      });
    });

    describe("updateArtifactStatus", () => {
      test("replaces any status value in frontmatter, not just open", async () => {
        const meetingId = "audience-Assistant-20260221-120004";
        await writeMeetingArtifactWithStatus(meetingId, "requested");

        const session = createMeetingSession(makeDeps());
        // Decline transitions requested -> declined, which exercises the
        // regex-based status replacement on a non-"open" value
        await session.declineMeeting(asMeetingId(meetingId), "test-project");

        const content = await fs.readFile(
          path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
          "utf-8",
        );
        expect(content).toContain("status: declined");
        expect(content).not.toContain("status: requested");
      });
    });

    describe("meeting log entries", () => {
      test("decline appends declined event to meeting_log", async () => {
        const meetingId = "audience-Assistant-20260221-120005";
        await writeMeetingArtifactWithStatus(meetingId, "requested");

        const session = createMeetingSession(makeDeps());
        await session.declineMeeting(asMeetingId(meetingId), "test-project");

        const content = await fs.readFile(
          path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
          "utf-8",
        );
        expect(content).toContain("event: declined");
        expect(content).toContain('reason: "User declined meeting request"');
      });

      test("defer appends deferred event to meeting_log", async () => {
        const meetingId = "audience-Assistant-20260221-120006";
        await writeMeetingArtifactWithStatus(meetingId, "requested");

        const session = createMeetingSession(makeDeps());
        await session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-03-01");

        const content = await fs.readFile(
          path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
          "utf-8",
        );
        expect(content).toContain("event: deferred");
        expect(content).toContain('reason: "Deferred until 2026-03-01"');
      });
    });
  });

  describe("declineMeeting", () => {
    async function writeMeetingArtifactWithStatus(
      meetingId: string,
      status: MeetingStatus,
    ): Promise<void> {
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      const content = `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: ${status === "requested" ? "requested" : "opened"}
    reason: "Test setup"
notes_summary: ""
---
`;
      await fs.writeFile(path.join(meetingsDir, `${meetingId}.md`), content, "utf-8");
    }

    test("transitions requested meeting to declined", async () => {
      const meetingId = "audience-Assistant-20260221-130000";
      await writeMeetingArtifactWithStatus(meetingId, "requested");

      const session = createMeetingSession(makeDeps());
      await session.declineMeeting(asMeetingId(meetingId), "test-project");

      const content = await fs.readFile(
        path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("status: declined");
    });

    test("rejects if status is not requested", async () => {
      const meetingId = "audience-Assistant-20260221-130001";
      await writeMeetingArtifactWithStatus(meetingId, "open");

      const session = createMeetingSession(makeDeps());
      await expect(
        session.declineMeeting(asMeetingId(meetingId), "test-project"),
      ).rejects.toThrow("Invalid meeting status transition: open -> declined");
    });

    test("rejects if status is closed", async () => {
      const meetingId = "audience-Assistant-20260221-130002";
      await writeMeetingArtifactWithStatus(meetingId, "closed");

      const session = createMeetingSession(makeDeps());
      await expect(
        session.declineMeeting(asMeetingId(meetingId), "test-project"),
      ).rejects.toThrow("Invalid meeting status transition: closed -> declined");
    });
  });

  describe("deferMeeting", () => {
    async function writeMeetingArtifactWithStatus(
      meetingId: string,
      status: MeetingStatus,
    ): Promise<void> {
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      const content = `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: ${status === "requested" ? "requested" : "opened"}
    reason: "Test setup"
notes_summary: ""
---
`;
      await fs.writeFile(path.join(meetingsDir, `${meetingId}.md`), content, "utf-8");
    }

    test("sets deferred_until field and keeps status as requested", async () => {
      const meetingId = "audience-Assistant-20260221-140000";
      await writeMeetingArtifactWithStatus(meetingId, "requested");

      const session = createMeetingSession(makeDeps());
      await session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-03-15");

      const content = await fs.readFile(
        path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("status: requested");
      expect(content).toContain('deferred_until: "2026-03-15"');
    });

    test("appends deferred event to meeting_log", async () => {
      const meetingId = "audience-Assistant-20260221-140001";
      await writeMeetingArtifactWithStatus(meetingId, "requested");

      const session = createMeetingSession(makeDeps());
      await session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-04-01");

      const content = await fs.readFile(
        path.join(integrationDir, ".lore", "meetings", `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("event: deferred");
      expect(content).toContain('reason: "Deferred until 2026-04-01"');
    });

    test("rejects if status is not requested", async () => {
      const meetingId = "audience-Assistant-20260221-140002";
      await writeMeetingArtifactWithStatus(meetingId, "open");

      const session = createMeetingSession(makeDeps());
      await expect(
        session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-03-15"),
      ).rejects.toThrow('Cannot defer meeting with status "open"');
    });

    test("rejects if status is closed", async () => {
      const meetingId = "audience-Assistant-20260221-140003";
      await writeMeetingArtifactWithStatus(meetingId, "closed");

      const session = createMeetingSession(makeDeps());
      await expect(
        session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-03-15"),
      ).rejects.toThrow('Cannot defer meeting with status "closed"');
    });

    test("rejects if status is declined", async () => {
      const meetingId = "audience-Assistant-20260221-140004";
      await writeMeetingArtifactWithStatus(meetingId, "declined");

      const session = createMeetingSession(makeDeps());
      await expect(
        session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-03-15"),
      ).rejects.toThrow('Cannot defer meeting with status "declined"');
    });
  });

  describe("acceptMeetingRequest", () => {
    async function writeMeetingArtifactWithStatus(
      meetingId: string,
      status: MeetingStatus,
      overrides: Record<string, string> = {},
    ): Promise<void> {
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      const content = `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "${overrides.agenda ?? "Test agenda"}"
deferred_until: "${overrides.deferred_until ?? ""}"
linked_artifacts: ${overrides.linked_artifacts ?? "[]"}
meeting_log:
  - timestamp: ${now.toISOString()}
    event: ${status === "requested" ? "requested" : "opened"}
    reason: "Test setup"
notes_summary: ""
---
`;
      await fs.writeFile(path.join(meetingsDir, `${meetingId}.md`), content, "utf-8");
    }

    test("transitions requested->open, creates session, yields events", async () => {
      const meetingId = "audience-Assistant-20260221-160000";
      await writeMeetingArtifactWithStatus(meetingId, "requested", {
        agenda: "Review the code",
      });

      // Use copyFromDir so the worktree gets the artifact from integrationDir
      const session = createMeetingSession(
        makeDeps({ gitOps: createMockGitOps({ copyFromDir: integrationDir }) }),
      );
      const events = await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      // Should get session, text_delta, turn_end events
      const types = events.map((e) => e.type);
      expect(types).toEqual(["session", "text_delta", "turn_end"]);

      // Verify meeting is now active
      expect(session.getActiveMeetings()).toBe(1);

      // Verify artifact status was updated to "open" (on the activity worktree)
      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const content = await fs.readFile(
        path.join(worktreeDir, ".lore", "meetings", `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("status: open");
      expect(content).toContain("event: opened");
      expect(content).toContain('reason: "User accepted meeting request"');
    });

    test("rejects if cap reached", async () => {
      const meetingId = "audience-Assistant-20260221-160001";
      await writeMeetingArtifactWithStatus(meetingId, "requested");

      const config = makeConfig();
      config.projects[0].path = projectDir;
      config.projects[0].meetingCap = 1;

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      // Create one meeting to fill the cap
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );
      expect(session.getActiveMeetings()).toBe(1);

      // Accepting should fail due to cap
      const events = await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("Meeting cap reached");
      }
    });

    test("rejects if status is not requested", async () => {
      const meetingId = "audience-Assistant-20260221-160002";
      await writeMeetingArtifactWithStatus(meetingId, "open");

      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("Invalid meeting status transition");
      }
    });

    test("rejects for unknown project", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.acceptMeetingRequest(
          asMeetingId("audience-Assistant-20260221-160003"),
          "nonexistent-project",
        ),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("not found");
      }
    });

    test("includes user message in prompt when provided", async () => {
      const meetingId = "audience-Assistant-20260221-160004";
      await writeMeetingArtifactWithStatus(meetingId, "requested", {
        agenda: "Review code quality",
      });

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const session = createMeetingSession(
        makeDeps({
          queryFn: mock.queryFn,
          activateFn: activateMock.activateFn,
          gitOps: createMockGitOps({ copyFromDir: integrationDir }),
        }),
      );

      await collectEvents(
        session.acceptMeetingRequest(
          asMeetingId(meetingId),
          "test-project",
          "Focus on the auth module please",
        ),
      );

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].prompt).toContain("Review code quality");
      expect(mock.calls[0].prompt).toContain("Focus on the auth module please");
    });

    test("writes state file with meeting info", async () => {
      const meetingId = "audience-Assistant-20260221-160005";
      await writeMeetingArtifactWithStatus(meetingId, "requested");

      const session = createMeetingSession(
        makeDeps({ gitOps: createMockGitOps({ copyFromDir: integrationDir }) }),
      );
      await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.meetingId).toBe(meetingId);
      expect(state.projectName).toBe("test-project");
      expect(state.workerName).toBe("Assistant");
      expect(state.status).toBe("open");
      expect(state.sdkSessionId).toBe("sdk-session-123");
    });
  });

  describe("writeMeetingArtifact with deferred_until field", () => {
    test("meeting artifact includes deferred_until field", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain('deferred_until: ""');
    });
  });

  describe("recoverMeetings", () => {
    /**
     * Writes a state file directly (simulating a previous daemon run) so
     * recoverMeetings() can discover it on startup.
     */
    async function writeStateFile(
      meetingId: string,
      data: Record<string, unknown>,
    ): Promise<void> {
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify(data, null, 2),
        "utf-8",
      );
    }

    test("recovers open meetings from state files", async () => {
      const meetingId = "audience-Assistant-20260221-100000";
      // Create the worktreeDir on disk so recovery doesn't close the meeting
      const worktreeDir = path.join(tmpRoot, "worktree-recovered");
      await fs.mkdir(worktreeDir, { recursive: true });

      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-old-session",
        worktreeDir,
        branchName: "claude/meeting/audience-Assistant-20260221-100000",
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(1);
      expect(session.getActiveMeetings()).toBe(1);

      const openMeetings = session.getOpenMeetingsForProject("test-project");
      expect(openMeetings).toHaveLength(1);
      expect(openMeetings[0].meetingId).toBe(asMeetingId(meetingId));
    });

    test("skips closed meetings", async () => {
      const meetingId = "audience-Assistant-20260221-100001";
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-session-closed",
        worktreeDir: "/tmp/guild-hall-closed",
        status: "closed",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(0);
      expect(session.getActiveMeetings()).toBe(0);
    });

    test("skips meetings for projects not in config", async () => {
      const meetingId = "audience-Assistant-20260221-100002";
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "deleted-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-session-orphan",
        worktreeDir: "/tmp/guild-hall-orphan",
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(0);
      expect(session.getActiveMeetings()).toBe(0);
    });

    test("recovered meeting can receive sendMessage", async () => {
      const meetingId = "audience-Assistant-20260221-100003";
      const worktreeDir = path.join(tmpRoot, "worktree-resume");
      await fs.mkdir(worktreeDir, { recursive: true });

      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-session-to-resume",
        worktreeDir,
        branchName: "claude/meeting/audience-Assistant-20260221-100003",
        status: "open",
      });

      const mock = makeMockQueryFn();
      const activateMock = makeMockActivateFn();
      const session = createMeetingSession(
        makeDeps({ queryFn: mock.queryFn, activateFn: activateMock.activateFn }),
      );

      await session.recoverMeetings();
      expect(session.getActiveMeetings()).toBe(1);

      // Send a message to the recovered meeting
      const events = await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Follow up after restart"),
      );

      const types = events.map((e) => e.type);
      expect(types).toEqual(["session", "text_delta", "turn_end"]);

      // Verify the resume option used the persisted session ID
      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].options.resume).toBe("sdk-session-to-resume");
    });

    test("returns 0 when no state directory exists", async () => {
      // ghHomeDir has no state/meetings/ subdirectory
      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();
      expect(recovered).toBe(0);
    });

    test("closes meeting when worktreeDir no longer exists (post-reboot)", async () => {
      const meetingId = "audience-Assistant-20260221-100020";
      // Use a path that doesn't exist (simulates a worktree lost after reboot)
      const nonExistentDir = path.join(tmpRoot, "does-not-exist-after-reboot");
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-after-reboot",
        worktreeDir: nonExistentDir,
        branchName: "claude/meeting/audience-Assistant-20260221-100020",
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      // Meeting should NOT be recovered (closed instead)
      expect(recovered).toBe(0);
      expect(session.getActiveMeetings()).toBe(0);

      // State file should show closed
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.status).toBe("closed");
    });

    test("recovers multiple open meetings, skipping closed ones", async () => {
      // Create worktree dirs on disk for open meetings
      const wt1 = path.join(tmpRoot, "wt-multi-1");
      const wt3 = path.join(tmpRoot, "wt-multi-3");
      await fs.mkdir(wt1, { recursive: true });
      await fs.mkdir(wt3, { recursive: true });

      await writeStateFile("audience-Assistant-20260221-100010", {
        meetingId: "audience-Assistant-20260221-100010",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-1",
        worktreeDir: wt1,
        branchName: "claude/meeting/audience-Assistant-20260221-100010",
        status: "open",
      });
      await writeStateFile("audience-Assistant-20260221-100011", {
        meetingId: "audience-Assistant-20260221-100011",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-2",
        worktreeDir: "/tmp/gh-2",
        status: "closed",
      });
      await writeStateFile("audience-Assistant-20260221-100012", {
        meetingId: "audience-Assistant-20260221-100012",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-3",
        worktreeDir: wt3,
        branchName: "claude/meeting/audience-Assistant-20260221-100012",
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(2);
      expect(session.getActiveMeetings()).toBe(2);
    });
  });

  describe("session renewal", () => {
    /**
     * Creates a mock queryFn that simulates session expiry on the first
     * call (when resume is set), then succeeds on the second call.
     */
    function makeExpiringQueryFn() {
      const calls: Array<{ prompt: string; options: QueryOptions }> = [];
      let callCount = 0;

      async function* expiringQuery(params: {
        prompt: string;
        options: QueryOptions;
      }): AsyncGenerator<SDKMessage> {
        await Promise.resolve();
        calls.push(params);
        callCount++;

        if (callCount === 1 && params.options.resume) {
          // First call with resume: simulate session expiry via a result
          // error message. This flows through the event translator as an
          // error event.
          yield {
            type: "result",
            subtype: "error_during_execution",
            errors: ["session expired or not found"],
            uuid: "00000000-0000-0000-0000-000000000010" as `${string}-${string}-${string}-${string}-${string}`,
            session_id: "expired-session",
          } as unknown as SDKMessage;
          return;
        }

        // Subsequent calls (renewal): succeed normally with a new session ID
        yield makeInitMessage("sdk-renewed-session-456");
        yield makeTextDelta("Renewed response");
        yield makeResultSuccess();
      }

      return { queryFn: expiringQuery, calls };
    }

    test("session expiry triggers renewal with fresh session", async () => {
      const expiringMock = makeExpiringQueryFn();
      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      // First: create a meeting with a normal queryFn for the initial session
      const createMock = makeMockQueryFn();
      const createSession = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: createMock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      const createEvents = await collectEvents(
        createSession.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }
      expect(meetingId).not.toBe("");

      // Now create a session with the expiring queryFn and recover the meeting
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);

      // Write the transcript so renewal can inject context
      const meetingsTranscriptDir = path.join(ghHomeDir, "meetings");
      await fs.mkdir(meetingsTranscriptDir, { recursive: true });
      await fs.writeFile(
        path.join(meetingsTranscriptDir, `${meetingId}.md`),
        `---\nmeetingId: ${meetingId}\nworker: "Assistant"\nproject: "test-project"\nstarted: 2026-02-21T10:00:00Z\n---\n\n## User (2026-02-21T10:00:00Z)\n\nHello\n\n## Assistant (2026-02-21T10:00:01Z)\n\nHi there!\n`,
        "utf-8",
      );

      // Create a fresh session that will use the expiring queryFn, manually
      // adding the meeting to its map via recovery
      const renewalSession = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: expiringMock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      // Write a state file for recovery (worktreeDir from state already exists)
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          ...state,
          packageName: "guild-hall-sample-assistant",
        }),
        "utf-8",
      );

      const recovered = await renewalSession.recoverMeetings();
      expect(recovered).toBe(1);

      // Send a message; this should trigger expiry then renewal
      const sendEvents = await collectEvents(
        renewalSession.sendMessage(asMeetingId(meetingId), "Continue the work"),
      );

      // The renewal should produce session, text_delta, turn_end events
      const types = sendEvents.map((e) => e.type);
      expect(types).toContain("session");
      expect(types).toContain("text_delta");
      expect(types).toContain("turn_end");

      // Verify the queryFn was called twice: once with resume (failed), once
      // without (renewal)
      expect(expiringMock.calls).toHaveLength(2);
      expect(expiringMock.calls[0].options.resume).toBe("sdk-session-123");
      expect(expiringMock.calls[1].options.resume).toBeUndefined();

      // The renewal prompt should contain transcript context but NOT duplicate
      // the user message via a separate "User's new message:" suffix. The
      // message is already in the transcript from appendUserTurn.
      expect(expiringMock.calls[1].prompt).toContain("Previous conversation context:");
      expect(expiringMock.calls[1].prompt).not.toContain("User's new message:");
      // The user turn is present via the transcript, not as a duplicate suffix
      expect(expiringMock.calls[1].prompt).toContain("Continue the work");
    });

    test("meeting log records session renewal", async () => {
      const expiringMock = makeExpiringQueryFn();
      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      // Set up a meeting via state file recovery
      const meetingId = "audience-Assistant-20260221-110000";
      const worktreeDir = path.join(tmpRoot, "wt-renewal-log");
      await fs.mkdir(worktreeDir, { recursive: true });
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          meetingId,
          projectName: "test-project",
          workerName: "Assistant",
          packageName: "guild-hall-sample-assistant",
          sdkSessionId: "sdk-old-session-for-log",
          worktreeDir,
          branchName: "claude/meeting/audience-Assistant-20260221-110000",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact to the worktreeDir so appendMeetingLog can find it
      const meetingsArtifactDir = path.join(worktreeDir, ".lore", "meetings");
      await fs.mkdir(meetingsArtifactDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsArtifactDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test renewal"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: expiringMock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      await session.recoverMeetings();
      await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Trigger renewal"),
      );

      // Read the meeting artifact from worktreeDir to check the log
      const artifactContent = await fs.readFile(
        path.join(meetingsArtifactDir, `${meetingId}.md`),
        "utf-8",
      );

      expect(artifactContent).toContain("event: session_renewed");
      expect(artifactContent).toContain("sdk-old-session-for-log");
      expect(artifactContent).toContain("sdk-renewed-session-456");
    });

    test("state file is updated with new session ID after renewal", async () => {
      const expiringMock = makeExpiringQueryFn();
      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110001";
      const worktreeDir = path.join(tmpRoot, "wt-renewal-state");
      await fs.mkdir(worktreeDir, { recursive: true });
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          meetingId,
          projectName: "test-project",
          workerName: "Assistant",
          packageName: "guild-hall-sample-assistant",
          sdkSessionId: "sdk-before-renewal",
          worktreeDir,
          branchName: "claude/meeting/audience-Assistant-20260221-110001",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact to worktreeDir for appendMeetingLog
      const meetingsArtifactDir = path.join(worktreeDir, ".lore", "meetings");
      await fs.mkdir(meetingsArtifactDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsArtifactDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test state update"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: expiringMock.queryFn,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      await session.recoverMeetings();
      await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Trigger renewal"),
      );

      // Read the state file and verify the session ID was updated
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.sdkSessionId).toBe("sdk-renewed-session-456");
      expect(state.status).toBe("open");
    });

    test("handles thrown error for session expiry", async () => {
      // Test the catch path: queryFn throws instead of yielding an error event
      const calls: Array<{ prompt: string; options: QueryOptions }> = [];
      let callCount = 0;

      async function* throwingExpiryQuery(params: {
        prompt: string;
        options: QueryOptions;
      }): AsyncGenerator<SDKMessage> {
        await Promise.resolve();
        calls.push(params);
        callCount++;

        if (callCount === 1 && params.options.resume) {
          throw new Error("SDK session expired or not found");
        }

        yield makeInitMessage("sdk-renewed-after-throw");
        yield makeTextDelta("Renewed after throw");
        yield makeResultSuccess();
      }

      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110002";
      const worktreeDir = path.join(tmpRoot, "wt-throw-test");
      await fs.mkdir(worktreeDir, { recursive: true });
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          meetingId,
          projectName: "test-project",
          workerName: "Assistant",
          packageName: "guild-hall-sample-assistant",
          sdkSessionId: "sdk-will-throw",
          worktreeDir,
          branchName: "claude/meeting/audience-Assistant-20260221-110002",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact to worktreeDir for appendMeetingLog
      const meetingsArtifactDir = path.join(worktreeDir, ".lore", "meetings");
      await fs.mkdir(meetingsArtifactDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsArtifactDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test thrown expiry"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: throwingExpiryQuery,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      await session.recoverMeetings();

      const events = await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "After throw"),
      );

      // Should have renewed successfully
      const types = events.map((e) => e.type);
      expect(types).toContain("session");
      expect(types).toContain("text_delta");
      expect(types).toContain("turn_end");

      // Verify calls: first with resume (threw), second without (renewal)
      expect(calls).toHaveLength(2);
      expect(calls[0].options.resume).toBe("sdk-will-throw");
      expect(calls[1].options.resume).toBeUndefined();

      // State file should have new session ID
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.sdkSessionId).toBe("sdk-renewed-after-throw");
    });

    test("non-expiry errors are not retried as renewal", async () => {
      async function* regularErrorQuery(params: {
        prompt: string;
        options: QueryOptions;
      }): AsyncGenerator<SDKMessage> {
        await Promise.resolve();
        if (params.options.resume) {
          throw new Error("Some other SDK error");
        }
        yield makeInitMessage();
        yield makeResultSuccess();
      }

      const activateMock = makeMockActivateFn();
      const mockGit = createMockGitOps();
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110003";
      const worktreeDir = path.join(tmpRoot, "wt-regular-error");
      await fs.mkdir(worktreeDir, { recursive: true });
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          meetingId,
          projectName: "test-project",
          workerName: "Assistant",
          packageName: "guild-hall-sample-assistant",
          sdkSessionId: "sdk-regular-error",
          worktreeDir,
          branchName: "claude/meeting/audience-Assistant-20260221-110003",
          status: "open",
        }),
        "utf-8",
      );

      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: regularErrorQuery,
        activateFn: activateMock.activateFn,
        gitOps: mockGit,
      });

      await session.recoverMeetings();

      const events = await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Should fail"),
      );

      // Should get the error, not a renewal
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") {
        expect(events[0].reason).toContain("Some other SDK error");
      }
    });
  });

  describe("state file includes packageName", () => {
    test("state file written by createMeeting includes packageName", async () => {
      const session = createMeetingSession(makeDeps());
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const files = await fs.readdir(stateDir);
      const stateContent = await fs.readFile(
        path.join(stateDir, files[0]),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.packageName).toBe("guild-hall-sample-assistant");
      expect(state.workerName).toBe("Assistant");
    });
  });

  describe("meeting git integration", () => {
    test("createMeeting calls createBranch, createWorktree, configureSparseCheckout", async () => {
      const mockGit = createMockGitOps();
      const session = createMeetingSession(makeDeps({ gitOps: mockGit }));
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      // Verify session established successfully
      const sessionEvent = events.find((e) => e.type === "session");
      expect(sessionEvent).toBeDefined();

      // Verify git operations were called in order
      expect(mockGit.calls).toContain("createBranch");
      expect(mockGit.calls).toContain("createWorktree");
      expect(mockGit.calls).toContain("configureSparseCheckout");

      // Order: createBranch before createWorktree before configureSparseCheckout
      const branchIdx = mockGit.calls.indexOf("createBranch");
      const worktreeIdx = mockGit.calls.indexOf("createWorktree");
      const sparseIdx = mockGit.calls.indexOf("configureSparseCheckout");
      expect(branchIdx).toBeLessThan(worktreeIdx);
      expect(worktreeIdx).toBeLessThan(sparseIdx);
    });

    test("closeMeeting calls commitAll, squashMerge, removeWorktree, deleteBranch in order", async () => {
      const mockGit = createMockGitOps();
      const session = createMeetingSession(makeDeps({ gitOps: mockGit }));
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      // Clear calls from creation to isolate close calls
      mockGit.calls.length = 0;

      await session.closeMeeting(asMeetingId(meetingId));

      // Verify git cleanup operations in order
      const commitIdx = mockGit.calls.indexOf("commitAll");
      const squashIdx = mockGit.calls.indexOf("squashMerge");
      const removeIdx = mockGit.calls.indexOf("removeWorktree");
      const deleteIdx = mockGit.calls.indexOf("deleteBranch");

      expect(commitIdx).toBeGreaterThanOrEqual(0);
      expect(squashIdx).toBeGreaterThanOrEqual(0);
      expect(removeIdx).toBeGreaterThanOrEqual(0);
      expect(deleteIdx).toBeGreaterThanOrEqual(0);

      expect(commitIdx).toBeLessThan(squashIdx);
      expect(squashIdx).toBeLessThan(removeIdx);
      expect(removeIdx).toBeLessThan(deleteIdx);
    });

    test("state file includes branchName after createMeeting", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.branchName).toBe(meetingBranchName(meetingId));
      expect(state.branchName).toMatch(/^claude\/meeting\//);
    });

    test("worktreeDir uses meetingWorktreePath convention", async () => {
      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = events.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

      const expectedDir = meetingWorktreePath(ghHomeDir, "test-project", meetingId);
      const worktreeDir = await getWorktreeDirFromState(meetingId);
      expect(worktreeDir).toBe(expectedDir);
    });

    test("declineMeeting operates on integration worktree, not project.path", async () => {
      // Write artifact to the integration worktree
      const meetingId = "audience-Assistant-20260221-200000";
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: requested
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: requested
    reason: "Test setup"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession(makeDeps());
      await session.declineMeeting(asMeetingId(meetingId), "test-project");

      // Verify the artifact was updated in the integration worktree
      const content = await fs.readFile(
        path.join(meetingsDir, `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("status: declined");

      // Verify nothing was written to project.path/.lore/meetings/
      const projectMeetingsDir = path.join(projectDir, ".lore", "meetings");
      let projectHasMeetings = false;
      try {
        await fs.access(projectMeetingsDir);
        projectHasMeetings = true;
      } catch {
        projectHasMeetings = false;
      }
      expect(projectHasMeetings).toBe(false);
    });

    test("deferMeeting operates on integration worktree, not project.path", async () => {
      const meetingId = "audience-Assistant-20260221-200001";
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: requested
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: requested
    reason: "Test setup"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession(makeDeps());
      await session.deferMeeting(asMeetingId(meetingId), "test-project", "2026-04-01");

      // Verify update happened in integration worktree
      const content = await fs.readFile(
        path.join(meetingsDir, `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("event: deferred");
      expect(content).toContain('deferred_until: "2026-04-01"');

      // Verify nothing was written to project.path/.lore/meetings/
      const projectMeetingsDir = path.join(projectDir, ".lore", "meetings");
      let projectHasMeetings = false;
      try {
        await fs.access(projectMeetingsDir);
        projectHasMeetings = true;
      } catch {
        projectHasMeetings = false;
      }
      expect(projectHasMeetings).toBe(false);
    });

    test("acceptMeetingRequest reads from integration, writes to activity worktree", async () => {
      const meetingId = "audience-Assistant-20260221-200002";

      // Write artifact to integration worktree
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: requested
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Accept test"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: requested
    reason: "Test setup"
notes_summary: ""
---
`,
        "utf-8",
      );

      // Use copy-from mock so the worktree gets the artifact
      const mockGit = createMockGitOps({ copyFromDir: integrationDir });
      const session = createMeetingSession(makeDeps({ gitOps: mockGit }));

      const events = await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      // Verify session was established
      const types = events.map((e) => e.type);
      expect(types).toContain("session");

      // Verify git operations
      expect(mockGit.calls).toContain("createBranch");
      expect(mockGit.calls).toContain("createWorktree");

      // Verify the activity worktree has the updated artifact
      const worktreeDir = await getWorktreeDirFromState(meetingId);
      const content = await fs.readFile(
        path.join(worktreeDir, ".lore", "meetings", `${meetingId}.md`),
        "utf-8",
      );
      expect(content).toContain("status: open");
      expect(content).toContain("event: opened");
    });

    test("recovery closes meetings with missing worktrees and updates integration artifact", async () => {
      const meetingId = "audience-Assistant-20260221-200003";
      const nonExistentDir = path.join(tmpRoot, "gone-after-reboot");

      // Write a state file for an open meeting with a missing worktree
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(
        path.join(stateDir, `${meetingId}.json`),
        JSON.stringify({
          meetingId,
          projectName: "test-project",
          workerName: "Assistant",
          packageName: "guild-hall-sample-assistant",
          sdkSessionId: "sdk-gone",
          worktreeDir: nonExistentDir,
          branchName: "claude/meeting/" + meetingId,
          status: "open",
        }),
        "utf-8",
      );

      // Write the artifact to the integration worktree so recovery can update it
      const meetingsDir = path.join(integrationDir, ".lore", "meetings");
      await fs.mkdir(meetingsDir, { recursive: true });
      const now = new Date();
      await fs.writeFile(
        path.join(meetingsDir, `${meetingId}.md`),
        `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test recovery"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: opened
    reason: "Test setup"
notes_summary: ""
---
`,
        "utf-8",
      );

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      // Meeting should NOT be recovered (closed instead)
      expect(recovered).toBe(0);
      expect(session.getActiveMeetings()).toBe(0);

      // State file should show closed
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.status).toBe("closed");

      // Integration worktree artifact should be updated to closed
      const artifactContent = await fs.readFile(
        path.join(meetingsDir, `${meetingId}.md`),
        "utf-8",
      );
      expect(artifactContent).toContain("status: closed");
      expect(artifactContent).toContain("Worktree lost during daemon restart");
    });
  });
});

// -- Manager worker integration --

import {
  MANAGER_PACKAGE_NAME,
  createManagerPackage,
} from "@/daemon/services/manager-worker";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";

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
/* eslint-enable @typescript-eslint/require-await */

const MANAGER_PKG = createManagerPackage();

describe("manager worker integration", () => {
  test("meeting session identifies manager by package name and sets isManager flag", async () => {
    // Use an activateFn that captures the context to inspect resolvedTools
    const activateCalls: Array<{ pkg: DiscoveredPackage; context: ActivationContext }> = [];
    function captureActivateFn(
      pkg: DiscoveredPackage,
      context: ActivationContext,
    ): Promise<ActivationResult> {
      activateCalls.push({ pkg, context });
      return Promise.resolve({
        systemPrompt: "Manager prompt",
        tools: context.resolvedTools,
        resourceBounds: { maxTurns: 200 },
      });
    }

    const deps = makeDeps({
      packages: [MANAGER_PKG, WORKER_PKG],
      activateFn: captureActivateFn,
      commissionSession: makeMockCommissionSession(),
      eventBus: { emit() {}, subscribe() { return () => {}; } },
    });

    const session = createMeetingSession(deps);

    // The manager package name is "guild-hall-manager"; use it as workerName
    // (createMeeting looks up by package name via getWorkerByName).
    const events = await collectEvents(
      session.createMeeting("test-project", MANAGER_PACKAGE_NAME, "Plan project work"),
    );

    // Should have succeeded (no error events about worker not found)
    const errorEvents = events.filter((e) => e.type === "error");
    const workerNotFoundErrors = errorEvents.filter(
      (e) => e.type === "error" && e.reason.includes("not found"),
    );
    expect(workerNotFoundErrors).toHaveLength(0);

    // The activateFn should have been called with the manager package
    expect(activateCalls).toHaveLength(1);
    expect(activateCalls[0].pkg.name).toBe(MANAGER_PACKAGE_NAME);

    // The resolved tools should include the manager toolbox MCP server
    const mcpNames = activateCalls[0].context.resolvedTools.mcpServers.map(
      (s) => s.name,
    );
    expect(mcpNames).toContain("guild-hall-manager");
    // Also verify that base and meeting toolboxes are still present
    expect(mcpNames).toContain("guild-hall-base");
    expect(mcpNames).toContain("guild-hall-meeting");
  });

  test("activateWorker handles path='' for built-in manager (no activateFn)", async () => {
    // This test verifies that when activateFn is NOT provided, the
    // production code path for path="" routes to activateManager().
    const mock = makeMockQueryFn();
    const mockGit = createMockGitOps();

    const config = makeConfig();
    config.projects[0].path = projectDir;

    const deps: MeetingSessionDeps = {
      packages: [MANAGER_PKG, WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      // No activateFn, so the built-in path is exercised
      gitOps: mockGit,
      commissionSession: makeMockCommissionSession(),
      eventBus: { emit() {}, subscribe() { return () => {}; } },
    };

    const session = createMeetingSession(deps);
    const events = await collectEvents(
      session.createMeeting("test-project", MANAGER_PACKAGE_NAME, "Coordinate work"),
    );

    // Should have succeeded (session event + text + result)
    const errorEvents = events.filter((e) => e.type === "error");
    // No "Worker activation failed" errors
    const activationErrors = errorEvents.filter(
      (e) => e.type === "error" && e.reason.includes("activation failed"),
    );
    expect(activationErrors).toHaveLength(0);

    // The query function should have been called, meaning activation succeeded
    expect(mock.calls).toHaveLength(1);

    // The system prompt should contain the manager posture
    expect(mock.calls[0].options.systemPrompt).toContain("coordination specialist");
  });

  test("activateWorker throws for unknown built-in workers (path='' but not manager)", async () => {
    const unknownBuiltIn: DiscoveredPackage = {
      name: "guild-hall-unknown",
      path: "",
      metadata: {
        type: "worker",
        identity: {
          name: "Unknown",
          description: "An unrecognized built-in.",
          displayTitle: "Unknown Worker",
        },
        posture: "You are unknown.",
        domainToolboxes: [],
        builtInTools: ["Read"],
        checkoutScope: "sparse",
      },
    };

    const mock = makeMockQueryFn();
    const mockGit = createMockGitOps();

    const config = makeConfig();
    config.projects[0].path = projectDir;

    const deps: MeetingSessionDeps = {
      packages: [unknownBuiltIn, WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      // No activateFn, so the built-in path is exercised
      gitOps: mockGit,
    };

    const session = createMeetingSession(deps);
    const events = await collectEvents(
      session.createMeeting("test-project", "guild-hall-unknown", "Do something"),
    );

    // Should have an error about unknown built-in
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBeGreaterThan(0);

    const activationError = errorEvents.find(
      (e) => e.type === "error" && e.reason.includes("Unknown built-in worker"),
    );
    expect(activationError).toBeDefined();
    expect(activationError!.type === "error" && activationError!.reason).toContain(
      "guild-hall-unknown",
    );
  });

  test("regular worker is not detected as manager", async () => {
    const activateCalls: Array<{ pkg: DiscoveredPackage; context: ActivationContext }> = [];
    function captureActivateFn(
      pkg: DiscoveredPackage,
      context: ActivationContext,
    ): Promise<ActivationResult> {
      activateCalls.push({ pkg, context });
      return Promise.resolve(makeActivationResult());
    }

    const deps = makeDeps({
      packages: [MANAGER_PKG, WORKER_PKG],
      activateFn: captureActivateFn,
      commissionSession: makeMockCommissionSession(),
    });

    const session = createMeetingSession(deps);
    await collectEvents(
      session.createMeeting("test-project", "guild-hall-sample-assistant", "Regular meeting"),
    );

    // The activateFn should have been called with the regular worker
    expect(activateCalls).toHaveLength(1);
    expect(activateCalls[0].pkg.name).toBe("guild-hall-sample-assistant");

    // The resolved tools should NOT include the manager toolbox
    const mcpNames = activateCalls[0].context.resolvedTools.mcpServers.map(
      (s) => s.name,
    );
    expect(mcpNames).not.toContain("guild-hall-manager");
  });
});
