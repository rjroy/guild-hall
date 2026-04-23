import { describe, test, expect } from "bun:test";
import { isAtCapacity } from "@/apps/daemon/services/commission/capacity";
import type { AppConfig } from "@/lib/types";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    projects: [
      { name: "alpha", path: "/projects/alpha" },
      { name: "beta", path: "/projects/beta", commissionCap: 5 },
    ],
    ...overrides,
  };
}

function makeActiveMap(entries: Array<{ id: string; projectName: string }>): Map<string, { projectName: string }> {
  const map = new Map<string, { projectName: string }>();
  for (const e of entries) {
    map.set(e.id, { projectName: e.projectName });
  }
  return map;
}

describe("isAtCapacity", () => {
  test("not at capacity when under both limits", () => {
    const result = isAtCapacity("alpha", new Map(), makeConfig());
    expect(result.atLimit).toBe(false);
    expect(result.reason).toBe("");
  });

  test("at capacity when global limit reached", () => {
    // Default global limit is 10
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      projectName: `project-${i}`,
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(true);
    expect(result.reason).toContain("Global concurrent limit");
  });

  test("at capacity when project limit reached", () => {
    // Default project cap is 3
    const entries = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`,
      projectName: "alpha",
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(true);
    expect(result.reason).toContain('Project "alpha"');
  });

  test("respects custom project cap", () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      projectName: "beta",
    }));
    // beta has cap of 5, 4 active should be fine
    const result = isAtCapacity("beta", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(false);
  });

  test("respects custom global limit", () => {
    const config = makeConfig({ maxConcurrentCommissions: 20 });
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      projectName: `project-${i}`,
    }));
    // Default would be at capacity at 10, but custom is 20
    const result = isAtCapacity("alpha", makeActiveMap(entries), config);
    expect(result.atLimit).toBe(false);
  });

  test("global limit checked before project limit", () => {
    const config = makeConfig({ maxConcurrentCommissions: 2 });
    const entries = [
      { id: "c1", projectName: "alpha" },
      { id: "c2", projectName: "beta" },
    ];
    const result = isAtCapacity("alpha", makeActiveMap(entries), config);
    expect(result.atLimit).toBe(true);
    expect(result.reason).toContain("Global");
  });

  test("counts only matching project for project limit", () => {
    const entries = [
      { id: "c1", projectName: "alpha" },
      { id: "c2", projectName: "beta" },
      { id: "c3", projectName: "alpha" },
      { id: "c4", projectName: "alpha" },
    ];
    // alpha has 3 active (at default cap of 3)
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(true);
    // beta has only 1 active
    const resultBeta = isAtCapacity("beta", makeActiveMap(entries), makeConfig());
    expect(resultBeta.atLimit).toBe(false);
  });

  test("one below project limit is not at capacity", () => {
    // Default cap is 3, so 2 active should be fine
    const entries = Array.from({ length: 2 }, (_, i) => ({
      id: `c${i}`,
      projectName: "alpha",
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(false);
  });
});

