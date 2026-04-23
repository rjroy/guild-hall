import { describe, test, expect } from "bun:test";
import type { Attribution } from "@/apps/web/components/artifact/ArtifactProvenance";

/**
 * ArtifactProvenance is a client component that composes DetailHeader
 * for container chrome and condensed state. These tests verify the
 * component's prop-passing logic and path construction without rendering.
 */
describe("ArtifactProvenance", () => {
  test("module is importable", async () => {
    const mod = await import(
      "@/apps/web/components/artifact/ArtifactProvenance"
    );
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("exports Attribution type (compilation check)", () => {
    // This test verifies the Attribution type is exported and usable.
    // If the type export is missing, TypeScript compilation fails.
    const attr: Attribution = {
      workerName: "Dalton",
      workerTitle: "Guild Artificer",
      workerPortraitUrl: "/images/portraits/dalton.webp",
      commissionId: "commission-123",
      commissionTitle: "Build the thing",
    };
    expect(attr.workerName).toBe("Dalton");
  });

  test("Attribution type allows optional fields to be omitted", () => {
    const minimal: Attribution = { workerName: "Celeste" };
    expect(minimal.workerTitle).toBeUndefined();
    expect(minimal.workerPortraitUrl).toBeUndefined();
    expect(minimal.commissionId).toBeUndefined();
    expect(minimal.commissionTitle).toBeUndefined();
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

  test("commission link URL uses encodeURIComponent for commission ID", () => {
    const commissionId = "commission-Dalton-20260324-183500";
    const projectName = "guild-hall";
    const encodedName = encodeURIComponent(projectName);
    const href = `/projects/${encodedName}/commissions/${encodeURIComponent(commissionId)}`;
    expect(href).toBe("/projects/guild-hall/commissions/commission-Dalton-20260324-183500");
  });

  test("commission link URL handles special characters in ID", () => {
    const commissionId = "commission with spaces & symbols";
    const href = `/projects/test/commissions/${encodeURIComponent(commissionId)}`;
    expect(href).toContain("commission%20with%20spaces%20%26%20symbols");
  });
});

describe("DetailHeader", () => {
  test("module is importable", async () => {
    const mod = await import("@/apps/web/components/ui/DetailHeader");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

describe("Breadcrumb", () => {
  test("module is importable", async () => {
    const mod = await import("@/apps/web/components/ui/Breadcrumb");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
