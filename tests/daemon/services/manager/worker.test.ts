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

  test("includes manager and git-readonly in systemToolboxes", () => {
    const pkg = createManagerPackage();
    const metadata = pkg.metadata as WorkerMetadata;
    expect(metadata.systemToolboxes).toEqual(["manager", "git-readonly"]);
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
      resolvedTools: { mcpServers: [], allowedTools: [], builtInTools: [] },
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

  test("includes memory guidance in systemPrompt when present (REQ-SPO-9)", () => {
    const result = activateManager(makeContext({ memoryGuidance: "MEMORY_GUIDANCE_TEXT" }));
    expect(result.systemPrompt).toContain("# Memory");
    expect(result.systemPrompt).toContain("MEMORY_GUIDANCE_TEXT");
  });

  test("includes injected memory in sessionContext, not systemPrompt (REQ-SPO-14)", () => {
    const result = activateManager(makeContext({ injectedMemory: "Remember this" }));
    expect(result.sessionContext).toContain("# Injected Memory");
    expect(result.sessionContext).toContain("Remember this");
    // Memory content should NOT be in systemPrompt
    expect(result.systemPrompt).not.toContain("Remember this");
  });

  test("includes manager context in sessionContext, not systemPrompt (REQ-SPO-14)", () => {
    const result = activateManager(makeContext({ managerContext: "Active commissions: 3" }));
    expect(result.sessionContext).toContain("# Manager Context");
    expect(result.sessionContext).toContain("Active commissions: 3");
    expect(result.systemPrompt).not.toContain("Active commissions: 3");
  });

  test("meeting and commission context excluded from systemPrompt (INFO-2)", () => {
    const result = activateManager(makeContext({
      meetingContext: { meetingId: "m1", agenda: "Test agenda", referencedArtifacts: [] },
      commissionContext: { commissionId: "c1", prompt: "Test task", dependencies: [] },
    }));
    expect(result.systemPrompt).not.toContain("Test agenda");
    expect(result.systemPrompt).not.toContain("Test task");
    expect(result.sessionContext).toContain("Test agenda");
    expect(result.sessionContext).toContain("Test task");
  });

  test("sessionContext parts ordered: memory < meeting < commission < manager (INFO-1)", () => {
    const result = activateManager(makeContext({
      injectedMemory: "MEMORY_BLOCK",
      meetingContext: { meetingId: "m1", agenda: "MEETING_AGENDA", referencedArtifacts: [] },
      commissionContext: { commissionId: "c1", prompt: "COMMISSION_TASK", dependencies: [] },
      managerContext: "MANAGER_BLOCK",
    }));
    const memIdx = result.sessionContext.indexOf("MEMORY_BLOCK");
    const meetIdx = result.sessionContext.indexOf("MEETING_AGENDA");
    const commIdx = result.sessionContext.indexOf("COMMISSION_TASK");
    const mgrIdx = result.sessionContext.indexOf("MANAGER_BLOCK");

    expect(memIdx).toBeGreaterThanOrEqual(0);
    expect(meetIdx).toBeGreaterThan(memIdx);
    expect(commIdx).toBeGreaterThan(meetIdx);
    expect(mgrIdx).toBeGreaterThan(commIdx);
  });

  test("sessionContext is empty when no memory, meeting, commission, or manager context", () => {
    const result = activateManager(makeContext());
    expect(result.sessionContext).toBe("");
  });

  test("returns opus as default model when context.model is absent", () => {
    const result = activateManager(makeContext());
    expect(result.model).toBe("opus");
  });

  test("uses context.model when provided", () => {
    const result = activateManager(makeContext({ model: "sonnet" }));
    expect(result.model).toBe("sonnet");
  });

  test("returns resolved tools from context", () => {
    const tools = { mcpServers: [], allowedTools: ["Read", "Glob"], builtInTools: [] as string[] };
    const result = activateManager(makeContext({ resolvedTools: tools }));
    expect(result.tools.allowedTools).toEqual(["Read", "Glob"]);
  });
});
