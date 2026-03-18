import { describe, test, expect } from "bun:test";
import {
  MODEL_REGISTRY,
  getModels,
  findModel,
  getCostEstimate,
  getDefaultModel,
} from "@/packages/guild-hall-replicate/model-registry";

describe("model registry", () => {
  test("registry contains at least 7 entries", () => {
    expect(MODEL_REGISTRY.length).toBeGreaterThanOrEqual(7);
  });

  test("registry covers all 4 capabilities", () => {
    const capabilities = new Set(MODEL_REGISTRY.map((m) => m.capability));
    expect(capabilities.has("text-to-image")).toBe(true);
    expect(capabilities.has("image-to-image")).toBe(true);
    expect(capabilities.has("background-removal")).toBe(true);
    expect(capabilities.has("upscale")).toBe(true);
  });

  test("every model ID is valid owner/name format", () => {
    for (const model of MODEL_REGISTRY) {
      const parts = model.id.split("/");
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    }
  });
});

describe("getModels", () => {
  test("returns all models with no filter", () => {
    const all = getModels();
    expect(all.length).toBe(MODEL_REGISTRY.length);
  });

  test("filters by text-to-image capability", () => {
    const models = getModels("text-to-image");
    expect(models.length).toBeGreaterThanOrEqual(4);
    for (const m of models) {
      expect(m.capability).toBe("text-to-image");
    }
  });

  test("returns empty array for unknown capability", () => {
    const models = getModels("nonexistent");
    expect(models).toEqual([]);
  });
});

describe("findModel", () => {
  test("returns entry for known model", () => {
    const entry = findModel("black-forest-labs/flux-schnell");
    expect(entry).toBeDefined();
    expect(entry?.name).toBe("FLUX Schnell");
  });

  test("returns undefined for unknown model", () => {
    expect(findModel("unknown/model")).toBeUndefined();
  });
});

describe("getCostEstimate", () => {
  test("returns cost for known model", () => {
    expect(getCostEstimate("black-forest-labs/flux-schnell")).toBe("$0.003/image");
  });

  test("returns 'unknown' for unregistered model", () => {
    expect(getCostEstimate("some/custom-model")).toBe("unknown");
  });
});

describe("getDefaultModel", () => {
  test("returns valid model ID for each capability", () => {
    const capabilities = ["text-to-image", "image-to-image", "background-removal", "upscale"];
    for (const cap of capabilities) {
      const id = getDefaultModel(cap);
      expect(id).toBeTruthy();
      expect(id.split("/")).toHaveLength(2);
    }
  });

  test("default text-to-image is flux-schnell", () => {
    expect(getDefaultModel("text-to-image")).toBe("black-forest-labs/flux-schnell");
  });

  test("throws for unknown capability", () => {
    expect(() => getDefaultModel("nonexistent")).toThrow();
  });
});
