import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverPackages,
  getWorkers,
  getToolboxes,
  validatePackageModels,
  packageMetadataSchema,
  pluginMetadataSchema,
} from "@/lib/packages";
import type {
  AppConfig,
  PluginMetadata,
  WorkerMetadata,
  ToolboxMetadata,
  DiscoveredPackage,
} from "@/lib/types";
import { prepareSdkSession } from "@/daemon/lib/agent-sdk/sdk-runner";
import { noopEventBus } from "@/daemon/lib/event-bus";
import type { ActivationResult, ResolvedToolSet } from "@/lib/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-plugin-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Test data factories --

function validPluginGuildHall(): object {
  return {
    type: "plugin",
    name: "guild-compendium",
    description: "Curated craft knowledge for the guild.",
  };
}

function validWorkerGuildHall(): object {
  return {
    type: "worker",
    identity: {
      name: "test-worker",
      description: "A test worker",
      displayTitle: "Test Worker",
    },
    posture: "You are a test worker.",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "sparse",
  };
}

async function writePackage(
  scanDir: string,
  dirName: string,
  pkgJson: object,
): Promise<string> {
  const pkgDir = path.join(scanDir, dirName);
  await fs.mkdir(pkgDir, { recursive: true });
  await fs.writeFile(
    path.join(pkgDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
    "utf-8",
  );
  return pkgDir;
}

async function _writePackageWithPosture(
  scanDir: string,
  dirName: string,
  pkgJson: object,
  postureContent: string,
): Promise<string> {
  const pkgDir = await writePackage(scanDir, dirName, pkgJson);
  await fs.writeFile(path.join(pkgDir, "posture.md"), postureContent, "utf-8");
  return pkgDir;
}

async function addPluginDir(pkgDir: string): Promise<void> {
  const pluginDir = path.join(pkgDir, "plugin", ".claude-plugin");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({ name: "Test Plugin", description: "A test plugin" }),
    "utf-8",
  );
}

// -- pluginMetadataSchema tests --

