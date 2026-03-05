import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { migrateContentToBody } from "@/cli/migrate-content-to-body";
import { writeConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";
import type { AppConfig } from "@/lib/types";

let tmpDir: string;
let fakeHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gh-migrate-content-test-")
  );
  fakeHome = path.join(tmpDir, "home");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Write a config with the given projects. */
async function writeTestConfig(config: AppConfig): Promise<void> {
  await writeConfig(config, getConfigPath(fakeHome));
}

/** Create a project directory with a commissions subdirectory. */
async function makeProject(name: string): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.mkdir(path.join(dir, ".lore", "commissions"), { recursive: true });
  return dir;
}

/** Write a commission artifact file. */
async function writeArtifact(
  projectDir: string,
  filename: string,
  content: string
): Promise<string> {
  const filePath = path.join(projectDir, ".lore", "commissions", filename);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

// Artifact with result_summary in frontmatter and empty body
const ARTIFACT_WITH_SUMMARY = `---
title: "Test Commission"
status: completed
result_summary: "This is the result summary."
projectName: test-project
---
`;

// Artifact with result_summary already migrated to body
const ARTIFACT_ALREADY_MIGRATED = `---
title: "Test Commission"
status: completed
projectName: test-project
---

This is the result summary.
`;

// Artifact with no result_summary at all
const ARTIFACT_NO_SUMMARY = `---
title: "Test Commission"
status: in_progress
projectName: test-project
---
`;

// Artifact with result_summary in frontmatter AND existing body content
const ARTIFACT_SUMMARY_AND_BODY = `---
title: "Test Commission"
status: completed
result_summary: "This is the result summary."
projectName: test-project
---

Existing body content here.
`;


describe("migrateContentToBody", () => {
  test("returns 0 with no projects registered", async () => {
    await writeTestConfig({ projects: [] });
    const exitCode = await migrateContentToBody(false, fakeHome);
    expect(exitCode).toBe(0);
  });

  test("dry run does not modify files", async () => {
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(
      dir,
      "commission-test.md",
      ARTIFACT_WITH_SUMMARY
    );
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(false, fakeHome);
    expect(exitCode).toBe(0);

    // File should be unchanged
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe(ARTIFACT_WITH_SUMMARY);
  });

  test("apply migrates result_summary to body", async () => {
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(
      dir,
      "commission-test.md",
      ARTIFACT_WITH_SUMMARY
    );
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    const content = await fs.readFile(filePath, "utf-8");

    // result_summary should not be in frontmatter
    expect(content).not.toContain("result_summary:");

    // Body should contain the summary text
    expect(content).toContain("This is the result summary.");

    // Should still have valid frontmatter delimiters
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain("\n---\n");

    // Frontmatter should still have other fields
    expect(content).toContain("title:");
    expect(content).toContain("status: completed");
    expect(content).toContain("projectName: test-project");
  });

  test("skips artifacts with body content already present", async () => {
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(
      dir,
      "commission-test.md",
      ARTIFACT_ALREADY_MIGRATED
    );
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    // File should be unchanged
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe(ARTIFACT_ALREADY_MIGRATED);
  });

  test("skips artifacts with result_summary AND existing body content", async () => {
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(
      dir,
      "commission-test.md",
      ARTIFACT_SUMMARY_AND_BODY
    );
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    // File should be unchanged: body already has content, so skip even though
    // result_summary is present in frontmatter
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe(ARTIFACT_SUMMARY_AND_BODY);
  });

  test("skips artifacts with no result_summary", async () => {
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(
      dir,
      "commission-test.md",
      ARTIFACT_NO_SUMMARY
    );
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    // File should be unchanged
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe(ARTIFACT_NO_SUMMARY);
  });

  test("handles projects with no commissions directory", async () => {
    const dir = path.join(tmpDir, "empty-project");
    await fs.mkdir(dir, { recursive: true });
    await writeTestConfig({
      projects: [{ name: "empty", path: dir }],
    });

    // Should not throw, just skip
    const exitCode = await migrateContentToBody(false, fakeHome);
    expect(exitCode).toBe(0);
  });

  test("processes multiple projects", async () => {
    const dir1 = await makeProject("project-a");
    const dir2 = await makeProject("project-b");
    const filePath1 = await writeArtifact(
      dir1,
      "commission-a.md",
      ARTIFACT_WITH_SUMMARY
    );
    const filePath2 = await writeArtifact(
      dir2,
      "commission-b.md",
      ARTIFACT_WITH_SUMMARY
    );
    await writeTestConfig({
      projects: [
        { name: "project-a", path: dir1 },
        { name: "project-b", path: dir2 },
      ],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    const content1 = await fs.readFile(filePath1, "utf-8");
    const content2 = await fs.readFile(filePath2, "utf-8");
    expect(content1).not.toContain("result_summary:");
    expect(content2).not.toContain("result_summary:");
    expect(content1).toContain("This is the result summary.");
    expect(content2).toContain("This is the result summary.");
  });

  test("preserves other frontmatter fields exactly", async () => {
    const artifact = `---
title: "Test Commission"
status: completed
tags: [commission, test]
result_summary: "The summary."
projectName: my-project
---
`;
    const dir = await makeProject("test-project");
    const filePath = await writeArtifact(dir, "commission-test.md", artifact);
    await writeTestConfig({
      projects: [{ name: "test-project", path: dir }],
    });

    const exitCode = await migrateContentToBody(true, fakeHome);
    expect(exitCode).toBe(0);

    const content = await fs.readFile(filePath, "utf-8");
    // Other fields preserved
    expect(content).toContain('title: "Test Commission"');
    expect(content).toContain("status: completed");
    expect(content).toContain("tags: [commission, test]");
    expect(content).toContain("projectName: my-project");
    // Summary moved to body
    expect(content).toContain("\n---\n\nThe summary.\n");
  });

  test("returns 1 for config errors", async () => {
    const configFile = getConfigPath(fakeHome);
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, "{{broken yaml:::", "utf-8");

    const exitCode = await migrateContentToBody(false, fakeHome);
    expect(exitCode).toBe(1);
  });
});
