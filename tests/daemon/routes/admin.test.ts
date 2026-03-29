import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { AdminDeps } from "@/daemon/routes/admin";
import type { AppConfig } from "@/lib/types";
import { writeConfig } from "@/lib/config";

function makeAdminDeps(overrides?: Partial<AdminDeps>): AdminDeps {
  const config: AppConfig = overrides?.config ?? { projects: [] };
  return {
    config,
    guildHallHome: "/tmp/test-gh",
    gitOps: {
      createBranch: () => Promise.resolve(),
      branchExists: () => Promise.resolve(false),
      deleteBranch: () => Promise.resolve(),
      createWorktree: () => Promise.resolve(),
      removeWorktree: () => Promise.resolve(),
      configureSparseCheckout: () => Promise.resolve(),
      commitAll: () => Promise.resolve(false),
      squashMerge: () => Promise.resolve(),
      hasUncommittedChanges: () => Promise.resolve(false),
      rebase: () => Promise.resolve(),
      currentBranch: () => Promise.resolve("main"),
      listWorktrees: () => Promise.resolve([]),
      initClaudeBranch: () => Promise.resolve(),
      detectDefaultBranch: () => Promise.resolve("main"),
      fetch: () => Promise.resolve(),
      push: () => Promise.resolve(),
      resetHard: () => Promise.resolve(),
      resetSoft: () => Promise.resolve(),
      createPullRequest: () => Promise.resolve({ url: "" }),
      isAncestor: () => Promise.resolve(false),
      treesEqual: () => Promise.resolve(false),
      revParse: () => Promise.resolve("abc"),
      rebaseOnto: () => Promise.resolve(),
      merge: () => Promise.resolve(),
      squashMergeNoCommit: () => Promise.resolve(true),
      listConflictedFiles: () => Promise.resolve([]),
      resolveConflictsTheirs: () => Promise.resolve(),
      mergeAbort: () => Promise.resolve(),
      hasCommitsBeyond: () => Promise.resolve(false),
      lorePendingChanges: () => Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
      commitLore: () => Promise.resolve({ committed: false }),
    },
    readConfigFromDisk: () => Promise.resolve({ projects: [] }),
    syncProject: () => Promise.resolve(),
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
  }).app;
}

