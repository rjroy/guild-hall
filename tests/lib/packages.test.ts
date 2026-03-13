import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverPackages,
  getWorkers,
  getToolboxes,
  getWorkerByName,
  isValidPackageName,
  resolveWorkerPortraits,
  validatePackageModels,
  packageMetadataSchema,
  workerMetadataSchema,
  toolboxMetadataSchema,
  workerIdentitySchema,
  resourceDefaultsSchema,
  MANAGER_WORKER_NAME,
  MANAGER_PORTRAIT_PATH,
} from "@/lib/packages";
import type {
  AppConfig,
  WorkerMetadata,
  ToolboxMetadata,
  DiscoveredPackage,
} from "@/lib/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-packages-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Test data factories --

function validWorkerGuildHall(): object {
  return {
    type: "worker",
    identity: {
      name: "researcher",
      description: "Researches topics thoroughly",
      displayTitle: "The Researcher",
      portraitPath: "portrait.png",
    },
    posture: "You are a careful researcher.",
    domainToolboxes: ["web-search"],
    builtInTools: ["Read", "Grep"],
    checkoutScope: "sparse",
    resourceDefaults: {
      maxTurns: 50,
      maxBudgetUsd: 1.5,
    },
  };
}

function validToolboxGuildHall(): object {
  return {
    type: "toolbox",
    name: "web-search",
    description: "Web search tools for research tasks",
  };
}

function validCombinedGuildHall(): object {
  return {
    type: ["worker", "toolbox"],
    identity: {
      name: "linter",
      description: "Lints and provides lint tools",
      displayTitle: "The Linter",
    },
    posture: "You lint code.",
    domainToolboxes: [],
    builtInTools: ["Bash"],
    checkoutScope: "full",
    // Also has toolbox fields, but the union will match worker first
    // since it has identity/posture/etc.
  };
}

