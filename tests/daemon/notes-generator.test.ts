import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  generateMeetingNotes,
  formatNotesForYaml,
  type NotesResult,
} from "@/daemon/services/notes-generator";
import type { QueryOptions } from "@/daemon/services/meeting-session";

// -- Test state --

let tmpRoot: string;
let projectDir: string;
let ghHomeDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notes-gen-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHomeDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// -- Mock SDK messages --

/**
 * Creates a mock assistant message with text content blocks.
 * Notes generation does not use includePartialMessages, so the SDK emits
 * assistant messages (not stream_event text_delta messages).
 */
function makeAssistantMessage(text: string): SDKMessage {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
    uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "notes-session",
  } as unknown as SDKMessage;
}

function makeResultSuccess(): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: 0.02,
    duration_ms: 2000,
    duration_api_ms: 1800,
    is_error: false,
    num_turns: 1,
    result: "Done.",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 500,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "notes-session",
  } as unknown as SDKMessage;
}

// -- Mock queryFn --

function makeMockNotesQueryFn(notesText: string) {
  const calls: Array<{ prompt: string; options: QueryOptions }> = [];

  async function* mockQuery(params: {
    prompt: string;
    options: QueryOptions;
  }): AsyncGenerator<SDKMessage> {
    await Promise.resolve();
    calls.push(params);
    yield makeAssistantMessage(notesText);
    yield makeResultSuccess();
  }

  return { queryFn: mockQuery, calls };
}

function makeFailingQueryFn() {
  // eslint-disable-next-line @typescript-eslint/require-await
  async function* failingQuery(): AsyncGenerator<SDKMessage> {
    throw new Error("SDK connection failed");
  }

  return () => failingQuery();
}

// -- Helpers --

const MEETING_ID = "audience-Assistant-20260221-120000";

async function writeTranscript(meetingId: string, content: string): Promise<void> {
  const transcriptsDir = path.join(ghHomeDir, "meetings");
  await fs.mkdir(transcriptsDir, { recursive: true });
  await fs.writeFile(
    path.join(transcriptsDir, `${meetingId}.md`),
    content,
    "utf-8",
  );
}

async function writeDecisions(
  meetingId: string,
  decisions: Array<{ question: string; decision: string; reasoning: string }>,
): Promise<void> {
  const decisionsDir = path.join(ghHomeDir, "state", "meetings", meetingId);
  await fs.mkdir(decisionsDir, { recursive: true });
  const lines = decisions.map((d) => JSON.stringify(d));
  await fs.writeFile(
    path.join(decisionsDir, "decisions.jsonl"),
    lines.join("\n") + "\n",
    "utf-8",
  );
}

async function writeMeetingArtifact(
  meetingId: string,
  linkedArtifacts: string[] = [],
): Promise<void> {
  const meetingsDir = path.join(projectDir, ".lore", "meetings");
  await fs.mkdir(meetingsDir, { recursive: true });

  const linkedStr = linkedArtifacts.length === 0
    ? "linked_artifacts: []"
    : `linked_artifacts:\n${linkedArtifacts.map((a) => `  - ${a}`).join("\n")}`;

  const content = `---
title: "Audience with Guild Assistant"
date: 2026-02-21
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test agenda"
deferred_until: ""
${linkedStr}
meeting_log:
  - timestamp: 2026-02-21T12:00:00.000Z
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`;
  await fs.writeFile(
    path.join(meetingsDir, `${meetingId}.md`),
    content,
    "utf-8",
  );
}

// -- Tests --

