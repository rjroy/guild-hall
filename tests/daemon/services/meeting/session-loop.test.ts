import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  composeMeetingPrompt,
  iterateSession,
  MEETING_GREETING_PROMPT,
  type SessionLoopDeps,
} from "@/daemon/services/meeting/session-loop";
import type { SdkQueryOptions } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { ActiveMeetingEntry } from "@/daemon/services/meeting/registry";
import type { GuildHallEvent } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";
import { nullLog } from "@/daemon/lib/log";

describe("composeMeetingPrompt", () => {
  test("new session with sessionContext: combines context + greeting (REQ-SPO-21)", () => {
    const result = composeMeetingPrompt("SESSION_CONTEXT", "unused", true);

    expect(result).toContain("SESSION_CONTEXT");
    expect(result).toContain(MEETING_GREETING_PROMPT);
    expect(result).toBe(`SESSION_CONTEXT\n\n${MEETING_GREETING_PROMPT}`);
  });

  test("new session without sessionContext: greeting only (REQ-SPO-21)", () => {
    const result = composeMeetingPrompt("", "unused", true);

    expect(result).toBe(MEETING_GREETING_PROMPT);
  });

  test("renewal with sessionContext: sessionContext only, no greeting (REQ-SPO-23)", () => {
    const result = composeMeetingPrompt("RENEWAL_CONTEXT", "fallback", false);

    expect(result).toBe("RENEWAL_CONTEXT");
    expect(result).not.toContain(MEETING_GREETING_PROMPT);
  });

  test("renewal without sessionContext: falls back to prompt", () => {
    const result = composeMeetingPrompt("", "FALLBACK_PROMPT", false);

    expect(result).toBe("FALLBACK_PROMPT");
  });

  test("resume path: no sessionContext, uses prompt (REQ-SPO-22)", () => {
    // Resume passes the user message as prompt with no sessionContext
    const result = composeMeetingPrompt("", "User typed this", false);

    expect(result).toBe("User typed this");
  });
});

// -- iterateSession post-loop cleanup --

