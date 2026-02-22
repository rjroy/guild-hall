import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  buildActivationContext,
  buildQueryOptions,
} from "@/daemon/commission-worker";
import type { CommissionWorkerConfig } from "@/daemon/services/commission-worker-config";
import type {
  ActivationResult,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-worker-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const validConfig: CommissionWorkerConfig = {
  commissionId: "commission-researcher-20260221-143000",
  projectName: "guild-hall",
  projectPath: "/home/user/projects/guild-hall",
  workerPackageName: "guild-hall-sample-assistant",
  prompt: "Research OAuth 2.0 patterns for CLI tools",
  dependencies: [],
  workingDirectory: "/tmp/guild-hall-abc123",
  daemonSocketPath: "/home/user/.guild-hall/guild-hall.sock",
  packagesDir: "/home/user/.guild-hall/packages",
  guildHallHome: "/home/user/.guild-hall",
};

const testWorkerMeta: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "researcher",
    description: "A research specialist",
    displayTitle: "Research Specialist",
  },
  posture: "You are a careful research specialist.",
  domainToolboxes: [],
  builtInTools: [],
  checkoutScope: "sparse",
  resourceDefaults: {
    maxTurns: 100,
    maxBudgetUsd: 1.0,
  },
};

const testResolvedTools: ResolvedToolSet = {
  mcpServers: [],
  allowedTools: ["Read", "Write"],
};

// -- loadConfig --

describe("loadConfig", () => {
  test("reads and validates a config file from --config flag", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(validConfig), "utf-8");

    const result = await loadConfig(["--config", configPath]);

    expect(result.commissionId).toBe("commission-researcher-20260221-143000");
    expect(result.projectName).toBe("guild-hall");
    expect(result.prompt).toBe("Research OAuth 2.0 patterns for CLI tools");
    expect(result.dependencies).toEqual([]);
  });

  test("throws when --config flag is missing", async () => {
    await expect(loadConfig([])).rejects.toThrow("Missing required --config flag");
  });

  test("throws when config file does not exist", async () => {
    const bogusPath = path.join(tmpDir, "nonexistent.json");
    await expect(loadConfig(["--config", bogusPath])).rejects.toThrow();
  });

  test("throws when config file contains invalid JSON", async () => {
    const configPath = path.join(tmpDir, "bad.json");
    await fs.writeFile(configPath, "not json", "utf-8");
    await expect(loadConfig(["--config", configPath])).rejects.toThrow();
  });

  test("throws when config file is missing required fields", async () => {
    const configPath = path.join(tmpDir, "incomplete.json");
    await fs.writeFile(configPath, JSON.stringify({ commissionId: "x" }), "utf-8");
    await expect(loadConfig(["--config", configPath])).rejects.toThrow();
  });

  test("parses config with resourceOverrides", async () => {
    const config = {
      ...validConfig,
      resourceOverrides: { maxTurns: 50, maxBudgetUsd: 2.5 },
    };
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config), "utf-8");

    const result = await loadConfig(["--config", configPath]);

    expect(result.resourceOverrides?.maxTurns).toBe(50);
    expect(result.resourceOverrides?.maxBudgetUsd).toBe(2.5);
  });
});

// -- buildActivationContext --

