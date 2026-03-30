/**
 * Daemon integration tests.
 *
 * Exercises the full path: HTTP request -> Hono route handler -> real
 * meeting session (with mock queryFn) -> event translator -> SSE response.
 *
 * Unlike the unit tests in routes/meetings.test.ts (which mock the entire
 * meeting session) and meeting/orchestrator.test.ts (which test the orchestrator
 * in isolation), these tests wire real route handlers to a real meeting session,
 * verifying that the layers compose correctly.
 *
 * Limitations:
 * - The SDK queryFn is mocked; actual Claude Agent SDK behavior is not tested.
 * - SSE parsing in tests reads the full response body after the stream closes.
 *   Real browser SSE consumers process events incrementally as they arrive.
 *   This test validates event content and ordering, not incremental delivery.
 * - Worker activation uses a mock activateFn, not the real package index.ts.
 *   The real activate() is tested separately in package-level tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createApp } from "@/daemon/app";
import {
  MEETING_GREETING_PROMPT,
  createMeetingSession,
  type MeetingSessionDeps,
} from "@/daemon/services/meeting/orchestrator";
import type { SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { GuildHallEvent } from "@/daemon/types";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";

// -- Fixtures --

const WORKER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "Assistant",
    description: "A test assistant for integration tests.",
    displayTitle: "Guild Assistant",
  },
  posture:
    "You are a helpful assistant participating in a Guild Hall meeting.",
  domainToolboxes: [],
  builtInTools: ["Read", "Glob", "Grep"],
  checkoutScope: "sparse",
};

const WORKER_PKG: DiscoveredPackage = {
  name: "test-assistant",
  path: "/tmp/fake-packages/sample-assistant",
  metadata: WORKER_META,
};

// -- Mock SDK messages --

function makeInitMessage(sessionId = "sdk-session-integration-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.50",
    cwd: "/tmp",
    tools: ["Read", "Glob", "Grep"],
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
    session_id: "sdk-session-integration-1",
  } as unknown as SDKMessage;
}

function makeResultSuccess(cost = 0.05): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: cost,
    duration_ms: 3000,
    duration_api_ms: 2800,
    is_error: false,
    num_turns: 1,
    result: "Done.",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-integration-1",
  } as unknown as SDKMessage;
}

// -- Mock queryFn --

function makeMockQueryFn(
  messages: SDKMessage[] = [
    makeInitMessage(),
    makeTextDelta("Integration "),
    makeTextDelta("test response"),
    makeResultSuccess(),
  ],
) {
  const calls: Array<{ prompt: string; options: SdkQueryOptions }> = [];

  // Mock generators yield synchronously; no await needed.
  // eslint-disable-next-line @typescript-eslint/require-await
  async function* mockQuery(params: {
    prompt: string;
    options: SdkQueryOptions;
  }): AsyncGenerator<SDKMessage> {
    calls.push(params);
    for (const msg of messages) {
      yield msg;
    }
  }

  return { queryFn: mockQuery, calls };
}

// -- Mock activateFn --

function makeMockActivateFn() {
  const calls: Array<{
    pkg: DiscoveredPackage;
    context: ActivationContext;
  }> = [];

  // Mock returns synchronously; no await needed.
  // eslint-disable-next-line @typescript-eslint/require-await
  async function mockActivate(
    pkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    calls.push({ pkg, context });
    return {
      systemPrompt: context.posture,
      sessionContext: "",
      tools: {
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep"],
        builtInTools: [],
      },
    };
  }

  return { activateFn: mockActivate, calls };
}

// -- Mock GitOps --

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

/**
 * Creates a mock GitOps that simulates squash-merge by copying .lore/
 * from the last created worktree to the integration path. This mirrors
 * the real git behavior where squashMergeNoCommit stages the source
 * branch's content in the target working tree.
 */
