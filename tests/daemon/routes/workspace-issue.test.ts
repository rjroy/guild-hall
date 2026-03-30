import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import { slugify, resolveSlug, type IssueRouteDeps } from "@/daemon/routes/workspace-issue";
import type { GitOps } from "@/daemon/lib/git";
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

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "issue-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeTestApp(overrides: Partial<IssueRouteDeps> = {}) {
  const cfg = overrides.config ?? makeConfig();
  const gitOps = overrides.gitOps ?? makeMockGitOps();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    workspaceIssue: {
      config: cfg,
      guildHallHome: overrides.guildHallHome ?? tmpDir,
      gitOps,
    },
  }).app;
}

function postIssue(
  app: ReturnType<typeof makeTestApp>,
  body: Record<string, unknown>,
) {
  return app.request("/workspace/issue/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// -- Unit tests: slugify --

describe("slugify", () => {
  test("converts spaces to hyphens and lowercases", () => {
    expect(slugify("Quick Add Issues")).toBe("quick-add-issues");
  });

  test("handles parentheses and mixed punctuation", () => {
    expect(slugify("Build fails on Linux (with spaces)")).toBe("build-fails-on-linux-with-spaces");
  });

  test("strips leading and trailing whitespace", () => {
    expect(slugify("  leading spaces  ")).toBe("leading-spaces");
  });

  test("returns empty string for all-special characters", () => {
    expect(slugify("!@#$%")).toBe("");
  });

  test("collapses consecutive non-alphanumeric characters", () => {
    expect(slugify("a--b___c")).toBe("a-b-c");
  });
});

// -- Unit tests: resolveSlug --

describe("resolveSlug", () => {
  test("returns baseSlug when no file exists", async () => {
    const result = await resolveSlug(tmpDir, "my-issue");
    expect(result).toBe("my-issue");
  });

  test("appends -2 when base file exists", async () => {
    await fs.writeFile(path.join(tmpDir, "my-issue.md"), "");
    const result = await resolveSlug(tmpDir, "my-issue");
    expect(result).toBe("my-issue-2");
  });

  test("increments to -3 when base and -2 exist", async () => {
    await fs.writeFile(path.join(tmpDir, "quick-add-issues.md"), "");
    await fs.writeFile(path.join(tmpDir, "quick-add-issues-2.md"), "");
    const result = await resolveSlug(tmpDir, "quick-add-issues");
    expect(result).toBe("quick-add-issues-3");
  });
});

// -- Route tests --

describe("POST /workspace/issue/create", () => {
  test("returns 400 with empty title", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, { projectName: TEST_PROJECT, title: "" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Title is required");
  });

  test("returns 400 with missing title", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, { projectName: TEST_PROJECT });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Title is required");
  });

  test("returns 400 with title over 200 characters", async () => {
    const app = makeTestApp();
    const longTitle = "a".repeat(201);
    const res = await postIssue(app, { projectName: TEST_PROJECT, title: longTitle });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Title must be 200 characters or fewer");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, { projectName: "nonexistent", title: "Test" });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Project not found");
  });

  test("returns 400 for all-special-character title", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, { projectName: TEST_PROJECT, title: "!@#$%" });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Title must contain at least one alphanumeric character");
  });

  test("creates file with correct frontmatter (no body)", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, { projectName: TEST_PROJECT, title: "Test Issue" });
    expect(res.status).toBe(201);

    const data = (await res.json()) as { path: string; slug: string };
    expect(data.slug).toBe("test-issue");
    expect(data.path).toBe(".lore/issues/test-issue.md");

    const filePath = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "issues", "test-issue.md");
    const content = await fs.readFile(filePath, "utf-8");

    expect(content).toContain('title: "Test Issue"');
    expect(content).toContain("status: open");
    expect(content).toContain("date: ");
    // No body: file ends after closing ---
    expect(content.endsWith("---")).toBe(true);
  });

  test("creates file with frontmatter and body", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, {
      projectName: TEST_PROJECT,
      title: "Bug Report",
      body: "Steps to reproduce:\n1. Do this\n2. Do that",
    });
    expect(res.status).toBe(201);

    const data = (await res.json()) as { path: string; slug: string };
    expect(data.slug).toBe("bug-report");

    const filePath = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "issues", "bug-report.md");
    const content = await fs.readFile(filePath, "utf-8");

    expect(content).toContain('title: "Bug Report"');
    expect(content).toContain("\n\nSteps to reproduce:");
  });

  test("escapes double quotes in title", async () => {
    const app = makeTestApp();
    const res = await postIssue(app, {
      projectName: TEST_PROJECT,
      title: 'Fix the "broken" thing',
    });
    expect(res.status).toBe(201);

    const data = (await res.json()) as { path: string; slug: string };
    const filePath = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "issues", `${data.slug}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain('title: "Fix the \\"broken\\" thing"');
  });

  test("commit failure is non-fatal (still returns 201)", async () => {
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitAll: () => Promise.reject(new Error("commit exploded")),
      }),
    });
    const res = await postIssue(app, { projectName: TEST_PROJECT, title: "Commit fail test" });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { path: string; slug: string };
    expect(data.slug).toBe("commit-fail-test");
  });

  test("handles slug conflicts by appending suffix", async () => {
    const app = makeTestApp();

    // Create first issue
    const res1 = await postIssue(app, { projectName: TEST_PROJECT, title: "Duplicate Title" });
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as { slug: string };
    expect(data1.slug).toBe("duplicate-title");

    // Create second with same title
    const res2 = await postIssue(app, { projectName: TEST_PROJECT, title: "Duplicate Title" });
    expect(res2.status).toBe(201);
    const data2 = (await res2.json()) as { slug: string };
    expect(data2.slug).toBe("duplicate-title-2");
  });

  test("calls commitAll with correct worktree path and message", async () => {
    let capturedPath = "";
    let capturedMessage = "";
    const app = makeTestApp({
      gitOps: makeMockGitOps({
        commitAll: (worktreePath: string, message: string) => {
          capturedPath = worktreePath;
          capturedMessage = message;
          return Promise.resolve(true);
        },
      }),
    });

    await postIssue(app, { projectName: TEST_PROJECT, title: "Commit Path Test" });
    expect(capturedPath).toBe(path.join(tmpDir, "projects", TEST_PROJECT));
    expect(capturedMessage).toBe("Add issue: commit-path-test");
  });
});