describe("POST /system/config/application/reload", () => {
  test("updates config.projects in place from disk", async () => {
    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({
      config,
      readConfigFromDisk: () => Promise.resolve({
        projects: [
          { name: "new-project", path: "/tmp/new-project" },
        ],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/reload", { method: "POST" });

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
      readConfigFromDisk: () => Promise.resolve({
        projects: [
          { name: "existing", path: "/tmp/existing" },
          { name: "added", path: "/tmp/added" },
        ],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/reload", { method: "POST" });

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
      readConfigFromDisk: () => Promise.resolve({
        projects: [
          { name: "old", path: "/tmp/old" },
          { name: "new", path: "/tmp/new" },
        ],
      }),
      syncProject: (_path, name) => {
        syncedProjects.push(name);
        return Promise.resolve();
      },
    });
    const app = makeTestApp(deps);

    await app.request("/system/config/application/reload", { method: "POST" });

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
      readConfigFromDisk: () => Promise.resolve({
        projects: [{ name: "a", path: "/a" }],
      }),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/reload", { method: "POST" });

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
      readConfigFromDisk: () => Promise.resolve({
        projects: [{ name: "fresh", path: "/tmp/fresh" }],
      }),
    });
    const app = makeTestApp(deps);

    await app.request("/system/config/application/reload", { method: "POST" });

    // The original array reference should contain the new data
    expect(projectsRef).toHaveLength(1);
    expect(projectsRef[0].name).toBe("fresh");
  });

  test("route not mounted when admin deps not provided", async () => {
    const { app } = createApp({
      health: {
        getMeetingCount: () => 0,
        getUptimeSeconds: () => 42,
      },
    });

    const res = await app.request("/system/config/application/reload", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

// -- Tests for new Phase 4 admin routes --

describe("POST /system/config/project/register", () => {
  let tmpDir: string;
  let ghHome: string;
  let savedGHHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-admin-reg-"));
    ghHome = path.join(tmpDir, "guild-hall");
    await fs.mkdir(ghHome, { recursive: true });

    savedGHHome = process.env.GUILD_HALL_HOME;
    process.env.GUILD_HALL_HOME = ghHome;
  });

  afterEach(async () => {
    if (savedGHHome !== undefined) {
      process.env.GUILD_HALL_HOME = savedGHHome;
    } else {
      delete process.env.GUILD_HALL_HOME;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns 400 when name is missing", async () => {
    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/some-path" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("name and path are required");
  });

  test("returns 400 when path does not exist", async () => {
    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", path: "/nonexistent/path" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("does not exist");
  });

  test("returns 400 when .git is missing", async () => {
    const projectDir = path.join(tmpDir, "no-git-project");
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", path: projectDir }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain(".git/");
  });

  test("returns 400 when .lore is missing", async () => {
    const projectDir = path.join(tmpDir, "no-lore-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", path: projectDir }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain(".lore/");
  });

  test("returns 409 for duplicate project names", async () => {
    const projectDir = path.join(tmpDir, "dup-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    const config: AppConfig = {
      projects: [{ name: "existing", path: "/some/path" }],
    };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "existing", path: projectDir }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already registered");
  });

  test("successfully registers a valid project", async () => {
    const projectDir = path.join(tmpDir, "valid-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    // Write an initial config.yaml so the route can read/write it
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-project", path: projectDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
    expect(body.name).toBe("my-project");
    expect(body.defaultBranch).toBe("main");

    // In-memory config should be updated
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("my-project");
  });
});

describe("GET /system/config/application/validate", () => {
  let tmpDir: string;
  let ghHome: string;
  let savedGHHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-admin-val-"));
    ghHome = path.join(tmpDir, "guild-hall");
    await fs.mkdir(ghHome, { recursive: true });

    savedGHHome = process.env.GUILD_HALL_HOME;
    process.env.GUILD_HALL_HOME = ghHome;
  });

  afterEach(async () => {
    if (savedGHHome !== undefined) {
      process.env.GUILD_HALL_HOME = savedGHHome;
    } else {
      delete process.env.GUILD_HALL_HOME;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns valid for empty config", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/validate");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.projectCount).toBe(0);
  });

  test("reports issues for missing project paths", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({
      projects: [{ name: "ghost", path: "/nonexistent/path" }],
    }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/validate");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toContain("does not exist");
  });

  test("reports issues for missing .git and .lore", async () => {
    const projectDir = path.join(tmpDir, "bare-dir");
    await fs.mkdir(projectDir, { recursive: true });

    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({
      projects: [{ name: "bare", path: projectDir }],
    }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/validate");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.issues.length).toBeGreaterThanOrEqual(2);
  });

  test("returns valid when all projects check out", async () => {
    const projectDir = path.join(tmpDir, "good-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({
      projects: [{ name: "good", path: projectDir }],
    }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/validate");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.projectCount).toBe(1);
  });
});

describe("POST /workspace/git/branch/rebase", () => {
  test("returns results from rebaseAll", async () => {
    const deps = makeAdminDeps();
    const app = makeTestApp(deps);

    // No projects, so results should be empty
    const res = await app.request("/workspace/git/branch/rebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test("returns 400 for unknown project name", async () => {
    const deps = makeAdminDeps();
    const app = makeTestApp(deps);

    const res = await app.request("/workspace/git/branch/rebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "nonexistent" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

describe("POST /workspace/git/integration/sync", () => {
  test("returns results from syncAll", async () => {
    const deps = makeAdminDeps();
    const app = makeTestApp(deps);

    const res = await app.request("/workspace/git/integration/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  test("returns 400 for unknown project name", async () => {
    const deps = makeAdminDeps();
    const app = makeTestApp(deps);

    const res = await app.request("/workspace/git/integration/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "nonexistent" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});