function createMockGitOps(): GitOps {
  const worktreePaths: string[] = [];
  return {
    createBranch: () => Promise.resolve(),
    branchExists: () => Promise.resolve(false),
    deleteBranch: () => Promise.resolve(),
    createWorktree: async (_repoPath, worktreePath) => {
      await fs.mkdir(worktreePath, { recursive: true });
      worktreePaths.push(worktreePath);
    },
    removeWorktree: () => Promise.resolve(),
    configureSparseCheckout: () => Promise.resolve(),
    commitAll: () => Promise.resolve(false),
    squashMerge: () => Promise.resolve(),
    hasUncommittedChanges: () => Promise.resolve(false),
    rebase: () => Promise.resolve(),
    currentBranch: () => Promise.resolve("main"),
    listWorktrees: () => Promise.resolve([]),
    initClaudeBranch: () => Promise.resolve(),
    detectDefaultBranch: () => Promise.resolve("main"),
    fetch: () => Promise.resolve(),
    push: () => Promise.resolve(),
    resetHard: () => Promise.resolve(),
    resetSoft: () => Promise.resolve(),
    createPullRequest: () => Promise.resolve({ url: "" }),
    isAncestor: () => Promise.resolve(false),
    treesEqual: () => Promise.resolve(false),
    revParse: () => Promise.resolve("abc"),
    rebaseOnto: () => Promise.resolve(),
    merge: async () => {},
    squashMergeNoCommit: async (integrationPath) => {
      // Simulate merge by copying .lore/ from the last worktree to integration
      const lastWorktree = worktreePaths[worktreePaths.length - 1];
      if (lastWorktree) {
        const loreSrc = path.join(lastWorktree, ".lore");
        const loreDest = path.join(integrationPath, ".lore");
        try {
          await fs.mkdir(loreDest, { recursive: true });
          await copyDir(loreSrc, loreDest);
        } catch {
          // .lore may not exist in some test scenarios
        }
      }
      return true;
    },
    listConflictedFiles: () => Promise.resolve([]),
    resolveConflictsTheirs: () => Promise.resolve(),
    mergeAbort: () => Promise.resolve(),
    hasCommitsBeyond: () => Promise.resolve(false),
    lorePendingChanges: () => Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
    commitLore: () => Promise.resolve({ committed: false }),
  };
}

// -- SSE parsing --

/**
 * Parses SSE response body into individual event data payloads.
 * SSE format: "data: <json>\n\n" per event.
 */
async function parseSSEResponse(res: Response): Promise<GuildHallEvent[]> {
  const text = await res.text();
  const events: GuildHallEvent[] = [];

  const blocks = text.split("\n\n").filter((b) => b.trim().length > 0);
  for (const block of blocks) {
    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const jsonStr = line.slice("data:".length).trim();
        if (jsonStr) {
          events.push(JSON.parse(jsonStr) as GuildHallEvent);
        }
      }
    }
  }

  return events;
}

// -- Test state --

