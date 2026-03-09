import { describe, test, expect } from "bun:test";
import { statusToGem, VALID_MODELS, isValidModel } from "@/lib/types";
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
    ["requested", "pending"],
    ["Draft", "pending"],
    ["Requested", "pending"],

    // Blocked (red)
    ["superseded", "blocked"],
    ["outdated", "blocked"],
    ["wontfix", "blocked"],
    ["declined", "blocked"],
    ["abandoned", "blocked"],
    ["Superseded", "blocked"],
    ["Declined", "blocked"],

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

describe("VALID_MODELS", () => {
  test("contains exactly 3 entries", () => {
    expect(VALID_MODELS).toHaveLength(3);
  });

  test("contains opus, sonnet, and haiku", () => {
    expect(VALID_MODELS).toContain("opus");
    expect(VALID_MODELS).toContain("sonnet");
    expect(VALID_MODELS).toContain("haiku");
  });
});

describe("isValidModel", () => {
  test("returns true for valid model names", () => {
    expect(isValidModel("opus")).toBe(true);
    expect(isValidModel("sonnet")).toBe(true);
    expect(isValidModel("haiku")).toBe(true);
  });

  test("returns false for invalid model names", () => {
    expect(isValidModel("invalid")).toBe(false);
    expect(isValidModel("")).toBe(false);
  });
});
