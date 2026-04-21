import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { AppConfig } from "@/lib/types";
import type { MeetingSessionForRoutes } from "@/daemon/services/meeting/orchestrator";

// -- Test fixtures --

let tmpDir: string;
let guildHallHome: string;
let lorePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-view-open-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");
  const integrationPath = path.join(guildHallHome, "projects", "test-project");
  lorePath = path.join(integrationPath, ".lore");
  await fs.mkdir(path.join(lorePath, "meetings"), { recursive: true });
  // Create state/meetings dir for getActiveMeetingWorktrees
  await fs.mkdir(path.join(guildHallHome, "state", "meetings"), { recursive: true });
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
    createMeetingRequest: async () => {},
    getOpenMeetingsForProject: () => [],
    listAllActiveMeetings: () => [],
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
  }).app;
}

async function writeMeeting(id: string, content: string): Promise<void> {
  const filePath = path.join(lorePath, "meetings", `${id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
}

function meetingContent(opts: {
  title?: string;
  status?: string;
  date?: string;
}): string {
  return `---
title: "${opts.title ?? "Test Meeting"}"
status: ${opts.status ?? "open"}
worker: Worker
date: ${opts.date ?? "2026-03-01"}
---
`;
}

// -- Tests: GET /meeting/request/meeting/list?view=open --

describe("GET /meeting/request/meeting/list?view=open", () => {
  test("returns empty array when no meetings exist", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toEqual([]);
  });

  test("returns only open meetings from a mix of statuses", async () => {
    await writeMeeting("meeting-open", meetingContent({ status: "open", date: "2026-03-01" }));
    await writeMeeting("meeting-requested", meetingContent({ status: "requested", date: "2026-03-02" }));
    await writeMeeting("meeting-closed", meetingContent({ status: "closed", date: "2026-03-03" }));

    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0].meetingId).toBe("meeting-open");
    expect(body.meetings[0].status).toBe("open");
  });

  test("returns multiple open meetings sorted by date descending", async () => {
    await writeMeeting("meeting-old", meetingContent({ status: "open", date: "2026-01-01" }));
    await writeMeeting("meeting-new", meetingContent({ status: "open", date: "2026-03-01" }));
    await writeMeeting("meeting-mid", meetingContent({ status: "open", date: "2026-02-01" }));

    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toHaveLength(3);
    expect(body.meetings[0].meetingId).toBe("meeting-new");
    expect(body.meetings[1].meetingId).toBe("meeting-mid");
    expect(body.meetings[2].meetingId).toBe("meeting-old");
  });

  test("returns empty array when meetings directory does not exist", async () => {
    // Remove the meetings directory so none exists
    await fs.rm(path.join(lorePath, "meetings"), { recursive: true, force: true });

    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toEqual([]);
  });

  test("integration copy wins when file appears in both integration and worktree", async () => {
    // Write the file in integration path with title "Integration"
    await writeMeeting(
      "meeting-shared",
      meetingContent({ status: "open", date: "2026-03-01", title: "Integration Copy" }),
    );

    // Set up a worktree with the same filename but title "Worktree"
    const worktreeDir = path.join(tmpDir, "worktrees", "test-project", "meeting-wt");
    const wtMeetingsDir = path.join(worktreeDir, ".lore", "meetings");
    await fs.mkdir(wtMeetingsDir, { recursive: true });
    await fs.writeFile(
      path.join(wtMeetingsDir, "meeting-shared.md"),
      `---
title: "Worktree Copy"
status: open
worker: Worker
date: 2026-03-01
---
`,
      "utf-8",
    );

    // Register the worktree via a state file
    await fs.writeFile(
      path.join(guildHallHome, "state", "meetings", "wt-meeting.json"),
      JSON.stringify({
        projectName: "test-project",
        status: "open",
        worktreeDir,
      }),
      "utf-8",
    );

    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meetings: { meetingId: string; title: string }[] };

    // Should only have one entry (deduped), and it should be the integration copy
    const shared = body.meetings.filter(
      (m) => m.meetingId === "meeting-shared",
    );
    expect(shared).toHaveLength(1);
    expect(shared[0].title).toBe("Integration Copy");
  });

  test("includes open meetings from active worktrees not in integration", async () => {
    // Integration has no meetings
    // Worktree has one open meeting
    const worktreeDir = path.join(tmpDir, "worktrees", "test-project", "meeting-wt");
    const wtMeetingsDir = path.join(worktreeDir, ".lore", "meetings");
    await fs.mkdir(wtMeetingsDir, { recursive: true });
    await fs.writeFile(
      path.join(wtMeetingsDir, "meeting-wt-only.md"),
      meetingContent({ status: "open", date: "2026-03-15" }),
      "utf-8",
    );

    await fs.writeFile(
      path.join(guildHallHome, "state", "meetings", "wt-meeting.json"),
      JSON.stringify({
        projectName: "test-project",
        status: "open",
        worktreeDir,
      }),
      "utf-8",
    );

    const app = makeTestApp();
    const res = await app.request(
      "/meeting/request/meeting/list?projectName=test-project&view=open",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0].meetingId).toBe("meeting-wt-only");
  });
});