let tmpRoot: string;
let projectDir: string;
let ghHomeDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gh-integration-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");

  // Create project directory with .lore/ (required for artifact writes)
  await fs.mkdir(path.join(projectDir, ".lore", "meetings"), {
    recursive: true,
  });
  await fs.mkdir(ghHomeDir, { recursive: true });
  // Create integration worktree directory (simulates daemon boot setup)
  const iDir = integrationWorktreePath(ghHomeDir, "test-project");
  await fs.mkdir(iDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// -- Helpers --

function makeConfig(): AppConfig {
  return {
    projects: [{ name: "test-project", path: projectDir }],
  };
}

function makeFullApp(overrides: Partial<MeetingSessionDeps> = {}) {
  const config = makeConfig();
  const mock = makeMockQueryFn();
  const activateMock = makeMockActivateFn();

  const deps: MeetingSessionDeps = {
    packages: [WORKER_PKG],
    config,
    guildHallHome: ghHomeDir,
    queryFn: mock.queryFn,
    activateFn: activateMock.activateFn,
    gitOps: createMockGitOps(),
    ...overrides,
  };

  const meetingSession = createMeetingSession(deps);
  const startTime = Date.now();

  const { app } = createApp({
    health: {
      getMeetingCount: () => meetingSession.getActiveMeetings(),
      getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    },
    meetingSession,
    packages: [WORKER_PKG],
  });

  return { app, meetingSession, queryMock: mock, activateMock };
}

async function postCreateMeeting(
  app: ReturnType<typeof createApp>["app"],
  body: Record<string, unknown> = {
    projectName: "test-project",
    workerName: "test-assistant",
    prompt: "Analyze the codebase",
  },
) {
  return app.request("/meeting/request/meeting/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Reads the worktreeDir from the state file for a given meetingId.
 * Artifacts are now written to the worktreeDir (not project.path).
 */
async function getWorktreeDirFromState(meetingId: string): Promise<string> {
  const stateDir = path.join(ghHomeDir, "state", "meetings");
  const content = await fs.readFile(path.join(stateDir, `${meetingId}.json`), "utf-8");
  const state = JSON.parse(content) as { worktreeDir: string };
  return state.worktreeDir;
}

// -- Tests --

describe("integration: POST /meeting/request/meeting/create creates meeting and streams events", () => {
  test("returns SSE stream with session, text_delta, and turn_end events", async () => {
    const { app } = makeFullApp();

    const res = await postCreateMeeting(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await parseSSEResponse(res);

    // session event comes first
    expect(events[0].type).toBe("session");
    if (events[0].type === "session") {
      expect(events[0].meetingId).toMatch(
        /^audience-Assistant-\d{8}-\d{6}(-\d+)?$/,
      );
      expect(events[0].sessionId).toBe("sdk-session-integration-1");
      expect(events[0].worker).toBe("Assistant");
    }

    // text_delta events follow
    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas.length).toBe(2);
    if (textDeltas[0].type === "text_delta") {
      expect(textDeltas[0].text).toBe("Integration ");
    }
    if (textDeltas[1].type === "text_delta") {
      expect(textDeltas[1].text).toBe("test response");
    }

    // turn_end is the final event
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("turn_end");
    if (lastEvent.type === "turn_end") {
      expect(lastEvent.cost).toBe(0.05);
    }
  });

  test("creates meeting artifact in the activity worktree's .lore/meetings/", async () => {
    const { app } = makeFullApp();

    // Must consume SSE response body so the meeting session's async generator
    // finishes executing and the side effects (artifact/state writes) complete.
    const res = await postCreateMeeting(app);
    const events = await parseSSEResponse(res);

    // Get meetingId from session event
    const sessionEvent = events.find((e) => e.type === "session");
    let meetingId = "";
    if (sessionEvent?.type === "session") meetingId = sessionEvent.meetingId;

    // Artifacts are written to the worktreeDir, not project.path
    const worktreeDir = await getWorktreeDirFromState(meetingId);
    const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
    const files = await fs.readdir(meetingsDir);
    expect(files.length).toBeGreaterThanOrEqual(1);

    const artifactFile = files.find((f) => f.startsWith("audience-Assistant-"));
    expect(artifactFile).toBeDefined();

    const content = await fs.readFile(
      path.join(meetingsDir, artifactFile!),
      "utf-8",
    );
    expect(content).toContain('title: "Audience with Guild Assistant"');
    expect(content).toContain("status: open");
    expect(content).toContain("tags: [meeting]");
    expect(content).toContain("worker: Assistant");
    expect(content).toContain("Analyze the codebase");

    // Verify transcript file was created and the initial user turn was appended
    const transcriptFile = path.join(ghHomeDir, "meetings", `${meetingId}.md`);
    const transcriptContent = await fs.readFile(transcriptFile, "utf-8");
    expect(transcriptContent).toContain("meetingId:");
    expect(transcriptContent).toContain("## User (");
  });

  test("creates state file in guild-hall home", async () => {
    const { app } = makeFullApp();

    const res = await postCreateMeeting(app);
    const events = await parseSSEResponse(res);

    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();

    let meetingId = "";
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    const stateDir = path.join(ghHomeDir, "state", "meetings");
    const stateFile = path.join(stateDir, `${meetingId}.json`);
    const stateContent = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(stateContent);

    expect(state.projectName).toBe("test-project");
    expect(state.workerName).toBe("Assistant");
    expect(state.status).toBe("open");
    expect(state.sdkSessionId).toBe("sdk-session-integration-1");
  });

  test("passes activation context correctly through the full chain", async () => {
    const { app, activateMock } = makeFullApp();

    const res = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "test-assistant",
      prompt: "Review the architecture",
    });
    await parseSSEResponse(res);

    expect(activateMock.calls).toHaveLength(1);
    const call = activateMock.calls[0];
    expect(call.pkg.name).toBe("test-assistant");
    expect(call.context.posture).toBe(WORKER_META.posture);
    expect(call.context.meetingContext?.agenda).toBe("Review the architecture");
    expect(call.context.projectPath).toBe(projectDir);
  });

  test("passes correct query options to the SDK mock", async () => {
    const { app, queryMock } = makeFullApp();

    const res = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "test-assistant",
      prompt: "Explain the config",
    });
    await parseSSEResponse(res);

    expect(queryMock.calls).toHaveLength(1);
    const call = queryMock.calls[0];
    expect(call.prompt).toBe(MEETING_GREETING_PROMPT);
    expect(call.options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: WORKER_META.posture,
    });
    expect(call.options.permissionMode).toBe("dontAsk");
  });
});

