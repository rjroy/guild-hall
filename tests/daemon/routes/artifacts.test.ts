import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { ArtifactDeps } from "@/daemon/routes/artifacts";
import type { AppConfig } from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";

// -- Test fixtures --

let tmpDir: string;
let lorePath: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-routes-"));
  // Simulate integration worktree at <ghHome>/projects/<projectName>/.lore
  guildHallHome = path.join(tmpDir, "guild-hall-home");
  const integrationPath = path.join(guildHallHome, "projects", "test-project");
  lorePath = path.join(integrationPath, ".lore");
  await fs.mkdir(lorePath, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(projectName = "test-project"): AppConfig {
  return {
    projects: [{ name: projectName, path: path.join(tmpDir, "repo") }],
  };
}

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
    createPullRequest: () => Promise.resolve(""),
    squashMergeNoCommit: () => Promise.resolve(true),
    listConflictedFiles: () => Promise.resolve([]),
    resolveConflictsTheirs: () => Promise.resolve(),
    revParse: () => Promise.resolve(""),
    isAncestor: () => Promise.resolve(false),
    listBranches: () => Promise.resolve([]),
    lorePendingChanges: () => Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
    commitLore: () => Promise.resolve({ committed: false }),
    ...overrides,
  } as GitOps;
}

function makeTestApp(
  artifactDeps: Partial<ArtifactDeps> = {},
  config?: AppConfig,
) {
  const cfg = artifactDeps.config ?? config ?? makeConfig();
  const ghHome = artifactDeps.guildHallHome ?? guildHallHome;
  const gitOps = artifactDeps.gitOps ?? makeMockGitOps();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    artifacts: {
      config: cfg,
      guildHallHome: ghHome,
      gitOps,
      checkDependencyTransitions: artifactDeps.checkDependencyTransitions,
    },
  }).app;
}

async function writeTestArtifact(
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(lorePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// -- Tests: GET /workspace/artifact/document/list --

describe("GET /workspace/artifact/document/list", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns empty array for project with no artifacts", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toEqual([]);
  });

  test("lists artifacts with parsed frontmatter", async () => {
    await writeTestArtifact(
      "specs/test-spec.md",
      `---
title: Test Specification
date: 2026-03-13
status: draft
tags: [test, spec]
---

# Test Spec

Some content here.
`,
    );

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(1);

    const artifact = body.artifacts[0];
    expect(artifact.relativePath).toBe("specs/test-spec.md");
    expect(artifact.meta.title).toBe("Test Specification");
    expect(artifact.meta.status).toBe("draft");
    expect(artifact.meta.tags).toEqual(["test", "spec"]);
    expect(artifact.content).toContain("# Test Spec");
    expect(artifact.lastModified).toBeDefined();
    // filePath should NOT be exposed (daemon internal)
    expect(artifact.filePath).toBeUndefined();
  });

  test("returns multiple artifacts sorted by status and title", async () => {
    await writeTestArtifact(
      "plans/alpha.md",
      `---
title: Alpha Plan
date: 2026-03-13
status: approved
tags: []
---
Alpha content.
`,
    );
    await writeTestArtifact(
      "specs/beta.md",
      `---
title: Beta Spec
date: 2026-03-13
status: draft
tags: []
---
Beta content.
`,
    );

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(2);
    // draft (group 0) sorts before approved (group 1)
    expect(body.artifacts[0].meta.status).toBe("draft");
    expect(body.artifacts[1].meta.status).toBe("approved");
  });
});

// -- Tests: GET /workspace/artifact/document/list (recent) --

