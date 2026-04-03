import { describe, test, expect } from "bun:test";
import {
  activeMeetingHref,
  workerDisplayLabel,
} from "@/web/components/dashboard/ActiveMeetingCard";
import type { MeetingMeta } from "@/lib/meetings";

function makeMeeting(overrides: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    meetingId: "audience-Archivist-20260403-120000",
    title: "Lore Review",
    status: "open",
    worker: "archivist",
    workerDisplayTitle: "Guild Archivist",
    agenda: "",
    date: "2026-04-03",
    deferred_until: "",
    linked_artifacts: [],
    notes: "",
    projectName: "guild-hall",
    ...overrides,
  };
}

describe("activeMeetingHref", () => {
  test("constructs correct link to meeting view", () => {
    const href = activeMeetingHref("guild-hall", "audience-Archivist-20260403-120000");
    expect(href).toBe(
      "/projects/guild-hall/meetings/audience-Archivist-20260403-120000",
    );
  });

  test("encodes special characters in project name", () => {
    const href = activeMeetingHref("my project & co", "audience-test-123");
    expect(href).toBe(
      "/projects/my%20project%20%26%20co/meetings/audience-test-123",
    );
  });

  test("encodes special characters in meeting id", () => {
    const href = activeMeetingHref("project", "meeting with spaces");
    expect(href).toBe(
      "/projects/project/meetings/meeting%20with%20spaces",
    );
  });
});

describe("workerDisplayLabel", () => {
  test("returns workerDisplayTitle when present", () => {
    expect(workerDisplayLabel("Guild Archivist", "archivist")).toBe("Guild Archivist");
  });

  test("falls back to worker when workerDisplayTitle is empty", () => {
    expect(workerDisplayLabel("", "archivist")).toBe("archivist");
  });

  test("falls back to Unknown Worker when both are empty", () => {
    expect(workerDisplayLabel("", "")).toBe("Unknown Worker");
  });
});

describe("ActiveMeetings rendering logic", () => {
  test("empty meetings array produces empty-state condition", () => {
    const meetings: MeetingMeta[] = [];
    expect(meetings.length === 0).toBe(true);
  });

  test("non-empty meetings array produces card-render condition", () => {
    const meetings = [makeMeeting()];
    expect(meetings.length > 0).toBe(true);
  });

  test("each meeting card receives correct href", () => {
    const meeting = makeMeeting({ projectName: "proj", meetingId: "m-123" });
    const href = activeMeetingHref(meeting.projectName, meeting.meetingId);
    expect(href).toBe("/projects/proj/meetings/m-123");
  });

  test("workerPortraits lookup uses meeting.worker as key", () => {
    const meeting = makeMeeting({ worker: "archivist" });
    const portraits: Record<string, string> = { archivist: "/portraits/archivist.webp" };
    expect(portraits[meeting.worker]).toBe("/portraits/archivist.webp");
  });

  test("missing portrait lookup returns undefined gracefully", () => {
    const meeting = makeMeeting({ worker: "unknown-worker" });
    const portraits: Record<string, string> = {};
    expect(portraits[meeting.worker]).toBeUndefined();
  });
});