describe("generateMeetingNotes", () => {
  test("generates notes from transcript, decisions, and linked artifacts", async () => {
    const transcript = `---
meetingId: ${MEETING_ID}
worker: "Assistant"
project: "test-project"
started: 2026-02-21T12:00:00.000Z
---

## User (2026-02-21T12:00:01.000Z)

Review the architecture.

## Assistant (2026-02-21T12:00:05.000Z)

The architecture follows a clean separation of concerns.
`;

    await writeTranscript(MEETING_ID, transcript);
    await writeDecisions(MEETING_ID, [
      {
        question: "Should we use DI?",
        decision: "Yes",
        reasoning: "Testability",
      },
    ]);
    await writeMeetingArtifact(MEETING_ID, ["specs/architecture.md"]);

    const mock = makeMockNotesQueryFn("Meeting covered architecture review. DI was adopted for testability.");

    const result = await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    expect(result.success).toBe(true);
    expect((result as Extract<NotesResult, { success: true }>).notes).toBe("Meeting covered architecture review. DI was adopted for testability.");
    expect(mock.calls).toHaveLength(1);

    // Verify the prompt contains all three inputs
    const prompt = mock.calls[0].prompt;
    expect(prompt).toContain("Review the architecture");
    expect(prompt).toContain("Should we use DI?");
    expect(prompt).toContain("specs/architecture.md");
  });

  test("handles empty transcript", async () => {
    // No transcript file at all
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Minimal meeting with no content.");

    const result = await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    expect(result.success).toBe(true);
    expect((result as Extract<NotesResult, { success: true }>).notes).toBe("Minimal meeting with no content.");

    // Prompt should contain "(empty transcript)"
    const prompt = mock.calls[0].prompt;
    expect(prompt).toContain("(empty transcript)");
  });

  test("formats decisions correctly in prompt", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n");
    await writeDecisions(MEETING_ID, [
      {
        question: "Use TypeScript?",
        decision: "Yes, strict mode",
        reasoning: "Type safety prevents bugs",
      },
      {
        question: "Framework choice?",
        decision: "Next.js",
        reasoning: "SSR and routing built-in",
      },
    ]);
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Notes with decisions.");

    await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    const prompt = mock.calls[0].prompt;
    expect(prompt).toContain("Question: Use TypeScript?");
    expect(prompt).toContain("Decision: Yes, strict mode");
    expect(prompt).toContain("Reasoning: Type safety prevents bugs");
    expect(prompt).toContain("Question: Framework choice?");
    expect(prompt).toContain("Decision: Next.js");
  });

  test("handles no decisions file gracefully", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n");
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Notes without decisions.");

    await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    const prompt = mock.calls[0].prompt;
    expect(prompt).toContain("No decisions recorded");
  });

  test("handles no linked artifacts", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n");
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Notes without artifacts.");

    await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    const prompt = mock.calls[0].prompt;
    expect(prompt).toContain("No artifacts linked");
  });

  test("returns failure result when SDK fails", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n## User\n\nHello\n");
    await writeMeetingArtifact(MEETING_ID);

    const result = await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: makeFailingQueryFn() },
    );

    expect(result.success).toBe(false);
    const reason = (result as Extract<NotesResult, { success: false }>).reason;
    expect(reason).toContain("Notes generation failed");
    expect(reason).toContain("SDK connection failed");
  });

  test("returns failure result when queryFn is not provided", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n");
    await writeMeetingArtifact(MEETING_ID);

    const result = await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir },
    );

    expect(result.success).toBe(false);
    expect((result as Extract<NotesResult, { success: false }>).reason).toBe("Notes generation not available.");
  });

  test("passes correct query options", async () => {
    await writeTranscript(MEETING_ID, "---\nmeetingId: test\n---\n");
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Summary notes.");

    await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    expect(mock.calls).toHaveLength(1);
    const options = mock.calls[0].options;
    expect(options.maxTurns).toBe(1);
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.settingSources).toEqual([]);
    expect(options.maxBudgetUsd).toBe(0.10);
    expect(options.systemPrompt).toContain("meeting notes generator");
  });

  test("truncates long transcripts to last ~50000 chars", async () => {
    // Create a transcript longer than 50000 chars
    const longContent = "x".repeat(60_000);
    await writeTranscript(MEETING_ID, longContent);
    await writeMeetingArtifact(MEETING_ID);

    const mock = makeMockNotesQueryFn("Summary of long meeting.");

    await generateMeetingNotes(
      MEETING_ID,
      projectDir,
      "Assistant",
      { guildHallHome: ghHomeDir, queryFn: mock.queryFn },
    );

    const prompt = mock.calls[0].prompt;
    // The transcript portion should be truncated. The prompt includes
    // the transcript plus other sections, so the total prompt is larger
    // than 50000, but the transcript portion is at most 50000.
    // We verify by checking the prompt doesn't contain the full 60000 chars.
    expect(prompt.length).toBeLessThan(60_000 + 1000); // transcript + prompt overhead
  });
});

