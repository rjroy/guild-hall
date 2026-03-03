import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  truncateTranscript,
  appendAssistantTurnSafe,
  createTranscript,
  readTranscript,
  TRANSCRIPT_MAX_CHARS,
} from "@/daemon/services/transcript";

// -- truncateTranscript --

describe("truncateTranscript", () => {
  test("returns original string when under limit", () => {
    const transcript = "## User (2024-01-01T00:00:00Z)\n\nHello\n\n## Assistant (2024-01-01T00:00:01Z)\n\nWorld\n";
    expect(truncateTranscript(transcript, 1000)).toBe(transcript);
  });

  test("returns original string when exactly at limit", () => {
    const transcript = "## User (2024-01-01T00:00:00Z)\n\nHello\n";
    expect(truncateTranscript(transcript, transcript.length)).toBe(transcript);
  });

  test("handles empty string", () => {
    expect(truncateTranscript("", 100)).toBe("");
  });

  test("preserves turn boundaries when truncating", () => {
    const turn1 = "## User (2024-01-01T00:00:00Z)\n\nFirst message that is fairly long\n";
    const turn2 = "## Assistant (2024-01-01T00:00:01Z)\n\nFirst response\n";
    const turn3 = "## User (2024-01-01T00:00:02Z)\n\nSecond message\n";
    const turn4 = "## Assistant (2024-01-01T00:00:03Z)\n\nSecond response\n";
    const transcript = turn1 + "\n" + turn2 + "\n" + turn3 + "\n" + turn4;

    // Set limit so only the last two turns fit
    const lastTwoLen = turn3.length + turn4.length + 2; // +2 for the \n between them
    const result = truncateTranscript(transcript, lastTwoLen);

    // Should not contain the first turns
    expect(result).not.toContain("First message");
    expect(result).not.toContain("First response");
    // Should contain the last turns
    expect(result).toContain("Second message");
    expect(result).toContain("Second response");
  });

  test("drops leading turns to fit within budget", () => {
    // Build a transcript where each turn is about 50 chars
    const turns: string[] = [];
    for (let i = 0; i < 10; i++) {
      const role = i % 2 === 0 ? "User" : "Assistant";
      turns.push(`## ${role} (2024-01-01T00:0${i}:00Z)\n\nTurn number ${i}\n`);
    }
    const transcript = turns.join("\n");

    // Truncate to fit approximately the last 3 turns
    const lastThree = turns.slice(-3).join("\n");
    const result = truncateTranscript(transcript, lastThree.length);

    // The result should contain the last few turns
    expect(result).toContain("Turn number 9");
    expect(result).toContain("Turn number 8");
    // Should not contain the earliest turns
    expect(result).not.toContain("Turn number 0");
    expect(result).not.toContain("Turn number 1");
  });

  test("uses default maxChars when not specified", () => {
    // A short transcript should pass through unchanged with default limit
    const transcript = "## User (2024-01-01T00:00:00Z)\n\nShort\n";
    expect(truncateTranscript(transcript)).toBe(transcript);
    // Verify the default constant
    expect(TRANSCRIPT_MAX_CHARS).toBe(30000);
  });
});

// -- appendAssistantTurnSafe --

describe("appendAssistantTurnSafe", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-transcript-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("appends formatted turn with text and tool uses", async () => {
    const meetingId = "test-meeting-001";
    await createTranscript(meetingId, "test-worker", "test-project", tmpDir);

    await appendAssistantTurnSafe(
      meetingId,
      ["Hello ", "world"],
      [{ toolName: "read_file", result: "file contents here" }],
      tmpDir,
    );

    const content = await readTranscript(meetingId, tmpDir);
    expect(content).toContain("## Assistant");
    expect(content).toContain("Hello world");
    expect(content).toContain("> Tool: read_file");
    expect(content).toContain("> file contents here");
  });

  test("appends turn with text only (no tool uses)", async () => {
    const meetingId = "test-meeting-002";
    await createTranscript(meetingId, "test-worker", "test-project", tmpDir);

    await appendAssistantTurnSafe(
      meetingId,
      ["Just text"],
      [],
      tmpDir,
    );

    const content = await readTranscript(meetingId, tmpDir);
    expect(content).toContain("## Assistant");
    expect(content).toContain("Just text");
    expect(content).not.toContain("> Tool:");
  });

  test("appends turn with tool uses only (no text)", async () => {
    const meetingId = "test-meeting-003";
    await createTranscript(meetingId, "test-worker", "test-project", tmpDir);

    await appendAssistantTurnSafe(
      meetingId,
      [],
      [{ toolName: "bash", result: "output" }],
      tmpDir,
    );

    const content = await readTranscript(meetingId, tmpDir);
    expect(content).toContain("## Assistant");
    expect(content).toContain("> Tool: bash");
    expect(content).toContain("> output");
  });

  test("skips append when both text and tool uses are empty", async () => {
    const meetingId = "test-meeting-004";
    await createTranscript(meetingId, "test-worker", "test-project", tmpDir);

    const beforeContent = await readTranscript(meetingId, tmpDir);
    await appendAssistantTurnSafe(meetingId, [], [], tmpDir);
    const afterContent = await readTranscript(meetingId, tmpDir);

    // Content should be unchanged
    expect(afterContent).toBe(beforeContent);
  });

  test("skips append when text parts are empty strings and no tool uses", async () => {
    const meetingId = "test-meeting-005";
    await createTranscript(meetingId, "test-worker", "test-project", tmpDir);

    const beforeContent = await readTranscript(meetingId, tmpDir);
    await appendAssistantTurnSafe(meetingId, ["", ""], [], tmpDir);
    const afterContent = await readTranscript(meetingId, tmpDir);

    expect(afterContent).toBe(beforeContent);
  });

  test("swallows write errors gracefully (does not throw)", async () => {
    // Use a non-existent directory that can't be created (path traversal
    // rejection). The meetingId validation in appendAssistantTurn will throw,
    // and appendAssistantTurnSafe should swallow it.
    // Actually, the validation happens inside appendAssistantTurn which is
    // called by appendAssistantTurnSafe. Let's use a meetingId that would
    // cause a write to fail by pointing to a non-existent home.
    const bogusHome = path.join(tmpDir, "nonexistent", "deep", "path");
    // Don't create the directory, so the write will fail

    // Should not throw
    await appendAssistantTurnSafe(
      "some-meeting",
      ["some text"],
      [{ toolName: "test", result: "result" }],
      bogusHome,
    );
    // If we get here without throwing, the test passes
  });

  test("swallows errors for permission-denied scenarios", async () => {
    const meetingId = "test-meeting-006";
    // Point to a directory we can't write to (the meetings subdir won't exist)
    const readOnlyHome = path.join(tmpDir, "readonly");
    await fs.mkdir(path.join(readOnlyHome, "meetings"), { recursive: true });

    // Create a transcript file, then make the directory read-only
    const transcriptFile = path.join(readOnlyHome, "meetings", `${meetingId}.md`);
    await fs.writeFile(transcriptFile, "---\n---\n", "utf-8");
    await fs.chmod(path.join(readOnlyHome, "meetings"), 0o444);

    try {
      // Should not throw even though write will fail
      await appendAssistantTurnSafe(
        meetingId,
        ["text"],
        [{ toolName: "test", result: "result" }],
        readOnlyHome,
      );
    } finally {
      // Restore permissions for cleanup
      await fs.chmod(path.join(readOnlyHome, "meetings"), 0o755);
    }
  });
});
