import { describe, test, expect } from "bun:test";
import {
  MANAGER_WORKER_NAME,
  MANAGER_PACKAGE_NAME,
  createManagerPackage,
  activateManager,
  buildModelGuidance,
} from "@/daemon/services/manager/worker";
import { workerMetadataSchema } from "@/lib/packages";
import type {
  ActivationContext,
  ModelDefinition,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";

/**
 * Builds a minimal ActivationContext for testing. Override fields as needed.
 */
function makeContext(
  overrides: Partial<ActivationContext> = {},
): ActivationContext {
  const defaultTools: ResolvedToolSet = {
    mcpServers: [],
    allowedTools: ["Read", "Glob", "Grep"],
  };

  return {
    identity: { name: "Guild Master", description: "Test manager", displayTitle: "Guild Master" },
    posture: "Test posture text.",
    injectedMemory: "",
    resolvedTools: defaultTools,
    resourceDefaults: { maxTurns: 200 },
    projectPath: "/tmp/test-project",
    workingDirectory: "/tmp/test-project",
    ...overrides,
  };
}

describe("createManagerPackage", () => {
  test("returns a DiscoveredPackage with correct name", () => {
    const pkg = createManagerPackage();
    expect(pkg.name).toBe(MANAGER_PACKAGE_NAME);
    expect(pkg.name).toBe("guild-hall-manager");
  });

  test("has empty string path (built-in indicator)", () => {
    const pkg = createManagerPackage();
    expect(pkg.path).toBe("");
  });

  test("metadata passes Zod workerMetadataSchema validation", () => {
    const pkg = createManagerPackage();
    const result = workerMetadataSchema.safeParse(pkg.metadata);
    expect(result.success).toBe(true);
  });

  test("metadata type is worker", () => {
    const pkg = createManagerPackage();
    expect(pkg.metadata.type).toBe("worker");
  });

  test("identity has correct name and displayTitle", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.identity.name).toBe("Guild Master");
    expect(meta.identity.displayTitle).toBe("Guild Master");
    expect(meta.identity.description.length).toBeGreaterThan(0);
  });

  test("has checkoutScope full", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.checkoutScope).toBe("full");
  });

  test("resourceDefaults has maxTurns 200", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.resourceDefaults?.maxTurns).toBe(200);
  });

  test("builtInTools are read-only (Read, Glob, Grep)", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.builtInTools).toEqual(["Read", "Glob", "Grep"]);
  });

  test("domainToolboxes is empty", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.domainToolboxes).toEqual([]);
  });

  test("posture is a non-empty string", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture.length).toBeGreaterThan(0);
  });

  test("manager metadata has soul field", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.soul).toBeDefined();
    expect(typeof meta.soul).toBe("string");
    expect(meta.soul!.length).toBeGreaterThan(0);
  });

  test("metadata has model set to opus", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("opus");
  });

  test("defaults to opus when called with no argument", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("opus");
  });

  test("uses configured guildMaster model from config", () => {
    const pkg = createManagerPackage({ projects: [], systemModels: { guildMaster: "sonnet" } });
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("sonnet");
  });

  test("uses haiku when configured", () => {
    const pkg = createManagerPackage({ projects: [], systemModels: { guildMaster: "haiku" } });
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("haiku");
  });

  test("stores local model name as-is for runtime resolution", () => {
    const pkg = createManagerPackage({ projects: [], systemModels: { guildMaster: "my-local" } });
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("my-local");
  });

  test("falls back to opus when systemModels is present but guildMaster is absent", () => {
    const pkg = createManagerPackage({ projects: [], systemModels: {} });
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.model).toBe("opus");
  });
});

describe("MANAGER constants", () => {
  test("MANAGER_WORKER_NAME is Guild Master", () => {
    expect(MANAGER_WORKER_NAME).toBe("Guild Master");
  });

  test("MANAGER_PACKAGE_NAME is guild-hall-manager", () => {
    expect(MANAGER_PACKAGE_NAME).toBe("guild-hall-manager");
  });
});

