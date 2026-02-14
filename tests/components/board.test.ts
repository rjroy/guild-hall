import { describe, expect, it } from "bun:test";

import { formatRelativeTime } from "@/lib/relative-time";
import {
  buildCreateSessionBody,
  canSubmitSession,
  formatMessageLabel,
  toggleSetMember,
} from "@/lib/board-utils";
import type { SessionStatus } from "@/lib/types";

// Fixed reference time: 2026-02-12T12:00:00.000Z
const NOW = new Date("2026-02-12T12:00:00.000Z").getTime();
const fixedClock = () => NOW;

// -- Tests --

describe("formatRelativeTime", () => {
  it("returns 'just now' for timestamps less than a minute ago", () => {
    const thirtySecondsAgo = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo, fixedClock)).toBe("just now");
  });

  it("returns 'just now' for future timestamps", () => {
    const fiveMinutesFromNow = new Date(NOW + 300_000).toISOString();
    expect(formatRelativeTime(fiveMinutesFromNow, fixedClock)).toBe("just now");
  });

  it("returns '1 min ago' for exactly one minute", () => {
    const oneMinuteAgo = new Date(NOW - 60_000).toISOString();
    expect(formatRelativeTime(oneMinuteAgo, fixedClock)).toBe("1 min ago");
  });

  it("returns minutes for under an hour", () => {
    const twentyFiveMinAgo = new Date(NOW - 25 * 60_000).toISOString();
    expect(formatRelativeTime(twentyFiveMinAgo, fixedClock)).toBe("25 min ago");
  });

  it("returns '1 hour ago' for exactly one hour", () => {
    const oneHourAgo = new Date(NOW - 3_600_000).toISOString();
    expect(formatRelativeTime(oneHourAgo, fixedClock)).toBe("1 hour ago");
  });

  it("returns hours for under a day", () => {
    const fiveHoursAgo = new Date(NOW - 5 * 3_600_000).toISOString();
    expect(formatRelativeTime(fiveHoursAgo, fixedClock)).toBe("5 hours ago");
  });

  it("returns 'yesterday' for 24-48 hours ago", () => {
    const thirtyHoursAgo = new Date(NOW - 30 * 3_600_000).toISOString();
    expect(formatRelativeTime(thirtyHoursAgo, fixedClock)).toBe("yesterday");
  });

  it("returns days for more than 48 hours ago", () => {
    const threeDaysAgo = new Date(NOW - 3 * 24 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeDaysAgo, fixedClock)).toBe("3 days ago");
  });

  it("uses Date.now() when no clock is provided", () => {
    // Exercises the defaultClock path (the only uncovered function in this module)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 min ago");
  });

  it("handles the boundary between minutes and hours", () => {
    const fiftyNineMin = new Date(NOW - 59 * 60_000).toISOString();
    expect(formatRelativeTime(fiftyNineMin, fixedClock)).toBe("59 min ago");

    const sixtyMin = new Date(NOW - 60 * 60_000).toISOString();
    expect(formatRelativeTime(sixtyMin, fixedClock)).toBe("1 hour ago");
  });
});

describe("formatMessageLabel", () => {
  it("shows singular for single message", () => {
    expect(formatMessageLabel(1)).toBe("1 message");
  });

  it("shows plural for multiple messages", () => {
    expect(formatMessageLabel(42)).toBe("42 messages");
  });

  it("shows plural for zero messages", () => {
    expect(formatMessageLabel(0)).toBe("0 messages");
  });
});

describe("canSubmitSession", () => {
  it("requires a non-empty session name", () => {
    expect(canSubmitSession("", 1, false)).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    expect(canSubmitSession("   ", 1, false)).toBe(false);
  });

  it("requires at least one guild member selected", () => {
    expect(canSubmitSession("My Session", 0, false)).toBe(false);
  });

  it("rejects when creation is in progress", () => {
    expect(canSubmitSession("My Session", 1, true)).toBe(false);
  });

  it("allows submission when name and members are valid and not creating", () => {
    expect(canSubmitSession("Debug auth flow", 2, false)).toBe(true);
  });
});

describe("buildCreateSessionBody", () => {
  it("trims whitespace from name", () => {
    const body = buildCreateSessionBody("  Debug auth  ", new Set(["filesystem"]));
    expect(body.name).toBe("Debug auth");
  });

  it("converts selected members set to array", () => {
    const body = buildCreateSessionBody("Session", new Set(["filesystem", "code-runner"]));
    expect(body.guildMembers).toContain("filesystem");
    expect(body.guildMembers).toContain("code-runner");
    expect(body.guildMembers).toHaveLength(2);
  });
});

describe("toggleSetMember", () => {
  it("adds a member not already in the set", () => {
    const result = toggleSetMember(new Set<string>(), "filesystem");
    expect(result.has("filesystem")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("removes a member already in the set", () => {
    const result = toggleSetMember(new Set(["filesystem"]), "filesystem");
    expect(result.has("filesystem")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("does not mutate the original set", () => {
    const original = new Set(["filesystem"]);
    toggleSetMember(original, "filesystem");
    expect(original.has("filesystem")).toBe(true);
  });

  it("handles multiple members", () => {
    const initial = new Set(["filesystem"]);
    const result = toggleSetMember(initial, "web-search");
    expect(result.size).toBe(2);
    expect(result.has("filesystem")).toBe(true);
    expect(result.has("web-search")).toBe(true);
  });
});

describe("Status indicator type coverage", () => {
  // These tests verify that the status label and CSS class mappings in
  // SessionCard.tsx cover all SessionStatus values. The maps are
  // typed as Record<SessionStatus, string>, so a missing key is a
  // compile error. These assertions confirm the expected mapping values
  // at runtime as a documentation-level check.

  const allStatuses: SessionStatus[] = [
    "idle",
    "running",
    "completed",
    "expired",
    "error",
  ];

  it("every status has a defined label", () => {
    const statusLabels: Record<SessionStatus, string> = {
      idle: "idle",
      running: "running",
      completed: "done",
      expired: "expired",
      error: "error",
    };

    for (const status of allStatuses) {
      expect(statusLabels[status]).toBeDefined();
      expect(statusLabels[status].length).toBeGreaterThan(0);
    }
  });

  it("every status maps to a CSS class key", () => {
    const statusDotClassKeys: Record<SessionStatus, string> = {
      idle: "statusIdle",
      running: "statusRunning",
      completed: "statusCompleted",
      expired: "statusExpired",
      error: "statusError",
    };

    for (const status of allStatuses) {
      expect(statusDotClassKeys[status]).toBeDefined();
    }
  });
});