describe("integration: POST /meeting/session/message/send sends follow-up", () => {
  test("streams response events for follow-up messages", async () => {
    const { app } = makeFullApp();

    // Create a meeting first
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    const sessionEvent = createEvents.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();

    let meetingId = "";
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Send follow-up message
    const followUpRes = await app.request(
      "/meeting/session/message/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, message: "Tell me more" }),
      },
    );

    expect(followUpRes.status).toBe(200);
    expect(followUpRes.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    const followUpEvents = await parseSSEResponse(followUpRes);

    // Follow-up should include session (re-emitted from translator),
    // text_delta, and turn_end
    const types = followUpEvents.map((e) => e.type);
    expect(types).toContain("text_delta");
    expect(types).toContain("turn_end");

    // Verify transcript contains assistant turn written after the follow-up
    const transcriptFile = path.join(ghHomeDir, "meetings", `${meetingId}.md`);
    const transcriptContent = await fs.readFile(transcriptFile, "utf-8");
    expect(transcriptContent).toContain("## Assistant (");
  });

  test("passes resume option with the correct SDK session ID", async () => {
    const { app, queryMock } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Send follow-up and consume the SSE response to ensure the generator
    // runs to completion (async transcript writes create gaps that require
    // the stream to be fully consumed before checking mock call counts).
    const followUpRes = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, message: "What about tests?" }),
    });
    await followUpRes.text();

    // First call was createMeeting, second is sendMessage
    expect(queryMock.calls).toHaveLength(2);
    const resumeCall = queryMock.calls[1];
    expect(resumeCall.prompt).toBe("What about tests?");
    expect(resumeCall.options.resume).toBe("sdk-session-integration-1");
  });
});