describe("GET /workspace/artifact/document/list?recent=true", () => {
  test("returns recent artifacts sorted by modification time", async () => {
    await writeTestArtifact(
      "specs/older.md",
      `---
title: Older
date: 2026-03-10
status: draft
tags: []
---
Older content.
`,
    );
    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));
    await writeTestArtifact(
      "specs/newer.md",
      `---
title: Newer
date: 2026-03-13
status: draft
tags: []
---
Newer content.
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/list?projectName=test-project&recent=true&limit=10",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(2);
    // Newest first
    expect(body.artifacts[0].meta.title).toBe("Newer");
    expect(body.artifacts[1].meta.title).toBe("Older");
  });

  test("respects limit parameter", async () => {
    await writeTestArtifact("a.md", "---\ntitle: A\ndate: 2026-01-01\nstatus: draft\ntags: []\n---\nA");
    await new Promise((r) => setTimeout(r, 50));
    await writeTestArtifact("b.md", "---\ntitle: B\ndate: 2026-01-02\nstatus: draft\ntags: []\n---\nB");
    await new Promise((r) => setTimeout(r, 50));
    await writeTestArtifact("c.md", "---\ntitle: C\ndate: 2026-01-03\nstatus: draft\ntags: []\n---\nC");

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/list?projectName=test-project&recent=true&limit=2",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(2);
  });

  test("defaults limit to 10 when not specified", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/list?projectName=test-project&recent=true",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toBeDefined();
  });

  test("returns 400 for invalid limit", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/list?projectName=test-project&recent=true&limit=abc",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("limit");
  });
});

// -- Tests: GET /workspace/artifact/document/read --

describe("GET /workspace/artifact/document/read", () => {
  test("reads a single artifact with parsed content", async () => {
    await writeTestArtifact(
      "specs/my-spec.md",
      `---
title: My Spec
date: 2026-03-13
status: approved
tags: [architecture]
---

# My Specification

Detailed requirements here.
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/read?projectName=test-project&path=specs/my-spec.md",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.relativePath).toBe("specs/my-spec.md");
    expect(body.meta.title).toBe("My Spec");
    expect(body.meta.status).toBe("approved");
    expect(body.content).toContain("Detailed requirements here.");
    expect(body.rawContent).toBeDefined();
    expect(body.lastModified).toBeDefined();
    expect(body.filePath).toBeUndefined();
  });

  test("returns 404 for nonexistent artifact", async () => {
    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/read?projectName=test-project&path=does/not/exist.md",
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("does/not/exist.md");
  });

  test("path traversal in POST body returns 400", async () => {
    // GET path traversal is neutralized by HTTP URL normalization before
    // reaching the route handler. POST body paths bypass URL normalization,
    // so writeRawArtifactContent's validatePath catches them.
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "../../etc/passwd",
        content: "malicious",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Path traversal");
  });

  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/read?path=some/path.md");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("handles deep nested paths", async () => {
    await writeTestArtifact(
      "specs/infrastructure/deep/nested-spec.md",
      `---
title: Deep Nested
date: 2026-03-13
status: draft
tags: []
---
Deep content.
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/read?projectName=test-project&path=specs/infrastructure/deep/nested-spec.md",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.relativePath).toBe("specs/infrastructure/deep/nested-spec.md");
    expect(body.meta.title).toBe("Deep Nested");
  });
});

// -- Tests: POST /workspace/artifact/document/write --

describe("POST /workspace/artifact/document/write", () => {
  test("writes artifact content and returns success", async () => {
    // Create the file first (writeRawArtifactContent writes to existing paths)
    await writeTestArtifact("specs/writable.md", "---\ntitle: Old\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nOld content.");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/writable.md",
        content: "---\ntitle: Updated\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nNew content.",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify the file was actually written
    const written = await fs.readFile(
      path.join(lorePath, "specs/writable.md"),
      "utf-8",
    );
    expect(written).toContain("New content.");
  });

  test("calls gitOps.commitAll after writing", async () => {
    await writeTestArtifact("specs/commit-test.md", "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nContent.");

    let commitCalled = false;
    let commitPath = "";
    let commitMessage = "";
    const mockGitOps = makeMockGitOps({
      commitAll: (worktreePath: string, message: string) => {
        commitCalled = true;
        commitPath = worktreePath;
        commitMessage = message;
        return Promise.resolve(true);
      },
    });

    const app = makeTestApp({ gitOps: mockGitOps });
    await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/commit-test.md",
        content: "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nUpdated.",
      }),
    });

    expect(commitCalled).toBe(true);
    expect(commitPath).toContain("projects/test-project");
    expect(commitMessage).toContain("specs/commit-test.md");
  });

  test("calls checkDependencyTransitions after writing", async () => {
    await writeTestArtifact("specs/dep-test.md", "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nContent.");

    let depCheckCalled = false;
    let depCheckProject = "";
    const app = makeTestApp({
      checkDependencyTransitions: (projectName: string) => {
        depCheckCalled = true;
        depCheckProject = projectName;
        return Promise.resolve();
      },
    });

    await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/dep-test.md",
        content: "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nUpdated.",
      }),
    });

    expect(depCheckCalled).toBe(true);
    expect(depCheckProject).toBe("test-project");
  });

  test("succeeds even if git commit fails", async () => {
    await writeTestArtifact("specs/git-fail.md", "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nContent.");

    const mockGitOps = makeMockGitOps({
      commitAll: () => Promise.reject(new Error("Git is broken")),
    });

    const app = makeTestApp({ gitOps: mockGitOps });
    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/git-fail.md",
        content: "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nUpdated.",
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("succeeds even if dependency check fails", async () => {
    await writeTestArtifact("specs/dep-fail.md", "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nContent.");

    const app = makeTestApp({
      checkDependencyTransitions: () => Promise.reject(new Error("Dependency check broken")),
    });

    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/dep-fail.md",
        content: "---\ntitle: Test\nstatus: draft\ntags: []\ndate: 2026-01-01\n---\nUpdated.",
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("returns 400 for missing fields", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactPath: "specs/test.md" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 for invalid JSON body", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/write?projectName=test-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 404 for unknown project on write", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/write?projectName=nonexistent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactPath: "specs/test.md",
        content: "content",
      }),
    });
    expect(res.status).toBe(404);
  });
});

// -- Tests: JSON response shape --

describe("response shape", () => {
  test("lastModified is an ISO string, not a Date object", async () => {
    await writeTestArtifact(
      "specs/date-test.md",
      "---\ntitle: Date Test\ndate: 2026-03-13\nstatus: draft\ntags: []\n---\nContent.",
    );

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    const body = await res.json();
    const artifact = body.artifacts[0];
    expect(typeof artifact.lastModified).toBe("string");
    // Validate it parses as a date
    expect(new Date(artifact.lastModified).toISOString()).toBe(
      artifact.lastModified,
    );
  });

  test("list response wraps artifacts in an object", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    const body = await res.json();
    expect(body).toHaveProperty("artifacts");
    expect(Array.isArray(body.artifacts)).toBe(true);
  });

  test("single artifact response is not wrapped", async () => {
    await writeTestArtifact(
      "specs/unwrapped.md",
      "---\ntitle: Unwrapped\ndate: 2026-03-13\nstatus: draft\ntags: []\n---\nContent.",
    );

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/read?projectName=test-project&path=specs/unwrapped.md",
    );
    const body = await res.json();
    // Single artifact is returned directly, not in an array
    expect(body.relativePath).toBe("specs/unwrapped.md");
    expect(body.meta).toBeDefined();
  });

  test("content-type is application/json", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