describe("formatNotesForYaml", () => {
  test("formats single-line notes as YAML block scalar", () => {
    const result = formatNotesForYaml("Meeting discussed architecture.");
    expect(result).toBe("notes_summary: |\n  Meeting discussed architecture.");
  });

  test("formats multi-line notes with proper indentation", () => {
    const notes = "First paragraph of notes.\n\nSecond paragraph.\nWith continuation.";
    const result = formatNotesForYaml(notes);
    expect(result).toBe(
      "notes_summary: |\n  First paragraph of notes.\n  \n  Second paragraph.\n  With continuation.",
    );
  });

  test("handles notes with special YAML characters", () => {
    const notes = 'Decision: "Use DI" was made.\nReasoning: it\'s testable.';
    const result = formatNotesForYaml(notes);
    // Block scalar doesn't need escaping for quotes
    expect(result).toContain('Decision: "Use DI" was made.');
    expect(result).toContain("Reasoning: it's testable.");
  });
});

describe("closeMeeting with notes generation", () => {
  // This tests the integration between closeMeeting and notes generation
  // through the meeting-session module.

  // Use the same fixtures as meeting-session tests
  const WORKER_META = {
    type: "worker" as const,
    identity: {
      name: "Assistant",
      description: "A test assistant.",
      displayTitle: "Guild Assistant",
    },
    posture: "You are a helpful assistant.",
    domainToolboxes: [] as string[],
    builtInTools: ["Read", "Glob"],
    checkoutScope: "sparse" as const,
    resourceDefaults: { maxTurns: 30 },
  };

  const WORKER_PKG = {
    name: "guild-hall-sample-assistant",
    path: "/packages/sample-assistant",
    metadata: WORKER_META,
  };

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

  function makeSessionTextDelta(text: string): SDKMessage {
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

  function makeSessionResultSuccess(): SDKMessage {
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
      session_id: "sdk-session-123",
    } as unknown as SDKMessage;
  }

  test("closeMeeting returns generated notes", async () => {
    const { createMeetingSession } = await import("@/daemon/services/meeting-session");
    const { asMeetingId } = await import("@/daemon/types");

    const config = {
      projects: [{ name: "test-project", path: projectDir }],
    };

    // Session queryFn for creating the meeting
    async function* sessionQuery(): AsyncGenerator<SDKMessage> {
      await Promise.resolve();
      yield makeInitMessage();
      yield makeSessionTextDelta("Hello");
      yield makeSessionResultSuccess();
    }

    // Notes queryFn for generating notes on close
    const notesQueryMock = makeMockNotesQueryFn("These are the generated meeting notes.\nWith multiple lines.");

    function mockActivate() {
      return Promise.resolve({
        systemPrompt: "You are a helpful assistant.",
        tools: { mcpServers: [], allowedTools: ["Read", "Glob"] },
        resourceBounds: { maxTurns: 30 },
      });
    }

    const session = createMeetingSession({
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: sessionQuery,
      notesQueryFn: notesQueryMock.queryFn,
      activateFn: mockActivate,
    });

    // Create meeting
    const events = [];
    for await (const event of session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello")) {
      events.push(event);
    }

    let meetingId = "";
    const sessionEvent = events.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close and verify notes are returned
    const result = await session.closeMeeting(asMeetingId(meetingId));
    expect(result.notes).toBe("These are the generated meeting notes.\nWith multiple lines.");

    // Verify notes were written to artifact
    const artifactPath = path.join(projectDir, ".lore", "meetings", `${meetingId}.md`);
    const artifactContent = await fs.readFile(artifactPath, "utf-8");
    expect(artifactContent).toContain("notes_summary: |");
    expect(artifactContent).toContain("  These are the generated meeting notes.");
    expect(artifactContent).toContain("  With multiple lines.");
    expect(artifactContent).not.toContain('notes_summary: ""');
  });

  test("closeMeeting preserves transcript when notes generation fails", async () => {
    const { createMeetingSession } = await import("@/daemon/services/meeting-session");
    const { asMeetingId } = await import("@/daemon/types");

    const config = {
      projects: [{ name: "test-project", path: projectDir }],
    };

    async function* sessionQuery(): AsyncGenerator<SDKMessage> {
      await Promise.resolve();
      yield makeInitMessage();
      yield makeSessionTextDelta("Hello");
      yield makeSessionResultSuccess();
    }

    function mockActivate() {
      return Promise.resolve({
        systemPrompt: "You are a helpful assistant.",
        tools: { mcpServers: [], allowedTools: ["Read", "Glob"] },
        resourceBounds: { maxTurns: 30 },
      });
    }

    const session = createMeetingSession({
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: sessionQuery,
      notesQueryFn: makeFailingQueryFn(),
      activateFn: mockActivate,
    });

    // Create meeting
    const events = [];
    for await (const event of session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello")) {
      events.push(event);
    }

    let meetingId = "";
    const sessionEvent = events.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close meeting (notes generation will fail)
    const result = await session.closeMeeting(asMeetingId(meetingId));
    expect(result.notes).toContain("Notes generation failed");

    // Transcript should be preserved
    const transcriptPath = path.join(ghHomeDir, "meetings", `${meetingId}.md`);
    const transcriptExists = await fs.stat(transcriptPath).then(() => true).catch(() => false);
    expect(transcriptExists).toBe(true);
  });

  test("closeMeeting removes transcript when notes succeed", async () => {
    const { createMeetingSession } = await import("@/daemon/services/meeting-session");
    const { asMeetingId } = await import("@/daemon/types");

    const config = {
      projects: [{ name: "test-project", path: projectDir }],
    };

    async function* sessionQuery(): AsyncGenerator<SDKMessage> {
      await Promise.resolve();
      yield makeInitMessage();
      yield makeSessionTextDelta("Hello");
      yield makeSessionResultSuccess();
    }

    const notesQueryMock = makeMockNotesQueryFn("Successful notes.");

    function mockActivate() {
      return Promise.resolve({
        systemPrompt: "You are a helpful assistant.",
        tools: { mcpServers: [], allowedTools: ["Read", "Glob"] },
        resourceBounds: { maxTurns: 30 },
      });
    }

    const session = createMeetingSession({
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: sessionQuery,
      notesQueryFn: notesQueryMock.queryFn,
      activateFn: mockActivate,
    });

    // Create meeting
    const events = [];
    for await (const event of session.createMeeting("test-project", "guild-hall-sample-assistant", "Hello")) {
      events.push(event);
    }

    let meetingId = "";
    const sessionEvent = events.find((e) => e.type === "session");
    if (sessionEvent?.type === "session") {
      meetingId = sessionEvent.meetingId;
    }

    // Close meeting (notes generation succeeds)
    await session.closeMeeting(asMeetingId(meetingId));

    // Transcript should be removed
    const transcriptPath = path.join(ghHomeDir, "meetings", `${meetingId}.md`);
    const transcriptExists = await fs.stat(transcriptPath).then(() => true).catch(() => false);
    expect(transcriptExists).toBe(false);
  });
});
