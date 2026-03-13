import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { AppConfig } from "@/lib/types";
import type { MeetingSessionForRoutes } from "@/daemon/routes/meetings";

// -- Test fixtures --

let tmpDir: string;
let guildHallHome: string;
let lorePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-read-routes-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");
  const integrationPath = path.join(guildHallHome, "projects", "test-project");
  lorePath = path.join(integrationPath, ".lore");
  await fs.mkdir(path.join(lorePath, "meetings"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(projectName = "test-project"): AppConfig {
  return {
    projects: [{ name: projectName, path: path.join(tmpDir, "repo") }],
  };
}

function makeMockMeetingSession(): MeetingSessionForRoutes {
  return {
    acceptMeetingRequest: async function* () {},
    createMeeting: async function* () {},
    sendMessage: async function* () {},
    closeMeeting: () => Promise.resolve({ notes: "" }),
    recoverMeetings: () => Promise.resolve(0),
    declineMeeting: async () => {},
    deferMeeting: async () => {},
    interruptTurn: () => {},
    getActiveMeetings: () => 0,
  };
}

function makeTestApp(config?: AppConfig) {
  const cfg = config ?? makeConfig();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    meetingSession: makeMockMeetingSession(),
    config: cfg,
    configRoutes: {
      config: cfg,
      guildHallHome,
    },
  });
}

async function writeMeeting(id: string, content: string): Promise<void> {
  const filePath = path.join(lorePath, "meetings", `${id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
}

// -- Tests: GET /meeting/request/meeting/list --

describe("GET /meeting/request/meeting/list", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list");
    // POST /meetings also returns 400 for missing body, but GET should be
    // distinguished by method. Hono routes match by method.
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list?projectName=nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns empty array when no meeting requests exist", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toEqual([]);
  });

  test("lists only meeting requests (status: requested)", async () => {
    await writeMeeting(
      "audience-Worker-20260313-120000",
      `---
title: Requested Meeting
status: requested
worker: Worker
agenda: Discuss something
date: 2026-03-13
---
`,
    );
    await writeMeeting(
      "audience-Worker-20260313-130000",
      `---
title: Closed Meeting
status: closed
worker: Worker
agenda: Already done
date: 2026-03-13
---

Some notes here.
`,
    );

    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only "requested" meetings are returned
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0].meetingId).toBe("audience-Worker-20260313-120000");
    expect(body.meetings[0].status).toBe("requested");
    expect(body.meetings[0].title).toBe("Requested Meeting");
    expect(body.meetings[0].worker).toBe("Worker");
    expect(body.meetings[0].agenda).toBe("Discuss something");
    expect(body.meetings[0].projectName).toBe("test-project");
  });

  test("response wraps meetings in an object", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list?projectName=test-project");
    const body = await res.json();
    expect(body).toHaveProperty("meetings");
    expect(Array.isArray(body.meetings)).toBe(true);
  });

  test("content-type is application/json", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/list?projectName=test-project");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// -- Tests: GET /meeting/request/meeting/read --

describe("GET /meeting/request/meeting/read", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/read?meetingId=some-id");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/read?meetingId=some-id&projectName=nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns 404 for nonexistent meeting", async () => {
    const app = makeTestApp();
    const res = await app.request("/meeting/request/meeting/read?meetingId=does-not-exist&projectName=test-project");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("does-not-exist");
  });

  test("reads meeting detail with metadata", async () => {
    const meetingId = "audience-Worker-20260313-120000";
    await writeMeeting(
      meetingId,
      `---
title: Audience with Test Worker
status: open
worker: Worker
workerDisplayTitle: Test Worker
agenda: Discuss architecture
date: 2026-03-13
linked_artifacts:
  - specs/test-spec.md
---

Meeting notes content here.
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/meeting/request/meeting/read?meetingId=${meetingId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.meeting.meetingId).toBe(meetingId);
    expect(body.meeting.title).toBe("Audience with Test Worker");
    expect(body.meeting.status).toBe("open");
    expect(body.meeting.worker).toBe("Worker");
    expect(body.meeting.workerDisplayTitle).toBe("Test Worker");
    expect(body.meeting.agenda).toBe("Discuss architecture");
    expect(body.meeting.linked_artifacts).toEqual(["specs/test-spec.md"]);
    expect(body.meeting.notes).toBe("Meeting notes content here.");
    expect(body.meeting.projectName).toBe("test-project");
  });

  test("includes transcript when transcript file exists", async () => {
    const meetingId = "audience-Worker-20260313-120000";
    await writeMeeting(
      meetingId,
      `---
title: Meeting With Transcript
status: open
worker: Worker
date: 2026-03-13
---
`,
    );

    // Write a transcript file in the meetings directory
    const transcriptDir = path.join(guildHallHome, "meetings");
    await fs.mkdir(transcriptDir, { recursive: true });
    await fs.writeFile(
      path.join(transcriptDir, `${meetingId}.md`),
      "## User (2026-03-13T12:00:00Z)\n\nHello\n\n## Assistant (2026-03-13T12:00:01Z)\n\nHi there!",
      "utf-8",
    );

    const app = makeTestApp();
    const res = await app.request(
      `/meeting/request/meeting/read?meetingId=${meetingId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toContain("Hello");
    expect(body.transcript).toContain("Hi there!");
  });

  test("returns empty transcript when no transcript file exists", async () => {
    const meetingId = "audience-Worker-20260313-120000";
    await writeMeeting(
      meetingId,
      `---
title: No Transcript
status: requested
worker: Worker
date: 2026-03-13
---
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/meeting/request/meeting/read?meetingId=${meetingId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBe("");
  });
});