async function writePackage(
  scanDir: string,
  dirName: string,
  pkgJson: object
): Promise<string> {
  const pkgDir = path.join(scanDir, dirName);
  await fs.mkdir(pkgDir, { recursive: true });
  await fs.writeFile(
    path.join(pkgDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
    "utf-8"
  );
  return pkgDir;
}

async function writePackageWithPosture(
  scanDir: string,
  dirName: string,
  pkgJson: object,
  postureContent: string
): Promise<string> {
  const pkgDir = await writePackage(scanDir, dirName, pkgJson);
  await fs.writeFile(
    path.join(pkgDir, "posture.md"),
    postureContent,
    "utf-8"
  );
  return pkgDir;
}

// -- Package name validation --

describe("isValidPackageName", () => {
  test("accepts simple names", () => {
    expect(isValidPackageName("researcher")).toBe(true);
    expect(isValidPackageName("web-search")).toBe(true);
    expect(isValidPackageName("my_toolbox")).toBe(true);
    expect(isValidPackageName("tool123")).toBe(true);
  });

  test("accepts scoped npm names without slashes", () => {
    // Scoped names like @scope/pkg contain a slash, which we reject
    expect(isValidPackageName("@scope")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isValidPackageName("")).toBe(false);
  });

  test("rejects names with forward slash", () => {
    expect(isValidPackageName("@scope/package")).toBe(false);
    expect(isValidPackageName("path/traversal")).toBe(false);
  });

  test("rejects names with backslash", () => {
    expect(isValidPackageName("back\\slash")).toBe(false);
  });

  test("rejects names with double-dot", () => {
    expect(isValidPackageName("..")).toBe(false);
    expect(isValidPackageName("name..evil")).toBe(false);
  });

  test("rejects names with spaces", () => {
    expect(isValidPackageName("has space")).toBe(false);
    expect(isValidPackageName("tab\there")).toBe(false);
  });

  test("rejects names with non-ASCII characters", () => {
    expect(isValidPackageName("caf\u00e9")).toBe(false);
    expect(isValidPackageName("\u2603snowman")).toBe(false);
  });
});

// -- Zod schemas --

describe("Zod schemas", () => {
  test("workerIdentitySchema accepts valid identity", () => {
    const result = workerIdentitySchema.safeParse({
      name: "researcher",
      description: "A researcher",
      displayTitle: "The Researcher",
    });
    expect(result.success).toBe(true);
  });

  test("workerIdentitySchema accepts optional portraitPath", () => {
    const result = workerIdentitySchema.safeParse({
      name: "researcher",
      description: "A researcher",
      displayTitle: "The Researcher",
      portraitPath: "portrait.png",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.portraitPath).toBe("portrait.png");
    }
  });

  test("workerIdentitySchema rejects missing fields", () => {
    const result = workerIdentitySchema.safeParse({
      name: "researcher",
    });
    expect(result.success).toBe(false);
  });

  test("resourceDefaultsSchema accepts all optional", () => {
    const result = resourceDefaultsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("resourceDefaultsSchema accepts both fields", () => {
    const result = resourceDefaultsSchema.safeParse({
      maxTurns: 50,
      maxBudgetUsd: 1.5,
    });
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema accepts valid worker", () => {
    const result = workerMetadataSchema.safeParse(validWorkerGuildHall());
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema accepts combined type array", () => {
    const result = workerMetadataSchema.safeParse(validCombinedGuildHall());
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema accepts soul field when present", () => {
    const data = { ...validWorkerGuildHall(), soul: "You are a steadfast craftsman." } as Record<string, unknown>;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.soul).toBe("You are a steadfast craftsman.");
    }
  });

  test("workerMetadataSchema validates successfully with soul absent", () => {
    const data = validWorkerGuildHall() as Record<string, unknown>;
    delete data.soul;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.soul).toBeUndefined();
    }
  });

  test("workerMetadataSchema rejects soul with wrong type", () => {
    const data = { ...validWorkerGuildHall(), soul: 42 } as Record<string, unknown>;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(false);

    const data2 = { ...validWorkerGuildHall(), soul: { nested: "object" } } as Record<string, unknown>;
    const result2 = workerMetadataSchema.safeParse(data2);
    expect(result2.success).toBe(false);
  });

  test("workerMetadataSchema accepts valid model name", () => {
    const data = { ...validWorkerGuildHall(), model: "haiku" } as Record<string, unknown>;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("haiku");
    }
  });

  test("workerMetadataSchema validates successfully with model absent", () => {
    const data = validWorkerGuildHall() as Record<string, unknown>;
    delete data.model;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBeUndefined();
    }
  });

  test("workerMetadataSchema accepts any non-empty model string (validation deferred to validatePackageModels)", () => {
    const data = { ...validWorkerGuildHall(), model: "llama3-local" } as Record<string, unknown>;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("llama3-local");
    }
  });

  test("workerMetadataSchema rejects empty model string", () => {
    const data = { ...validWorkerGuildHall(), model: "" } as Record<string, unknown>;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("workerMetadataSchema accepts domainPlugins", () => {
    const data = { ...validWorkerGuildHall(), domainPlugins: ["pkg-name"] };
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema accepts missing domainPlugins (optional)", () => {
    const result = workerMetadataSchema.safeParse(validWorkerGuildHall());
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema rejects missing identity", () => {
    const data = validWorkerGuildHall() as Record<string, unknown>;
    delete data.identity;
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("toolboxMetadataSchema accepts valid toolbox", () => {
    const result = toolboxMetadataSchema.safeParse(validToolboxGuildHall());
    expect(result.success).toBe(true);
  });

  test("toolboxMetadataSchema rejects missing name", () => {
    const result = toolboxMetadataSchema.safeParse({
      type: "toolbox",
      description: "Missing name",
    });
    expect(result.success).toBe(false);
  });

  test("packageMetadataSchema matches worker metadata", () => {
    const result = packageMetadataSchema.safeParse(validWorkerGuildHall());
    expect(result.success).toBe(true);
  });

  test("packageMetadataSchema matches toolbox metadata", () => {
    const result = packageMetadataSchema.safeParse(validToolboxGuildHall());
    expect(result.success).toBe(true);
  });

  test("packageMetadataSchema rejects invalid type", () => {
    const result = packageMetadataSchema.safeParse({
      type: "unknown",
      name: "test",
      description: "test",
    });
    expect(result.success).toBe(false);
  });

  test("workerMetadataSchema accepts canUseToolRules referencing tools in builtInTools", () => {
    const data = {
      ...validWorkerGuildHall(),
      builtInTools: ["Read", "Glob", "Bash"],
      canUseToolRules: [
        { tool: "Bash", commands: ["git status"], allow: true },
        { tool: "Bash", allow: false, reason: "Only git status" },
      ],
    };
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema rejects canUseToolRules referencing tool not in builtInTools (REQ-SBX-15)", () => {
    const data = {
      ...validWorkerGuildHall(),
      builtInTools: ["Read", "Glob"],
      canUseToolRules: [
        { tool: "Bash", allow: false, reason: "No Bash" },
      ],
    };
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("Bash") && m.includes("not in builtInTools"))).toBe(true);
    }
  });

  test("workerMetadataSchema accepts missing canUseToolRules (optional)", () => {
    const result = workerMetadataSchema.safeParse(validWorkerGuildHall());
    expect(result.success).toBe(true);
  });

  test("workerMetadataSchema accepts empty canUseToolRules array", () => {
    const data = {
      ...validWorkerGuildHall(),
      canUseToolRules: [],
    };
    const result = workerMetadataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// -- Discovery --

describe("discoverPackages", () => {
  test("discovers valid worker package with all metadata fields", async () => {
    await writePackage(tmpDir, "researcher", {
      name: "researcher",
      guildHall: validWorkerGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const pkg = packages[0];
    expect(pkg.name).toBe("researcher");
    expect(pkg.path).toBe(path.join(tmpDir, "researcher"));

    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.type).toBe("worker");
    expect(meta.identity.name).toBe("researcher");
    expect(meta.identity.description).toBe("Researches topics thoroughly");
    expect(meta.identity.displayTitle).toBe("The Researcher");
    expect(meta.identity.portraitPath).toBe("portrait.png");
    expect(meta.posture).toBe("You are a careful researcher.");
    expect(meta.domainToolboxes).toEqual(["web-search"]);
    expect(meta.builtInTools).toEqual(["Read", "Grep"]);
    expect(meta.checkoutScope).toBe("sparse");
    expect(meta.resourceDefaults).toEqual({
      maxTurns: 50,
      maxBudgetUsd: 1.5,
    });
  });

  test("discovers valid toolbox package", async () => {
    await writePackage(tmpDir, "web-search", {
      name: "web-search",
      guildHall: validToolboxGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as ToolboxMetadata;
    expect(meta.type).toBe("toolbox");
    expect(meta.name).toBe("web-search");
    expect(meta.description).toBe("Web search tools for research tasks");
  });

  test("discovers combined worker+toolbox package", async () => {
    await writePackage(tmpDir, "linter", {
      name: "linter",
      guildHall: validCombinedGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.type).toEqual(["worker", "toolbox"]);
    expect(meta.identity.name).toBe("linter");
    expect(meta.checkoutScope).toBe("full");
  });

  test("skips directories without package.json", async () => {
    await fs.mkdir(path.join(tmpDir, "no-pkg-json"), { recursive: true });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(0);
  });

  test("skips package.json without guildHall key", async () => {
    await writePackage(tmpDir, "regular-npm", {
      name: "regular-npm",
      version: "1.0.0",
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(0);
  });

  test("skips malformed guildHall metadata with Zod error", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      await writePackage(tmpDir, "broken", {
        name: "broken",
        guildHall: {
          type: "worker",
          // Missing required fields: identity, posture, etc.
        },
      });

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);
      expect(warnMessages.some((m) => m.includes("invalid guildHall metadata"))).toBe(
        true
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  test("skips worker with no posture source", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      // Worker missing posture in JSON and no posture.md
      const incomplete = validWorkerGuildHall() as Record<string, unknown>;
      delete incomplete.posture;

      await writePackage(tmpDir, "incomplete", {
        name: "incomplete",
        guildHall: incomplete,
      });

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);
      expect(warnMessages.some((m) => m.includes("no posture.md and no guildHall.posture"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("returns empty array for empty scan directory", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });

    const packages = await discoverPackages([emptyDir]);
    expect(packages).toEqual([]);
  });

  test("returns empty array for nonexistent scan path", async () => {
    const packages = await discoverPackages([
      path.join(tmpDir, "does-not-exist"),
    ]);
    expect(packages).toEqual([]);
  });

  test("merges multiple scan paths with deduplication by name", async () => {
    const scanA = path.join(tmpDir, "scan-a");
    const scanB = path.join(tmpDir, "scan-b");
    await fs.mkdir(scanA, { recursive: true });
    await fs.mkdir(scanB, { recursive: true });

    // Same package name in both scan paths
    await writePackage(scanA, "researcher", {
      name: "researcher",
      guildHall: validWorkerGuildHall(),
    });

    const alternateGuildHall = validWorkerGuildHall() as Record<string, unknown>;
    (alternateGuildHall.identity as Record<string, unknown>).name =
      "researcher-alt";

    await writePackage(scanB, "researcher", {
      name: "researcher",
      guildHall: alternateGuildHall,
    });

    // Different package in scanB
    await writePackage(scanB, "web-search", {
      name: "web-search",
      guildHall: validToolboxGuildHall(),
    });

    const packages = await discoverPackages([scanA, scanB]);
    expect(packages).toHaveLength(2);

    // First scan path wins for "researcher"
    const researcher = packages.find((p) => p.name === "researcher");
    expect(researcher).toBeDefined();
    expect(researcher!.path).toBe(path.join(scanA, "researcher"));
    const meta = researcher!.metadata as WorkerMetadata;
    expect(meta.identity.name).toBe("researcher");

    // "web-search" from scanB is also included
    const webSearch = packages.find((p) => p.name === "web-search");
    expect(webSearch).toBeDefined();
  });

  test("rejects package names with path-unsafe characters", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      // Package with slash in name (e.g., scoped npm package)
      await writePackage(tmpDir, "scoped-pkg", {
        name: "@scope/evil",
        guildHall: validToolboxGuildHall(),
      });

      // Package with double-dot in name
      await writePackage(tmpDir, "dotdot-pkg", {
        name: "..sneaky",
        guildHall: validToolboxGuildHall(),
      });

      // Package with space in name
      await writePackage(tmpDir, "spaced-pkg", {
        name: "has space",
        guildHall: validToolboxGuildHall(),
      });

      // Package with backslash
      await writePackage(tmpDir, "backslash-pkg", {
        name: "back\\slash",
        guildHall: validToolboxGuildHall(),
      });

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);

      // Each should have generated a warning
      expect(
        warnMessages.filter((m) => m.includes("unsafe characters")).length
      ).toBe(4);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("skips package.json with invalid JSON", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      const pkgDir = path.join(tmpDir, "bad-json");
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(
        path.join(pkgDir, "package.json"),
        "{{not valid json",
        "utf-8"
      );

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);
      expect(warnMessages.some((m) => m.includes("invalid JSON"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("skips package.json with missing name field", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      await writePackage(tmpDir, "no-name", {
        guildHall: validToolboxGuildHall(),
      });

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);
      expect(warnMessages.some((m) => m.includes("missing or empty"))).toBe(
        true
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  test("discovers posture from posture.md file", async () => {
    const guildHall = validWorkerGuildHall() as Record<string, unknown>;
    delete guildHall.posture;

    await writePackageWithPosture(
      tmpDir,
      "md-worker",
      { name: "md-worker", guildHall },
      "You are a markdown-based worker."
    );

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.posture).toBe("You are a markdown-based worker.");
  });

  test("posture.md takes precedence over guildHall.posture", async () => {
    await writePackageWithPosture(
      tmpDir,
      "both-worker",
      { name: "both-worker", guildHall: validWorkerGuildHall() },
      "Markdown posture wins."
    );

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.posture).toBe("Markdown posture wins.");
  });

  test("falls back to guildHall.posture when no posture.md", async () => {
    await writePackage(tmpDir, "json-worker", {
      name: "json-worker",
      guildHall: validWorkerGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.posture).toBe("You are a careful researcher.");
  });

  test("discovers soul from soul.md file", async () => {
    const guildHall = validWorkerGuildHall() as Record<string, unknown>;
    delete guildHall.posture;

    const pkgDir = await writePackageWithPosture(
      tmpDir,
      "soul-worker",
      { name: "soul-worker", guildHall },
      "Worker posture here."
    );
    await fs.writeFile(
      path.join(pkgDir, "soul.md"),
      "## Character\n\nYou are the soul.\n\n## Voice\n\nSpeak plainly.\n\n## Vibe\n\nSteady.",
      "utf-8"
    );

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.soul).toContain("You are the soul.");
    expect(meta.soul).toContain("## Character");
  });

  test("worker without soul.md is still valid", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      await writePackageWithPosture(
        tmpDir,
        "no-soul",
        { name: "no-soul", guildHall: validWorkerGuildHall() },
        "Posture only."
      );

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(1);

      const meta = packages[0].metadata as WorkerMetadata;
      expect(meta.soul).toBeUndefined();
      expect(warnMessages.some((m) => m.includes("no soul.md found"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("package with plugin/.claude-plugin/plugin.json gets pluginPath populated", async () => {
    const pkgDir = await writePackage(tmpDir, "plugin-worker", {
      name: "plugin-worker",
      guildHall: validWorkerGuildHall(),
    });
    await fs.mkdir(path.join(pkgDir, "plugin", ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "plugin", ".claude-plugin", "plugin.json"),
      "{}",
      "utf-8"
    );

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);
    expect(packages[0].pluginPath).toBe(path.join(pkgDir, "plugin"));
  });

  test("package without plugin/.claude-plugin/plugin.json gets pluginPath undefined", async () => {
    await writePackage(tmpDir, "no-plugin-worker", {
      name: "no-plugin-worker",
      guildHall: validWorkerGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);
    expect(packages[0].pluginPath).toBeUndefined();
  });

  test("discovery does not fail if plugin/.claude-plugin/ exists without plugin.json", async () => {
    const pkgDir = await writePackage(tmpDir, "partial-plugin", {
      name: "partial-plugin",
      guildHall: validWorkerGuildHall(),
    });
    await fs.mkdir(path.join(pkgDir, "plugin", ".claude-plugin"), { recursive: true });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);
    expect(packages[0].pluginPath).toBeUndefined();
  });

  test("discovers worker with model field in metadata", async () => {
    const guildHall = { ...validWorkerGuildHall(), model: "haiku" };
    await writePackage(tmpDir, "haiku-worker", {
      name: "haiku-worker",
      guildHall,
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.model).toBe("haiku");
  });

  test("worker without model field has model undefined in metadata", async () => {
    await writePackage(tmpDir, "no-model-worker", {
      name: "no-model-worker",
      guildHall: validWorkerGuildHall(),
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.model).toBeUndefined();
  });

  test("discovers worker with non-builtin model name (validation deferred to validatePackageModels)", async () => {
    const guildHall = { ...validWorkerGuildHall(), model: "llama3" };
    await writePackage(tmpDir, "local-model", {
      name: "local-model",
      guildHall,
    });

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.model).toBe("llama3");
  });

  test("soul.md loading does not affect posture loading", async () => {
    const guildHall = validWorkerGuildHall() as Record<string, unknown>;
    delete guildHall.posture;

    const pkgDir = await writePackageWithPosture(
      tmpDir,
      "both-files",
      { name: "both-files", guildHall },
      "Posture content here."
    );
    await fs.writeFile(
      path.join(pkgDir, "soul.md"),
      "Soul content here.",
      "utf-8"
    );

    const packages = await discoverPackages([tmpDir]);
    expect(packages).toHaveLength(1);

    const meta = packages[0].metadata as WorkerMetadata;
    expect(meta.posture).toBe("Posture content here.");
    expect(meta.soul).toBe("Soul content here.");
  });
});

// -- Filtering helpers --

describe("getWorkers", () => {
  test("returns only worker packages", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "researcher",
        path: "/packages/researcher",
        metadata: { ...validWorkerGuildHall() } as WorkerMetadata,
      },
      {
        name: "web-search",
        path: "/packages/web-search",
        metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
      },
    ];

    const workers = getWorkers(packages);
    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("researcher");
  });

  test("includes combined worker+toolbox packages", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "linter",
        path: "/packages/linter",
        metadata: { ...validCombinedGuildHall() } as WorkerMetadata,
      },
      {
        name: "web-search",
        path: "/packages/web-search",
        metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
      },
    ];

    const workers = getWorkers(packages);
    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("linter");
  });
});

describe("getToolboxes", () => {
  test("returns only toolbox packages", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "researcher",
        path: "/packages/researcher",
        metadata: { ...validWorkerGuildHall() } as WorkerMetadata,
      },
      {
        name: "web-search",
        path: "/packages/web-search",
        metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
      },
    ];

    const toolboxes = getToolboxes(packages);
    expect(toolboxes).toHaveLength(1);
    expect(toolboxes[0].name).toBe("web-search");
  });

  test("includes combined worker+toolbox packages", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "linter",
        path: "/packages/linter",
        metadata: { ...validCombinedGuildHall() } as WorkerMetadata,
      },
    ];

    const toolboxes = getToolboxes(packages);
    expect(toolboxes).toHaveLength(1);
    expect(toolboxes[0].name).toBe("linter");
  });
});

describe("getWorkerByName", () => {
  test("finds worker by name", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "researcher",
        path: "/packages/researcher",
        metadata: { ...validWorkerGuildHall() } as WorkerMetadata,
      },
      {
        name: "web-search",
        path: "/packages/web-search",
        metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
      },
    ];

    const found = getWorkerByName(packages, "researcher");
    expect(found).toBeDefined();
    expect(found!.name).toBe("researcher");
  });

  test("returns undefined for nonexistent name", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "researcher",
        path: "/packages/researcher",
        metadata: { ...validWorkerGuildHall() } as WorkerMetadata,
      },
    ];

    const found = getWorkerByName(packages, "nonexistent");
    expect(found).toBeUndefined();
  });

  test("finds worker by identity name when package name differs", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "guild-hall-writer",
        path: "/packages/guild-hall-writer",
        metadata: {
          ...validWorkerGuildHall(),
          identity: {
            name: "Scribe",
            description: "Writes documents",
            displayTitle: "The Scribe",
          },
        } as WorkerMetadata,
      },
    ];

    const found = getWorkerByName(packages, "Scribe");
    expect(found).toBeDefined();
    expect(found!.name).toBe("guild-hall-writer");
  });

  test("prefers package name over identity name", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "researcher",
        path: "/packages/researcher",
        metadata: { ...validWorkerGuildHall() } as WorkerMetadata,
      },
      {
        name: "guild-hall-writer",
        path: "/packages/guild-hall-writer",
        metadata: {
          ...validWorkerGuildHall(),
          identity: {
            name: "researcher",
            description: "Writes documents",
            displayTitle: "The Writer",
          },
        } as WorkerMetadata,
      },
    ];

    const found = getWorkerByName(packages, "researcher");
    expect(found).toBeDefined();
    expect(found!.path).toBe("/packages/researcher");
  });

  test("returns undefined when name matches a toolbox, not a worker", () => {
    const packages: DiscoveredPackage[] = [
      {
        name: "web-search",
        path: "/packages/web-search",
        metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
      },
    ];

    const found = getWorkerByName(packages, "web-search");
    expect(found).toBeUndefined();
  });
});

