import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/apps/daemon/app";
import type { ArtifactDeps } from "@/apps/daemon/routes/artifacts";
import type { AppConfig } from "@/lib/types";
import type { GitOps } from "@/apps/daemon/lib/git";

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
    // Both group 0; "approved" sorts before "draft" alphabetically by status name
    expect(body.artifacts[0].meta.status).toBe("approved");
    expect(body.artifacts[1].meta.status).toBe("draft");
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
    expect(commitPath).toContain(path.join("projects", "test-project"));
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

  test("serializeArtifact includes artifactType for markdown", async () => {
    await writeTestArtifact(
      "specs/typed.md",
      "---\ntitle: Typed\ndate: 2026-03-18\nstatus: draft\ntags: []\n---\nContent.",
    );

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/document/read?projectName=test-project&path=specs/typed.md",
    );
    const body = await res.json();
    expect(body.artifactType).toBe("document");
  });

  test("serializeArtifact includes artifactType for images in list", async () => {
    // Write both a markdown and an image file
    await writeTestArtifact(
      "specs/doc.md",
      "---\ntitle: Doc\ndate: 2026-03-18\nstatus: draft\ntags: []\n---\nContent.",
    );
    const imgPath = path.join(lorePath, "generated", "hero.png");
    await fs.mkdir(path.dirname(imgPath), { recursive: true });
    await fs.writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/document/list?projectName=test-project");
    const body = await res.json();
    expect(body.artifacts).toHaveLength(2);

    const artifacts = body.artifacts as Array<{ artifactType: string; relativePath: string; content: string }>;
    const doc = artifacts.find((a) => a.artifactType === "document");
    const img = artifacts.find((a) => a.artifactType === "image");
    expect(doc).toBeDefined();
    expect(img).toBeDefined();
    expect(img!.relativePath).toBe("generated/hero.png");
    expect(img!.content).toBe("");
  });
});

// -- Tests: GET /workspace/artifact/image/read --

async function writeTestImage(
  relativePath: string,
  content?: Buffer,
): Promise<void> {
  const fullPath = path.join(lorePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content ?? Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

describe("GET /workspace/artifact/image/read", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?path=test.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 400 when path is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("path");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=nonexistent&path=test.png");
    expect(res.status).toBe(404);
  });

  test("returns 415 for unsupported extension", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=data.bmp");
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Unsupported");
  });

  test("returns 404 for missing image file", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=nonexistent.png");
    expect(res.status).toBe(404);
  });

  test("rejects path traversal attempts", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=../../etc/passwd.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Path traversal");
  });

  test("serves PNG with correct Content-Type", async () => {
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await writeTestImage("generated/hero.png", pngData);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=generated/hero.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("max-age=300, stale-while-revalidate=60");
    expect(res.headers.get("content-length")).toBe(String(pngData.length));

    const body = Buffer.from(await res.arrayBuffer());
    expect(body).toEqual(pngData);
  });

  test("serves JPEG with correct Content-Type", async () => {
    await writeTestImage("photo.jpg");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=photo.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  test("serves SVG with correct Content-Type", async () => {
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeTestImage("diagram.svg", svgContent);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=diagram.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
  });

  test("serves WebP with correct Content-Type", async () => {
    await writeTestImage("cover.webp");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=cover.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
  });

  test("serves GIF with correct Content-Type", async () => {
    await writeTestImage("animation.gif");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=animation.gif");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
  });

  test("binary response body matches file content exactly", async () => {
    // Use recognizable binary data
    const imageData = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    await writeTestImage("generated/gradient.png", imageData);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/read?projectName=test-project&path=generated/gradient.png");
    expect(res.status).toBe(200);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(256);
    expect(body[0]).toBe(0);
    expect(body[255]).toBe(255);
  });
});

// -- Tests: GET /workspace/artifact/mockup/read --

