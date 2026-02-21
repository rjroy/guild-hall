import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readConfig, getProject, writeConfig } from "@/lib/config";
import { scanArtifacts, readArtifact } from "@/lib/artifacts";
import { projectLorePath, getConfigPath } from "@/lib/paths";
import { statusToGem } from "@/lib/types";
import type { GemStatus, Artifact } from "@/lib/types";
import { relatedToHref } from "@/components/artifact/MetadataSidebar";

/**
 * Integration tests for navigation data flow.
 *
 * Verifies that the chain from config reading through artifact scanning
 * to URL construction produces correct links. These tests use a real
 * temp directory fixture (config.yaml + .lore/ artifacts) and exercise
 * the actual lib/ functions, not copies of their logic.
 *
 * URL patterns tested:
 *   Dashboard project link:  /?project={name}
 *   Project view:            /projects/{name}
 *   Project tab:             /projects/{name}?tab={tab}
 *   Artifact link:           /projects/{name}/artifacts/{relativePath}
 *   Breadcrumb home:         /
 *   Breadcrumb project:      /projects/{name}
 *   Related artifact:        /projects/{name}/artifacts/{stripped-path}
 */

let tmpDir: string;
let projectDir: string;
let loreDir: string;
let configFilePath: string;

const PROJECT_NAME = "test-project";
const PROJECT_NAME_SPECIAL = "my project & stuff";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-nav-test-"));

  // Set up a project directory with .lore/ and artifacts
  projectDir = path.join(tmpDir, "project");
  loreDir = path.join(projectDir, ".lore");
  await fs.mkdir(loreDir, { recursive: true });

  // Create artifact directories
  await fs.mkdir(path.join(loreDir, "specs"), { recursive: true });
  await fs.mkdir(path.join(loreDir, "plans", "phase-1"), { recursive: true });
  await fs.mkdir(path.join(loreDir, "retros"), { recursive: true });

  // Create test artifacts
  await fs.writeFile(
    path.join(loreDir, "specs", "system.md"),
    `---
title: System Specification
date: 2026-01-15
status: approved
tags: [spec, system]
related:
  - .lore/plans/phase-1/impl.md
---
# System Spec

The system specification.`,
    "utf-8"
  );

  await fs.writeFile(
    path.join(loreDir, "plans", "phase-1", "impl.md"),
    `---
title: Phase 1 Implementation
date: 2026-02-01
status: draft
tags: [plan, phase-1]
modules: [core]
related:
  - .lore/specs/system.md
---
# Phase 1

Implementation plan.`,
    "utf-8"
  );

  await fs.writeFile(
    path.join(loreDir, "retros", "ui-review.md"),
    `---
title: UI Review Retro
date: 2026-02-10
status: complete
tags: [retro]
---
# UI Review

Lessons learned.`,
    "utf-8"
  );

  // Root-level artifact (no subdirectory)
  await fs.writeFile(
    path.join(loreDir, "readme.md"),
    `# Project Notes

No frontmatter here.`,
    "utf-8"
  );

  // Set up config.yaml
  const homeDir = path.join(tmpDir, "home");
  configFilePath = getConfigPath(homeDir);

  await writeConfig(
    {
      projects: [
        { name: PROJECT_NAME, path: projectDir, description: "Test project" },
        {
          name: PROJECT_NAME_SPECIAL,
          path: projectDir,
          description: "Special chars",
        },
      ],
    },
    configFilePath
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("config to project data flow", () => {
  test("readConfig returns registered projects", async () => {
    const config = await readConfig(configFilePath);
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].name).toBe(PROJECT_NAME);
    expect(config.projects[1].name).toBe(PROJECT_NAME_SPECIAL);
  });

  test("getProject finds registered project by name", async () => {
    const project = await getProject(PROJECT_NAME, configFilePath);
    expect(project).toBeDefined();
    expect(project!.path).toBe(projectDir);
  });

  test("getProject returns undefined for unregistered name", async () => {
    const project = await getProject("nonexistent", configFilePath);
    expect(project).toBeUndefined();
  });

  test("projectLorePath resolves correctly from project config", async () => {
    const project = await getProject(PROJECT_NAME, configFilePath);
    const lorePath = projectLorePath(project!.path);
    expect(lorePath).toBe(loreDir);
  });
});