describe("integration: POST /meeting/session/meeting/close closes meeting", () => {
  test("returns 200 with status ok and notes", async () => {
    const { app } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close meeting
    const deleteRes = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.status).toBe("ok");
    // Without notesQueryFn, notes generation returns placeholder text
    expect(body.notes).toBe("Notes generation not available.");
  });

  test("subsequent sendMessage returns error for closed meeting", async () => {
    const { app } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close meeting
    await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });

    // Try to send message to closed meeting
    const sendRes = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, message: "Hello again" }),
    });

    // The route returns 200 SSE even for errors (error is in the stream)
    expect(sendRes.status).toBe(200);
    const events = await parseSSEResponse(sendRes);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].reason).toContain("not found");
    }
  });

  test("updates meeting artifact status to closed", async () => {
    const { app } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Read worktreeDir from state file before closing (state file deleted on successful merge)
    const worktreeDir = await getWorktreeDirFromState(meetingId);

    // Close meeting
    await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });

    // Read the artifact from the worktreeDir (still present: mock removeWorktree is a no-op)
    const meetingsDir = path.join(worktreeDir, ".lore", "meetings");
    const artifactPath = path.join(meetingsDir, `${meetingId}.md`);
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain("status: closed");
    expect(content).toContain("event: closed");
    expect(content).toContain('reason: "User closed audience"');
  });

  test("removes state file after successful squash-merge on close", async () => {
    const { app } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    const stateFile = path.join(
      ghHomeDir,
      "state",
      "meetings",
      `${meetingId}.json`,
    );

    // Verify state file exists before close (readable as JSON)
    const stateBefore = JSON.parse(await fs.readFile(stateFile, "utf-8"));
    expect(stateBefore.status).toBe("open");

    // Close meeting
    await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });

    // State file deleted: artifact on the integration worktree is the source of truth
    await expect(fs.readFile(stateFile, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("integration: GET /system/runtime/daemon/health returns correct meeting counts", () => {
  test("reports 0 meetings before any are created", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/system/runtime/daemon/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.meetings).toBe(0);
  });

  test("reports 1 meeting after creating one", async () => {
    const { app } = makeFullApp();

    const createRes = await postCreateMeeting(app);
    await parseSSEResponse(createRes);

    const res = await app.request("/system/runtime/daemon/health");
    const body = await res.json();
    expect(body.meetings).toBe(1);
  });

  test("reports 0 meetings after creating and closing one", async () => {
    const { app } = makeFullApp();

    const createRes = await postCreateMeeting(app);
    const events = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = events.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close meeting
    await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });

    const res = await app.request("/system/runtime/daemon/health");
    const body = await res.json();
    expect(body.meetings).toBe(0);
  });

  test("reports correct count with multiple meetings", async () => {
    const { app } = makeFullApp();

    const r1 = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "test-assistant",
      prompt: "Task 1",
    });
    await parseSSEResponse(r1);
    const r2 = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "test-assistant",
      prompt: "Task 2",
    });
    await parseSSEResponse(r2);

    const res = await app.request("/system/runtime/daemon/health");
    const body = await res.json();
    expect(body.meetings).toBe(2);
  });
});

describe("integration: GET /system/packages/worker/list returns discovered workers", () => {
  test("returns the sample-assistant worker with correct metadata", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/system/packages/worker/list");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      workers: Array<{
        name: string;
        displayName: string;
        displayTitle: string;
        description: string;
        portraitUrl: string | null;
      }>;
    };
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0].name).toBe("test-assistant");
    expect(body.workers[0].displayName).toBe("Assistant");
    expect(body.workers[0].displayTitle).toBe("Guild Assistant");
    expect(body.workers[0].description).toBe(
      "A test assistant for integration tests.",
    );
    expect(body.workers[0].portraitUrl).toBeNull();
  });

  test("returns empty array when no packages are provided", async () => {
    const config = makeConfig();
    const mock = makeMockQueryFn();
    const activateMock = makeMockActivateFn();

    const meetingSession = createMeetingSession({
      packages: [],
      config,
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      activateFn: activateMock.activateFn,
    });

    const { app } = createApp({
      health: {
        getMeetingCount: () => meetingSession.getActiveMeetings(),
        getUptimeSeconds: () => 0,
      },
      meetingSession,
      packages: [],
    });

    const res = await app.request("/system/packages/worker/list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workers: unknown[] };
    expect(body.workers).toHaveLength(0);
  });
});