describe("buildActivationContext", () => {
  test("builds context with commission fields", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.posture).toBe("You are a careful research specialist.");
    expect(context.injectedMemory).toBe("");
    expect(context.resolvedTools).toBe(testResolvedTools);
    expect(context.projectPath).toBe("/home/user/projects/guild-hall");
    expect(context.workingDirectory).toBe("/tmp/guild-hall-abc123");
  });

  test("includes commissionContext with prompt and dependencies", () => {
    const config = {
      ...validConfig,
      dependencies: ["dep-1", "dep-2"],
    };

    const context = buildActivationContext(
      config,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.commissionContext).toBeDefined();
    expect(context.commissionContext!.commissionId).toBe(
      "commission-researcher-20260221-143000",
    );
    expect(context.commissionContext!.prompt).toBe(
      "Research OAuth 2.0 patterns for CLI tools",
    );
    expect(context.commissionContext!.dependencies).toEqual(["dep-1", "dep-2"]);
  });

  test("does not include meetingContext", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.meetingContext).toBeUndefined();
  });

  test("passes worker resourceDefaults", () => {
    const context = buildActivationContext(
      validConfig,
      testWorkerMeta,
      testResolvedTools,
    );

    expect(context.resourceDefaults.maxTurns).toBe(100);
    expect(context.resourceDefaults.maxBudgetUsd).toBe(1.0);
  });

  test("handles worker without resourceDefaults", () => {
    const workerNoDefaults: WorkerMetadata = {
      ...testWorkerMeta,
      resourceDefaults: undefined,
    };

    const context = buildActivationContext(
      validConfig,
      workerNoDefaults,
      testResolvedTools,
    );

    expect(context.resourceDefaults.maxTurns).toBeUndefined();
    expect(context.resourceDefaults.maxBudgetUsd).toBeUndefined();
  });
});

// -- buildQueryOptions --

describe("buildQueryOptions", () => {
  const testActivation: ActivationResult = {
    systemPrompt: "You are a research specialist.",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Write"],
    },
    resourceBounds: {
      maxTurns: 100,
      maxBudgetUsd: 1.0,
    },
  };

  test("builds options with activation values as defaults", () => {
    const options = buildQueryOptions(validConfig, testActivation);

    expect(options.systemPrompt).toBe("You are a research specialist.");
    expect(options.allowedTools).toEqual(["Read", "Write"]);
    expect(options.maxTurns).toBe(100);
    expect(options.maxBudgetUsd).toBe(1.0);
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.settingSources).toEqual([]);
    expect(options.cwd).toBe("/tmp/guild-hall-abc123");
    expect(options.includePartialMessages).toBe(false);
  });

  test("commission resourceOverrides take priority over worker defaults", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 50,
        maxBudgetUsd: 5.0,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    expect(options.maxTurns).toBe(50);
    expect(options.maxBudgetUsd).toBe(5.0);
  });

  test("falls back to 150 maxTurns when neither override nor worker default", () => {
    const activationNoDefaults: ActivationResult = {
      ...testActivation,
      resourceBounds: {},
    };

    const options = buildQueryOptions(validConfig, activationNoDefaults);

    expect(options.maxTurns).toBe(150);
  });

  test("omits maxBudgetUsd when neither override nor worker default", () => {
    const activationNoDefaults: ActivationResult = {
      ...testActivation,
      resourceBounds: {},
    };

    const options = buildQueryOptions(validConfig, activationNoDefaults);

    expect(options).not.toHaveProperty("maxBudgetUsd");
  });

  test("partial resourceOverrides: only maxTurns overridden", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 25,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    expect(options.maxTurns).toBe(25);
    // maxBudgetUsd should fall through to worker default
    expect(options.maxBudgetUsd).toBe(1.0);
  });

  test("partial resourceOverrides: only maxBudgetUsd overridden", () => {
    const config: CommissionWorkerConfig = {
      ...validConfig,
      resourceOverrides: {
        maxBudgetUsd: 10.0,
      },
    };

    const options = buildQueryOptions(config, testActivation);

    // maxTurns should fall through to worker default
    expect(options.maxTurns).toBe(100);
    expect(options.maxBudgetUsd).toBe(10.0);
  });

  test("builds mcpServers record from activation tools", () => {
    const activationWithServers: ActivationResult = {
      ...testActivation,
      tools: {
        mcpServers: [
          { name: "guild-hall-base", type: "sdk" as const, instance: {} as never },
          { name: "guild-hall-commission", type: "sdk" as const, instance: {} as never },
        ],
        allowedTools: [],
      },
    };

    const options = buildQueryOptions(validConfig, activationWithServers);

    expect(options.mcpServers).toHaveProperty("guild-hall-base");
    expect(options.mcpServers).toHaveProperty("guild-hall-commission");
  });
});
