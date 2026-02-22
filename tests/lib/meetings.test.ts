import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  scanMeetings,
  scanMeetingRequests,
  readMeetingMeta,
  parseTranscriptToMessages,
} from "@/lib/meetings";

// -- Test state --

let tmpRoot: string;
let projectLorePath: string;
let meetingsDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "meetings-lib-test-"));
  projectLorePath = path.join(tmpRoot, "project", ".lore");
  meetingsDir = path.join(projectLorePath, "meetings");
  await fs.mkdir(meetingsDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// -- Helpers --

function writeMeetingArtifact(
  filename: string,
  overrides: Record<string, string> = {},
): Promise<void> {
  const defaults: Record<string, string> = {
    title: "Audience with Guild Assistant",
    date: "2026-02-21",
    status: "requested",
    tags: "[meeting]",
    worker: "Assistant",
    workerDisplayTitle: "Guild Assistant",
    agenda: "Review the architecture",
    deferred_until: "",
    linked_artifacts: "[]",
    notes_summary: "",
  };

  const fields = { ...defaults, ...overrides };

  const content = `---
title: "${fields.title}"
date: ${fields.date}
status: ${fields.status}
tags: ${fields.tags}
worker: ${fields.worker}
workerDisplayTitle: "${fields.workerDisplayTitle}"
agenda: "${fields.agenda}"
deferred_until: "${fields.deferred_until}"
linked_artifacts: ${fields.linked_artifacts}
notes_summary: "${fields.notes_summary}"
---
`;

  return fs.writeFile(path.join(meetingsDir, filename), content, "utf-8");
}

// -- Tests --

describe("readMeetingMeta", () => {
  test("parses frontmatter correctly", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      title: "Audience with Guild Assistant",
      status: "requested",
      worker: "Assistant",
      agenda: "Review the architecture",
      workerDisplayTitle: "Guild Assistant",
    });

    const meta = await readMeetingMeta(
      path.join(meetingsDir, "audience-Assistant-20260221-120000.md"),
      "test-project",
    );

    expect(meta.meetingId).toBe("audience-Assistant-20260221-120000");
    expect(meta.title).toBe("Audience with Guild Assistant");
    expect(meta.status).toBe("requested");
    expect(meta.worker).toBe("Assistant");
    expect(meta.agenda).toBe("Review the architecture");
    expect(meta.workerDisplayTitle).toBe("Guild Assistant");
    expect(meta.projectName).toBe("test-project");
    expect(meta.date).toBe("2026-02-21");
    expect(meta.deferred_until).toBe("");
    expect(meta.linked_artifacts).toEqual([]);
    expect(meta.notes_summary).toBe("");
  });

  test("extracts meetingId from filename", async () => {
    await writeMeetingArtifact("audience-Researcher-20260301-093000.md", {
      worker: "Researcher",
    });

    const meta = await readMeetingMeta(
      path.join(meetingsDir, "audience-Researcher-20260301-093000.md"),
      "my-project",
    );

    expect(meta.meetingId).toBe("audience-Researcher-20260301-093000");
  });

  test("handles malformed frontmatter gracefully", async () => {
    await fs.writeFile(
      path.join(meetingsDir, "bad-frontmatter.md"),
      "this is not valid frontmatter at all",
      "utf-8",
    );

    const meta = await readMeetingMeta(
      path.join(meetingsDir, "bad-frontmatter.md"),
      "test-project",
    );

    expect(meta.meetingId).toBe("bad-frontmatter");
    expect(meta.title).toBe("");
    expect(meta.status).toBe("");
    expect(meta.projectName).toBe("test-project");
  });

  test("handles missing optional fields with defaults", async () => {
    // Write a minimal artifact with only title and status
    await fs.writeFile(
      path.join(meetingsDir, "minimal.md"),
      `---
title: "Minimal"
status: open
---
`,
      "utf-8",
    );

    const meta = await readMeetingMeta(
      path.join(meetingsDir, "minimal.md"),
      "test-project",
    );

    expect(meta.title).toBe("Minimal");
    expect(meta.status).toBe("open");
    expect(meta.worker).toBe("");
    expect(meta.agenda).toBe("");
    expect(meta.deferred_until).toBe("");
    expect(meta.linked_artifacts).toEqual([]);
  });
});

