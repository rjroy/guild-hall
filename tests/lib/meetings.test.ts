import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  scanMeetings,
  scanMeetingRequests,
  readMeetingMeta,
  getActiveMeetingWorktrees,
  parseTranscriptToMessages,
  sortMeetingArtifacts,
  sortMeetingRequests,
  sortActiveMeetings,
} from "@/lib/meetings";
import type { MeetingMeta } from "@/lib/meetings";
import type { Artifact } from "@/lib/types";

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
    body: "",
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
---
${fields.body}`;

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
    expect(meta.notes).toBe("");
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

// -- sortMeetingArtifacts tests --

function makeMeetingArtifact(overrides: {
  title?: string;
  status?: string;
  date?: string;
}): Artifact {
  return {
    meta: {
      title: overrides.title ?? "",
      date: overrides.date ?? "",
      status: overrides.status ?? "",
      tags: [],
    },
    filePath: "/tmp/meeting.md",
    relativePath: "meeting.md",
    content: "",
    lastModified: new Date(),
  };
}

describe("sortMeetingArtifacts", () => {
  test("open meetings sort before non-open meetings", () => {
    const closed = makeMeetingArtifact({ title: "Closed", status: "closed", date: "2026-03-01" });
    const open = makeMeetingArtifact({ title: "Open", status: "open", date: "2026-01-01" });
    const requested = makeMeetingArtifact({ title: "Requested", status: "requested", date: "2026-02-01" });

    const sorted = sortMeetingArtifacts([closed, open, requested]);
    expect(sorted[0].meta.status).toBe("open");
    expect(sorted[1].meta.status).toBe("closed");
    expect(sorted[2].meta.status).toBe("requested");
  });

  test("within same status group, newer dates sort first", () => {
    const older = makeMeetingArtifact({ title: "Older", status: "closed", date: "2026-01-01" });
    const newer = makeMeetingArtifact({ title: "Newer", status: "closed", date: "2026-03-01" });

    const sorted = sortMeetingArtifacts([older, newer]);
    expect(sorted[0].meta.title).toBe("Newer");
    expect(sorted[1].meta.title).toBe("Older");
  });

  test("missing dates sort after present dates", () => {
    const withDate = makeMeetingArtifact({ title: "With Date", status: "closed", date: "2026-01-01" });
    const noDate = makeMeetingArtifact({ title: "No Date", status: "closed", date: "" });

    const sorted = sortMeetingArtifacts([noDate, withDate]);
    expect(sorted[0].meta.title).toBe("With Date");
    expect(sorted[1].meta.title).toBe("No Date");
  });

  test("empty array returns empty array", () => {
    expect(sortMeetingArtifacts([])).toEqual([]);
  });

  test("does not mutate input array", () => {
    const meetings = [
      makeMeetingArtifact({ title: "B", status: "closed", date: "2026-01-01" }),
      makeMeetingArtifact({ title: "A", status: "open", date: "2026-01-01" }),
    ];
    const original = [...meetings];
    sortMeetingArtifacts(meetings);
    expect(meetings.map((m) => m.meta.title)).toEqual(original.map((m) => m.meta.title));
  });
});

// -- sortMeetingRequests tests --

function makeMeetingRequest(overrides: {
  date?: string;
  deferred_until?: string;
  title?: string;
}): MeetingMeta {
  return {
    meetingId: "test-meeting",
    title: overrides.title ?? "",
    status: "requested",
    worker: "Assistant",
    agenda: "",
    date: overrides.date ?? "2026-02-01",
    deferred_until: overrides.deferred_until ?? "",
    linked_artifacts: [],
    notes: "",
    workerDisplayTitle: "",
    projectName: "test",
  };
}

describe("sortMeetingRequests", () => {
  test("non-deferred requests sort before deferred requests", () => {
    const deferred = makeMeetingRequest({ title: "Deferred", deferred_until: "2026-04-01" });
    const active = makeMeetingRequest({ title: "Active", deferred_until: "" });

    const sorted = sortMeetingRequests([deferred, active]);
    expect(sorted[0].title).toBe("Active");
    expect(sorted[1].title).toBe("Deferred");
  });

  test("deferred requests sort by deferred_until ascending", () => {
    const later = makeMeetingRequest({ title: "Later", deferred_until: "2026-06-01" });
    const sooner = makeMeetingRequest({ title: "Sooner", deferred_until: "2026-04-01" });

    const sorted = sortMeetingRequests([later, sooner]);
    expect(sorted[0].title).toBe("Sooner");
    expect(sorted[1].title).toBe("Later");
  });

  test("within same deferred group, newer dates sort first", () => {
    const older = makeMeetingRequest({ title: "Older", date: "2026-01-01", deferred_until: "" });
    const newer = makeMeetingRequest({ title: "Newer", date: "2026-03-01", deferred_until: "" });

    const sorted = sortMeetingRequests([older, newer]);
    expect(sorted[0].title).toBe("Newer");
    expect(sorted[1].title).toBe("Older");
  });

  test("empty array returns empty array", () => {
    expect(sortMeetingRequests([])).toEqual([]);
  });

  test("does not mutate input array", () => {
    const requests = [
      makeMeetingRequest({ title: "B", deferred_until: "2026-04-01" }),
      makeMeetingRequest({ title: "A", deferred_until: "" }),
    ];
    const original = [...requests];
    sortMeetingRequests(requests);
    expect(requests.map((r) => r.title)).toEqual(original.map((r) => r.title));
  });
});

// -- sortActiveMeetings tests --

function makeActiveMeeting(overrides: {
  date?: string;
  title?: string;
}): MeetingMeta {
  return {
    meetingId: "test-meeting",
    title: overrides.title ?? "",
    status: "open",
    worker: "Assistant",
    agenda: "",
    date: overrides.date ?? "2026-02-01",
    deferred_until: "",
    linked_artifacts: [],
    notes: "",
    workerDisplayTitle: "",
    projectName: "test",
  };
}

describe("sortActiveMeetings", () => {
  test("empty array returns empty array", () => {
    expect(sortActiveMeetings([])).toEqual([]);
  });

  test("single item is returned unchanged", () => {
    const meeting = makeActiveMeeting({ title: "Only", date: "2026-03-01" });
    const sorted = sortActiveMeetings([meeting]);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].title).toBe("Only");
  });

  test("multiple items sorted by date descending", () => {
    const older = makeActiveMeeting({ title: "Older", date: "2026-01-01" });
    const newer = makeActiveMeeting({ title: "Newer", date: "2026-03-01" });
    const middle = makeActiveMeeting({ title: "Middle", date: "2026-02-01" });

    const sorted = sortActiveMeetings([older, newer, middle]);
    expect(sorted[0].title).toBe("Newer");
    expect(sorted[1].title).toBe("Middle");
    expect(sorted[2].title).toBe("Older");
  });

  test("does not mutate input array", () => {
    const meetings = [
      makeActiveMeeting({ title: "A", date: "2026-01-01" }),
      makeActiveMeeting({ title: "B", date: "2026-03-01" }),
    ];
    const original = meetings.map((m) => m.title);
    sortActiveMeetings(meetings);
    expect(meetings.map((m) => m.title)).toEqual(original);
  });
});

// -- getActiveMeetingWorktrees tests --

describe("getActiveMeetingWorktrees", () => {
  let ghHome: string;

  beforeEach(async () => {
    ghHome = path.join(tmpRoot, "gh-home");
    await fs.mkdir(path.join(ghHome, "state", "meetings"), { recursive: true });
  });

  test("returns worktree paths for open meetings of matching project", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-1.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/my-project/meeting-1",
      }),
    );
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-2.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/my-project/meeting-2",
      }),
    );

    const result = await getActiveMeetingWorktrees(ghHome, "my-project");
    expect(result.sort()).toEqual([
      "/tmp/worktrees/my-project/meeting-1",
      "/tmp/worktrees/my-project/meeting-2",
    ]);
  });

  test("excludes meetings from other projects", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-1.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/my-project/meeting-1",
      }),
    );
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-2.json"),
      JSON.stringify({
        projectName: "other-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/other-project/meeting-2",
      }),
    );

    const result = await getActiveMeetingWorktrees(ghHome, "my-project");
    expect(result).toEqual(["/tmp/worktrees/my-project/meeting-1"]);
  });

  test("excludes non-open meetings", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-1.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/my-project/meeting-1",
      }),
    );
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-2.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "closed",
        worktreeDir: "/tmp/worktrees/my-project/meeting-2",
      }),
    );

    const result = await getActiveMeetingWorktrees(ghHome, "my-project");
    expect(result).toEqual(["/tmp/worktrees/my-project/meeting-1"]);
  });

  test("returns empty array when state directory does not exist", async () => {
    const noStateHome = path.join(tmpRoot, "no-state-home");
    const result = await getActiveMeetingWorktrees(noStateHome, "my-project");
    expect(result).toEqual([]);
  });

  test("skips malformed state files", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "good.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
        worktreeDir: "/tmp/worktrees/my-project/good",
      }),
    );
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "bad.json"),
      "not json at all",
    );

    const result = await getActiveMeetingWorktrees(ghHome, "my-project");
    expect(result).toEqual(["/tmp/worktrees/my-project/good"]);
  });

  test("excludes entries without worktreeDir", async () => {
    await fs.writeFile(
      path.join(ghHome, "state", "meetings", "meeting-1.json"),
      JSON.stringify({
        projectName: "my-project",
        status: "open",
      }),
    );

    const result = await getActiveMeetingWorktrees(ghHome, "my-project");
    expect(result).toEqual([]);
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

  test("parses multiline tool output correctly", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

Reading the file...

> Tool: Read
> Line1
> Line2
> Line3

Here are my findings.
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    const assistant = messages[0];
    expect(assistant.toolUses).toHaveLength(1);
    expect(assistant.toolUses![0].name).toBe("Read");
    expect(assistant.toolUses![0].output).toBe("Line1\nLine2\nLine3");
    expect(assistant.content).toContain("Reading the file...");
    expect(assistant.content).toContain("Here are my findings.");
  });

  test("preserves empty lines within multiline tool output", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

> Tool: Read
> Line1
> ${""/* empty blockquote line */}
> Line3
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].toolUses).toHaveLength(1);
    expect(messages[0].toolUses![0].output).toBe("Line1\n\nLine3");
  });

  test("parses multiple multiline tools without bleed-through", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

Some text.

> Tool: Glob
> file1.ts
> file2.ts

> Tool: Read
> contents line 1
> contents line 2

More text.
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    const assistant = messages[0];
    expect(assistant.toolUses).toHaveLength(2);
    expect(assistant.toolUses![0].name).toBe("Glob");
    expect(assistant.toolUses![0].output).toBe("file1.ts\nfile2.ts");
    expect(assistant.toolUses![1].name).toBe("Read");
    expect(assistant.toolUses![1].output).toBe("contents line 1\ncontents line 2");
    expect(assistant.content).toContain("Some text.");
    expect(assistant.content).toContain("More text.");
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

  test("multiline tool output is joined with newlines", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

> Tool: readFile
> line one
> line two
> line three
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].toolUses).toHaveLength(1);
    expect(messages[0].toolUses![0].name).toBe("readFile");
    expect(messages[0].toolUses![0].output).toBe(
      "line one\nline two\nline three",
    );
  });

  test("multiple multiline tool blocks in one assistant turn parse independently", () => {
    const transcript = `---