// -- resolveWorkerPortraits --

describe("resolveWorkerPortraits", () => {
  test("always includes the built-in Guild Master portrait", async () => {
    const ghHome = path.join(tmpDir, "no-packages");

    const portraits = await resolveWorkerPortraits(ghHome);
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });

  test("includes discovered workers alongside the Guild Master", async () => {
    const ghHome = path.join(tmpDir, "gh-home");
    const packagesDir = path.join(ghHome, "packages");

    await writePackage(packagesDir, "researcher", {
      name: "researcher",
      guildHall: validWorkerGuildHall(),
    });

    const portraits = await resolveWorkerPortraits(ghHome);
    expect(portraits.get("researcher")).toBe("portrait.png");
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });

  test("omits workers without portraitPath but keeps Guild Master", async () => {
    const ghHome = path.join(tmpDir, "gh-home");
    const packagesDir = path.join(ghHome, "packages");

    const noPortrait = validWorkerGuildHall() as Record<string, unknown>;
    (noPortrait.identity as Record<string, unknown>).portraitPath = undefined;

    await writePackage(packagesDir, "plain-worker", {
      name: "plain-worker",
      guildHall: noPortrait,
    });

    const portraits = await resolveWorkerPortraits(ghHome);
    // Only the Guild Master (no disk workers have portraits)
    expect(portraits.size).toBe(1);
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });

  test("returns Guild Master even when packages directory does not exist", async () => {
    const ghHome = path.join(tmpDir, "no-packages");

    const portraits = await resolveWorkerPortraits(ghHome);
    expect(portraits.size).toBe(1);
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });

  test("maps multiple workers by identity name", async () => {
    const ghHome = path.join(tmpDir, "gh-home");
    const packagesDir = path.join(ghHome, "packages");

    await writePackage(packagesDir, "researcher", {
      name: "researcher",
      guildHall: validWorkerGuildHall(),
    });

    const secondWorker = validWorkerGuildHall() as Record<string, unknown>;
    (secondWorker.identity as Record<string, unknown>).name = "architect";
    (secondWorker.identity as Record<string, unknown>).displayTitle = "The Architect";
    (secondWorker.identity as Record<string, unknown>).portraitPath = "arch.png";

    await writePackage(packagesDir, "architect", {
      name: "architect",
      guildHall: secondWorker,
    });

    const portraits = await resolveWorkerPortraits(ghHome);
    // 2 disk workers + Guild Master = 3
    expect(portraits.size).toBe(3);
    expect(portraits.get("researcher")).toBe("portrait.png");
    expect(portraits.get("architect")).toBe("arch.png");
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });

  test("skips toolbox packages but keeps Guild Master", async () => {
    const ghHome = path.join(tmpDir, "gh-home");
    const packagesDir = path.join(ghHome, "packages");

    await writePackage(packagesDir, "web-search", {
      name: "web-search",
      guildHall: validToolboxGuildHall(),
    });

    const portraits = await resolveWorkerPortraits(ghHome);
    expect(portraits.size).toBe(1);
    expect(portraits.get(MANAGER_WORKER_NAME)).toBe(MANAGER_PORTRAIT_PATH);
  });
});

