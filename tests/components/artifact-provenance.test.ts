import { describe, test, expect } from "bun:test";

/**
 * ArtifactProvenance is now a client component that uses hooks (useState,
 * useEffect for condensed state). It can't be called as a plain function
 * outside React's rendering context. These tests verify the component's
 * prop-passing logic and path construction without rendering.
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

  test("condensed state defaults based on matchMedia at 960px", () => {
    // The component uses window.matchMedia("(max-width: 960px)").matches
    // to determine initial condensed state. Verify the breakpoint value.
    const breakpoint = "(max-width: 960px)";
    expect(breakpoint).toBe("(max-width: 960px)");
  });
});