meetingId: test
---

## Assistant (2026-02-21T12:00:05.000Z)

> Tool: readFile
> alpha
> beta
> gamma

Some text in between.

> Tool: listDir
> entry one
> entry two
`;

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].toolUses).toHaveLength(2);

    expect(messages[0].toolUses![0].name).toBe("readFile");
    expect(messages[0].toolUses![0].output).toBe("alpha\nbeta\ngamma");

    expect(messages[0].toolUses![1].name).toBe("listDir");
    expect(messages[0].toolUses![1].output).toBe("entry one\nentry two");
  });

  test("blank line inside tool output is preserved as empty string in join", () => {
    // The empty blockquote line ""> "" ("> " with no following content) contributes
    // an empty string to the result, producing a double newline in the output.
    const transcript =
      "---\nmeetingId: test\n---\n\n## Assistant (2026-02-21T12:00:05.000Z)\n\n> Tool: readFile\n> first line\n> \n> third line\n";

    const messages = parseTranscriptToMessages(transcript);

    expect(messages).toHaveLength(1);
    expect(messages[0].toolUses).toHaveLength(1);
    expect(messages[0].toolUses![0].name).toBe("readFile");
    expect(messages[0].toolUses![0].output).toBe("first line\n\nthird line");
  });

  test("recognizes Context Compacted headings as system role", () => {
    const transcript = `---