describe("integration: POST /meeting/session/generation/interrupt", () => {
  test("returns 200 for an active meeting", async () => {
    const { app } = makeFullApp();

    // Create meeting
    const createRes = await postCreateMeeting(app);
    const events = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = events.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Interrupt the meeting
    const interruptRes = await app.request(
      "/meeting/session/generation/interrupt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      },
    );

    expect(interruptRes.status).toBe(200);
    const body = await interruptRes.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("returns 404 for unknown meeting", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/meeting/session/generation/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "nonexistent-meeting" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

describe("integration: error cases", () => {
  test("returns error event for invalid project name", async () => {
    const { app } = makeFullApp();

    const res = await postCreateMeeting(app, {
      projectName: "nonexistent-project",
      workerName: "test-assistant",
      prompt: "Hello",
    });

    // SSE always starts as 200 (errors are in the stream)
    expect(res.status).toBe(200);
    const events = await parseSSEResponse(res);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].reason).toContain("not found");
    }
  });

  test("returns error event for unknown worker", async () => {
    const { app } = makeFullApp();

    const res = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "nonexistent-worker",
      prompt: "Hello",
    });

    expect(res.status).toBe(200);
    const events = await parseSSEResponse(res);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].reason).toContain("not found");
    }
  });

  test("returns 400 for missing required fields", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test-project" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/meeting/request/meeting/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 400 for missing message in follow-up", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/meeting/session/message/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "any-meeting" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: message");
  });

  test("returns 404 when closing a nonexistent meeting", async () => {
    const { app } = makeFullApp();

    const res = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: "nonexistent-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

describe("integration: full lifecycle (create, message, close)", () => {
  test("complete meeting lifecycle produces correct state transitions", async () => {
    const { app, queryMock } = makeFullApp();

    // 1. Create meeting
    const createRes = await postCreateMeeting(app, {
      projectName: "test-project",
      workerName: "test-assistant",
      prompt: "Begin investigation",
    });
    const createEvents = await parseSSEResponse(createRes);

    let meetingId = "";
    const sessionEvent = createEvents.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }
    expect(meetingId).toBeTruthy();

    // Verify health shows 1 meeting
    let healthRes = await app.request("/system/runtime/daemon/health");
    let healthBody = await healthRes.json();
    expect(healthBody.meetings).toBe(1);

    // 2. Send follow-up message
    const followUpRes = await app.request(
      "/meeting/session/message/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, message: "Continue with details" }),
      },
    );
    const followUpEvents = await parseSSEResponse(followUpRes);
    expect(followUpEvents.some((e) => e.type === "text_delta")).toBe(true);
    expect(followUpEvents.some((e) => e.type === "turn_end")).toBe(true);

    // Verify SDK was called with resume on second call
    expect(queryMock.calls).toHaveLength(2);
    expect(queryMock.calls[1].options.resume).toBe(
      "sdk-session-integration-1",
    );

    // Health still shows 1 meeting
    healthRes = await app.request("/system/runtime/daemon/health");
    healthBody = await healthRes.json();
    expect(healthBody.meetings).toBe(1);

    // Read worktreeDir from state file before closing (state file deleted on successful merge)
    const worktreeDir = await getWorktreeDirFromState(meetingId);

    // 3. Close meeting
    const deleteRes = await app.request("/meeting/session/meeting/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });
    expect(deleteRes.status).toBe(200);

    // Health shows 0 meetings
    healthRes = await app.request("/system/runtime/daemon/health");
    healthBody = await healthRes.json();
    expect(healthBody.meetings).toBe(0);

    // 4. Verify final artifact state (artifacts live in the activity worktree;
    // worktreeDir was read before close since state file is removed after successful merge)
    const artifactPath = path.join(
      worktreeDir,
      ".lore",
      "meetings",
      `${meetingId}.md`,
    );
    const artifactContent = await fs.readFile(artifactPath, "utf-8");
    expect(artifactContent).toContain("status: closed");
    expect(artifactContent).toContain("event: opened");
    expect(artifactContent).toContain("event: closed");

    // 5. Verify state file deleted: artifact on the integration worktree is the source of truth
    const stateFile = path.join(
      ghHomeDir,
      "state",
      "meetings",
      `${meetingId}.json`,
    );
    await expect(fs.readFile(stateFile, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });

    // 6. Verify subsequent operations on closed meeting fail correctly
    const postCloseRes = await app.request(
      "/meeting/session/message/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, message: "Should fail" }),
      },
    );
    const postCloseEvents = await parseSSEResponse(postCloseRes);
    expect(postCloseEvents[0].type).toBe("error");
  });
});

