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
  packageMetadataSchema,
  workerMetadataSchema,
  toolboxMetadataSchema,
  workerIdentitySchema,
  resourceDefaultsSchema,
} from "@/lib/packages";
import type {
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

  test("skips packages with missing required fields", async () => {
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    try {
      // Worker missing posture
      const incomplete = validWorkerGuildHall() as Record<string, unknown>;
      delete incomplete.posture;

      await writePackage(tmpDir, "incomplete", {
        name: "incomplete",
        guildHall: incomplete,
      });

      const packages = await discoverPackages([tmpDir]);
      expect(packages).toHaveLength(0);
      expect(warnMessages.length).toBeGreaterThan(0);
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