meetingId: test
---

## User (2026-03-23T10:00:00.000Z)

Hello

## Context Compacted (2026-03-23T10:05:00.000Z)

Context was compressed (auto, 95000 tokens before compaction).

> Summary: The conversation was about testing.

## Assistant (2026-03-23T10:05:01.000Z)

Here is my response.
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("Context was compressed");
    expect(messages[2].role).toBe("assistant");
  });

  test("system messages interleaved with user/assistant have correct order", () => {
    const transcript = `---
meetingId: test
---

## User (2026-03-23T10:00:00.000Z)

First question

## Assistant (2026-03-23T10:00:01.000Z)

First answer

## Context Compacted (2026-03-23T10:05:00.000Z)

Context was compressed (auto, 95000 tokens).

## User (2026-03-23T10:06:00.000Z)

Second question

## Assistant (2026-03-23T10:06:01.000Z)

Second answer
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toHaveLength(5);
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "system",
      "user",
      "assistant",
    ]);
  });

  test("system messages have no toolUses", () => {
    const transcript = `## Context Compacted (2026-03-23T10:05:00.000Z)

Context was compressed (auto, 95000 tokens before compaction).
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].toolUses).toBeUndefined();
  });

  test("parses Error sections as system messages with Error: prefix (REQ-MEP-5/6)", () => {
    const transcript = `## User (2026-04-05T10:00:00.000Z)

Hello

## Error (2026-04-05T10:01:00.000Z)

Session expired

## Assistant (2026-04-05T10:02:00.000Z)

Recovered.
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toBe("Error: Session expired");
    expect(messages[1].toolUses).toBeUndefined();
    expect(messages[2].role).toBe("assistant");
  });

  test("Error: prefix distinguishes errors from compaction notices", () => {
    const transcript = `## Context Compacted (2026-04-05T10:00:00.000Z)

Context was compressed (auto, 50000 tokens before compaction).

## Error (2026-04-05T10:01:00.000Z)

Connection timeout
`;

    const messages = parseTranscriptToMessages(transcript);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).not.toMatch(/^Error:/);
    expect(messages[1].content).toBe("Error: Connection timeout");
  });
});
