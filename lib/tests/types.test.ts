import { describe, test, expect } from "bun:test";
import {
  statusToGem,
  formatStatus,
  VALID_MODELS,
  isValidModel,
  resolveModel,
  artifactTypeSegment,
  TYPE_LABELS,
} from "@/lib/types";
import type { GemStatus, AppConfig, ModelDefinition } from "@/lib/types";

describe("statusToGem", () => {
  const cases: Array<[string, GemStatus]> = [
    // Active (green) - in-progress and active states
    ["approved", "pending"],
    ["active", "active"],
    ["current", "active"],
    // Case-insensitive
    ["Approved", "pending"],
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
    expect(statusToGem("  approved  ")).toBe("pending");
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

describe("TYPE_LABELS", () => {
  test("includes learned -> Learned (REQ-LDR-1)", () => {
    expect(TYPE_LABELS.learned).toBe("Learned");
  });

  test("preserves existing entries", () => {
    expect(TYPE_LABELS.specs).toBe("Spec");
    expect(TYPE_LABELS.plans).toBe("Plan");
    expect(TYPE_LABELS.brainstorm).toBe("Brainstorm");
    expect(TYPE_LABELS.issues).toBe("Issue");
    expect(TYPE_LABELS.research).toBe("Research");
    expect(TYPE_LABELS.retros).toBe("Retro");
    expect(TYPE_LABELS.design).toBe("Design");
    expect(TYPE_LABELS.reference).toBe("Reference");
    expect(TYPE_LABELS.notes).toBe("Note");
    expect(TYPE_LABELS.tasks).toBe("Task");
    expect(TYPE_LABELS.diagrams).toBe("Diagram");
    expect(TYPE_LABELS.meetings).toBe("Meeting");
    expect(TYPE_LABELS.commissions).toBe("Commission");
  });
});

describe("artifactTypeSegment", () => {
  test("classifies flat-layout typed paths", () => {
    expect(artifactTypeSegment("specs/foo.md")).toBe("Spec");
    expect(artifactTypeSegment("plans/p.md")).toBe("Plan");
    expect(artifactTypeSegment("issues/bug.md")).toBe("Issue");
    expect(artifactTypeSegment("commissions/c-1.md")).toBe("Commission");
    expect(artifactTypeSegment("meetings/m-1.md")).toBe("Meeting");
  });

  test("returns null for root-level files (REQ-LDR-4)", () => {
    expect(artifactTypeSegment("heartbeat.md")).toBeNull();
    expect(artifactTypeSegment("lore-config.md")).toBeNull();
    expect(artifactTypeSegment("lore-agents.md")).toBeNull();
    expect(artifactTypeSegment("vision.md")).toBeNull();
  });

  test("returns raw segment for unknown flat-layout segments (e.g., generated)", () => {
    expect(artifactTypeSegment("generated/foo.md")).toBe("generated");
    expect(artifactTypeSegment("unknown-bucket/foo.md")).toBe("unknown-bucket");
  });

  test("peels a single leading work/ segment (REQ-LDR-2)", () => {
    expect(artifactTypeSegment("work/specs/foo.md")).toBe("Spec");
    expect(artifactTypeSegment("work/plans/p.md")).toBe("Plan");
    expect(artifactTypeSegment("work/issues/bug.md")).toBe("Issue");
    expect(artifactTypeSegment("work/commissions/c-1.md")).toBe("Commission");
    expect(artifactTypeSegment("work/meetings/m-1.md")).toBe("Meeting");
    expect(artifactTypeSegment("work/notes/n.md")).toBe("Note");
    expect(artifactTypeSegment("work/research/r.md")).toBe("Research");
    expect(artifactTypeSegment("work/retros/r.md")).toBe("Retro");
    expect(artifactTypeSegment("work/brainstorm/b.md")).toBe("Brainstorm");
    expect(artifactTypeSegment("work/design/d.md")).toBe("Design");
  });

  test("classifies work/learned/ as Learned (REQ-LDR-1, REQ-LDR-2)", () => {
    expect(artifactTypeSegment("work/learned/lesson.md")).toBe("Learned");
    expect(artifactTypeSegment("learned/lesson.md")).toBe("Learned");
  });

  test("returns null for work/ with no second segment (REQ-LDR-2)", () => {
    expect(artifactTypeSegment("work/foo.md")).toBeNull();
  });

  test("returns raw segment for unknown second segment under work/ (REQ-LDR-3)", () => {
    expect(artifactTypeSegment("work/unrecognized/foo.md")).toBe("unrecognized");
    expect(artifactTypeSegment("work/foo-bucket/bar.md")).toBe("foo-bucket");
  });

  test("peels only a single work/ prefix; double-prefixed paths surface inner work segment", () => {
    // Single peel by spec (REQ-LDR-2). After peeling once, "work/work/foo.md"
    // becomes "work/foo.md", whose first segment "work" is not in TYPE_LABELS
    // and so is returned raw per REQ-LDR-3.
    expect(artifactTypeSegment("work/work/foo.md")).toBe("work");
  });

  test("classifies reference/ unchanged", () => {
    expect(artifactTypeSegment("reference/glossary.md")).toBe("Reference");
    expect(artifactTypeSegment("work/reference/glossary.md")).toBe("Reference");
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
