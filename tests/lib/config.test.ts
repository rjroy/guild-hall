import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { readConfig, writeConfig, getProject } from "@/lib/config";
import { appConfigSchema, projectConfigSchema, modelDefinitionSchema } from "@/lib/config";

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

describe("modelDefinitionSchema", () => {
  test("accepts a valid model definition", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "llama3",
      modelId: "llama3",
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(true);
  });

  test("accepts valid names with hyphens and underscores", () => {
    for (const name of ["mistral-local", "qwen2_5", "my-model-v2"]) {
      const result = modelDefinitionSchema.safeParse({
        name,
        modelId: "test",
        baseUrl: "http://localhost:11434",
      });
      expect(result.success).toBe(true);
    }
  });

  test("rejects names with invalid characters", () => {
    for (const name of ["my:model", "has space", "slashed/name", "dot.name"]) {
      const result = modelDefinitionSchema.safeParse({
        name,
        modelId: "test",
        baseUrl: "http://localhost:11434",
      });
      expect(result.success).toBe(false);
    }
  });

  test("rejects empty name", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "",
      modelId: "test",
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(false);
  });

  test("rejects baseUrl without a scheme", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "localhost:11434",
    });
    expect(result.success).toBe(false);
  });

  test("accepts baseUrl with valid URL", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(true);
  });

  test("auth is optional", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBeUndefined();
    }
  });

  test("accepts auth with token and apiKey", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "http://localhost:11434",
      auth: { token: "my-token", apiKey: "my-key" },
    });
    expect(result.success).toBe(true);
  });

  test("guidance is optional", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(true);
  });

  test("accepts guidance string", () => {
    const result = modelDefinitionSchema.safeParse({
      name: "test",
      modelId: "test",
      baseUrl: "http://localhost:11434",
      guidance: "Use for fast local inference on bounded tasks.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guidance).toBe("Use for fast local inference on bounded tasks.");
    }
  });
});

describe("appConfigSchema models validation", () => {
  const baseConfig = { projects: [{ name: "p", path: "/p" }] };

  test("accepts config without models key", () => {
    const result = appConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  test("accepts config with valid models", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      models: [
        { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
        { name: "mistral-local", modelId: "mistral", baseUrl: "http://localhost:11434" },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects model name colliding with built-in", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      models: [
        { name: "opus", modelId: "test", baseUrl: "http://localhost:11434" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("conflicts with built-in"))).toBe(true);
    }
  });

  test("rejects duplicate model names", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      models: [
        { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
        { name: "llama3", modelId: "llama3-v2", baseUrl: "http://localhost:11434" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Duplicate model name"))).toBe(true);
    }
  });

  test("rejects model with invalid baseUrl", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      models: [
        { name: "test", modelId: "test", baseUrl: "not-a-url" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("parses models from YAML via readConfig", async () => {
    const yamlContent = `
projects:
  - name: my-project
    path: /home/user/my-project
models:
  - name: llama3
    modelId: llama3
    baseUrl: http://localhost:11434
  - name: custom-server
    modelId: gpt-4o
    baseUrl: http://192.168.1.50:8080
    auth:
      token: my-api-key
      apiKey: my-api-key
`;
    await fs.writeFile(configPath(), yamlContent, "utf-8");
    const config = await readConfig(configPath());
    expect(config.models).toHaveLength(2);
    expect(config.models![0].name).toBe("llama3");
    expect(config.models![1].auth?.token).toBe("my-api-key");
  });

  test("readConfig rejects built-in name collision in YAML", async () => {
    const yamlContent = `
projects:
  - name: p
    path: /p
models:
  - name: haiku
    modelId: test
    baseUrl: http://localhost:11434
`;
    await fs.writeFile(configPath(), yamlContent, "utf-8");
    await expect(readConfig(configPath())).rejects.toThrow("Config validation failed");
  });
});

describe("systemModels schema", () => {
  const baseConfig = { projects: [{ name: "p", path: "/p" }] };

  test("config with full systemModels section parses without error", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      systemModels: {
        memoryCompaction: "haiku",
        meetingNotes: "sonnet",
        briefing: "sonnet",
        guildMaster: "opus",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.systemModels?.memoryCompaction).toBe("haiku");
      expect(result.data.systemModels?.meetingNotes).toBe("sonnet");
      expect(result.data.systemModels?.briefing).toBe("sonnet");
      expect(result.data.systemModels?.guildMaster).toBe("opus");
    }
  });

  test("all systemModels fields are independently optional", () => {
    // Only one field
    expect(appConfigSchema.safeParse({
      ...baseConfig,
      systemModels: { memoryCompaction: "haiku" },
    }).success).toBe(true);

    // Two fields
    expect(appConfigSchema.safeParse({
      ...baseConfig,
      systemModels: { briefing: "sonnet", guildMaster: "opus" },
    }).success).toBe(true);

    // Three fields
    expect(appConfigSchema.safeParse({
      ...baseConfig,
      systemModels: { memoryCompaction: "haiku", meetingNotes: "sonnet", briefing: "sonnet" },
    }).success).toBe(true);
  });

  test("empty string for any field is rejected", () => {
    for (const field of ["memoryCompaction", "meetingNotes", "briefing", "guildMaster"]) {
      const result = appConfigSchema.safeParse({
        ...baseConfig,
        systemModels: { [field]: "" },
      });
      expect(result.success).toBe(false);
    }
  });

  test("absent systemModels key returns undefined", () => {
    const result = appConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.systemModels).toBeUndefined();
    }
  });

  test("systemModels parses from YAML via readConfig", async () => {
    const yamlContent = `
projects:
  - name: my-project
    path: /home/user/my-project
systemModels:
  memoryCompaction: haiku
  meetingNotes: sonnet
  briefing: sonnet
  guildMaster: opus
`;
    await fs.writeFile(configPath(), yamlContent, "utf-8");
    const config = await readConfig(configPath());
    expect(config.systemModels?.memoryCompaction).toBe("haiku");
    expect(config.systemModels?.meetingNotes).toBe("sonnet");
    expect(config.systemModels?.briefing).toBe("sonnet");
    expect(config.systemModels?.guildMaster).toBe("opus");
  });

  test("systemModels accepts local model names", () => {
    const result = appConfigSchema.safeParse({
      ...baseConfig,
      systemModels: { memoryCompaction: "my-local-model" },
    });
    expect(result.success).toBe(true);
  });
});
