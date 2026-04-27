import { describe, test, expect } from "bun:test";
import { statusToGem } from "@/lib/types";
import {
  meetingHref,
  previewText,
} from "@/apps/web/components/project/MeetingList";
import type { Artifact } from "@/lib/types";

function makeMeeting(overrides: Partial<Artifact> = {}): Artifact {
  return {
    meta: {
      title: "Audience with Guild Master",
      date: "2026-03-19",
      status: "open",
      tags: [],
      extras: {},
    },
    filePath: "/tmp/meetings/test.md",
    relativePath: "meetings/test.md",
    content: "",
    lastModified: new Date(),
    ...overrides,
  };
}

describe("statusToGem", () => {
  test("open maps to pending", () => {
    expect(statusToGem("open")).toBe("pending");
  });

  test("requested maps to pending", () => {
    expect(statusToGem("requested")).toBe("pending");
  });

  test("declined maps to inactive", () => {
    expect(statusToGem("declined")).toBe("inactive");
  });

  test("closed maps to info", () => {
    expect(statusToGem("closed")).toBe("info");
  });

  test("unknown status maps to blocked", () => {
    expect(statusToGem("something-else")).toBe("blocked");
  });

  test("normalizes case and whitespace", () => {
    expect(statusToGem("  Open  ")).toBe("pending");
    expect(statusToGem("CLOSED")).toBe("info");
    expect(statusToGem("Requested")).toBe("pending");
  });
});

describe("meetingHref", () => {
  test("open meeting links to live meeting view", () => {
    const href = meetingHref(
      "open",
      "my-project",
      "meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBe(
      "/projects/my-project/meetings/audience-Assistant-20260221-120000",
    );
  });

  test("closed meeting links to artifact view", () => {
    const href = meetingHref(
      "closed",
      "my-project",
      "meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBe(
      "/projects/my-project/artifacts/meetings/audience-Assistant-20260221-120000.md",
    );
  });

  test("requested meeting returns null (not linkable)", () => {
    const href = meetingHref(
      "requested",
      "my-project",
      "meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBeNull();
  });

  test("declined meeting returns null (not linkable)", () => {
    const href = meetingHref(
      "declined",
      "my-project",
      "meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBeNull();
  });

  test("unknown status returns null", () => {
    const href = meetingHref(
      "something-else",
      "my-project",
      "meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBeNull();
  });

  test("encodes special characters in project name", () => {
    const href = meetingHref(
      "closed",
      "my project & stuff",
      "meetings/audience-test-123.md",
    );
    expect(href).toBe(
      "/projects/my%20project%20%26%20stuff/artifacts/meetings/audience-test-123.md",
    );
  });

  test("encodes special characters in project name for open meetings", () => {
    const href = meetingHref(
      "open",
      "my project & stuff",
      "meetings/audience-test-123.md",
    );
    expect(href).toBe(
      "/projects/my%20project%20%26%20stuff/meetings/audience-test-123",
    );
  });

  test("closed meeting accepts work/meetings/ prefix (REQ-LDR-19)", () => {
    const href = meetingHref(
      "closed",
      "my-project",
      "work/meetings/audience-Assistant-20260221-120000.md",
    );
    expect(href).toBe(
      "/projects/my-project/artifacts/work/meetings/audience-Assistant-20260221-120000.md",
    );
  });

  test("normalizes status case and whitespace", () => {
    expect(
      meetingHref("  Closed  ", "proj", "meetings/abc.md"),
    ).toBe("/projects/proj/artifacts/meetings/abc.md");

    expect(
      meetingHref("OPEN", "proj", "meetings/abc.md"),
    ).toBe("/projects/proj/meetings/abc");
  });
});

describe("previewText", () => {
  test("returns agenda when present", () => {
    const meeting = makeMeeting({
      meta: {
        title: "Test",
        date: "2026-03-19",
        status: "open",
        tags: [],
        extras: { agenda: "Discuss project roadmap" },
      },
    });
    expect(previewText(meeting)).toBe("Discuss project roadmap");
  });

  test("agenda takes priority over notes content", () => {
    const meeting = makeMeeting({
      meta: {
        title: "Test",
        date: "2026-03-19",
        status: "closed",
        tags: [],
        extras: { agenda: "Original prompt" },
      },
      content: "# Meeting Notes\n\nWe discussed the roadmap.",
    });
    expect(previewText(meeting)).toBe("Original prompt");
  });

  test("falls back to notes excerpt when agenda is absent", () => {
    const meeting = makeMeeting({
      content: "# Meeting Notes\n\nWe discussed the roadmap.",
    });
    expect(previewText(meeting)).toBe("We discussed the roadmap.");
  });

  test("falls back to notes excerpt when agenda is empty string", () => {
    const meeting = makeMeeting({
      meta: {
        title: "Test",
        date: "2026-03-19",
        status: "closed",
        tags: [],
        extras: { agenda: "   " },
      },
      content: "Some notes here.",
    });
    expect(previewText(meeting)).toBe("Some notes here.");
  });

  test("returns undefined when both agenda and content are absent", () => {
    const meeting = makeMeeting();
    expect(previewText(meeting)).toBeUndefined();
  });

  test("returns undefined when content has only headings and empty lines", () => {
    const meeting = makeMeeting({
      content: "# Meeting Notes\n## Summary\n\n",
    });
    expect(previewText(meeting)).toBeUndefined();
  });

  test("skips markdown heading lines in notes", () => {
    const meeting = makeMeeting({
      content: "# Meeting Notes\n## Summary\nActual content line.",
    });
    expect(previewText(meeting)).toBe("Actual content line.");
  });

  test("skips empty lines in notes", () => {
    const meeting = makeMeeting({
      content: "\n\n  \nFirst real line.",
    });
    expect(previewText(meeting)).toBe("First real line.");
  });

  test("returns undefined when extras is undefined", () => {
    const meeting = makeMeeting({
      meta: {
        title: "Test",
        date: "2026-03-19",
        status: "open",
        tags: [],
      },
      content: "",
    });
    expect(previewText(meeting)).toBeUndefined();
  });
});
