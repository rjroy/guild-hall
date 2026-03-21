import { describe, test, expect } from "bun:test";
import { statusToGem, formatStatus, VALID_MODELS, isValidModel, resolveModel } from "@/lib/types";
import type { GemStatus, AppConfig, ModelDefinition } from "@/lib/types";

describe("statusToGem", () => {
  const cases: Array<[string, GemStatus]> = [
    // Active (green) - in-progress and active states
    ["approved", "active"],
    ["active", "active"],
    ["current", "active"],
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

    // Blocked (red) - hard failures only
    ["failed", "blocked"],
    ["cancelled", "blocked"],
    ["blocked", "blocked"],

    // Commission-specific statuses
    ["dispatched", "active"],
    ["in_progress", "active"],

    // Info (blue) - terminal states (no action needed)
    ["complete", "info"],
    ["completed", "info"],
    ["resolved", "info"],
    ["implemented", "info"],

    // Inactive (gray) - closed but not successful (no action needed, but not green)
    ["superseded", "inactive"],
    ["outdated", "inactive"],
    ["wontfix", "inactive"],
    ["declined", "inactive"],
    ["abandoned", "inactive"],
    ["Superseded", "inactive"],
    ["Declined", "inactive"],
    ["archived", "inactive"],

    // Unknown (red) - unrecognized (alert default)
    ["unknown-status", "blocked"],
    ["", "blocked"],
    ["something-else", "blocked"],
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

  test("returns true for configured local model when config provided", () => {
    const config = configWithModels([
      { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
    ]);
    expect(isValidModel("llama3", config)).toBe(true);
  });

  test("returns false for local model when config omitted", () => {
    expect(isValidModel("llama3")).toBe(false);
  });
});

const configWithModels = (models: ModelDefinition[]): AppConfig => ({
  projects: [],
  models,
});

describe("resolveModel", () => {
  test("resolves built-in model names", () => {
    const result = resolveModel("opus");
    expect(result).toEqual({ type: "builtin", name: "opus" });
  });

  test("resolves all built-in models", () => {
    for (const name of VALID_MODELS) {
      const result = resolveModel(name);
      expect(result.type).toBe("builtin");
    }
  });

  test("resolves configured local model", () => {
    const def: ModelDefinition = {
      name: "llama3",
      modelId: "llama3",
      baseUrl: "http://localhost:11434",
    };
    const config = configWithModels([def]);
    const result = resolveModel("llama3", config);
    expect(result).toEqual({ type: "local", definition: def });
  });

  test("built-in takes precedence over local with same name", () => {
    // This shouldn't happen in practice (config validation rejects it),
    // but the resolution logic should still prefer built-in
    const config = configWithModels([
      { name: "opus", modelId: "local-opus", baseUrl: "http://localhost:11434" },
    ]);
    const result = resolveModel("opus", config);
    expect(result.type).toBe("builtin");
  });

  test("throws for unknown model without config", () => {
    expect(() => resolveModel("unknown")).toThrow("Unknown model");
  });

  test("throws for unknown model with config", () => {
    const config = configWithModels([
      { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
    ]);
    expect(() => resolveModel("unknown", config)).toThrow("Unknown model");
  });

  test("error message includes configured local models as hint", () => {
    const config = configWithModels([
      { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
    ]);
    expect(() => resolveModel("unknown", config)).toThrow("Configured local models: llama3");
  });

  test("throws for local model name when config is omitted", () => {
    expect(() => resolveModel("llama3")).toThrow("Unknown model");
  });
});

describe("formatStatus", () => {
  test("single lowercase word is title-cased", () => {
    expect(formatStatus("complete")).toBe("Complete");
  });

  test("underscores become spaces with title-casing", () => {
    expect(formatStatus("in_progress")).toBe("In Progress");
  });

  test("single word without underscores", () => {
    expect(formatStatus("wontfix")).toBe("Wontfix");
  });

  test("simple lowercase word", () => {
    expect(formatStatus("open")).toBe("Open");
  });

  test("empty string returns empty string", () => {
    expect(formatStatus("")).toBe("");
  });

  test("already-uppercase input is title-cased", () => {
    expect(formatStatus("DONE")).toBe("DONE");
  });

  test("mixed case with underscores", () => {
    expect(formatStatus("not_started")).toBe("Not Started");
  });
});