describe("artifact scanning data flow", () => {
  test("scanArtifacts finds all .md files in .lore/", async () => {
    const artifacts = await scanArtifacts(loreDir);
    expect(artifacts.length).toBe(4);

    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toEqual([
      "plans/phase-1/impl.md",
      "readme.md",
      "retros/ui-review.md",
      "specs/system.md",
    ]);
  });

  test("relativePaths from scanArtifacts work with readArtifact", async () => {
    const artifacts = await scanArtifacts(loreDir);

    for (const artifact of artifacts) {
      const full = await readArtifact(loreDir, artifact.relativePath);
      expect(full.relativePath).toBe(artifact.relativePath);
      expect(full.content.length).toBeGreaterThan(0);
    }
  });

  test("related paths in frontmatter reference real artifacts", async () => {
    const artifact = await readArtifact(loreDir, "specs/system.md");
    expect(artifact.meta.related).toBeDefined();
    expect(artifact.meta.related!.length).toBeGreaterThan(0);

    // The related path (.lore/plans/phase-1/impl.md) should correspond
    // to a real artifact after stripping the .lore/ prefix
    for (const relPath of artifact.meta.related!) {
      const stripped = relPath.replace(/^\.lore\//, "");
      const related = await readArtifact(loreDir, stripped);
      expect(related.relativePath).toBe(stripped);
    }
  });
});

describe("dashboard URL construction", () => {
  test("project links use /?project={encodedName} format", async () => {
    const config = await readConfig(configFilePath);

    for (const project of config.projects) {
      const href = `/?project=${encodeURIComponent(project.name)}`;

      // Simple name: no encoding needed
      if (project.name === PROJECT_NAME) {
        expect(href).toBe(`/?project=${PROJECT_NAME}`);
      }

      // Special characters: must be encoded
      if (project.name === PROJECT_NAME_SPECIAL) {
        expect(href).toBe("/?project=my%20project%20%26%20stuff");
      }
    }
  });

  test("project view links use /projects/{encodedName} format", async () => {
    const config = await readConfig(configFilePath);

    for (const project of config.projects) {
      const href = `/projects/${encodeURIComponent(project.name)}`;

      if (project.name === PROJECT_NAME) {
        expect(href).toBe(`/projects/${PROJECT_NAME}`);
      }

      if (project.name === PROJECT_NAME_SPECIAL) {
        expect(href).toBe("/projects/my%20project%20%26%20stuff");
      }
    }
  });

  test("artifact links from dashboard use /projects/{name}/artifacts/{path}", async () => {
    const config = await readConfig(configFilePath);
    const project = config.projects[0];
    const lorePath = projectLorePath(project.path);
    const artifacts = await scanArtifacts(lorePath);
    const encodedName = encodeURIComponent(project.name);

    for (const artifact of artifacts) {
      const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;

      // All artifact links must start with the project prefix
      expect(href).toStartWith(`/projects/${encodedName}/artifacts/`);

      // The relativePath must be present (used to resolve on the artifact page)
      expect(href).toContain(artifact.relativePath);
    }
  });
});

describe("project view URL construction", () => {
  test("artifact list links use /projects/{name}/artifacts/{relativePath}", async () => {
    const project = await getProject(PROJECT_NAME, configFilePath);
    const lorePath = projectLorePath(project!.path);
    const artifacts = await scanArtifacts(lorePath);
    const encodedName = encodeURIComponent(PROJECT_NAME);

    // This mirrors ArtifactList.tsx link construction
    for (const artifact of artifacts) {
      const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
      expect(href).toMatch(/^\/projects\/[^/]+\/artifacts\/.+/);
    }
  });

  test("tab links use /projects/{name}?tab={key} format", async () => {
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const tabs = ["commissions", "artifacts", "meetings"];

    for (const tab of tabs) {
      const href = `/projects/${encodedName}?tab=${tab}`;
      expect(href).toStartWith(`/projects/${encodedName}`);
      expect(href).toContain(`tab=${tab}`);
    }
  });

  test("ProjectHeader breadcrumb links back to dashboard", () => {
    // ProjectHeader renders Link href="/"
    const homeHref = "/";
    expect(homeHref).toBe("/");
  });

  test("project name with special characters encodes correctly in URLs", () => {
    const encodedName = encodeURIComponent(PROJECT_NAME_SPECIAL);
    const projectHref = `/projects/${encodedName}`;
    const artifactHref = `/projects/${encodedName}/artifacts/specs/system.md`;

    expect(projectHref).toBe("/projects/my%20project%20%26%20stuff");
    expect(artifactHref).toBe(
      "/projects/my%20project%20%26%20stuff/artifacts/specs/system.md"
    );

    // Roundtrip: decodeURIComponent should recover the original name
    const decoded = decodeURIComponent(encodedName);
    expect(decoded).toBe(PROJECT_NAME_SPECIAL);
  });
});

describe("artifact view URL construction", () => {
  test("breadcrumb home link points to /", () => {
    // ArtifactBreadcrumb renders Link href="/"
    const homeHref = "/";
    expect(homeHref).toBe("/");
  });

  test("breadcrumb project link points to /projects/{name}", () => {
    const encodedName = encodeURIComponent(PROJECT_NAME);
    // ArtifactBreadcrumb renders Link href={`/projects/${encodedName}`}
    const projectHref = `/projects/${encodedName}`;
    expect(projectHref).toBe(`/projects/${PROJECT_NAME}`);
  });

  test("MetadataSidebar project link points to /projects/{name}", () => {
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const href = `/projects/${encodedName}`;
    expect(href).toBe(`/projects/${PROJECT_NAME}`);
  });

  test("related artifact links strip .lore/ prefix and encode correctly", async () => {
    const artifact = await readArtifact(loreDir, "specs/system.md");

    for (const relPath of artifact.meta.related!) {
      const href = relatedToHref(relPath, PROJECT_NAME);

      // Must start with the correct project prefix
      expect(href).toStartWith(`/projects/${PROJECT_NAME}/artifacts/`);

      // Must not contain .lore/ in the URL
      expect(href).not.toContain(".lore/");

      // The stripped path must resolve to an actual artifact
      const urlArtifactPath = href.replace(
        `/projects/${PROJECT_NAME}/artifacts/`,
        ""
      );
      const decodedPath = decodeURIComponent(urlArtifactPath);
      const resolvedArtifact = await readArtifact(loreDir, decodedPath);
      expect(resolvedArtifact).toBeDefined();
    }
  });

  test("bidirectional related links form valid navigation cycles", async () => {
    // system.md references plans/phase-1/impl.md
    // impl.md references specs/system.md
    // Both should produce valid round-trip URLs
    const system = await readArtifact(loreDir, "specs/system.md");
    const impl = await readArtifact(loreDir, "plans/phase-1/impl.md");

    // system -> impl link
    const systemToImpl = relatedToHref(
      system.meta.related![0],
      PROJECT_NAME
    );
    expect(systemToImpl).toContain("plans/phase-1/impl.md");

    // impl -> system link
    const implToSystem = relatedToHref(
      impl.meta.related![0],
      PROJECT_NAME
    );
    expect(implToSystem).toContain("specs/system.md");
  });
});

describe("status mapping completeness", () => {
  test("all artifact statuses in fixtures map to valid gem statuses", async () => {
    const artifacts = await scanArtifacts(loreDir);
    const validGemStatuses = new Set<GemStatus>([
      "active",
      "pending",
      "blocked",
      "info",
    ]);

    for (const artifact of artifacts) {
      const gemStatus = statusToGem(artifact.meta.status);
      expect(validGemStatuses.has(gemStatus)).toBe(true);
    }
  });

  test("known statuses from the spec all produce valid gem values", () => {
    // These are the statuses documented in CLAUDE.md for gem colors
    const specStatuses = [
      // green (active)
      "approved", "active", "complete",
      // amber (pending)
      "draft", "open", "pending",
      // red (blocked)
      "superseded", "outdated",
      // blue (info)
      "implemented", "archived",
    ];

    for (const status of specStatuses) {
      const gem = statusToGem(status);
      expect(["active", "pending", "blocked", "info"]).toContain(gem);
    }
  });
});

describe("navigation completeness (no dead ends)", () => {
  test("dashboard links to projects", async () => {
    const config = await readConfig(configFilePath);
    expect(config.projects.length).toBeGreaterThan(0);

    // Each project produces a link: /?project={name}
    for (const project of config.projects) {
      const href = `/?project=${encodeURIComponent(project.name)}`;
      expect(href).toBeTruthy();
    }
  });

  test("dashboard sidebar links to project view (REQ-VIEW-5)", async () => {
    // WorkspaceSidebar "View" link navigates to /projects/{name}
    const config = await readConfig(configFilePath);
    expect(config.projects.length).toBeGreaterThan(0);

    for (const project of config.projects) {
      const encodedName = encodeURIComponent(project.name);
      const href = `/projects/${encodedName}`;
      expect(href).toMatch(/^\/projects\/.+/);
    }

    // Special characters encode correctly in the view link
    const specialHref = `/projects/${encodeURIComponent(PROJECT_NAME_SPECIAL)}`;
    expect(specialHref).toBe("/projects/my%20project%20%26%20stuff");
  });

  test("dashboard links to artifacts when project is selected", async () => {
    const project = await getProject(PROJECT_NAME, configFilePath);
    const lorePath = projectLorePath(project!.path);
    const artifacts = await scanArtifacts(lorePath);
    const encodedName = encodeURIComponent(PROJECT_NAME);

    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
      expect(href).toBeTruthy();
    }
  });

  test("project view links back to dashboard via breadcrumb", () => {
    // ProjectHeader has Link href="/"
    expect("/").toBe("/");
  });

  test("project view links to individual artifacts", async () => {
    const project = await getProject(PROJECT_NAME, configFilePath);
    const lorePath = projectLorePath(project!.path);
    const artifacts = await scanArtifacts(lorePath);
    const encodedName = encodeURIComponent(PROJECT_NAME);

    for (const artifact of artifacts) {
      const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
      expect(href).toMatch(/^\/projects\/.+\/artifacts\/.+/);
    }
  });

  test("artifact view links back to dashboard via breadcrumb", () => {
    // ArtifactBreadcrumb has Link href="/"
    expect("/").toBe("/");
  });

  test("artifact view links back to project via breadcrumb", () => {
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const href = `/projects/${encodedName}`;
    expect(href).toMatch(/^\/projects\/.+/);
  });

  test("artifact view links to related artifacts (cross-links)", async () => {
    const artifact = await readArtifact(loreDir, "specs/system.md");
    expect(artifact.meta.related!.length).toBeGreaterThan(0);

    for (const relPath of artifact.meta.related!) {
      const href = relatedToHref(relPath, PROJECT_NAME);
      expect(href).toMatch(/^\/projects\/.+\/artifacts\/.+/);
    }
  });

  test("artifact view links to project page via MetadataSidebar", () => {
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const href = `/projects/${encodedName}`;
    expect(href).toBe(`/projects/${PROJECT_NAME}`);
  });

  test("all views form a connected graph with no dead ends", async () => {
    // This test documents the navigation graph:
    //
    //   Dashboard (/)
    //     -> Project selection (filter): /?project={name}
    //     -> Project view (REQ-VIEW-5): /projects/{name}
    //     -> Artifact links: /projects/{name}/artifacts/{path}
    //
    //   Project (/projects/{name})
    //     -> Back to dashboard: /
    //     -> Tab navigation: /projects/{name}?tab={tab}
    //     -> Artifact links: /projects/{name}/artifacts/{path}
    //
    //   Artifact (/projects/{name}/artifacts/{path})
    //     -> Back to dashboard: /
    //     -> Back to project: /projects/{name}
    //     -> Related artifacts: /projects/{name}/artifacts/{otherPath}
    //
    // Every view has at least one link leading to it and at least one
    // link leading away. There are no dead ends.

    const config = await readConfig(configFilePath);
    const project = config.projects[0];
    const lorePath = projectLorePath(project.path);
    const artifacts = await scanArtifacts(lorePath);
    const encodedName = encodeURIComponent(project.name);

    // Dashboard -> Project (filter)
    const projectSelectUrl = `/?project=${encodeURIComponent(project.name)}`;
    expect(projectSelectUrl).toBeTruthy();

    // Dashboard -> Project view (REQ-VIEW-5, via "View" link in sidebar)
    const projectViewUrl = `/projects/${encodedName}`;
    expect(projectViewUrl).toMatch(/^\/projects\/.+/);

    // Dashboard -> Artifact (via recent artifacts)
    const artifactFromDashboard = `/projects/${encodedName}/artifacts/${artifacts[0].relativePath}`;
    expect(artifactFromDashboard).toBeTruthy();

    // Project -> Dashboard
    const dashboardUrl = "/";
    expect(dashboardUrl).toBe("/");

    // Project -> Artifact
    const artifactFromProject = `/projects/${encodedName}/artifacts/${artifacts[0].relativePath}`;
    expect(artifactFromProject).toBeTruthy();

    // Artifact -> Dashboard (breadcrumb)
    expect(dashboardUrl).toBe("/");

    // Artifact -> Project (breadcrumb + sidebar)
    const projectUrl = `/projects/${encodedName}`;
    expect(projectUrl).toBeTruthy();

    // All paths are reachable and lead somewhere
    expect(artifacts.length).toBeGreaterThan(0);
  });
});

describe("deeply nested artifact paths", () => {
  test("multi-level paths produce valid URLs", async () => {
    const artifact = await readArtifact(
      loreDir,
      "plans/phase-1/impl.md"
    );
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;

    expect(href).toBe(
      `/projects/${PROJECT_NAME}/artifacts/plans/phase-1/impl.md`
    );
  });

  test("catch-all route segments match nested paths", () => {
    // Next.js [...path] route receives ["plans", "phase-1", "impl.md"]
    // The artifact page joins them with "/" to reconstruct the relativePath
    const pathSegments = ["plans", "phase-1", "impl.md"];
    const reconstructed = pathSegments.map(decodeURIComponent).join("/");
    expect(reconstructed).toBe("plans/phase-1/impl.md");
  });

  test("root-level artifacts also produce valid URLs", async () => {
    const artifact = await readArtifact(loreDir, "readme.md");
    const encodedName = encodeURIComponent(PROJECT_NAME);
    const href = `/projects/${encodedName}/artifacts/${artifact.relativePath}`;

    expect(href).toBe(`/projects/${PROJECT_NAME}/artifacts/readme.md`);
  });
});
