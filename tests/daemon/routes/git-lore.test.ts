import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { GitLoreDeps } from "@/daemon/routes/git-lore";
import { cleanGitEnv, type GitOps } from "@/daemon/lib/git";
import type { AppConfig } from "@/lib/types";

const TEST_PROJECT = "test-project";

function makeMockGitOps(overrides: Partial<GitOps> = {}): GitOps {
  return {
    commitAll: () => Promise.resolve(false),
    createBranch: () => Promise.resolve(),
    branchExists: () => Promise.resolve(false),
    deleteBranch: () => Promise.resolve(),
    hasCommitsBeyond: () => Promise.resolve(false),
    createWorktree: () => Promise.resolve(),
    removeWorktree: () => Promise.resolve(),
    configureSparseCheckout: () => Promise.resolve(),
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
    revParse: () => Promise.resolve(""),
    rebaseOnto: () => Promise.resolve(),
    merge: () => Promise.resolve(),
    squashMergeNoCommit: () => Promise.resolve(true),
    listConflictedFiles: () => Promise.resolve([]),
    resolveConflictsTheirs: () => Promise.resolve(),
    mergeAbort: () => Promise.resolve(),
    lorePendingChanges: () => Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
    commitLore: () => Promise.resolve({ committed: false }),
    ...overrides,
  } as GitOps;
}

function makeConfig(): AppConfig {
  return {
    projects: [{ name: TEST_PROJECT, path: "/tmp/test-repo" }],
  };
}

function makeTestApp(
  overrides: Partial<GitLoreDeps> = {},
  config?: AppConfig,
) {
  const cfg = overrides.config ?? config ?? makeConfig();
  const gitOps = overrides.gitOps ?? makeMockGitOps();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    gitLore: {
      config: cfg,
      guildHallHome: overrides.guildHallHome ?? "/tmp/test-gh",
      gitOps,
    },
  }).app;
}

// -- GET /workspace/git/lore/status --