// -- validatePackageModels --

describe("validatePackageModels", () => {
  const baseConfig: AppConfig = { projects: [] };

  const configWithLlama3: AppConfig = {
    projects: [],
    models: [
      { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
    ],
  };

  function makeWorkerPkg(name: string, model?: string): DiscoveredPackage {
    return {
      name,
      path: `/packages/${name}`,
      metadata: {
        ...validWorkerGuildHall(),
        identity: { name, description: "Test", displayTitle: "Test" },
        ...(model !== undefined ? { model } : {}),
      } as WorkerMetadata,
    };
  }

  function makeToolboxPkg(name: string): DiscoveredPackage {
    return {
      name,
      path: `/packages/${name}`,
      metadata: { ...validToolboxGuildHall() } as ToolboxMetadata,
    };
  }

  test("worker with built-in model passes with any config", () => {
    const pkgs = [makeWorkerPkg("w1", "haiku")];
    const result = validatePackageModels(pkgs, baseConfig);
    expect(result).toHaveLength(1);
  });

  test("worker with configured local model passes", () => {
    const pkgs = [makeWorkerPkg("w1", "llama3")];
    const result = validatePackageModels(pkgs, configWithLlama3);
    expect(result).toHaveLength(1);
  });

  test("worker with unconfigured model is filtered and warned", () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      const pkgs = [makeWorkerPkg("w1", "llama3")];
      const result = validatePackageModels(pkgs, baseConfig);
      expect(result).toHaveLength(0);
      expect(warnMessages.some((m) =>
        m.includes('references model "llama3"') &&
        m.includes("not a built-in model") &&
        m.includes("not defined in config.yaml") &&
        m.includes("Package skipped"),
      )).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("worker with no model field passes regardless of config", () => {
    const pkgs = [makeWorkerPkg("w1")];
    const result = validatePackageModels(pkgs, baseConfig);
    expect(result).toHaveLength(1);
  });

  test("toolbox packages pass regardless", () => {
    const pkgs = [makeToolboxPkg("tb1")];
    const result = validatePackageModels(pkgs, baseConfig);
    expect(result).toHaveLength(1);
  });

  test("filters only invalid workers, keeps the rest", () => {
    const pkgs = [
      makeWorkerPkg("good", "haiku"),
      makeWorkerPkg("bad", "unknown-model"),
      makeToolboxPkg("tb"),
      makeWorkerPkg("local-ok", "llama3"),
    ];

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const result = validatePackageModels(pkgs, configWithLlama3);
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.name)).toEqual(["good", "tb", "local-ok"]);
    } finally {
      console.warn = originalWarn;
    }
  });
});
