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
});
