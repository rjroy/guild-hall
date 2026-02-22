import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createTranscript,
  appendUserTurn,
  appendAssistantTurn,
  readTranscript,
  readTranscriptMessages,
  parseTranscriptMessages,
  removeTranscript,
  transcriptPath,
  type ToolUseEntry,
} from "@/daemon/services/transcript";

// -- Test state --

let tmpRoot: string;
let ghHome: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "transcript-test-"));
  ghHome = path.join(tmpRoot, "guild-hall-home");
  await fs.mkdir(ghHome, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// -- Tests --

describe("transcript service", () => {
  describe("transcriptPath", () => {
    test("returns correct path under guildHallHome/meetings/", () => {
      const result = transcriptPath("audience-assistant-20260221-143000", ghHome);
      expect(result).toBe(
        path.join(ghHome, "meetings", "audience-assistant-20260221-143000.md"),
      );
    });

    test("rejects meetingId with forward slash", () => {
      expect(() => transcriptPath("../bad", ghHome)).toThrow("must not contain");
    });

    test("rejects meetingId with backslash", () => {
      expect(() => transcriptPath("foo\\bar", ghHome)).toThrow("must not contain");
    });

    test("rejects meetingId with ..", () => {
      expect(() => transcriptPath("foo..bar", ghHome)).toThrow("must not contain");
    });
  });

  describe("createTranscript", () => {
    test("creates transcript file with correct frontmatter", async () => {
      await createTranscript(
        "audience-assistant-20260221-143000",
        "sample-assistant",
        "guild-hall",
        ghHome,
      );

      const filePath = transcriptPath(
        "audience-assistant-20260221-143000",
        ghHome,
      );
      const content = await fs.readFile(filePath, "utf-8");

      expect(content).toStartWith("---\n");
      expect(content).toContain("meetingId: audience-assistant-20260221-143000");
      expect(content).toContain('worker: "sample-assistant"');
      expect(content).toContain('project: "guild-hall"');
      expect(content).toContain("started:");
      // Should end with closing frontmatter delimiter and newline
      expect(content).toMatch(/---\n$/);
    });

    test("creates meetings directory if it does not exist", async () => {
      const meetingsDir = path.join(ghHome, "meetings");
      // Verify directory doesn't exist yet
      const existsBefore = await fs
        .stat(meetingsDir)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(false);

      await createTranscript("test-meeting", "worker", "project", ghHome);

      const existsAfter = await fs
        .stat(meetingsDir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(true);
    });

    test("rejects path traversal in meetingId", async () => {
      await expect(
        createTranscript("../bad", "worker", "project", ghHome),
      ).rejects.toThrow("must not contain");
    });
  });

  describe("appendUserTurn", () => {
    test("appends user section with timestamp heading", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendUserTurn("test-meeting", "What should we work on?", ghHome);

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("## User (");
      expect(content).toContain("What should we work on?");
    });

    test("rejects path traversal in meetingId", async () => {
      await expect(
        appendUserTurn("foo/bar", "message", ghHome),
      ).rejects.toThrow("must not contain");
    });
  });

  describe("appendAssistantTurn", () => {
    test("appends assistant section with timestamp heading", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendAssistantTurn(
        "test-meeting",
        "Let me review the project...",
        undefined,
        ghHome,
      );

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("## Assistant (");
      expect(content).toContain("Let me review the project...");
    });

    test("renders tool uses as blockquotes", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      const tools: ToolUseEntry[] = [
        { toolName: "list_artifacts", result: "Listed 12 artifacts in .lore/" },
        { toolName: "Read", result: "File contents here" },
      ];
      await appendAssistantTurn(
        "test-meeting",
        "Based on my review...",
        tools,
        ghHome,
      );

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("> Tool: list_artifacts");
      expect(content).toContain("> Listed 12 artifacts in .lore/");
      expect(content).toContain("> Tool: Read");
      expect(content).toContain("> File contents here");
    });

    test("handles empty content with tool uses", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      const tools: ToolUseEntry[] = [
        { toolName: "Glob", result: "Found 5 files" },
      ];
      await appendAssistantTurn("test-meeting", "  ", tools, ghHome);

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("## Assistant (");
      expect(content).toContain("> Tool: Glob");
      expect(content).toContain("> Found 5 files");
    });

    test("handles content with no tool uses", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendAssistantTurn(
        "test-meeting",
        "Here is my analysis.",
        [],
        ghHome,
      );

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("Here is my analysis.");
      expect(content).not.toContain("> Tool:");
    });

    test("rejects path traversal in meetingId", async () => {
      await expect(
        appendAssistantTurn("foo\\bar", "content", undefined, ghHome),
      ).rejects.toThrow("must not contain");
    });
  });

  describe("readTranscript", () => {
    test("returns full transcript content", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendUserTurn("test-meeting", "Hello", ghHome);
      await appendAssistantTurn("test-meeting", "Hi there!", undefined, ghHome);

      const content = await readTranscript("test-meeting", ghHome);
      expect(content).toContain("meetingId: test-meeting");
      expect(content).toContain("## User (");
      expect(content).toContain("Hello");
      expect(content).toContain("## Assistant (");
      expect(content).toContain("Hi there!");
    });

    test("returns empty string for nonexistent transcript", async () => {
      const content = await readTranscript("nonexistent-meeting", ghHome);
      expect(content).toBe("");
    });

    test("rejects path traversal in meetingId", async () => {
      await expect(
        readTranscript("../etc/passwd", ghHome),
      ).rejects.toThrow("must not contain");
    });
  });

  describe("readTranscriptMessages", () => {
    test("parses user and assistant turns into message array", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendUserTurn("test-meeting", "What should we work on?", ghHome);
      await appendAssistantTurn(
        "test-meeting",
        "Let me review the project...",
        undefined,
        ghHome,
      );
      await appendUserTurn("test-meeting", "Good idea, proceed.", ghHome);
      await appendAssistantTurn(
        "test-meeting",
        "Working on it now.",
        undefined,
        ghHome,
      );

      const messages = await readTranscriptMessages("test-meeting", ghHome);
      expect(messages).toHaveLength(4);

      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What should we work on?");
      expect(messages[0].timestamp).toBeTruthy();

      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Let me review the project...");
      expect(messages[1].timestamp).toBeTruthy();

      expect(messages[2].role).toBe("user");
      expect(messages[2].content).toBe("Good idea, proceed.");

      expect(messages[3].role).toBe("assistant");
      expect(messages[3].content).toBe("Working on it now.");
    });

    test("parses tool uses from assistant turns", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      await appendUserTurn("test-meeting", "List the artifacts", ghHome);
      await appendAssistantTurn(
        "test-meeting",
        "Here are the artifacts:",
        [
          { toolName: "list_artifacts", result: "Listed 12 artifacts" },
          { toolName: "Read", result: "File contents" },
        ],
        ghHome,
      );

      const messages = await readTranscriptMessages("test-meeting", ghHome);
      expect(messages).toHaveLength(2);

      const assistantMsg = messages[1];
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.content).toBe("Here are the artifacts:");
      expect(assistantMsg.toolUses).toHaveLength(2);
      expect(assistantMsg.toolUses![0].toolName).toBe("list_artifacts");
      expect(assistantMsg.toolUses![0].result).toBe("Listed 12 artifacts");
      expect(assistantMsg.toolUses![1].toolName).toBe("Read");
      expect(assistantMsg.toolUses![1].result).toBe("File contents");
    });

    test("returns empty array for nonexistent transcript", async () => {
      const messages = await readTranscriptMessages(
        "nonexistent-meeting",
        ghHome,
      );
      expect(messages).toEqual([]);
    });

    test("handles transcript with only frontmatter (no turns)", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);
      const messages = await readTranscriptMessages("test-meeting", ghHome);
      expect(messages).toEqual([]);
    });
  });

  describe("parseTranscriptMessages (pure parsing)", () => {
    test("correctly splits on ## User and ## Assistant headings", () => {
      const raw = `---
meetingId: test
worker: assistant
project: guild-hall
started: 2026-02-21T14:30:00Z
---

## User (2026-02-21T14:30:05Z)

What should we work on next?

## Assistant (2026-02-21T14:30:12Z)

Let me review the current state of the project...

> Tool: list_artifacts
> Listed 12 artifacts in .lore/

Based on my review, I suggest focusing on...
`;

      const messages = parseTranscriptMessages(raw);
      expect(messages).toHaveLength(2);

      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What should we work on next?");
      expect(messages[0].timestamp).toBe("2026-02-21T14:30:05Z");

      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toContain("Let me review the current state");
      expect(messages[1].content).toContain("Based on my review, I suggest focusing on...");
      expect(messages[1].timestamp).toBe("2026-02-21T14:30:12Z");
      expect(messages[1].toolUses).toHaveLength(1);
      expect(messages[1].toolUses![0].toolName).toBe("list_artifacts");
      expect(messages[1].toolUses![0].result).toBe("Listed 12 artifacts in .lore/");
    });

    test("handles multiple tool uses in one assistant turn", () => {
      const raw = `---
meetingId: test
---

## Assistant (2026-02-21T14:30:12Z)

Checking things...

> Tool: Glob
> Found 5 files

> Tool: Read
> Contents of file.ts

Done reviewing.
`;

      const messages = parseTranscriptMessages(raw);
      expect(messages).toHaveLength(1);

      const msg = messages[0];
      expect(msg.role).toBe("assistant");
      expect(msg.toolUses).toHaveLength(2);
      expect(msg.toolUses![0].toolName).toBe("Glob");
      expect(msg.toolUses![1].toolName).toBe("Read");
      // Text content should include both text parts
      expect(msg.content).toContain("Checking things...");
      expect(msg.content).toContain("Done reviewing.");
    });

    test("handles empty input", () => {
      expect(parseTranscriptMessages("")).toEqual([]);
    });

    test("handles frontmatter only", () => {
      const raw = `---
meetingId: test
---
`;
      expect(parseTranscriptMessages(raw)).toEqual([]);
    });

    test("assistant turn with no tool uses has no toolUses property", () => {
      const raw = `---
meetingId: test
---

## Assistant (2026-02-21T14:30:12Z)

Just plain text here.
`;

      const messages = parseTranscriptMessages(raw);
      expect(messages).toHaveLength(1);
      expect(messages[0].toolUses).toBeUndefined();
    });
  });

  describe("removeTranscript", () => {
    test("deletes the transcript file", async () => {
      await createTranscript("test-meeting", "worker", "project", ghHome);

      // Verify file exists
      const filePath = transcriptPath("test-meeting", ghHome);
      const existsBefore = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      await removeTranscript("test-meeting", ghHome);

      // Verify file is gone
      const existsAfter = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    test("does not throw for nonexistent transcript", async () => {
      // Should not throw even when the file doesn't exist
      await expect(
        removeTranscript("nonexistent-meeting", ghHome),
      ).resolves.toBeUndefined();
    });

    test("rejects path traversal in meetingId", async () => {
      await expect(
        removeTranscript("../bad", ghHome),
      ).rejects.toThrow("must not contain");
    });
  });

  describe("path traversal protection", () => {
    test("rejects ../bad", () => {
      expect(() => transcriptPath("../bad", ghHome)).toThrow("must not contain");
    });

    test("rejects foo/bar", () => {
      expect(() => transcriptPath("foo/bar", ghHome)).toThrow("must not contain");
    });

    test("rejects foo\\bar", () => {
      expect(() => transcriptPath("foo\\bar", ghHome)).toThrow(
        "must not contain",
      );
    });

    test("rejects embedded .. like a..b", () => {
      expect(() => transcriptPath("a..b", ghHome)).toThrow("must not contain");
    });

    test("allows normal meetingId", () => {
      expect(() =>
        transcriptPath("audience-assistant-20260221-143000", ghHome),
      ).not.toThrow();
    });

    test("allows meetingId with hyphens and numbers", () => {
      expect(() =>
        transcriptPath("audience-assistant-20260221-143000-1", ghHome),
      ).not.toThrow();
    });
  });

  describe("full round-trip", () => {
    test("create, append turns, read back, and remove", async () => {
      const meetingId = "audience-assistant-20260221-143000";

      // Create
      await createTranscript(meetingId, "sample-assistant", "guild-hall", ghHome);

      // Append user turn
      await appendUserTurn(meetingId, "What should we work on next?", ghHome);

      // Append assistant turn with tools
      await appendAssistantTurn(
        meetingId,
        "Let me review the project...",
        [{ toolName: "list_artifacts", result: "Listed 12 artifacts in .lore/" }],
        ghHome,
      );

      // Append another user turn
      await appendUserTurn(meetingId, "Sounds good, proceed.", ghHome);

      // Append another assistant turn without tools
      await appendAssistantTurn(
        meetingId,
        "I will focus on the transcript storage implementation.",
        undefined,
        ghHome,
      );

      // Read raw
      const raw = await readTranscript(meetingId, ghHome);
      expect(raw).toContain("meetingId: " + meetingId);
      expect(raw).toContain("## User (");
      expect(raw).toContain("## Assistant (");
      expect(raw).toContain("> Tool: list_artifacts");

      // Parse into messages
      const messages = await readTranscriptMessages(meetingId, ghHome);
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].toolUses).toHaveLength(1);
      expect(messages[2].role).toBe("user");
      expect(messages[3].role).toBe("assistant");
      expect(messages[3].toolUses).toBeUndefined();

      // Remove
      await removeTranscript(meetingId, ghHome);
      const afterRemove = await readTranscript(meetingId, ghHome);
      expect(afterRemove).toBe("");
    });
  });
});
