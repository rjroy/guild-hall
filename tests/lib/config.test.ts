import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readConfig, writeConfig, getProject } from "@/lib/config";
import { appConfigSchema, projectConfigSchema } from "@/lib/config";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-config-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function configPath(): string {
  return path.join(tmpDir, "config.yaml");
}

describe("readConfig", () => {
  test("returns empty config when file does not exist", async () => {
    const config = await readConfig(path.join(tmpDir, "nonexistent.yaml"));
    expect(config).toEqual({ projects: [] });
  });

  test("returns empty config for empty file", async () => {
    await fs.writeFile(configPath(), "", "utf-8");
    const config = await readConfig(configPath());
    expect(config).toEqual({ projects: [] });
  });

  test("parses valid config with one project", async () => {
    const yaml = `
projects:
  - name: my-project
    path: /home/user/my-project
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    const config = await readConfig(configPath());
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("my-project");
    expect(config.projects[0].path).toBe("/home/user/my-project");
  });

  test("parses valid config with multiple projects and optional fields", async () => {
    const yaml = `
projects:
  - name: project-a
    path: /home/user/a
    description: First project
    repoUrl: https://github.com/user/a
    meetingCap: 3
  - name: project-b
    path: /home/user/b
settings:
  theme: dark
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    const config = await readConfig(configPath());
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].description).toBe("First project");
    expect(config.projects[0].repoUrl).toBe("https://github.com/user/a");
    expect(config.projects[0].meetingCap).toBe(3);
    expect(config.projects[1].description).toBeUndefined();
    expect(config.settings).toEqual({ theme: "dark" });
  });

  test("throws on invalid YAML syntax", async () => {
    await fs.writeFile(configPath(), "{{invalid: yaml:::", "utf-8");
    await expect(readConfig(configPath())).rejects.toThrow("Invalid YAML");
  });

  test("throws when required fields are missing", async () => {
    const yaml = `
projects:
  - description: missing name and path
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    await expect(readConfig(configPath())).rejects.toThrow(
      "Config validation failed"
    );
  });

  test("throws when projects is not an array", async () => {
    const yaml = `
projects: not-an-array
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    await expect(readConfig(configPath())).rejects.toThrow(
      "Config validation failed"
    );
  });

  test("throws when meetingCap is not a number", async () => {
    const yaml = `
projects:
  - name: test
    path: /tmp
    meetingCap: many
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    await expect(readConfig(configPath())).rejects.toThrow(
      "Config validation failed"
    );
  });
});

describe("writeConfig", () => {
  test("creates parent directory if needed", async () => {
    const nested = path.join(tmpDir, "nested", "deep", "config.yaml");
    await writeConfig({ projects: [] }, nested);
    const stat = await fs.stat(nested);
    expect(stat.isFile()).toBe(true);
  });

  test("round-trips correctly", async () => {
    const original = {
      projects: [
        { name: "test", path: "/tmp/test", description: "A test project" },
      ],
      settings: { key: "value" },
    };
    await writeConfig(original, configPath());
    const readBack = await readConfig(configPath());
    expect(readBack.projects).toHaveLength(1);
    expect(readBack.projects[0].name).toBe("test");
    expect(readBack.projects[0].path).toBe("/tmp/test");
    expect(readBack.projects[0].description).toBe("A test project");
    expect(readBack.settings).toEqual({ key: "value" });
  });

  test("overwrites existing file", async () => {
    await writeConfig(
      { projects: [{ name: "old", path: "/old" }] },
      configPath()
    );
    await writeConfig(
      { projects: [{ name: "new", path: "/new" }] },
      configPath()
    );
    const config = await readConfig(configPath());
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("new");
  });
});

describe("getProject", () => {
  test("returns project when found", async () => {
    const yaml = `
projects:
  - name: target
    path: /home/user/target
  - name: other
    path: /home/user/other
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    const project = await getProject("target", configPath());
    expect(project).toBeDefined();
    expect(project!.name).toBe("target");
    expect(project!.path).toBe("/home/user/target");
  });

  test("returns undefined when project not found", async () => {
    const yaml = `
projects:
  - name: existing
    path: /tmp
`;
    await fs.writeFile(configPath(), yaml, "utf-8");
    const project = await getProject("nonexistent", configPath());
    expect(project).toBeUndefined();
  });

  test("returns undefined when config file is missing", async () => {
    const project = await getProject(
      "anything",
      path.join(tmpDir, "missing.yaml")
    );
    expect(project).toBeUndefined();
  });
});

describe("Zod schemas", () => {
  test("projectConfigSchema accepts valid project", () => {
    const result = projectConfigSchema.safeParse({
      name: "test",
      path: "/tmp",
    });
    expect(result.success).toBe(true);
  });

  test("projectConfigSchema rejects missing name", () => {
    const result = projectConfigSchema.safeParse({ path: "/tmp" });
    expect(result.success).toBe(false);
  });

  test("appConfigSchema accepts minimal config", () => {
    const result = appConfigSchema.safeParse({ projects: [] });
    expect(result.success).toBe(true);
  });

  test("appConfigSchema accepts full config with settings", () => {
    const result = appConfigSchema.safeParse({
      projects: [{ name: "x", path: "/x" }],
      settings: { foo: "bar", nested: { a: 1 } },
    });
    expect(result.success).toBe(true);
  });
});
