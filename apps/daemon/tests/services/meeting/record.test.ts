import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { MeetingId } from "@/apps/daemon/types";
import {
  meetingArtifactPath,
  readArtifactStatus,
  updateArtifactStatus,
  appendMeetingLog,
  closeArtifact,
  writeMeetingArtifact,
  writeNotesToArtifact,
} from "@/apps/daemon/services/meeting/record";

let tmpDir: string;
const meetingId = "audience-researcher-20260301-120000" as MeetingId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-meeting-record-"));
  // Ensure the canonical meeting artifact directory exists so writes succeed.
  // meetingArtifactPath now returns .lore/work/meetings/<id>.md (REQ-LDR-21).
  await fs.mkdir(path.dirname(meetingArtifactPath(tmpDir, meetingId)), {
    recursive: true,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test meeting artifact with the standard frontmatter structure.
 * Returns the content written so tests can verify it.
 */
async function writeTestArtifact(
  overrides?: Partial<{
    status: string;
    meeting_log: string;
  }>,
): Promise<string> {
  const status = overrides?.status ?? "open";
  const meetingLog = overrides?.meeting_log ??
    `meeting_log:
  - timestamp: 2026-03-01T12:00:00.000Z
    event: opened
    reason: "User started audience"`;

  const content = `---
title: "Audience with The Researcher"
date: 2026-03-01
status: ${status}
tags: [meeting]
worker: researcher
workerDisplayTitle: "The Researcher"
agenda: "Discuss architecture patterns"
deferred_until: ""
linked_artifacts: []
${meetingLog}
---
`;

  const artifactPath = meetingArtifactPath(tmpDir, meetingId);
  await fs.writeFile(artifactPath, content, "utf-8");
  return content;
}

// -- readArtifactStatus --

describe("readArtifactStatus", () => {
  test("reads status from frontmatter", async () => {
    await writeTestArtifact({ status: "open" });
    const status = await readArtifactStatus(tmpDir, meetingId);
    expect(status).toBe("open");
  });

  test("reads requested status", async () => {
    await writeTestArtifact({ status: "requested" });
    const status = await readArtifactStatus(tmpDir, meetingId);
    expect(status).toBe("requested");
  });

  test("reads closed status", async () => {
    await writeTestArtifact({ status: "closed" });
    const status = await readArtifactStatus(tmpDir, meetingId);
    expect(status).toBe("closed");
  });

  test("returns null when status field is missing", async () => {
    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    // Write a minimal artifact without a status field
    await fs.writeFile(artifactPath, `---
title: "No status"
---
`, "utf-8");
    const status = await readArtifactStatus(tmpDir, meetingId);
    expect(status).toBeNull();
  });
});

// -- updateArtifactStatus --

describe("updateArtifactStatus", () => {
  test("updates status field in frontmatter", async () => {
    await writeTestArtifact({ status: "open" });
    await updateArtifactStatus(tmpDir, meetingId, "closed");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: closed");
    expect(raw).not.toContain("status: open");
  });

  test("preserves other frontmatter fields", async () => {
    await writeTestArtifact({ status: "open" });
    await updateArtifactStatus(tmpDir, meetingId, "closed");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('title: "Audience with The Researcher"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain('agenda: "Discuss architecture patterns"');
  });
});

// -- appendMeetingLog --

describe("appendMeetingLog", () => {
  test("appends log entry before closing ---", async () => {
    await writeTestArtifact();
    await appendMeetingLog(tmpDir, meetingId, "closed", "User closed audience");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // The new log entry should appear in the content
    expect(raw).toContain("event: closed");
    expect(raw).toContain('reason: "User closed audience"');

    // The entry should be before the closing ---
    const entryIndex = raw.indexOf("event: closed");
    const closingIndex = raw.lastIndexOf("\n---");
    expect(entryIndex).toBeLessThan(closingIndex);
  });

  test("preserves existing log entries", async () => {
    await writeTestArtifact();
    await appendMeetingLog(tmpDir, meetingId, "closed", "User closed audience");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // Original log entry should still be present
    expect(raw).toContain("event: opened");
    expect(raw).toContain('reason: "User started audience"');
  });

  test("escapes double quotes in reason", async () => {
    await writeTestArtifact();
    await appendMeetingLog(tmpDir, meetingId, "note", 'Said "hello"');

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('reason: "Said \\"hello\\""');
  });
});

// -- writeMeetingArtifact --

describe("writeMeetingArtifact", () => {
  test("creates artifact without notes_summary in frontmatter", async () => {
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "The Researcher",
      "Discuss architecture",
      "researcher",
      "open",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).not.toContain("notes_summary");
  });

  test("produces valid frontmatter with expected fields", async () => {
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "The Researcher",
      "Discuss architecture",
      "researcher",
      "open",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).toContain('title: "Audience with The Researcher"');
    expect(raw).toContain("status: open");
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain('agenda: "Discuss architecture"');
    expect(raw).toContain("tags: [meeting]");
    expect(raw).toContain("linked_artifacts: []");
    expect(raw).toContain("meeting_log:");
    expect(raw).toContain("event: opened");
  });

  test("uses requested event for requested status", async () => {
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "The Researcher",
      "Review code",
      "researcher",
      "requested",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).toContain("status: requested");
    expect(raw).toContain("event: requested");
    expect(raw).toContain('reason: "Meeting requested"');
  });

  test("creates necessary directories", async () => {
    // Use a fresh path without pre-created directories
    const freshDir = path.join(tmpDir, "fresh-project");
    await writeMeetingArtifact(
      freshDir,
      meetingId,
      "The Researcher",
      "Test prompt",
      "researcher",
    );

    const artifactPath = meetingArtifactPath(freshDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("status: open");
  });

  test("body starts empty", async () => {
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "The Researcher",
      "Test prompt",
      "researcher",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // After the closing ---, only a newline should remain (empty body)
    const closingIndex = raw.lastIndexOf("\n---");
    const afterClosing = raw.slice(closingIndex + 4);
    expect(afterClosing.trim()).toBe("");
  });
});

// -- writeNotesToArtifact --

describe("writeNotesToArtifact", () => {
  test("writes notes to the body, not frontmatter", async () => {
    await writeTestArtifact();
    const notes = "## Summary\n\nThe meeting covered architecture patterns.";
    await writeNotesToArtifact(tmpDir, meetingId, notes);

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // Notes should appear after the closing ---
    const closingIndex = raw.lastIndexOf("\n---");
    const body = raw.slice(closingIndex + 4);
    expect(body.trim()).toBe(notes);
  });

  test("preserves frontmatter when writing notes", async () => {
    await writeTestArtifact({ status: "closed" });
    await writeNotesToArtifact(tmpDir, meetingId, "Some notes.");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).toContain("status: closed");
    expect(raw).toContain('title: "Audience with The Researcher"');
    expect(raw).toContain("worker: researcher");
  });

  test("replaces existing body content", async () => {
    // Write artifact with initial notes
    await writeTestArtifact();
    await writeNotesToArtifact(tmpDir, meetingId, "Initial notes.");

    // Overwrite with new notes
    await writeNotesToArtifact(tmpDir, meetingId, "Updated notes.");

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    const closingIndex = raw.lastIndexOf("\n---");
    const body = raw.slice(closingIndex + 4);
    expect(body.trim()).toBe("Updated notes.");
    expect(raw).not.toContain("Initial notes.");
  });

  test("handles multiline notes", async () => {
    await writeTestArtifact();
    const notes = "Line one.\n\nLine two.\n\nLine three.";
    await writeNotesToArtifact(tmpDir, meetingId, notes);

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    const closingIndex = raw.lastIndexOf("\n---");
    const body = raw.slice(closingIndex + 4);
    expect(body.trim()).toBe(notes);
  });
});