describe("pluginMetadataSchema", () => {
  test("accepts valid plugin metadata", () => {
    const result = pluginMetadataSchema.safeParse({
      type: "plugin",
      name: "guild-compendium",
      description: "Curated craft knowledge.",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing name", () => {
    const result = pluginMetadataSchema.safeParse({
      type: "plugin",
      description: "Missing name field.",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing description", () => {
    const result = pluginMetadataSchema.safeParse({
      type: "plugin",
      name: "guild-compendium",
    });
    expect(result.success).toBe(false);
  });

  test("rejects wrong type", () => {
    const result = pluginMetadataSchema.safeParse({
      type: "worker",
      name: "guild-compendium",
      description: "Wrong type.",
    });
    expect(result.success).toBe(false);
  });
});

// -- packageMetadataSchema union tests --

describe("packageMetadataSchema accepts plugin type", () => {
  test("accepts plugin-type metadata", () => {
    const result = packageMetadataSchema.safeParse(validPluginGuildHall());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("plugin");
    }
  });
});

// -- discoverPackages tests --

describe("discoverPackages with plugin packages", () => {
  test("discovers a plugin-type package with pluginPath when plugin dir exists", async () => {
    const pkgDir = await writePackage(tmpDir, "guild-compendium", {
      name: "guild-compendium",
      guildHall: validPluginGuildHall(),
    });
    await addPluginDir(pkgDir);

    const packages = await discoverPackages([tmpDir]);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("guild-compendium");
    expect(packages[0].metadata.type).toBe("plugin");
    expect((packages[0].metadata as PluginMetadata).name).toBe("guild-compendium");
    expect(packages[0].pluginPath).toBe(path.join(pkgDir, "plugin"));
  });

  test("discovers a plugin-type package with undefined pluginPath when no plugin dir", async () => {
    await writePackage(tmpDir, "bare-plugin", {
      name: "bare-plugin",
      guildHall: {
        type: "plugin",
        name: "bare-plugin",
        description: "Plugin with no plugin directory.",
      },
    });

    const packages = await discoverPackages([tmpDir]);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("bare-plugin");
    expect(packages[0].pluginPath).toBeUndefined();
  });
});

// -- getWorkers and getToolboxes exclusion tests --

describe("getWorkers and getToolboxes exclude plugin packages", () => {
  test("getWorkers excludes plugin packages", () => {
    const pluginPkg: DiscoveredPackage = {
      name: "guild-compendium",
      path: "/tmp/guild-compendium",
      metadata: { ...validPluginGuildHall() } as PluginMetadata,
    };
    const workerPkg: DiscoveredPackage = {
      name: "test-worker",
      path: "/tmp/test-worker",
      metadata: {
        ...validWorkerGuildHall(),
        posture: "You are a test worker.",
      } as WorkerMetadata,
    };

    const workers = getWorkers([pluginPkg, workerPkg]);
    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("test-worker");
  });

  test("getToolboxes excludes plugin packages", () => {
    const pluginPkg: DiscoveredPackage = {
      name: "guild-compendium",
      path: "/tmp/guild-compendium",
      metadata: { ...validPluginGuildHall() } as PluginMetadata,
    };
    const toolboxPkg: DiscoveredPackage = {
      name: "test-toolbox",
      path: "/tmp/test-toolbox",
      metadata: {
        type: "toolbox",
        name: "test-toolbox",
        description: "A test toolbox",
      } as ToolboxMetadata,
    };

    const toolboxes = getToolboxes([pluginPkg, toolboxPkg]);
    expect(toolboxes).toHaveLength(1);
    expect(toolboxes[0].name).toBe("test-toolbox");
  });
});

// -- validatePackageModels passes plugin packages through --

describe("validatePackageModels with plugin packages", () => {
  test("passes plugin packages through unchanged", () => {
    const config: AppConfig = { projects: [] };
    const pluginPkg: DiscoveredPackage = {
      name: "guild-compendium",
      path: "/tmp/guild-compendium",
      metadata: { ...validPluginGuildHall() } as PluginMetadata,
    };

    const result = validatePackageModels([pluginPkg], config);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("guild-compendium");
  });
});

// -- Integration: prepareSdkSession resolves plugin-type package --

describe("prepareSdkSession resolves plugin-type package", () => {
  const mockWorkerMeta: WorkerMetadata = {
    type: "worker",
    identity: { name: "test-worker", description: "Test", displayTitle: "Test Worker" },
    posture: "You test things.",
    domainToolboxes: [],
    domainPlugins: ["guild-compendium"],
    builtInTools: ["Read"],
    checkoutScope: "sparse" as const,
  };

  const mockWorkerPkg: DiscoveredPackage = {
    name: "test-worker-pkg",
    path: "/tmp/packages/test-worker",
    metadata: mockWorkerMeta,
  };

  const mockPluginPkg: DiscoveredPackage = {
    name: "guild-compendium",
    path: "/tmp/packages/guild-compendium",
    metadata: {
      type: "plugin",
      name: "guild-compendium",
      description: "Curated craft knowledge.",
    } as PluginMetadata,
    pluginPath: "/tmp/packages/guild-compendium/plugin",
  };

  const mockActivation: ActivationResult = {
    systemPrompt: "You are a test worker.",
    sessionContext: "",
    model: "sonnet",
    tools: {
      mcpServers: [],
      allowedTools: ["Read"],
      builtInTools: ["Read"],
    },
  };

  function makeSpec(overrides?: Record<string, unknown>) {
    return {
      workerName: "test-worker",
      projectName: "test-project",
      projectPath: "/tmp/project",
      workspaceDir: "/tmp/workspace",
      guildHallHome: "/tmp/gh-home",
      packages: [mockWorkerPkg, mockPluginPkg],
      config: { projects: [] } as AppConfig,
      contextId: "ctx-1",
      contextType: "commission" as const,
      eventBus: noopEventBus,
      abortController: new AbortController(),
      ...overrides,
    };
  }

  function makeDeps() {
    return {
      findWorker: (packages: DiscoveredPackage[], name: string) =>
        packages.find(
          (p) =>
            "identity" in p.metadata &&
            (p.name === name || p.metadata.identity.name === name),
        ),
      resolveToolSet: () =>
        Promise.resolve({
          mcpServers: [],
          allowedTools: ["Read"],
          builtInTools: ["Read"],
        } as ResolvedToolSet),
      loadMemories: () => Promise.resolve({ memoryBlock: "", budgetInfo: { used: 0, limit: 16000, percentage: 0 } }),
      activateWorker: () => Promise.resolve(mockActivation),
      checkReachability: () => Promise.resolve({ reachable: true }),
      log: { info: () => {}, warn: () => {}, error: () => {} },
    };
  }

  test("plugin-type package with pluginPath produces options.plugins", async () => {
    const result = await prepareSdkSession(makeSpec(), makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.options.plugins).toEqual([
      { type: "local", path: "/tmp/packages/guild-compendium/plugin" },
    ]);
  });
});
