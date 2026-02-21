import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { register } from "@/cli/register";
import { readConfig } from "@/lib/config";
import { getConfigPath } from "@/lib/paths";

let tmpDir: string;
let fakeHome: string;
let projectDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-register-test-"));
  fakeHome = path.join(tmpDir, "home");
  projectDir = path.join(tmpDir, "project");

  // Create a valid project directory with .git/ and .lore/
  await fs.mkdir(path.join(projectDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(projectDir, ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("register", () => {
  test("registers a valid project", async () => {
    await register("my-project", projectDir, fakeHome);

    const config = await readConfig(getConfigPath(fakeHome));
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("my-project");
    expect(config.projects[0].path).toBe(projectDir);
  });

  test("creates config directory and file when they don't exist", async () => {
    await register("new-project", projectDir, fakeHome);

    const configFile = getConfigPath(fakeHome);
    const stat = await fs.stat(configFile);
    expect(stat.isFile()).toBe(true);
  });

  test("appends to existing config", async () => {
    // Register first project
    await register("project-a", projectDir, fakeHome);

    // Create a second valid project directory
    const projectDir2 = path.join(tmpDir, "project2");
    await fs.mkdir(path.join(projectDir2, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectDir2, ".lore"), { recursive: true });

    await register("project-b", projectDir2, fakeHome);

    const config = await readConfig(getConfigPath(fakeHome));
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].name).toBe("project-a");
    expect(config.projects[1].name).toBe("project-b");
  });

  test("rejects duplicate project name", async () => {
    await register("my-project", projectDir, fakeHome);

    await expect(
      register("my-project", projectDir, fakeHome)
    ).rejects.toThrow("already registered");
  });

  test("rejects path that does not exist", async () => {
    const bogus = path.join(tmpDir, "nonexistent");
    await expect(register("bad", bogus, fakeHome)).rejects.toThrow(
      "does not exist"
    );
  });

  test("rejects path missing .git/", async () => {
    const noGit = path.join(tmpDir, "no-git");
    await fs.mkdir(path.join(noGit, ".lore"), { recursive: true });

    await expect(register("bad", noGit, fakeHome)).rejects.toThrow(
      "does not contain a .git/ directory"
    );
  });

  test("rejects path missing .lore/", async () => {
    const noLore = path.join(tmpDir, "no-lore");
    await fs.mkdir(path.join(noLore, ".git"), { recursive: true });

    await expect(register("bad", noLore, fakeHome)).rejects.toThrow(
      "does not contain a .lore/ directory"
    );
  });

  test("rejects path that is a file, not a directory", async () => {
    const filePath = path.join(tmpDir, "a-file");
    await fs.writeFile(filePath, "not a directory", "utf-8");

    await expect(register("bad", filePath, fakeHome)).rejects.toThrow(
      "is not a directory"
    );
  });

  test("resolves relative paths", async () => {
    // Create a project in cwd-relative location
    const relativeDir = path.relative(process.cwd(), projectDir);
    await register("relative", relativeDir, fakeHome);

    const config = await readConfig(getConfigPath(fakeHome));
    // Stored path should be absolute
    expect(path.isAbsolute(config.projects[0].path)).toBe(true);
    expect(config.projects[0].path).toBe(projectDir);
  });
});
