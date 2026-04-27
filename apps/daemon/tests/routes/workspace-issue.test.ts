import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createApp } from "@/apps/daemon/app";
import {
  slugify,
  resolveSlug,
  issueListRequestSchema,
  issueListResponseSchema,
  issueReadRequestSchema,
  issueReadResponseSchema,
  type IssueRouteDeps,
} from "@/apps/daemon/routes/workspace-issue";
import type { GitOps } from "@/apps/daemon/lib/git";
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

// -- Route tests: GET /workspace/issue/list --

async function writeIssue(slug: string, frontmatter: Record<string, string>, body = ""): Promise<void> {
  const issuesDir = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "issues");
  await fs.mkdir(issuesDir, { recursive: true });
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: "${v}"`).join("\n");
  const content = `---\n${fmLines}\n---${body ? `\n\n${body}` : ""}`;
  await fs.writeFile(path.join(issuesDir, `${slug}.md`), content, "utf-8");
}

async function writeWorkIssue(
  slug: string,
  frontmatter: Record<string, string>,
  body = "",
): Promise<void> {
  const workDir = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "work", "issues");
  await fs.mkdir(workDir, { recursive: true });
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: "${v}"`).join("\n");
  const content = `---\n${fmLines}\n---${body ? `\n\n${body}` : ""}`;
  await fs.writeFile(path.join(workDir, `${slug}.md`), content, "utf-8");
}

