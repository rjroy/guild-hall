import { describe, test, expect } from "bun:test";
import {
  createManagerPackage,
  buildModelGuidance,
  activateManager,
  MANAGER_PACKAGE_NAME,
} from "@/daemon/services/manager/worker";
import { MANAGER_WORKER_NAME } from "@/lib/packages";
import type { AppConfig, ActivationContext, WorkerMetadata } from "@/lib/types";

describe("createManagerPackage", () => {
  test("returns opus as default model when called with no arguments", () => {
    const pkg = createManagerPackage();
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("opus");
  });

  test("returns opus when config has empty systemModels", () => {
    const config: AppConfig = { projects: [], systemModels: {} };
    const pkg = createManagerPackage(config);
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("opus");
  });

  test("uses configured guildMaster model", () => {
    const config: AppConfig = {
      projects: [],
      systemModels: { guildMaster: "sonnet" },
    };
    const pkg = createManagerPackage(config);
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("sonnet");
  });

  test("uses haiku when configured", () => {
    const config: AppConfig = {
      projects: [],
      systemModels: { guildMaster: "haiku" },
    };
    const pkg = createManagerPackage(config);
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("haiku");
  });

  test("stores local model name as-is for runtime resolution", () => {
    const config: AppConfig = {
      projects: [],
      systemModels: { guildMaster: "my-local" },
    };
    const pkg = createManagerPackage(config);
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("my-local");
  });

  test("ignores other systemModels fields, uses opus fallback", () => {
    const config: AppConfig = {
      projects: [],
      systemModels: { memoryCompaction: "haiku", meetingNotes: "haiku" },
    };
    const pkg = createManagerPackage(config);
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.model).toBe("opus");
  });

  test("returns correct package name and empty path", () => {
    const pkg = createManagerPackage();
    expect(pkg.name).toBe(MANAGER_PACKAGE_NAME);
    expect(pkg.path).toBe("");
  });

  test("returns correct worker identity", () => {
    const pkg = createManagerPackage();
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.identity.name).toBe(MANAGER_WORKER_NAME);
    expect(metadata.identity.displayTitle).toBe(MANAGER_WORKER_NAME);
  });

  test("includes manager in systemToolboxes", () => {
    const pkg = createManagerPackage();
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.systemToolboxes).toEqual(["manager"]);
  });
});

describe("buildModelGuidance", () => {
  test("includes built-in model guidance by default", () => {
    const guidance = buildModelGuidance();
    expect(guidance).toContain("Haiku");
    expect(guidance).toContain("Sonnet");
    expect(guidance).toContain("Opus");
  });

  test("includes local model guidance when provided", () => {
    const localModels = [
      {
        name: "llama3",
        modelId: "llama3",
        baseUrl: "http://localhost:11434",
        guidance: "Good for drafting and exploration.",
      },
    ];
    const guidance = buildModelGuidance(localModels);
    expect(guidance).toContain("llama3");
    expect(guidance).toContain("Good for drafting and exploration.");
  });

  test("omits local models without guidance field", () => {
    const localModels = [
      {
        name: "mistral",
        modelId: "mistral",
        baseUrl: "http://localhost:11434",
      },
    ];
    const guidance = buildModelGuidance(localModels);
    expect(guidance).not.toContain("mistral");
  });

  test("handles empty local models array", () => {
    const guidance = buildModelGuidance([]);
    expect(guidance).toContain("Haiku");
    expect(guidance).not.toContain("undefined");
  });
});

describe("activateManager", () => {
  function makeContext(overrides: Partial<ActivationContext> = {}): ActivationContext {
    return {
      identity: {
        name: MANAGER_WORKER_NAME,
        description: "The Guild Master",
        displayTitle: MANAGER_WORKER_NAME,
      },
      posture: "Manager posture text",
      injectedMemory: "",
      resolvedTools: { mcpServers: [], allowedTools: [] },
      resourceDefaults: { maxTurns: 200 },
      projectPath: "/tmp/project",
      workingDirectory: "/tmp/work",
      ...overrides,
    };
  }

  test("assembles system prompt with soul when present", () => {
    const result = activateManager(makeContext({ soul: "The Guild Master soul" }));
    expect(result.systemPrompt).toContain("# Soul");
    expect(result.systemPrompt).toContain("The Guild Master soul");
  });

  test("assembles system prompt with identity", () => {
    const result = activateManager(makeContext());
    expect(result.systemPrompt).toContain("# Identity");
    expect(result.systemPrompt).toContain(MANAGER_WORKER_NAME);
  });

  test("includes posture and model guidance", () => {
    const result = activateManager(makeContext());
    expect(result.systemPrompt).toContain("# Posture");
    expect(result.systemPrompt).toContain("Manager posture text");
    expect(result.systemPrompt).toContain("Model Selection");
  });

  test("includes injected memory when present", () => {
    const result = activateManager(makeContext({ injectedMemory: "Remember this" }));
    expect(result.systemPrompt).toContain("# Injected Memory");
    expect(result.systemPrompt).toContain("Remember this");
  });

  test("includes manager context when present", () => {
    const result = activateManager(makeContext({ managerContext: "Active commissions: 3" }));
    expect(result.systemPrompt).toContain("# Manager Context");
    expect(result.systemPrompt).toContain("Active commissions: 3");
  });

  test("returns opus as default model when context.model is absent", () => {
    const result = activateManager(makeContext());
    expect(result.model).toBe("opus");
  });

  test("uses context.model when provided", () => {
    const result = activateManager(makeContext({ model: "sonnet" }));
    expect(result.model).toBe("sonnet");
  });

  test("returns resourceBounds from context", () => {
    const result = activateManager(makeContext({ resourceDefaults: { maxTurns: 50, maxBudgetUsd: 1.0 } }));
    expect(result.resourceBounds.maxTurns).toBe(50);
    expect(result.resourceBounds.maxBudgetUsd).toBe(1.0);
  });

  test("returns resolved tools from context", () => {
    const tools = { mcpServers: [], allowedTools: ["Read", "Glob"] };
    const result = activateManager(makeContext({ resolvedTools: tools }));
    expect(result.tools.allowedTools).toEqual(["Read", "Glob"]);
  });
});