describe("scanMeetings", () => {
  test("returns all meeting artifacts with parsed metadata", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "open",
    });
    await writeMeetingArtifact("audience-Researcher-20260221-130000.md", {
      status: "requested",
      worker: "Researcher",
      workerDisplayTitle: "Guild Researcher",
    });

    const meetings = await scanMeetings(projectLorePath, "test-project");

    expect(meetings).toHaveLength(2);
    const ids = meetings.map((m) => m.meetingId).sort();
    expect(ids).toEqual([
      "audience-Assistant-20260221-120000",
      "audience-Researcher-20260221-130000",
    ]);

    // Verify metadata is parsed
    const assistant = meetings.find(
      (m) => m.meetingId === "audience-Assistant-20260221-120000",
    );
    expect(assistant?.status).toBe("open");
    expect(assistant?.projectName).toBe("test-project");
  });

  test("returns empty array when meetings directory does not exist", async () => {
    // Remove the meetings directory
    await fs.rm(meetingsDir, { recursive: true, force: true });

    const meetings = await scanMeetings(projectLorePath, "test-project");
    expect(meetings).toEqual([]);
  });

  test("returns empty array for empty meetings directory", async () => {
    // meetingsDir exists but is empty
    const meetings = await scanMeetings(projectLorePath, "test-project");
    expect(meetings).toEqual([]);
  });

  test("skips non-markdown files", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md");
    await fs.writeFile(
      path.join(meetingsDir, "notes.txt"),
      "not a meeting",
      "utf-8",
    );
    await fs.writeFile(
      path.join(meetingsDir, "state.json"),
      "{}",
      "utf-8",
    );

    const meetings = await scanMeetings(projectLorePath, "test-project");
    expect(meetings).toHaveLength(1);
    expect(meetings[0].meetingId).toBe("audience-Assistant-20260221-120000");
  });

  test("returns empty array when lore path does not exist", async () => {
    const nonExistentLorePath = path.join(tmpRoot, "nonexistent", ".lore");
    const meetings = await scanMeetings(nonExistentLorePath, "test-project");
    expect(meetings).toEqual([]);
  });
});

describe("scanMeetingRequests", () => {
  test("filters to only requested status", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "open",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-130000.md", {
      status: "requested",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-140000.md", {
      status: "closed",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-150000.md", {
      status: "requested",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.status === "requested")).toBe(true);
  });

  test("returns requested items regardless of deferred_until value", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "requested",
      deferred_until: "2026-03-15",
      date: "2026-02-20",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-130000.md", {
      status: "requested",
      deferred_until: "",
      date: "2026-02-19",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.status === "requested")).toBe(true);
    const deferValues = requests.map((r) => r.deferred_until).sort();
    expect(deferValues).toEqual(["", "2026-03-15"]);
  });

  test("returns all requested items with varied deferred_until dates", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "requested",
      deferred_until: "2026-04-01",
      date: "2026-02-20",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-130000.md", {
      status: "requested",
      deferred_until: "2026-03-01",
      date: "2026-02-20",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.status === "requested")).toBe(true);
    const deferValues = requests.map((r) => r.deferred_until).sort();
    expect(deferValues).toEqual(["2026-03-01", "2026-04-01"]);
  });

  test("returns all requested items with varied dates", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "requested",
      deferred_until: "",
      date: "2026-02-19",
    });
    await writeMeetingArtifact("audience-Assistant-20260221-130000.md", {
      status: "requested",
      deferred_until: "",
      date: "2026-02-21",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.status === "requested")).toBe(true);
    const dates = requests.map((r) => r.date).sort();
    expect(dates).toEqual(["2026-02-19", "2026-02-21"]);
  });

  test("returns empty array when no requests exist", async () => {
    await writeMeetingArtifact("audience-Assistant-20260221-120000.md", {
      status: "open",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");
    expect(requests).toEqual([]);
  });

  test("returns empty array for empty directory", async () => {
    const requests = await scanMeetingRequests(projectLorePath, "test-project");
    expect(requests).toEqual([]);
  });

  test("returns all requested items regardless of deferred state or date", async () => {
    // Active request (no deferred), newest date
    await writeMeetingArtifact("meeting-a.md", {
      status: "requested",
      deferred_until: "",
      date: "2026-02-21",
    });
    // Active request (no deferred), older date
    await writeMeetingArtifact("meeting-b.md", {
      status: "requested",
      deferred_until: "",
      date: "2026-02-18",
    });
    // Deferred to later
    await writeMeetingArtifact("meeting-c.md", {
      status: "requested",
      deferred_until: "2026-04-01",
      date: "2026-02-20",
    });
    // Deferred to sooner
    await writeMeetingArtifact("meeting-d.md", {
      status: "requested",
      deferred_until: "2026-03-01",
      date: "2026-02-20",
    });

    const requests = await scanMeetingRequests(projectLorePath, "test-project");

    expect(requests).toHaveLength(4);
    expect(requests.every((r) => r.status === "requested")).toBe(true);
    const ids = requests.map((r) => r.meetingId).sort();
    expect(ids).toEqual(["meeting-a", "meeting-b", "meeting-c", "meeting-d"]);
  });
});

