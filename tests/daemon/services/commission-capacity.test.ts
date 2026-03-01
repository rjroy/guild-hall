import { describe, test, expect } from "bun:test";
import {
  DEFAULT_COMMISSION_CAP,
  DEFAULT_MAX_CONCURRENT,
  getGlobalLimit,
  getProjectLimit,
  countActiveForProject,
  isAtCapacity,
} from "@/daemon/services/commission-capacity";
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

describe("getGlobalLimit", () => {
  test("returns default when config has no maxConcurrentCommissions", () => {
    expect(getGlobalLimit(makeConfig())).toBe(DEFAULT_MAX_CONCURRENT);
  });

  test("returns configured value when set", () => {
    expect(getGlobalLimit(makeConfig({ maxConcurrentCommissions: 20 }))).toBe(20);
  });
});

describe("getProjectLimit", () => {
  test("returns default when project has no commissionCap", () => {
    expect(getProjectLimit("alpha", makeConfig())).toBe(DEFAULT_COMMISSION_CAP);
  });

  test("returns configured project cap", () => {
    expect(getProjectLimit("beta", makeConfig())).toBe(5);
  });

  test("returns default for unknown project", () => {
    expect(getProjectLimit("unknown", makeConfig())).toBe(DEFAULT_COMMISSION_CAP);
  });
});

describe("countActiveForProject", () => {
  test("returns 0 for empty map", () => {
    expect(countActiveForProject("alpha", new Map())).toBe(0);
  });

  test("counts only matching project", () => {
    const map = makeActiveMap([
      { id: "c1", projectName: "alpha" },
      { id: "c2", projectName: "beta" },
      { id: "c3", projectName: "alpha" },
    ]);
    expect(countActiveForProject("alpha", map)).toBe(2);
    expect(countActiveForProject("beta", map)).toBe(1);
  });

  test("returns 0 for project with no active commissions", () => {
    const map = makeActiveMap([{ id: "c1", projectName: "alpha" }]);
    expect(countActiveForProject("beta", map)).toBe(0);
  });
});

describe("isAtCapacity", () => {
  test("not at capacity when under both limits", () => {
    const result = isAtCapacity("alpha", new Map(), makeConfig());
    expect(result.atLimit).toBe(false);
    expect(result.reason).toBe("");
  });

  test("at capacity when global limit reached", () => {
    const entries = Array.from({ length: DEFAULT_MAX_CONCURRENT }, (_, i) => ({
      id: `c${i}`,
      projectName: `project-${i}`,
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(true);
    expect(result.reason).toContain("Global concurrent limit");
  });

  test("at capacity when project limit reached", () => {
    const entries = Array.from({ length: DEFAULT_COMMISSION_CAP }, (_, i) => ({
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

  test("at-limit edge case: exactly at project limit", () => {
    const entries = Array.from({ length: DEFAULT_COMMISSION_CAP }, (_, i) => ({
      id: `c${i}`,
      projectName: "alpha",
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(true);
  });

  test("one below project limit is not at capacity", () => {
    const entries = Array.from({ length: DEFAULT_COMMISSION_CAP - 1 }, (_, i) => ({
      id: `c${i}`,
      projectName: "alpha",
    }));
    const result = isAtCapacity("alpha", makeActiveMap(entries), makeConfig());
    expect(result.atLimit).toBe(false);
  });
});
