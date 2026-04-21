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

  test("returns 409 for duplicate project names", async () => {
    const projectDir = path.join(tmpDir, "dup-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });

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

  test("successfully registers a valid project with .git and .lore", async () => {
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

  test("successfully registers a project without .lore directory", async () => {
    const projectDir = path.join(tmpDir, "no-lore-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });

    // Write an initial config.yaml so the route can read/write it
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "bare-project", path: projectDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
    expect(body.name).toBe("bare-project");

    // In-memory config should be updated
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("bare-project");
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

  test("reports .git as issue but .lore as warning", async () => {
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
    const body = (await res.json()) as { valid: boolean; issues: string[]; warnings: string[] };
    expect(body.valid).toBe(false);
    // .git is an issue
    expect(body.issues.length).toBeGreaterThanOrEqual(1);
    expect(body.issues.some((i) => i.includes(".git/"))).toBe(true);
    // .lore is a warning, not an issue
    expect(body.warnings).toBeDefined();
    expect(body.warnings.some((w) => w.includes(".lore/"))).toBe(true);
  });

  test("allows project without .lore but requires .git", async () => {
    const projectDir = path.join(tmpDir, "git-only-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });

    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({
      projects: [{ name: "git-only", path: projectDir }],
    }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/application/validate");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean; issues: string[]; warnings: string[] };
    expect(body.valid).toBe(true);
    // No git issues
    expect(body.issues.filter((i) => i.includes("git-only")).length).toBe(0);
    // But should have warning about missing .lore
    expect(body.warnings).toBeDefined();
    expect(body.warnings.some((w) => w.includes(".lore/"))).toBe(true);
  });

  test("returns valid when project has .git (even without .lore)", async () => {
    const projectDir = path.join(tmpDir, "good-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });

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
    // Should have warning about missing .lore
    expect(body.warnings).toBeDefined();
    expect(body.warnings.length).toBeGreaterThan(0);
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

// -- Tests for Phase 2: group, deregister, register with group --

describe("POST /system/config/project/register with group", () => {
  let tmpDir: string;
  let ghHome: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-admin-reg2-"));
    ghHome = path.join(tmpDir, "guild-hall");
    await fs.mkdir(ghHome, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("stores group when provided", async () => {
    const projectDir = path.join(tmpDir, "my-project");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-project", path: projectDir, group: "backend" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
    expect(body.group).toBe("backend");
    expect(config.projects[0].group).toBe("backend");
  });

  test("omits group when not provided", async () => {
    const projectDir = path.join(tmpDir, "no-group");
    await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });

    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const config: AppConfig = { projects: [] };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "no-group", path: projectDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
    expect("group" in body).toBe(false);
    expect("group" in config.projects[0]).toBe(false);
  });
});

describe("POST /system/config/project/group", () => {
  let tmpDir: string;
  let ghHome: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-admin-grp-"));
    ghHome = path.join(tmpDir, "guild-hall");
    await fs.mkdir(ghHome, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("updates group in memory and on disk", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [{ name: "proj", path: "/proj" }] }, configPath);

    const config: AppConfig = { projects: [{ name: "proj", path: "/proj" }] };
    const deps = makeAdminDeps({ guildHallHome: ghHome, config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "proj", group: "frontend" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(true);
    expect(body.name).toBe("proj");
    expect(body.group).toBe("frontend");
    expect(config.projects[0].group).toBe("frontend");
  });

  test("returns 404 when project not found", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [] }, configPath);

    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ghost", group: "nowhere" }),
    });

    expect(res.status).toBe(404);
  });

  test("returns 400 when name is missing", async () => {
    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "backend" }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when group is missing", async () => {
    const deps = makeAdminDeps({ guildHallHome: ghHome });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "proj" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /system/config/project/deregister", () => {
  let tmpDir: string;
  let ghHome: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-admin-dereg-"));
    ghHome = path.join(tmpDir, "guild-hall");
    await fs.mkdir(ghHome, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("removes project from config and memory", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [{ name: "proj", path: "/proj" }] }, configPath);

    const config: AppConfig = { projects: [{ name: "proj", path: "/proj" }] };
    const deps = makeAdminDeps({
      guildHallHome: ghHome,
      config,
      hasActiveActivities: () => Promise.resolve(false),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/deregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "proj" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deregistered).toBe(true);
    expect(body.name).toBe("proj");
    expect(config.projects).toHaveLength(0);
  });

  test("returns 404 when project not found", async () => {
    const deps = makeAdminDeps({
      guildHallHome: ghHome,
      hasActiveActivities: () => Promise.resolve(false),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/deregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ghost" }),
    });

    expect(res.status).toBe(404);
  });

  test("returns 409 when project has active activities", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [{ name: "busy", path: "/busy" }] }, configPath);

    const config: AppConfig = { projects: [{ name: "busy", path: "/busy" }] };
    const deps = makeAdminDeps({
      guildHallHome: ghHome,
      config,
      hasActiveActivities: () => Promise.resolve(true),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/deregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "busy" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("active activities");
  });

  test("clean flag attempts filesystem cleanup", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [{ name: "cleanme", path: "/cleanme" }] }, configPath);

    const config: AppConfig = { projects: [{ name: "cleanme", path: "/cleanme" }] };

    // Create fake integration worktree directory
    const integrationPath = path.join(ghHome, "projects", "cleanme");
    await fs.mkdir(integrationPath, { recursive: true });
    await fs.writeFile(path.join(integrationPath, "marker.txt"), "test");

    // Create fake activity worktrees directory
    const worktreeRoot = path.join(ghHome, "worktrees", "cleanme");
    await fs.mkdir(worktreeRoot, { recursive: true });

    const deps = makeAdminDeps({
      guildHallHome: ghHome,
      config,
      hasActiveActivities: () => Promise.resolve(false),
    });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/deregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "cleanme", clean: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deregistered).toBe(true);
    expect(Array.isArray(body.cleaned)).toBe(true);
    expect(Array.isArray(body.failedCleanup)).toBe(true);

    // Both directories should have been removed (or attempted)
    // Integration path may fail git worktree remove (not a real worktree) but rm should succeed
    const integrationExists = await fs.stat(integrationPath).then(() => true).catch(() => false);
    expect(integrationExists).toBe(false);
  });

  test("clean flag is non-fatal on cleanup failure", async () => {
    const configPath = path.join(ghHome, "config.yaml");
    await writeConfig({ projects: [{ name: "proj", path: "/proj" }] }, configPath);

    const config: AppConfig = { projects: [{ name: "proj", path: "/proj" }] };
    const deps = makeAdminDeps({
      guildHallHome: ghHome,
      config,
      hasActiveActivities: () => Promise.resolve(false),
    });
    const app = makeTestApp(deps);

    // clean:true but no dirs exist — rm with force: true will succeed silently
    const res = await app.request("/system/config/project/deregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "proj", clean: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deregistered).toBe(true);
    // Config removal is authoritative regardless of cleanup
    expect(config.projects).toHaveLength(0);
  });
});

describe("GET /system/config/project/list", () => {
  test("returns empty array when no projects are registered", async () => {
    const deps = makeAdminDeps();
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ projects: [] });
  });

  test("returns all registered projects with name, path, group, and status", async () => {
    const config: AppConfig = {
      projects: [
        { name: "alpha", path: "/tmp/alpha" },
        { name: "beta", path: "/tmp/beta", group: "team-x" },
      ],
    };
    const deps = makeAdminDeps({ config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(2);
    expect(body.projects[0]).toEqual({
      name: "alpha",
      path: "/tmp/alpha",
      group: undefined,
      status: "registered",
    });
    expect(body.projects[1]).toEqual({
      name: "beta",
      path: "/tmp/beta",
      group: "team-x",
      status: "registered",
    });
  });

  test("response wraps projects in an object", async () => {
    const config: AppConfig = {
      projects: [{ name: "p", path: "/tmp/p" }],
    };
    const deps = makeAdminDeps({ config });
    const app = makeTestApp(deps);

    const res = await app.request("/system/config/project/list");
    const body = await res.json();
    expect(body).toHaveProperty("projects");
    expect(Array.isArray(body.projects)).toBe(true);
  });
});
