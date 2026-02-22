import { describe, test, expect } from "bun:test";
import { CommissionWorkerConfigSchema } from "@/daemon/services/commission-worker-config";

const validConfig = {
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

describe("CommissionWorkerConfigSchema", () => {
  test("valid config parses correctly", () => {
    const result = CommissionWorkerConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.commissionId).toBe("commission-researcher-20260221-143000");
      expect(result.data.projectName).toBe("guild-hall");
      expect(result.data.projectPath).toBe("/home/user/projects/guild-hall");
      expect(result.data.workerPackageName).toBe("guild-hall-sample-assistant");
      expect(result.data.prompt).toBe("Research OAuth 2.0 patterns for CLI tools");
      expect(result.data.dependencies).toEqual([]);
      expect(result.data.workingDirectory).toBe("/tmp/guild-hall-abc123");
      expect(result.data.daemonSocketPath).toBe("/home/user/.guild-hall/guild-hall.sock");
      expect(result.data.packagesDir).toBe("/home/user/.guild-hall/packages");
      expect(result.data.guildHallHome).toBe("/home/user/.guild-hall");
    }
  });

  test("valid config with dependencies parses correctly", () => {
    const config = {
      ...validConfig,
      dependencies: ["commission-analyst-20260221-120000", "commission-writer-20260221-100000"],
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependencies).toEqual([
        "commission-analyst-20260221-120000",
        "commission-writer-20260221-100000",
      ]);
    }
  });

  test("optional resourceOverrides accepted", () => {
    const config = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 50,
        maxBudgetUsd: 2.5,
      },
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceOverrides?.maxTurns).toBe(50);
      expect(result.data.resourceOverrides?.maxBudgetUsd).toBe(2.5);
    }
  });

  test("partial resourceOverrides accepted (maxTurns only)", () => {
    const config = {
      ...validConfig,
      resourceOverrides: {
        maxTurns: 100,
      },
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceOverrides?.maxTurns).toBe(100);
      expect(result.data.resourceOverrides?.maxBudgetUsd).toBeUndefined();
    }
  });

  test("partial resourceOverrides accepted (maxBudgetUsd only)", () => {
    const config = {
      ...validConfig,
      resourceOverrides: {
        maxBudgetUsd: 5.0,
      },
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceOverrides?.maxBudgetUsd).toBe(5.0);
      expect(result.data.resourceOverrides?.maxTurns).toBeUndefined();
    }
  });

  test("config without resourceOverrides accepted", () => {
    const result = CommissionWorkerConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceOverrides).toBeUndefined();
    }
  });

  // Helper: create a copy of validConfig with one field removed.
  function without(key: string) {
    const copy = { ...validConfig } as Record<string, unknown>;
    delete copy[key];
    return copy;
  }

  test("missing required field commissionId rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("commissionId"));
    expect(result.success).toBe(false);
  });

  test("missing required field projectName rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("projectName"));
    expect(result.success).toBe(false);
  });

  test("missing required field projectPath rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("projectPath"));
    expect(result.success).toBe(false);
  });

  test("missing required field workerPackageName rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("workerPackageName"));
    expect(result.success).toBe(false);
  });

  test("missing required field prompt rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("prompt"));
    expect(result.success).toBe(false);
  });

  test("missing required field dependencies rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("dependencies"));
    expect(result.success).toBe(false);
  });

  test("missing required field workingDirectory rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("workingDirectory"));
    expect(result.success).toBe(false);
  });

  test("missing required field daemonSocketPath rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("daemonSocketPath"));
    expect(result.success).toBe(false);
  });

  test("missing required field packagesDir rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("packagesDir"));
    expect(result.success).toBe(false);
  });

  test("missing required field guildHallHome rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(without("guildHallHome"));
    expect(result.success).toBe(false);
  });

  test("invalid type for commissionId rejected", () => {
    const config = { ...validConfig, commissionId: 123 };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("invalid type for dependencies rejected", () => {
    const config = { ...validConfig, dependencies: "not-an-array" };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("invalid type for resourceOverrides.maxTurns rejected", () => {
    const config = {
      ...validConfig,
      resourceOverrides: { maxTurns: "fifty" },
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("invalid type for resourceOverrides.maxBudgetUsd rejected", () => {
    const config = {
      ...validConfig,
      resourceOverrides: { maxBudgetUsd: "five" },
    };
    const result = CommissionWorkerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("empty object rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("null rejected", () => {
    const result = CommissionWorkerConfigSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
