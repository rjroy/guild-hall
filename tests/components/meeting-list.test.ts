import { describe, test, expect } from "bun:test";
import { statusToGem } from "@/lib/types";
import {
  meetingHref,
} from "@/web/components/project/MeetingList";

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

  test("closed meeting prepends meetings/ when relativePath is just a filename", () => {
    const href = meetingHref(
      "closed",
      "my-project",
      "audience-Assistant-20260221-120000.md",
    );
    expect(href).toBe(
      "/projects/my-project/artifacts/meetings/audience-Assistant-20260221-120000.md",
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
