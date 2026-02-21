import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { validate } from "@/cli/validate";
import { writeConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";
import type { AppConfig } from "@/lib/types";

let tmpDir: string;
let fakeHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-validate-test-"));
  fakeHome = path.join(tmpDir, "home");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Create a project directory with the specified subdirectories. */
async function makeProject(
  name: string,
  subdirs: string[] = [".git", ".lore"]
): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.mkdir(dir, { recursive: true });
  for (const sub of subdirs) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  return dir;
}

/** Write a config with the given projects. */
async function writeTestConfig(config: AppConfig): Promise<void> {
  await writeConfig(config, getConfigPath(fakeHome));
}

describe("validate", () => {
  test("returns 0 for empty config (no projects)", async () => {
    await writeTestConfig({ projects: [] });
    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(0);
  });

  test("returns 0 when config file does not exist", async () => {
    // No config written at all; readConfig returns { projects: [] }
    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(0);
  });

  test("returns 0 for valid project", async () => {
    const dir = await makeProject("good-project");
    await writeTestConfig({
      projects: [{ name: "good", path: dir }],
    });

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(0);
  });

  test("returns 0 for multiple valid projects", async () => {
    const dir1 = await makeProject("project-a");
    const dir2 = await makeProject("project-b");
    await writeTestConfig({
      projects: [
        { name: "a", path: dir1 },
        { name: "b", path: dir2 },
      ],
    });

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(0);
  });

  test("returns 1 when project path does not exist", async () => {
    await writeTestConfig({
      projects: [{ name: "ghost", path: path.join(tmpDir, "nonexistent") }],
    });

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(1);
  });

  test("returns 1 when project missing .git/", async () => {
    const dir = await makeProject("no-git", [".lore"]);
    await writeTestConfig({
      projects: [{ name: "no-git", path: dir }],
    });

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(1);
  });

  test("returns 1 when project missing .lore/", async () => {
    const dir = await makeProject("no-lore", [".git"]);
    await writeTestConfig({
      projects: [{ name: "no-lore", path: dir }],
    });

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(1);
  });

  test("reports multiple issues from multiple projects", async () => {
    const missingGit = await makeProject("missing-git", [".lore"]);
    const missingLore = await makeProject("missing-lore", [".git"]);
    await writeTestConfig({
      projects: [
        { name: "no-git", path: missingGit },
        { name: "no-lore", path: missingLore },
        { name: "gone", path: path.join(tmpDir, "vanished") },
      ],
    });

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(String(args[0]));
    try {
      const exitCode = await validate(fakeHome);
      expect(exitCode).toBe(1);

      // All three projects should have issues reported, not fail-on-first
      const issueLines = errors.filter((e) => e.startsWith("  - "));
      expect(issueLines.length).toBe(3);
      expect(issueLines.some((l) => l.includes("no-git") && l.includes(".git"))).toBe(true);
      expect(issueLines.some((l) => l.includes("no-lore") && l.includes(".lore"))).toBe(true);
      expect(issueLines.some((l) => l.includes("gone") && l.includes("does not exist"))).toBe(true);
    } finally {
      console.error = originalError;
    }
  });

  test("returns 1 for invalid YAML in config", async () => {
    const configFile = getConfigPath(fakeHome);
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, "{{broken yaml:::", "utf-8");

    const exitCode = await validate(fakeHome);
    expect(exitCode).toBe(1);
  });

  test("skips .git and .lore checks when path does not exist", async () => {
    // When the path itself is gone, we should report "does not exist"
    // but not also report missing .git and .lore (the continue in the loop)
    await writeTestConfig({
      projects: [{ name: "gone", path: path.join(tmpDir, "vanished") }],
    });

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(String(args[0]));
    try {
      const exitCode = await validate(fakeHome);
      expect(exitCode).toBe(1);

      // Only one issue reported: the "does not exist" message.
      // Without the continue, we'd also get .git and .lore missing (3 issues).
      const issueLines = errors.filter((e) => e.startsWith("  - "));
      expect(issueLines.length).toBe(1);
      expect(issueLines[0]).toContain("does not exist");
      expect(issueLines[0]).not.toContain(".git");
      expect(issueLines[0]).not.toContain(".lore");
    } finally {
      console.error = originalError;
    }
  });
});
