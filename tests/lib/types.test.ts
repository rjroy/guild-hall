import { describe, test, expect } from "bun:test";
import { statusToGem } from "@/lib/types";
import type { GemStatus } from "@/lib/types";

describe("statusToGem", () => {
  const cases: Array<[string, GemStatus]> = [
    // Active (green)
    ["approved", "active"],
    ["active", "active"],
    ["current", "active"],
    ["complete", "active"],
    ["resolved", "active"],
    // Case-insensitive
    ["Approved", "active"],
    ["ACTIVE", "active"],

    // Pending (amber)
    ["draft", "pending"],
    ["open", "pending"],
    ["pending", "pending"],
    ["Draft", "pending"],

    // Blocked (red)
    ["superseded", "blocked"],
    ["outdated", "blocked"],
    ["wontfix", "blocked"],
    ["Superseded", "blocked"],

    // Info (blue) - recognized
    ["implemented", "info"],
    ["archived", "info"],

    // Info (blue) - unrecognized (safe default)
    ["unknown-status", "info"],
    ["", "info"],
    ["something-else", "info"],
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" maps to "${expected}"`, () => {
      expect(statusToGem(input)).toBe(expected);
    });
  }

  test("trims whitespace", () => {
    expect(statusToGem("  approved  ")).toBe("active");
    expect(statusToGem(" draft ")).toBe("pending");
  });
});
