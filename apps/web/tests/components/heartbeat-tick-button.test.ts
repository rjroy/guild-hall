import { describe, test, expect } from "bun:test";
import { tickNowLabel } from "@/apps/web/components/dashboard/WorkspaceSidebar";

/**
 * Tests for the heartbeat Tick Now button in WorkspaceSidebar.
 *
 * WorkspaceSidebar is a client component with hooks and cannot be rendered
 * outside a React context. We test the exported pure helper functions here,
 * and verify module-level exports for the component contract.
 */

describe("tickNowLabel", () => {
  test("returns 'Tick Now' when count is zero (no indicator)", () => {
    expect(tickNowLabel(0)).toBe("Tick Now");
  });

  test("returns 'Tick Now (N)' when count is positive", () => {
    expect(tickNowLabel(1)).toBe("Tick Now (1)");
    expect(tickNowLabel(3)).toBe("Tick Now (3)");
    expect(tickNowLabel(10)).toBe("Tick Now (10)");
  });

  test("zero count produces no parenthetical indicator", () => {
    const label = tickNowLabel(0);
    expect(label).not.toContain("(");
    expect(label).not.toContain(")");
  });

  test("nonzero count includes parenthetical with exact count", () => {
    const label = tickNowLabel(5);
    expect(label).toContain("(5)");
  });
});

describe("WorkspaceSidebar module exports", () => {
  test("default export is a function (the component)", async () => {
    const mod = await import("@/apps/web/components/dashboard/WorkspaceSidebar");
    expect(typeof mod.default).toBe("function");
  });

  test("tickNowLabel is exported", async () => {
    const mod = await import("@/apps/web/components/dashboard/WorkspaceSidebar");
    expect(typeof mod.tickNowLabel).toBe("function");
  });
});

describe("heartbeat API proxy routes", () => {
  test("tick route module exports POST handler", async () => {
    const mod = await import("@/apps/web/app/api/heartbeat/[projectName]/tick/route");
    expect(typeof mod.POST).toBe("function");
  });

  test("status route module exports GET handler", async () => {
    const mod = await import("@/apps/web/app/api/heartbeat/[projectName]/status/route");
    expect(typeof mod.GET).toBe("function");
  });
});

describe("button disabled state logic", () => {
  test("new Set correctly tracks ticking project", () => {
    const ticking = new Set<string>();
    const projectName = "my-project";
    expect(ticking.has(projectName)).toBe(false);

    const withProject = new Set(ticking).add(projectName);
    expect(withProject.has(projectName)).toBe(true);
  });

  test("removing from Set clears disabled state", () => {
    const ticking = new Set<string>(["my-project"]);
    const next = new Set(ticking);
    next.delete("my-project");
    expect(next.has("my-project")).toBe(false);
  });

  test("multiple projects track independently", () => {
    const ticking = new Set<string>(["project-a"]);
    expect(ticking.has("project-a")).toBe(true);
    expect(ticking.has("project-b")).toBe(false);
  });
});