// -- closeArtifact --

describe("closeArtifact", () => {
  test("applies notes, status, and log in a single operation", async () => {
    await writeTestArtifact({ status: "open" });
    await closeArtifact(
      tmpDir, meetingId, "Meeting notes here.",
      "closed", "closed", "User closed audience",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // Status updated
    expect(raw).toContain("status: closed");
    expect(raw).not.toContain("status: open");

    // Log entry appended
    expect(raw).toContain("event: closed");
    expect(raw).toContain('reason: "User closed audience"');

    // Notes in body
    const closingIndex = raw.lastIndexOf("\n---");
    const body = raw.slice(closingIndex + 4);
    expect(body.trim()).toBe("Meeting notes here.");
  });

  test("preserves existing frontmatter fields", async () => {
    await writeTestArtifact({ status: "open" });
    await closeArtifact(
      tmpDir, meetingId, "Notes.",
      "closed", "closed", "Closed",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).toContain('title: "Audience with The Researcher"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain('agenda: "Discuss architecture patterns"');
  });

  test("preserves existing log entries", async () => {
    await writeTestArtifact();
    await closeArtifact(
      tmpDir, meetingId, "Notes.",
      "closed", "closed", "Closed",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    // Original log entry preserved
    expect(raw).toContain("event: opened");
    expect(raw).toContain('reason: "User started audience"');
    // New log entry present
    expect(raw).toContain("event: closed");
  });

  test("escapes backslashes and newlines in log reason", async () => {
    await writeTestArtifact();
    await closeArtifact(
      tmpDir, meetingId, "Notes.",
      "closed", "closed", 'Path: C:\\Users\\test\nSecond line',
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).toContain('reason: "Path: C:\\\\Users\\\\test\\nSecond line"');
  });
});

// -- writeMeetingArtifact does not include workerPortraitUrl --

describe("writeMeetingArtifact portrait removal", () => {
  test("does not include workerPortraitUrl in frontmatter", async () => {
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "The Researcher",
      "Discuss architecture",
      "researcher",
      "open",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");

    expect(raw).not.toContain("workerPortraitUrl");
    expect(raw).not.toContain("portraitUrl");
  });
});

// -- escapeYamlValue in writeMeetingArtifact --

describe("writeMeetingArtifact YAML escaping", () => {
  test("escapes backslashes in workerDisplayTitle", async () => {
    await writeMeetingArtifact(
      tmpDir, meetingId,
      "The Research\\er",
      "Test prompt",
      "researcher",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('workerDisplayTitle: "The Research\\\\er"');
  });

  test("escapes newlines in agenda", async () => {
    await writeMeetingArtifact(
      tmpDir, meetingId,
      "The Researcher",
      "Line one\nLine two",
      "researcher",
    );

    const artifactPath = meetingArtifactPath(tmpDir, meetingId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('agenda: "Line one\\nLine two"');
  });
});