describe("activateManager", () => {
  test("includes posture text in system prompt", () => {
    const context = makeContext({
      posture: "You are the Guild Master, the coordination specialist.",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain(
      "You are the Guild Master, the coordination specialist.",
    );
  });

  test("includes injected memory in system prompt when present", () => {
    const context = makeContext({
      injectedMemory: "Project memory: the team uses TypeScript and bun.",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain(
      "Project memory: the team uses TypeScript and bun.",
    );
  });

  test("includes manager context in system prompt when present", () => {
    const context = makeContext({
      managerContext:
        "Active commissions: 3 in_progress, 1 pending. No blocked items.",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain(
      "Active commissions: 3 in_progress, 1 pending.",
    );
  });

  test("works when managerContext is undefined (graceful degradation)", () => {
    const context = makeContext({
      managerContext: undefined,
      injectedMemory: "Some memory.",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain("Some memory.");
    // Should not contain "undefined" as literal text
    expect(result.systemPrompt).not.toContain("undefined");
  });

  test("works when both managerContext and injectedMemory are empty/undefined", () => {
    const context = makeContext({
      managerContext: undefined,
      injectedMemory: "",
    });
    const result = activateManager(context);
    // System prompt now includes identity lines between soul and posture
    expect(result.systemPrompt).toContain("Your name is:");
    expect(result.systemPrompt).toContain(context.posture);
  });

  test("passes through resolvedTools unchanged", () => {
    const tools: ResolvedToolSet = {
      mcpServers: [],
      allowedTools: ["Read", "Glob", "Grep", "CustomTool"],
    };
    const context = makeContext({ resolvedTools: tools });
    const result = activateManager(context);
    expect(result.tools).toBe(tools);
  });

  test("passes through resourceBounds from context", () => {
    const context = makeContext({
      resourceDefaults: { maxTurns: 150, maxBudgetUsd: 5.0 },
    });
    const result = activateManager(context);
    expect(result.resourceBounds.maxTurns).toBe(150);
    expect(result.resourceBounds.maxBudgetUsd).toBe(5.0);
  });

  test("resourceBounds handles undefined maxBudgetUsd", () => {
    const context = makeContext({
      resourceDefaults: { maxTurns: 200 },
    });
    const result = activateManager(context);
    expect(result.resourceBounds.maxTurns).toBe(200);
    expect(result.resourceBounds.maxBudgetUsd).toBeUndefined();
  });

  test("system prompt sections are separated by double newlines", () => {
    const context = makeContext({
      soul: "THE_SOUL",
      posture: "THE_POSTURE",
      injectedMemory: "THE_MEMORY",
      managerContext: "THE_CONTEXT",
    });
    const result = activateManager(context);
    // Soul, identity, posture, memory, context all separated by \n\n
    expect(result.systemPrompt).toContain("THE_SOUL\n\n");
    expect(result.systemPrompt).toContain("THE_POSTURE\n\n");
    expect(result.systemPrompt).toContain("THE_MEMORY\n\n");
    expect(result.systemPrompt).toContain("THE_CONTEXT");
  });

  test("activateManager includes soul in system prompt", () => {
    const context = makeContext({
      soul: "MANAGER_SOUL_CONTENT",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain("MANAGER_SOUL_CONTENT");
  });

  test("activateManager includes identity metadata", () => {
    const context = makeContext({
      identity: { name: "Guild Master", displayTitle: "Guild Master", description: "Runs the hall." },
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain("Your name is: Guild Master");
    expect(result.systemPrompt).toContain("Your title is: Guild Master");
    expect(result.systemPrompt).toContain("You are described as: Runs the hall.");
  });

  test("activateManager assembly order: soul, identity, posture, memory, context", () => {
    const context = makeContext({
      soul: "SOUL",
      posture: "POSTURE",
      injectedMemory: "MEMORY",
      managerContext: "CONTEXT",
    });
    const result = activateManager(context);

    const soulIdx = result.systemPrompt.indexOf("SOUL");
    const identityIdx = result.systemPrompt.indexOf("Your name is:");
    const postureIdx = result.systemPrompt.indexOf("POSTURE");
    const memoryIdx = result.systemPrompt.indexOf("MEMORY");
    const contextIdx = result.systemPrompt.indexOf("CONTEXT");

    expect(soulIdx).toBeGreaterThanOrEqual(0);
    expect(identityIdx).toBeGreaterThan(soulIdx);
    expect(postureIdx).toBeGreaterThan(identityIdx);
    expect(memoryIdx).toBeGreaterThan(postureIdx);
    expect(contextIdx).toBeGreaterThan(memoryIdx);
  });

  test("uses context.model when provided", () => {
    const context = makeContext({ model: "haiku" });
    const result = activateManager(context);
    expect(result.model).toBe("haiku");
  });

  test("defaults to opus when context.model is not provided", () => {
    const context = makeContext();
    const result = activateManager(context);
    expect(result.model).toBe("opus");
  });
});

describe("manager posture content", () => {
  test("contains dispatch-with-review instructions", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture).toContain("create and dispatch commissions");
    expect(meta.posture).toContain("review and cancel");
  });

  test("contains deference rules", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture).toContain("Defer to the user");
    expect(meta.posture).toContain("project scope or direction");
    expect(meta.posture).toContain("protected branch");
    expect(meta.posture).toContain("domain knowledge");
  });

  test("contains coordination role statement in soul", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.soul).toContain("coordination specialist");
  });

  test("contains working style directive", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture).toContain("Be direct");
    expect(meta.posture).toContain("execute when authorized");
  });

  test("manager soul contains personality content", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.soul).toContain("## Character");
    expect(meta.soul).toContain("## Voice");
    expect(meta.soul).toContain("## Vibe");
    expect(meta.soul).toContain("Guild Master");
  });

  test("manager posture contains only operational content", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    // Posture should not contain Vibe or soul section headers
    expect(meta.posture).not.toContain("Vibe:");
    expect(meta.posture).not.toContain("## Character");
    expect(meta.posture).not.toContain("## Voice");
    expect(meta.posture).not.toContain("## Vibe");
  });

  test("manager posture base does not contain hardcoded model guidance", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    // Model guidance is now built dynamically in activateManager
    expect(meta.posture).not.toContain("## Model Selection");
    expect(meta.posture).not.toContain("Model guidance:");
  });
});