async function writeTestMockup(
  relativePath: string,
  content = "<html><body><h1>Mock</h1></body></html>",
): Promise<void> {
  const fullPath = path.join(lorePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

describe("GET /workspace/artifact/mockup/read", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?path=test.html");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 400 when path is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("path");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=nonexistent&path=test.html");
    expect(res.status).toBe(404);
  });

  test("returns 415 for non-.html extension", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=data.htm");
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Unsupported");
  });

  test("returns 415 for .txt extension", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=readme.txt");
    expect(res.status).toBe(415);
  });

  test("returns 404 for non-existent file", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=nonexistent.html");
    expect(res.status).toBe(404);
  });

  test("rejects path traversal attempts", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=../../../etc/passwd.html");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Path traversal");
  });

  test("serves HTML with correct Content-Type", async () => {
    const htmlContent = "<!DOCTYPE html><html><body><h1>Dashboard</h1></body></html>";
    await writeTestMockup("generated/dashboard.html", htmlContent);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/dashboard.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("content-length")).toBe(String(Buffer.byteLength(htmlContent)));

    const body = await res.text();
    expect(body).toBe(htmlContent);
  });

  test("response body matches file content exactly", async () => {
    const htmlContent = "<html><head><style>body{color:red}</style></head><body><script>console.log('hi')</script></body></html>";
    await writeTestMockup("generated/interactive.html", htmlContent);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/interactive.html");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(htmlContent);
  });

  test("CSP header contains connect-src none and frame-ancestors none", async () => {
    await writeTestMockup("generated/page.html");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/page.html");
    expect(res.status).toBe(200);

    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("X-Content-Type-Options header is nosniff", async () => {
    await writeTestMockup("generated/page.html");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/page.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("Cache-Control header is no-cache", async () => {
    await writeTestMockup("generated/page.html");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/page.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("Content-Disposition header is inline", async () => {
    await writeTestMockup("generated/page.html");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/mockup/read?projectName=test-project&path=generated/page.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe("inline");
  });
});

// -- Tests: GET /workspace/artifact/image/meta --

describe("GET /workspace/artifact/image/meta", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?path=test.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 400 when path is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("path");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=nonexistent&path=test.png");
    expect(res.status).toBe(404);
  });

  test("returns 415 for unsupported extension", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project&path=file.bmp");
    expect(res.status).toBe(415);
  });

  test("returns 404 for missing image file", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project&path=nonexistent.png");
    expect(res.status).toBe(404);
  });

  test("rejects path traversal attempts", async () => {
    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project&path=../../etc/passwd.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Path traversal");
  });

  test("returns synthetic metadata for a PNG file", async () => {
    const pngData = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    await writeTestImage("generated/hero-image.png", pngData);

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project&path=generated/hero-image.png");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.relativePath).toBe("generated/hero-image.png");
    expect(body.meta.title).toBe("Hero Image");
    expect(body.meta.status).toBe("complete");
    expect(body.meta.tags).toEqual([]);
    expect(body.meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.fileSize).toBe(1024);
    expect(body.mimeType).toBe("image/png");
    expect(body.lastModified).toBeDefined();
    // Validate lastModified is an ISO date string
    expect(new Date(body.lastModified).toISOString()).toBe(body.lastModified);
  });

  test("returns correct mimeType for each supported format", async () => {
    const extensions: Array<[string, string]> = [
      ["test.jpg", "image/jpeg"],
      ["test.jpeg", "image/jpeg"],
      ["test.webp", "image/webp"],
      ["test.gif", "image/gif"],
      ["test.svg", "image/svg+xml"],
    ];

    const app = makeTestApp();
    for (const [filename, expectedMime] of extensions) {
      await writeTestImage(filename);
      const res = await app.request(
        `/workspace/artifact/image/meta?projectName=test-project&path=${filename}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mimeType).toBe(expectedMime);
    }
  });

  test("derives title from filename with hyphens and underscores", async () => {
    await writeTestImage("my_cool-screenshot.png");

    const app = makeTestApp();
    const res = await app.request("/workspace/artifact/image/meta?projectName=test-project&path=my_cool-screenshot.png");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.title).toBe("My Cool Screenshot");
  });
});

// -- Tests: Image endpoints resolve from integration worktree for meetings/commissions paths --

describe("image endpoints resolve from integration worktree", () => {
  test("image/read serves image from commissions/ path via integration worktree", async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeTestImage("commissions/diagram.png", imageData);

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/image/read?projectName=test-project&path=commissions/diagram.png",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body).toEqual(imageData);
  });

  test("image/read serves image from meetings/ path via integration worktree", async () => {
    const imageData = Buffer.from([0xff, 0xd8, 0xff]);
    await writeTestImage("meetings/whiteboard.jpg", imageData);

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/image/read?projectName=test-project&path=meetings/whiteboard.jpg",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  test("image/meta returns metadata for image in commissions/ path", async () => {
    await writeTestImage("commissions/architecture-diagram.png");

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/image/meta?projectName=test-project&path=commissions/architecture-diagram.png",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.title).toBe("Architecture Diagram");
    expect(body.mimeType).toBe("image/png");
  });

  test("image/meta returns metadata for image in meetings/ path", async () => {
    await writeTestImage("meetings/sketch.svg", Buffer.from("<svg></svg>"));

    const app = makeTestApp();
    const res = await app.request(
      "/workspace/artifact/image/meta?projectName=test-project&path=meetings/sketch.svg",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.title).toBe("Sketch");
    expect(body.mimeType).toBe("image/svg+xml");
  });
});