describe("GET /workspace/git/lore/status", () => {
  test("returns hasPendingChanges: false when no changes", async () => {
    const app = makeTestApp();
    const res = await app.request(
      `/workspace/git/lore/status?projectName=${TEST_PROJECT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hasPendingChanges: false, fileCount: 0 });
  });

  test("returns hasPendingChanges: true with 3 pending files", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        lorePendingChanges: () =>
          Promise.resolve({ hasPendingChanges: true, fileCount: 3 }),
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/status?projectName=${TEST_PROJECT}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hasPendingChanges: true, fileCount: 3 });
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/workspace/git/lore/status?projectName=nonexistent",
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/git/lore/status");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 500 on unexpected git error", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        lorePendingChanges: () => Promise.reject(new Error("git status exploded")),
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/status?projectName=${TEST_PROJECT}`,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("git status exploded");
  });
});

// -- POST /workspace/git/lore/commit --

describe("POST /workspace/git/lore/commit", () => {
  test("returns 400 with empty message", async () => {
    let commitLoreCalled = false;
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitLore: () => {
          commitLoreCalled = true;
          return Promise.resolve({ committed: true });
        },
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Commit message is required");
    expect(commitLoreCalled).toBe(false);
  });

  test("returns 400 with missing message field", async () => {
    let commitLoreCalled = false;
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitLore: () => {
          commitLoreCalled = true;
          return Promise.resolve({ committed: true });
        },
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(400);
    expect(commitLoreCalled).toBe(false);
  });

  test("returns committed: false when nothing to commit", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitLore: () => Promise.resolve({ committed: false }),
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Update lore" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ committed: false, message: "Nothing to commit" });
  });

  test("returns committed: true on successful commit", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitLore: () => Promise.resolve({ committed: true }),
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Update lore" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ committed: true, message: "Update lore" });
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/workspace/git/lore/commit?projectName=nonexistent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("passes correct worktree path to commitLore", async () => {
    let capturedPath = "";
    let capturedMessage = "";
    const app = makeTestApp({
      guildHallHome: "/tmp/test-gh",
      gitOps: makeMockGitOps({
        commitLore: (worktreePath: string, message: string) => {
          capturedPath = worktreePath;
          capturedMessage = message;
          return Promise.resolve({ committed: true });
        },
      }),
    });
    await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "  My commit  " }),
      },
    );
    // Integration worktree path is <guildHallHome>/projects/<projectName>
    expect(capturedPath).toBe(`/tmp/test-gh/projects/${TEST_PROJECT}`);
    // Message should be trimmed
    expect(capturedMessage).toBe("My commit");
  });

  test("returns 500 on unexpected git error", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitLore: () => Promise.reject(new Error("commit exploded")),
      }),
    });
    const res = await app.request(
      `/workspace/git/lore/commit?projectName=${TEST_PROJECT}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("commit exploded");
  });
});

// -- Unit test: staging boundary via real git repo --

describe("createGitOps().commitLore staging boundary", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "git-lore-test-"));
    // Init a git repo
    const run = (args: string[]) =>
      Bun.spawn(["git", ...args], { cwd: tmpDir, stdout: "pipe", stderr: "pipe", env: cleanGitEnv() });
    await run(["init"]).exited;
    await run(["config", "user.email", "test@test.com"]).exited;
    await run(["config", "user.name", "Test"]).exited;
    // Create initial commit
    await fs.writeFile(path.join(tmpDir, "README.md"), "initial");
    await run(["add", "-A"]).exited;
    await run(["commit", "--no-verify", "-m", "initial"]).exited;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("commits only .lore/ files, not files outside .lore/", async () => {
    const { createGitOps } = await import("@/daemon/lib/git");
    const git = createGitOps();

    // Create a file inside .lore/ and one outside
    await fs.mkdir(path.join(tmpDir, ".lore"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".lore", "test.md"), "lore content");
    await fs.writeFile(path.join(tmpDir, "outside.txt"), "should not be committed");

    const result = await git.commitLore(tmpDir, "Lore only commit");
    expect(result.committed).toBe(true);

    // Check git log for committed files
    const proc = Bun.spawn(
      ["git", "log", "-1", "--name-only", "--format="],
      { cwd: tmpDir, stdout: "pipe", stderr: "pipe", env: cleanGitEnv() },
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const committedFiles = stdout.trim().split("\n").filter(Boolean);
    expect(committedFiles).toContain(".lore/test.md");
    expect(committedFiles).not.toContain("outside.txt");

    // Verify outside.txt is still uncommitted
    const statusProc = Bun.spawn(
      ["git", "status", "--porcelain"],
      { cwd: tmpDir, stdout: "pipe", stderr: "pipe", env: cleanGitEnv() },
    );
    const statusOut = await new Response(statusProc.stdout).text();
    await statusProc.exited;
    expect(statusOut).toContain("outside.txt");
  });

  test("returns committed: false when no .lore/ changes exist", async () => {
    const { createGitOps } = await import("@/daemon/lib/git");
    const git = createGitOps();

    // Create a file outside .lore/ only
    await fs.writeFile(path.join(tmpDir, "outside.txt"), "should not trigger commit");

    const result = await git.commitLore(tmpDir, "Should not commit");
    expect(result.committed).toBe(false);
  });
});

describe("createGitOps().lorePendingChanges", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "git-lore-status-"));
    const run = (args: string[]) =>
      Bun.spawn(["git", ...args], { cwd: tmpDir, stdout: "pipe", stderr: "pipe", env: cleanGitEnv() });
    await run(["init"]).exited;
    await run(["config", "user.email", "test@test.com"]).exited;
    await run(["config", "user.name", "Test"]).exited;
    await fs.writeFile(path.join(tmpDir, "README.md"), "initial");
    await run(["add", "-A"]).exited;
    await run(["commit", "--no-verify", "-m", "initial"]).exited;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns no pending changes for clean repo", async () => {
    const { createGitOps } = await import("@/daemon/lib/git");
    const git = createGitOps();

    const result = await git.lorePendingChanges(tmpDir);
    expect(result).toEqual({ hasPendingChanges: false, fileCount: 0 });
  });

  test("detects .lore/ changes and ignores non-.lore/ files", async () => {
    const { createGitOps } = await import("@/daemon/lib/git");
    const git = createGitOps();

    // Stage and commit a .lore/ file first so modifications show as individual lines
    await fs.mkdir(path.join(tmpDir, ".lore", "specs"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".lore", "specs", "a.md"), "a");
    await fs.writeFile(path.join(tmpDir, ".lore", "specs", "b.md"), "b");
    const run = (args: string[]) =>
      Bun.spawn(["git", ...args], { cwd: tmpDir, stdout: "pipe", stderr: "pipe", env: cleanGitEnv() });
    await run(["add", "-A"]).exited;
    await run(["commit", "--no-verify", "-m", "add lore"]).exited;

    // Now modify both files (modifications show as individual lines in --porcelain)
    await fs.writeFile(path.join(tmpDir, ".lore", "specs", "a.md"), "a modified");
    await fs.writeFile(path.join(tmpDir, ".lore", "specs", "b.md"), "b modified");
    await fs.writeFile(path.join(tmpDir, "outside.txt"), "ignored");

    const result = await git.lorePendingChanges(tmpDir);
    expect(result.hasPendingChanges).toBe(true);
    expect(result.fileCount).toBe(2);
  });
});
