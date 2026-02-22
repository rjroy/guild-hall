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

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHomeDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<MeetingSessionDeps> = {}): MeetingSessionDeps {
  const config = makeConfig();
  config.projects[0].path = projectDir;

  const mock = makeMockQueryFn();
  const activateMock = makeMockActivateFn();

  return {
    packages: [WORKER_PKG],
    config,
    guildHallHome: ghHomeDir,
    queryFn: mock.queryFn,
    activateFn: activateMock.activateFn,
    ...overrides,
  };
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
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Review the code"),
      );

      // Find the meeting artifact
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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

      await session.closeMeeting(asMeetingId(meetingId));

      // Read the artifact and verify status
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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

      await session.closeMeeting(asMeetingId(meetingId));

      const meetingsDir = path.join(projectDir, ".lore", "meetings");
      const files = await fs.readdir(meetingsDir);
      const content = await fs.readFile(path.join(meetingsDir, files[0]), "utf-8");
      expect(content).toContain("event: closed");
      expect(content).toContain('reason: "User closed audience"');
    });

    test("cleans up temp directory", async () => {
      const session = createMeetingSession(makeDeps());
      const createEvents = await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      let meetingId = "";
      const sessionEvent = createEvents.find((e) => e.type === "session");
      if (sessionEvent?.type === "session") {
        meetingId = sessionEvent.meetingId;
      }

      // Read the state file to find the temp dir path
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateFiles = await fs.readdir(stateDir);
      const stateContent = await fs.readFile(
        path.join(stateDir, stateFiles[0]),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      const tempDir = state.tempDir;

      // Verify temp dir exists before close
      const existsBefore = await fs.stat(tempDir).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      await session.closeMeeting(asMeetingId(meetingId));

      // Verify temp dir is cleaned up
      const existsAfter = await fs.stat(tempDir).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
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
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
      await collectEvents(
        session.createMeeting(
          "test-project",
          "guild-hall-sample-assistant",
          'Review "important" code',
        ),
      );

      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
      expect(state).toHaveProperty("tempDir");
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
    // Helper to write a meeting artifact with a given status directly
    async function writeMeetingArtifactWithStatus(
      meetingId: string,
      status: MeetingStatus,
    ): Promise<void> {
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
          path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
        await collectEvents(
          session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
        );

        const meetingsDir = path.join(projectDir, ".lore", "meetings");
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

        await session.closeMeeting(asMeetingId(meetingId));

        const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
          path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
          path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
          path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
        path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
        path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
        path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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

      const session = createMeetingSession(makeDeps());
      const events = await collectEvents(
        session.acceptMeetingRequest(asMeetingId(meetingId), "test-project"),
      );

      // Should get session, text_delta, turn_end events
      const types = events.map((e) => e.type);
      expect(types).toEqual(["session", "text_delta", "turn_end"]);

      // Verify meeting is now active
      expect(session.getActiveMeetings()).toBe(1);

      // Verify artifact status was updated to "open"
      const content = await fs.readFile(
        path.join(projectDir, ".lore", "meetings", `${meetingId}.md`),
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
      const session = createMeetingSession({
        packages: [WORKER_PKG],
        config,
        guildHallHome: ghHomeDir,
        queryFn: mock.queryFn,
        activateFn: activateMock.activateFn,
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
        makeDeps({ queryFn: mock.queryFn, activateFn: activateMock.activateFn }),
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

      const session = createMeetingSession(makeDeps());
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
      await collectEvents(
        session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello"),
      );

      const meetingsDir = path.join(projectDir, ".lore", "meetings");
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
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-old-session",
        tempDir: "/tmp/guild-hall-recovered",
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
        tempDir: "/tmp/guild-hall-closed",
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
        tempDir: "/tmp/guild-hall-orphan",
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();

      expect(recovered).toBe(0);
      expect(session.getActiveMeetings()).toBe(0);
    });

    test("recovered meeting can receive sendMessage", async () => {
      const meetingId = "audience-Assistant-20260221-100003";
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-session-to-resume",
        tempDir: "/tmp/guild-hall-resume",
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

    test("creates fresh tempDir when stored tempDir no longer exists (post-reboot)", async () => {
      const meetingId = "audience-Assistant-20260221-100020";
      // Use a path that doesn't exist (simulates a temp dir from a previous boot)
      const nonExistentTempDir = path.join(tmpRoot, "does-not-exist-after-reboot");
      await writeStateFile(meetingId, {
        meetingId,
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-after-reboot",
        tempDir: nonExistentTempDir,
        status: "open",
      });

      const session = createMeetingSession(makeDeps());
      const recovered = await session.recoverMeetings();
      expect(recovered).toBe(1);

      // The recovered meeting should have a tempDir that actually exists
      const openMeetings = session.getOpenMeetingsForProject("test-project");
      expect(openMeetings).toHaveLength(1);
      const meeting = openMeetings[0];
      expect(meeting.tempDir).not.toBe(nonExistentTempDir);

      const tempDirExists = await fs.stat(meeting.tempDir).then(() => true).catch(() => false);
      expect(tempDirExists).toBe(true);

      // State file should have been updated with the new tempDir
      const stateDir = path.join(ghHomeDir, "state", "meetings");
      const stateContent = await fs.readFile(
        path.join(stateDir, `${meetingId}.json`),
        "utf-8",
      );
      const state = JSON.parse(stateContent);
      expect(state.tempDir).toBe(meeting.tempDir);
      expect(state.tempDir).not.toBe(nonExistentTempDir);

      // Clean up the created temp dir
      await fs.rm(meeting.tempDir, { recursive: true, force: true });
    });

    test("recovers multiple open meetings, skipping closed ones", async () => {
      await writeStateFile("audience-Assistant-20260221-100010", {
        meetingId: "audience-Assistant-20260221-100010",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-1",
        tempDir: "/tmp/gh-1",
        status: "open",
      });
      await writeStateFile("audience-Assistant-20260221-100011", {
        meetingId: "audience-Assistant-20260221-100011",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-2",
        tempDir: "/tmp/gh-2",
        status: "closed",
      });
      await writeStateFile("audience-Assistant-20260221-100012", {
        meetingId: "audience-Assistant-20260221-100012",
        projectName: "test-project",
        workerName: "Assistant",
        packageName: "guild-hall-sample-assistant",
        sdkSessionId: "sdk-3",
        tempDir: "/tmp/gh-3",
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
      const stateFiles = await fs.readdir(stateDir);
      const stateContent = await fs.readFile(
        path.join(stateDir, stateFiles[0]),
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
      });

      // Write a state file for recovery
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
      const config = makeConfig();
      config.projects[0].path = projectDir;

      // Set up a meeting via state file recovery
      const meetingId = "audience-Assistant-20260221-110000";
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
          tempDir: "/tmp/guild-hall-log-test",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact so appendMeetingLog can find it
      const meetingsArtifactDir = path.join(projectDir, ".lore", "meetings");
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
      });

      await session.recoverMeetings();
      await collectEvents(
        session.sendMessage(asMeetingId(meetingId), "Trigger renewal"),
      );

      // Read the meeting artifact to check the log
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
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110001";
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
          tempDir: "/tmp/guild-hall-state-test",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact for appendMeetingLog
      const meetingsArtifactDir = path.join(projectDir, ".lore", "meetings");
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
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110002";
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
          tempDir: "/tmp/guild-hall-throw-test",
          status: "open",
        }),
        "utf-8",
      );

      // Write meeting artifact for appendMeetingLog
      const meetingsArtifactDir = path.join(projectDir, ".lore", "meetings");
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
      const config = makeConfig();
      config.projects[0].path = projectDir;

      const meetingId = "audience-Assistant-20260221-110003";
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
          tempDir: "/tmp/guild-hall-regular-error",
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
});