// -- buildModelGuidance tests (REQ-LOCAL-20) --

describe("buildModelGuidance", () => {
  test("includes built-in model guidance for Haiku, Sonnet, and Opus", () => {
    const guidance = buildModelGuidance();
    expect(guidance).toContain("**Haiku:**");
    expect(guidance).toContain("**Sonnet:**");
    expect(guidance).toContain("**Opus:**");
  });

  test("includes Model Selection header and override instructions", () => {
    const guidance = buildModelGuidance();
    expect(guidance).toContain("## Model Selection");
    expect(guidance).toContain("resourceOverrides");
  });

  test("includes local model guidance when provided", () => {
    const localModels: ModelDefinition[] = [
      {
        name: "llama3",
        modelId: "llama3:latest",
        baseUrl: "http://localhost:11434",
        guidance: "Fast local inference for simple tasks.",
      },
    ];
    const guidance = buildModelGuidance(localModels);
    expect(guidance).toContain("**llama3:**");
    expect(guidance).toContain("Fast local inference for simple tasks.");
  });

  test("skips local models without guidance field", () => {
    const localModels: ModelDefinition[] = [
      {
        name: "llama3",
        modelId: "llama3:latest",
        baseUrl: "http://localhost:11434",
        // no guidance
      },
    ];
    const guidance = buildModelGuidance(localModels);
    expect(guidance).not.toContain("**llama3:**");
  });

  test("combines built-in and local model guidance", () => {
    const localModels: ModelDefinition[] = [
      {
        name: "deepseek",
        modelId: "deepseek-coder:latest",
        baseUrl: "http://localhost:11434",
        guidance: "Strong at code generation. Use for implementation tasks.",
      },
    ];
    const guidance = buildModelGuidance(localModels);
    // Built-in models present
    expect(guidance).toContain("**Haiku:**");
    expect(guidance).toContain("**Sonnet:**");
    expect(guidance).toContain("**Opus:**");
    // Local model present
    expect(guidance).toContain("**deepseek:**");
    expect(guidance).toContain("Strong at code generation.");
  });

  test("handles empty local models array", () => {
    const guidance = buildModelGuidance([]);
    expect(guidance).toContain("**Haiku:**");
    expect(guidance).toContain("**Sonnet:**");
    expect(guidance).toContain("**Opus:**");
  });

  test("handles undefined local models", () => {
    const guidance = buildModelGuidance(undefined);
    expect(guidance).toContain("**Haiku:**");
  });
});

describe("activateManager model guidance integration", () => {
  test("system prompt includes built-in model guidance", () => {
    const context = makeContext({ posture: "Test posture." });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain("## Model Selection");
    expect(result.systemPrompt).toContain("**Haiku:**");
    expect(result.systemPrompt).toContain("**Sonnet:**");
    expect(result.systemPrompt).toContain("**Opus:**");
  });

  test("system prompt includes local model guidance from context", () => {
    const localModels: ModelDefinition[] = [
      {
        name: "llama3",
        modelId: "llama3:latest",
        baseUrl: "http://localhost:11434",
        guidance: "Use for bounded, predictable local tasks.",
      },
    ];
    const context = makeContext({
      posture: "Test posture.",
      localModelDefinitions: localModels,
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toContain("**llama3:**");
    expect(result.systemPrompt).toContain("Use for bounded, predictable local tasks.");
  });

  test("model guidance appears after posture base in system prompt", () => {
    const context = makeContext({ posture: "POSTURE_BASE_TEXT" });
    const result = activateManager(context);
    const postureIdx = result.systemPrompt.indexOf("POSTURE_BASE_TEXT");
    const guidanceIdx = result.systemPrompt.indexOf("## Model Selection");
    expect(postureIdx).toBeGreaterThanOrEqual(0);
    expect(guidanceIdx).toBeGreaterThan(postureIdx);
  });
});