describe("GET /workspace/issue/list", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/issue/list");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("projectName is required");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/issue/list?projectName=nonexistent");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Project not found");
  });

  test("returns empty array when .lore/issues/ does not exist", async () => {
    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { issues: unknown[] };
    expect(data.issues).toEqual([]);
  });

  test("returns frontmatter rows for each issue", async () => {
    await writeIssue("first-bug", { title: "First Bug", date: "2026-01-15", status: "open" });
    await writeIssue("second-bug", { title: "Second Bug", date: "2026-02-20", status: "closed" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      issues: Array<{ slug: string; title: string; status: string; date: string }>;
    };
    expect(data.issues).toHaveLength(2);
    const slugs = data.issues.map((i) => i.slug).sort();
    expect(slugs).toEqual(["first-bug", "second-bug"]);
  });

  test("filters by status when ?status= is provided", async () => {
    await writeIssue("open-1", { title: "Open 1", date: "2026-01-01", status: "open" });
    await writeIssue("open-2", { title: "Open 2", date: "2026-01-02", status: "open" });
    await writeIssue("closed-1", { title: "Closed 1", date: "2026-01-03", status: "closed" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}&status=closed`);
    const data = (await res.json()) as { issues: Array<{ slug: string; status: string }> };
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].slug).toBe("closed-1");
    expect(data.issues[0].status).toBe("closed");
  });

  test("ignores non-.md files in the issues directory", async () => {
    await writeIssue("real-issue", { title: "Real", date: "2026-01-01", status: "open" });
    const issuesDir = path.join(tmpDir, "projects", TEST_PROJECT, ".lore", "issues");
    await fs.writeFile(path.join(issuesDir, "stray.txt"), "not an issue", "utf-8");

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    const data = (await res.json()) as { issues: Array<{ slug: string }> };
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].slug).toBe("real-issue");
  });

  test("response validates against issueListResponseSchema", async () => {
    await writeIssue("sch-issue", { title: "Sch", date: "2026-05-05", status: "open" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    const body = await res.json();
    const parsed = issueListResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("issueListRequestSchema rejects missing projectName", () => {
    const parsed = issueListRequestSchema.safeParse({ status: "open" });
    expect(parsed.success).toBe(false);
  });

  test("issueListRequestSchema accepts required projectName with optional status", () => {
    expect(
      issueListRequestSchema.safeParse({ projectName: "p" }).success,
    ).toBe(true);
    expect(
      issueListRequestSchema.safeParse({ projectName: "p", status: "open" }).success,
    ).toBe(true);
    // Empty projectName violates the min(1) constraint.
    expect(
      issueListRequestSchema.safeParse({ projectName: "" }).success,
    ).toBe(false);
  });

  // REQ-LDR-14: dual-read merge of work/issues and flat issues directories.
  test("merges issues from .lore/work/issues/ and .lore/issues/", async () => {
    await writeIssue("flat-issue", { title: "Flat", date: "2026-01-01", status: "open" });
    await writeWorkIssue("work-issue", { title: "Work", date: "2026-01-02", status: "open" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { issues: Array<{ slug: string; title: string }> };
    const slugs = data.issues.map((i) => i.slug).sort();
    expect(slugs).toEqual(["flat-issue", "work-issue"]);
  });

  test("dedupes by slug, preferring the work/ copy", async () => {
    await writeIssue("same-slug", { title: "Flat Version", date: "2026-01-01", status: "open" });
    await writeWorkIssue("same-slug", { title: "Work Version", date: "2026-01-02", status: "closed" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { issues: Array<{ slug: string; title: string; status: string }> };
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].title).toBe("Work Version");
    expect(data.issues[0].status).toBe("closed");
  });

  test("returns work/-only issues when flat directory is missing", async () => {
    await writeWorkIssue("work-only", { title: "Work Only", date: "2026-01-01", status: "open" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/list?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { issues: Array<{ slug: string }> };
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].slug).toBe("work-only");
  });
});

// -- Route tests: GET /workspace/issue/read --

describe("GET /workspace/issue/read", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/issue/read?slug=foo");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("projectName is required");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/issue/read?projectName=nonexistent&slug=foo");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Project not found");
  });

  test("returns 400 when slug is missing", async () => {
    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/read?projectName=${TEST_PROJECT}`);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("slug is required");
  });

  test("returns 404 when slug is not found", async () => {
    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/read?projectName=${TEST_PROJECT}&slug=missing`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Issue not found: missing");
  });

  test("returns frontmatter and body for an existing issue", async () => {
    await writeIssue(
      "bug-report",
      { title: "Bug Report", date: "2026-03-10", status: "open" },
      "Steps to reproduce:\n1. Click the button\n2. Watch it crash",
    );

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/read?projectName=${TEST_PROJECT}&slug=bug-report`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      slug: string;
      title: string;
      status: string;
      date: string;
      body: string;
    };
    expect(data.slug).toBe("bug-report");
    expect(data.title).toBe("Bug Report");
    expect(data.status).toBe("open");
    expect(data.date).toBe("2026-03-10");
    expect(data.body).toContain("Steps to reproduce:");
    expect(data.body).toContain("Click the button");
  });

  test("returns empty body for an issue with no body section", async () => {
    await writeIssue("no-body", { title: "No Body", date: "2026-03-10", status: "open" });

    const app = makeTestApp();
    const res = await app.request(`/workspace/issue/read?projectName=${TEST_PROJECT}&slug=no-body`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { body: string };
    expect(data.body).toBe("");
  });

  test("response validates against issueReadResponseSchema", async () => {
    await writeIssue(
      "sch-read",
      { title: "Sch Read", date: "2026-06-06", status: "closed" },
      "body line",
    );

    const app = makeTestApp();
    const res = await app.request(
      `/workspace/issue/read?projectName=${TEST_PROJECT}&slug=sch-read`,
    );
    const body = await res.json();
    const parsed = issueReadResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("issueReadRequestSchema rejects missing slug or projectName", () => {
    expect(
      issueReadRequestSchema.safeParse({ projectName: "p" }).success,
    ).toBe(false);
    expect(issueReadRequestSchema.safeParse({ slug: "s" }).success).toBe(false);
    expect(
      issueReadRequestSchema.safeParse({ projectName: "p", slug: "s" }).success,
    ).toBe(true);
  });

  // REQ-LDR-14: read endpoint accepts both layouts, preferring work/.
  test("reads issue from .lore/work/issues/ when present", async () => {
    await writeWorkIssue(
      "work-side",
      { title: "From Work", date: "2026-04-01", status: "open" },
      "Work body",
    );

    const app = makeTestApp();
    const res = await app.request(
      `/workspace/issue/read?projectName=${TEST_PROJECT}&slug=work-side`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { title: string; body: string };
    expect(data.title).toBe("From Work");
    expect(data.body).toBe("Work body");
  });

  test("prefers work/ copy when slug exists in both layouts", async () => {
    await writeIssue(
      "shared-slug",
      { title: "Flat Version", date: "2026-01-01", status: "open" },
      "Flat body",
    );
    await writeWorkIssue(
      "shared-slug",
      { title: "Work Version", date: "2026-01-02", status: "closed" },
      "Work body",
    );

    const app = makeTestApp();
    const res = await app.request(
      `/workspace/issue/read?projectName=${TEST_PROJECT}&slug=shared-slug`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { title: string; status: string; body: string };
    expect(data.title).toBe("Work Version");
    expect(data.status).toBe("closed");
    expect(data.body).toBe("Work body");
  });
});