// -- parseTranscriptToMessages tests --

describe("parseTranscriptToMessages", () => {
  test("correctly parses user and assistant turns", () => {
    const transcript = `---
meetingId: test-meeting
worker: "Assistant"
project: "test-project"
started: 2026-02-21T12:00:00.000Z
---

## User (2026-02-21T12:00:01.000Z)

Hello, can you review this code?

## Assistant (2026-02-21T12:00:05.000Z)

Sure, I'll take a look at the code now.

## User (2026-02-21T12:00:10.000Z)

What do you think about the architecture?

## Assistant (2026-02-21T12:00:15.000Z)

The architecture looks solid overall.
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(4);

    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello, can you review this code?");
    expect(messages[0].id).toBe("transcript-1");

    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe(
      "Sure, I'll take a look at the code now.",
    );
    expect(messages[1].id).toBe("transcript-2");
    expect(messages[1].toolUses).toBeUndefined();

    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toBe(
      "What do you think about the architecture?",
    );

    expect(messages[3].role).toBe("assistant");
    expect(messages[3].content).toBe(
      "The architecture looks solid overall.",
    );
  });

  test("handles empty transcript", () => {
    expect(parseTranscriptToMessages("")).toEqual([]);
    expect(parseTranscriptToMessages("  \n  ")).toEqual([]);
  });

  test("handles transcript with only frontmatter", () => {
    const transcript = `---
meetingId: test-meeting
worker: "Assistant"
project: "test-project"
started: 2026-02-21T12:00:00.000Z
---
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toEqual([]);
  });

  test("extracts tool uses from blockquotes", () => {
    const transcript = `---
meetingId: test-meeting
worker: "Assistant"
project: "test-project"
started: 2026-02-21T12:00:00.000Z
---

## User (2026-02-21T12:00:01.000Z)

Read the config file.

## Assistant (2026-02-21T12:00:05.000Z)

I'll read the config file for you.

> Tool: read_file
> File content here
> More content

And here are my findings.

> Tool: write_file
> File written successfully
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(2);

    const assistant = messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toContain(
      "I'll read the config file for you.",
    );
    expect(assistant.content).toContain("And here are my findings.");

    expect(assistant.toolUses).toBeDefined();
    expect(assistant.toolUses).toHaveLength(2);

    expect(assistant.toolUses![0].name).toBe("read_file");
    expect(assistant.toolUses![0].status).toBe("complete");
    expect(assistant.toolUses![0].output).toBe(
      "File content here\nMore content",
    );

    expect(assistant.toolUses![1].name).toBe("write_file");
    expect(assistant.toolUses![1].status).toBe("complete");
    expect(assistant.toolUses![1].output).toBe("File written successfully");
  });

  test("handles assistant turn with only tool uses and no text", () => {
    const transcript = `---
meetingId: test-meeting
worker: "Assistant"
project: "test-project"
started: 2026-02-21T12:00:00.000Z
---

## Assistant (2026-02-21T12:00:05.000Z)

> Tool: search_code
> Found 3 matches
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("");
    expect(messages[0].toolUses).toHaveLength(1);
    expect(messages[0].toolUses![0].name).toBe("search_code");
  });

  test("generates sequential transcript IDs", () => {
    const transcript = `---
meetingId: test
---

## User (2026-02-21T12:00:01.000Z)

First

## Assistant (2026-02-21T12:00:02.000Z)

Second

## User (2026-02-21T12:00:03.000Z)

Third
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages[0].id).toBe("transcript-1");
    expect(messages[1].id).toBe("transcript-2");
    expect(messages[2].id).toBe("transcript-3");
  });

  test("tool use with no result lines has undefined output", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

> Tool: empty_tool
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].toolUses).toHaveLength(1);
    expect(messages[0].toolUses![0].name).toBe("empty_tool");
    expect(messages[0].toolUses![0].output).toBeUndefined();
  });
});
