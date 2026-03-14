import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ManagerToolboxDeps, RouteCaller } from "@/daemon/services/manager/toolbox";
import { makeSyncProjectHandler } from "@/daemon/services/manager/toolbox";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-sync-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  await fs.mkdir(path.join(guildHallHome, "projects", "test-project", ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Mock factories --

/**
 * Creates a mock RouteCaller that records calls and returns configured responses.
 */
function createMockRouteCaller(responseMap?: Record<string, Awaited<ReturnType<RouteCaller>>>): RouteCaller & {
  calls: Array<{ routePath: string; body: unknown }>;
} {
  const calls: Array<{ routePath: string; body: unknown }> = [];
  const fn = ((routePath: string, body: unknown) => {
    calls.push({ routePath, body });
    if (responseMap?.[routePath]) {
      return Promise.resolve(responseMap[routePath]);
    }
    return Promise.resolve({ ok: true as const, status: 200, data: {} });
  }) as RouteCaller & { calls: Array<{ routePath: string; body: unknown }> };
  fn.calls = calls;
  return fn;
}

function makeDeps(
  overrides?: Partial<ManagerToolboxDeps>,
): ManagerToolboxDeps {
  return {
    projectName: "test-project",
    guildHallHome,
    callRoute: createMockRouteCaller(),
    eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
    gitOps: {} as never,
    config: { projects: [{ name: "test-project", path: "/fake/project/path" }] },
    getProjectConfig(name: string) {
      if (name === "test-project") {
        return Promise.resolve({ name: "test-project", path: "/fake/project/path", defaultBranch: "main" });
      }
      return Promise.resolve(undefined);
    },
    ...overrides,
  };
}

// Phase 7: sync_project now delegates to the daemon route via callRoute.
// These tests verify the handler calls the correct route, formats the
// response, and propagates errors.

describe("sync_project", () => {
  test("calls the sync route with projectName", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: {
          results: [{ project: "test-project", action: "noop", reason: "No sync needed" }],
        },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    expect(mockRoute.calls).toHaveLength(1);
    expect(mockRoute.calls[0].routePath).toBe("/workspace/git/integration/sync");
    expect(mockRoute.calls[0].body).toEqual({ projectName: "test-project" });
  });

  test("returns noop when route reports no sync needed", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: {
          results: [{ project: "test-project", action: "noop", reason: "No sync needed" }],
        },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as { action: string; summary: string };
    expect(parsed.action).toBe("noop");
    expect(parsed.summary).toContain("No sync needed");
  });

  test("returns reset when route detects merged PR", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: {
          results: [{
            project: "test-project",
            action: "reset",
            reason: "Merged PR detected for test-project. Reset claude/main.",
          }],
        },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as { action: string; summary: string };
    expect(parsed.action).toBe("reset");
    expect(parsed.summary).toContain("Merged PR detected");
    expect(parsed.summary).toContain("test-project");
  });

  test("returns rebase when route reports rebase", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: {
          results: [{
            project: "test-project",
            action: "rebase",
            reason: "Rebased claude/main onto origin/main",
          }],
        },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as { action: string; summary: string };
    expect(parsed.action).toBe("rebase");
    expect(parsed.summary).toContain("Rebased");
  });

  test("returns skip when route reports active activities", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: {
          results: [{
            project: "test-project",
            action: "skip",
            reason: "Skipped: active commissions or meetings for test-project",
          }],
        },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as { action: string; summary: string };
    expect(parsed.action).toBe("skip");
    expect(parsed.summary).toContain("active commissions or meetings");
  });

  test("returns isError when route returns error", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: false,
        error: 'Project "nonexistent" is not registered',
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not registered");
  });

  test("returns isError when route reports diverged branches", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: false,
        error: "Branches have diverged: manual resolution required",
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("diverged");
  });

  test("handles missing project in results gracefully", async () => {
    const mockRoute = createMockRouteCaller({
      "/workspace/git/integration/sync": {
        ok: true,
        status: 200,
        data: { results: [] },
      },
    });
    const deps = makeDeps({ callRoute: mockRoute });
    const handler = makeSyncProjectHandler(deps);

    const result = await handler({ projectName: "test-project" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as { action: string; summary: string };
    expect(parsed.action).toBe("completed");
    expect(parsed.summary).toContain("Sync completed");
  });
});