describe("iterateSession post-loop cleanup", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  // SDK message fixtures for a minimal session
  function makeInitMessage(sessionId = "sdk-session-test"): SDKMessage {
    return {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
      apiKeySource: "user",
      betas: [],
      claude_code_version: "2.1.50",
      cwd: "/tmp",
      tools: [],
      mcp_servers: [],
      model: "claude-sonnet-4-6",
      permissionMode: "default",
      slash_commands: [],
      output_style: "text",
      skills: [],
      plugins: [],
    } as unknown as SDKMessage;
  }

  function makeResultSuccess(): SDKMessage {
    return {
      type: "result",
      subtype: "success",
      total_cost_usd: 0.01,
      duration_ms: 100,
      duration_api_ms: 90,
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
      uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "sdk-session-test",
    } as unknown as SDKMessage;
  }

  async function collectEvents(
    gen: AsyncGenerator<GuildHallEvent>,
  ): Promise<GuildHallEvent[]> {
    const events: GuildHallEvent[] = [];
    for await (const event of gen) {
      events.push(event);
    }
    return events;
  }

  test("late-arriving lastCompactSummary is appended to transcript after loop exits", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-loop-test-"));
    const meetingsDir = path.join(tmpDir, "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });

    const meetingId = asMeetingId("test-meeting-postloop");

    // Create a minimal transcript file so appendCompactSummarySafe can append
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "---\nmeeting: test\n---\n",
      "utf-8",
    );

    const meeting: ActiveMeetingEntry = {
      meetingId,
      projectName: "test-project",
      workerName: "test-worker",
      packageName: "test-worker",
      sdkSessionId: null,
      worktreeDir: tmpDir,
      branchName: "test-branch",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
    };

    // queryFn that simulates the PostCompact hook firing after the stream ends.
    // After yielding the last SDK message, it sets lastCompactSummary on the
    // shared meeting object. This runs before the for-await loop in
    // runSdkSession exits, simulating the race condition where the hook
    // callback fires after the boundary event was already processed.
    // eslint-disable-next-line @typescript-eslint/require-await -- AsyncGenerator required by queryFn signature; yields but doesn't await
    async function* lateHookQuery(_params: {
      prompt: string;
      options: SdkQueryOptions;
    }): AsyncGenerator<SDKMessage> {
      yield makeInitMessage();
      yield makeResultSuccess();
      // Simulate PostCompact hook firing late
      meeting.lastCompactSummary = "Late-arriving summary from PostCompact hook";
    }

    const deps: SessionLoopDeps = {
      queryFn: lateHookQuery,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      prepDeps: {} as SessionLoopDeps["prepDeps"],
    };

    const options: SdkQueryOptions = {};
    await collectEvents(
      iterateSession(deps, meeting, "test prompt", options, false),
    );

    // The post-loop cleanup should have called appendCompactSummarySafe
    // and cleared the field
    expect(meeting.lastCompactSummary).toBeUndefined();

    // Verify the summary was appended to the transcript file
    const transcript = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    expect(transcript).toContain("> Summary: Late-arriving summary from PostCompact hook");
  });

  test("no post-loop cleanup when lastCompactSummary is not set", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-loop-test-"));
    const meetingsDir = path.join(tmpDir, "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });

    const meetingId = asMeetingId("test-meeting-no-postloop");
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "---\nmeeting: test\n---\n",
      "utf-8",
    );

    const meeting: ActiveMeetingEntry = {
      meetingId,
      projectName: "test-project",
      workerName: "test-worker",
      packageName: "test-worker",
      sdkSessionId: null,
      worktreeDir: tmpDir,
      branchName: "test-branch",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
    };

    // eslint-disable-next-line @typescript-eslint/require-await -- AsyncGenerator required by queryFn signature; yields but doesn't await
    async function* normalQuery(_params: {
      prompt: string;
      options: SdkQueryOptions;
    }): AsyncGenerator<SDKMessage> {
      yield makeInitMessage();
      yield makeResultSuccess();
      // No lastCompactSummary set
    }

    const deps: SessionLoopDeps = {
      queryFn: normalQuery,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      prepDeps: {} as SessionLoopDeps["prepDeps"],
    };

    await collectEvents(
      iterateSession(deps, meeting, "test prompt", {}, false),
    );

    // No summary was set, so transcript should be unchanged
    const transcript = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    expect(transcript).not.toContain("> Summary:");
    expect(meeting.lastCompactSummary).toBeUndefined();
  });

  test("iterateSession persists errors to transcript via appendErrorSafe (REQ-MEP-2/4)", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-loop-test-"));
    const meetingsDir = path.join(tmpDir, "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });

    const meetingId = asMeetingId("test-meeting-error-persist");
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "---\nmeeting: test\n---\n",
      "utf-8",
    );

    const meeting: ActiveMeetingEntry = {
      meetingId,
      projectName: "test-project",
      workerName: "test-worker",
      packageName: "test-worker",
      sdkSessionId: null,
      worktreeDir: tmpDir,
      branchName: "test-branch",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
    };

    // queryFn that yields an init message then an error
    // eslint-disable-next-line @typescript-eslint/require-await -- AsyncGenerator required by queryFn signature
    async function* errorQuery(_params: {
      prompt: string;
      options: SdkQueryOptions;
    }): AsyncGenerator<SDKMessage> {
      yield makeInitMessage();
      yield {
        type: "result",
        subtype: "error",
        errors: ["Session expired"],
        is_error: true,
        duration_ms: 50,
        duration_api_ms: 40,
        num_turns: 0,
        total_cost_usd: 0,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
        session_id: "sdk-session-test",
      } as unknown as SDKMessage;
    }

    const deps: SessionLoopDeps = {
      queryFn: errorQuery,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      prepDeps: {} as SessionLoopDeps["prepDeps"],
    };

    const events = await collectEvents(
      iterateSession(deps, meeting, "test prompt", {}, false),
    );

    // Verify the error event was yielded
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);

    // Verify the error was persisted to transcript
    const transcript = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    expect(transcript).toContain("## Error (");
    expect(transcript).toContain("Session expired");
  });

  test("inserts line break between text blocks separated by tool use", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-loop-test-"));
    const meetingsDir = path.join(tmpDir, "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });

    const meetingId = asMeetingId("test-meeting-tool-linebreak");
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "---\nmeeting: test\n---\n",
      "utf-8",
    );

    const meeting: ActiveMeetingEntry = {
      meetingId,
      projectName: "test-project",
      workerName: "test-worker",
      packageName: "test-worker",
      sdkSessionId: null,
      worktreeDir: tmpDir,
      branchName: "test-branch",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
    };

    // queryFn that simulates: text → tool_use → tool_result → text
    // eslint-disable-next-line @typescript-eslint/require-await -- AsyncGenerator required by queryFn signature
    async function* toolBetweenTextQuery(_params: {
      prompt: string;
      options: SdkQueryOptions;
    }): AsyncGenerator<SDKMessage> {
      yield makeInitMessage();
      // First text block
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Let me look that up." },
        },
      } as unknown as SDKMessage;
      // Tool use start
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "tool-1", name: "search", input: {} },
        },
      } as unknown as SDKMessage;
      // Tool result (user message with tool_result block)
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: "Found 3 results",
            },
          ],
        },
      } as unknown as SDKMessage;
      // Second text block (after tool)
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 2,
          delta: { type: "text_delta", text: "Okay I found what you mentioned." },
        },
      } as unknown as SDKMessage;
      yield makeResultSuccess();
    }

    const deps: SessionLoopDeps = {
      queryFn: toolBetweenTextQuery,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      prepDeps: {} as SessionLoopDeps["prepDeps"],
    };

    const events = await collectEvents(
      iterateSession(deps, meeting, "test prompt", {}, false),
    );

    // The text_delta events should still stream individually
    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas.length).toBe(2);

    // The transcript should have a line break between the two text blocks
    const transcript = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    expect(transcript).toContain("Let me look that up.\n\nOkay I found what you mentioned.");
    // Should NOT have them concatenated without spacing
    expect(transcript).not.toContain("Let me look that up.Okay");
  });

  test("no spurious line break when tool use precedes first text", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-loop-test-"));
    const meetingsDir = path.join(tmpDir, "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });

    const meetingId = asMeetingId("test-meeting-tool-first");
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "---\nmeeting: test\n---\n",
      "utf-8",
    );

    const meeting: ActiveMeetingEntry = {
      meetingId,
      projectName: "test-project",
      workerName: "test-worker",
      packageName: "test-worker",
      sdkSessionId: null,
      worktreeDir: tmpDir,
      branchName: "test-branch",
      abortController: new AbortController(),
      status: "open",
      scope: "activity",
    };

    // queryFn: tool_use → tool_result → text (no text before tool)
    // eslint-disable-next-line @typescript-eslint/require-await -- AsyncGenerator required by queryFn signature
    async function* toolFirstQuery(_params: {
      prompt: string;
      options: SdkQueryOptions;
    }): AsyncGenerator<SDKMessage> {
      yield makeInitMessage();
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "tool-1", name: "search", input: {} },
        },
      } as unknown as SDKMessage;
      yield {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "result" },
          ],
        },
      } as unknown as SDKMessage;
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 1,
          delta: { type: "text_delta", text: "Here are the results." },
        },
      } as unknown as SDKMessage;
      yield makeResultSuccess();
    }

    const deps: SessionLoopDeps = {
      queryFn: toolFirstQuery,
      guildHallHome: tmpDir,
      log: nullLog("test"),
      prepDeps: {} as SessionLoopDeps["prepDeps"],
    };

    await collectEvents(
      iterateSession(deps, meeting, "test prompt", {}, false),
    );

    const transcript = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    // The text should appear without a spurious leading line break injected
    // by the tool-completion flag. The assistant section header naturally
    // produces "\n\n" before the text, but there should be no extra "\n\n\n\n".
    expect(transcript).toContain("Here are the results.");
    expect(transcript).not.toContain("\n\n\n\nHere are the results.");
  });
});