describe("integration: meeting cap enforcement through HTTP", () => {
  test("enforces meeting cap through the full HTTP path", async () => {
    const config: AppConfig = {
      projects: [{ name: "test-project", path: projectDir, meetingCap: 1 }],
    };
    const mock = makeMockQueryFn();
    const activateMock = makeMockActivateFn();

    const meetingSession = createMeetingSession({
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      activateFn: activateMock.activateFn,
      gitOps: createMockGitOps(),
    });

    const { app } = createApp({
      health: {
        getMeetingCount: () => meetingSession.getActiveMeetings(),
        getUptimeSeconds: () => 0,
      },
      meetingSession,
      packages: [WORKER_PKG],
    });

    // First meeting succeeds
    const res1 = await postCreateMeeting(app);
    const events1 = await parseSSEResponse(res1);
    expect(events1[0].type).toBe("session");

    // Second meeting is rejected due to cap
    const res2 = await postCreateMeeting(app);
    const events2 = await parseSSEResponse(res2);
    expect(events2).toHaveLength(1);
    expect(events2[0].type).toBe("error");
    if (events2[0].type === "error") {
      expect(events2[0].reason).toContain("Meeting cap reached");
    }
  });
});

describe("integration: SDK error propagation", () => {
  test("SDK query failure surfaces as error event in SSE stream", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* failingQuery(): AsyncGenerator<SDKMessage> {
      throw new Error("SDK connection timeout");
    }

    const activateMock = makeMockActivateFn();
    const config = makeConfig();

    const meetingSession = createMeetingSession({
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: () => failingQuery(),
      activateFn: activateMock.activateFn,
      gitOps: createMockGitOps(),
    });

    const { app } = createApp({
      health: {
        getMeetingCount: () => meetingSession.getActiveMeetings(),
        getUptimeSeconds: () => 0,
      },
      meetingSession,
      packages: [WORKER_PKG],
    });

    const res = await postCreateMeeting(app);
    const events = await parseSSEResponse(res);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.reason).toContain("SDK connection timeout");
    }
  });

  test("SDK returning error result surfaces as error event", async () => {
    const errorMessages: SDKMessage[] = [
      makeInitMessage(),
      makeTextDelta("Starting..."),
      {
        type: "result",
        subtype: "error_max_turns",
        total_cost_usd: 0.10,
        duration_ms: 60000,
        duration_api_ms: 55000,
        is_error: true,
        num_turns: 30,
        errors: ["Maximum turns reached (30)"],
        usage: {
          input_tokens: 5000,
          output_tokens: 3000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
        uuid: "00000000-0000-0000-0000-000000000099" as `${string}-${string}-${string}-${string}-${string}`,
        session_id: "sdk-session-integration-1",
      } as unknown as SDKMessage,
    ];

    const mock = makeMockQueryFn(errorMessages);
    const activateMock = makeMockActivateFn();

    const meetingSession = createMeetingSession({
      packages: [WORKER_PKG],
      config: makeConfig(),
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      activateFn: activateMock.activateFn,
      gitOps: createMockGitOps(),
    });

    const { app } = createApp({
      health: {
        getMeetingCount: () => meetingSession.getActiveMeetings(),
        getUptimeSeconds: () => 0,
      },
      meetingSession,
      packages: [WORKER_PKG],
    });

    const res = await postCreateMeeting(app);
    const events = await parseSSEResponse(res);

    // Should have session, text_delta, and error
    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeDefined();

    const textEvent = events.find((e) => e.type === "text_delta");
    expect(textEvent).toBeDefined();

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.reason).toContain("Maximum turns reached");
    }
  });
});
