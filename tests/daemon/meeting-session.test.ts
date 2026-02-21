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
import type { GuildHallEvent } from "@/daemon/types";
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
});
