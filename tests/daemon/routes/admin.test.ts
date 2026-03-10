import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import type { AdminDeps } from "@/daemon/routes/admin";
import type { AppConfig } from "@/lib/types";

function makeAdminDeps(overrides?: Partial<AdminDeps>): AdminDeps {
  const config: AppConfig = overrides?.config ?? { projects: [] };
  return {
    config,
    guildHallHome: "/tmp/test-gh",
    gitOps: {
      createBranch: async () => {},
      branchExists: async () => false,
      deleteBranch: async () => {},
      createWorktree: async () => {},
      removeWorktree: async () => {},
      configureSparseCheckout: async () => {},
      commitAll: async () => false,
      squashMerge: async () => {},
      hasUncommittedChanges: async () => false,
      rebase: async () => {},
      currentBranch: async () => "main",
      listWorktrees: async () => [],
      initClaudeBranch: async () => {},
      detectDefaultBranch: async () => "main",
      fetch: async () => {},
      push: async () => {},
      resetHard: async () => {},
      resetSoft: async () => {},
      createPullRequest: async () => ({ url: "" }),
      isAncestor: async () => false,
      treesEqual: async () => false,
      revParse: async () => "abc",
      rebaseOnto: async () => {},
      merge: async () => {},
      squashMergeNoCommit: async () => true,
      listConflictedFiles: async () => [],
      resolveConflictsTheirs: async () => {},
      mergeAbort: async () => {},
      hasCommitsBeyond: async () => false,
    },
    readConfigFromDisk: async () => ({ projects: [] }),
    syncProject: async () => {},
    ...overrides,
  };
}

function makeTestApp(adminDeps: AdminDeps) {
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    admin: adminDeps,
  });
}

describe("POST /admin/reload-config", () => {
  test("updates config.projects in place from disk", async () => {
    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: async () => ({
        projects: [
          { name: "new-project", path: "/tmp/new-project" },
        ],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/admin/reload-config", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reloaded).toBe(true);
    expect(body.projectCount).toBe(1);
    expect(body.newProjects).toEqual(["new-project"]);

    // The original config object should be mutated in place
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("new-project");
  });

  test("preserves existing projects and adds new ones", async () => {
    const config: AppConfig = {
      projects: [{ name: "existing", path: "/tmp/existing" }],
    };
    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: async () => ({
        projects: [
          { name: "existing", path: "/tmp/existing" },
          { name: "added", path: "/tmp/added" },
        ],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/admin/reload-config", { method: "POST" });

    const body = await res.json();
    expect(body.projectCount).toBe(2);
    expect(body.newProjects).toEqual(["added"]);
    expect(config.projects).toHaveLength(2);
  });

  test("runs sync only for newly added projects", async () => {
    const syncedProjects: string[] = [];
    const config: AppConfig = {
      projects: [{ name: "old", path: "/tmp/old" }],
    };
    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: async () => ({
        projects: [
          { name: "old", path: "/tmp/old" },
          { name: "new", path: "/tmp/new" },
        ],
      }),
      syncProject: async (_path, name) => {
        syncedProjects.push(name);
      },
    });
    const app = makeTestApp(deps);

    await app.request("/admin/reload-config", { method: "POST" });

    expect(syncedProjects).toEqual(["new"]);
  });

  test("handles removed projects (config has fewer projects)", async () => {
    const config: AppConfig = {
      projects: [
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ],
    };
    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: async () => ({
        projects: [{ name: "a", path: "/a" }],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/admin/reload-config", { method: "POST" });

    const body = await res.json();
    expect(body.projectCount).toBe(1);
    expect(body.newProjects).toEqual([]);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("a");
  });

  test("existing references see updated projects", async () => {
    const config: AppConfig = { projects: [] };
    // Capture a reference to the same array before reload
    const projectsRef = config.projects;

    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: async () => ({
        projects: [{ name: "fresh", path: "/tmp/fresh" }],
      }),
    });
    const app = makeTestApp(deps);

    await app.request("/admin/reload-config", { method: "POST" });

    // The original array reference should contain the new data
    expect(projectsRef).toHaveLength(1);
    expect(projectsRef[0].name).toBe("fresh");
  });

  test("route not mounted when admin deps not provided", async () => {
    const app = createApp({
      health: {
        getMeetingCount: () => 0,
        getUptimeSeconds: () => 42,
      },
    });

    const res = await app.request("/admin/reload-config", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
