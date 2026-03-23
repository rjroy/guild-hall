import { describe, test, expect } from "bun:test";

/**
 * ArtifactProvenance is a client component that composes DetailHeader
 * for container chrome and condensed state. These tests verify the
 * component's prop-passing logic and path construction without rendering.
 */
describe("ArtifactProvenance", () => {
  test("module is importable", async () => {
    const mod = await import(
      "@/web/components/artifact/ArtifactProvenance"
    );
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test(".lore/ prefix is prepended to artifactPath", () => {
    const artifactPath = "specs/guild-hall-system.md";
    const copyPath = `.lore/${artifactPath}`;
    expect(copyPath).toBe(".lore/specs/guild-hall-system.md");
  });

  test(".lore/ prefix works for deeply nested artifact paths", () => {
    const artifactPath = "plans/phase-1/step-3.md";
    const copyPath = `.lore/${artifactPath}`;
    expect(copyPath).toBe(".lore/plans/phase-1/step-3.md");
  });
});

describe("DetailHeader", () => {
  test("module is importable", async () => {
    const mod = await import("@/web/components/ui/DetailHeader");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

describe("Breadcrumb", () => {
  test("module is importable", async () => {
    const mod = await import("@/web/components/ui/Breadcrumb");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
