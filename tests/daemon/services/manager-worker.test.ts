import { describe, test, expect } from "bun:test";
import {
  MANAGER_WORKER_NAME,
  MANAGER_PACKAGE_NAME,
  createManagerPackage,
  activateManager,
} from "@/daemon/services/manager/worker";
import { workerMetadataSchema } from "@/lib/packages";
import type {
  ActivationContext,
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
    // System prompt should just be the posture
    expect(result.systemPrompt).toBe(context.posture);
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
      posture: "POSTURE",
      injectedMemory: "MEMORY",
      managerContext: "CONTEXT",
    });
    const result = activateManager(context);
    expect(result.systemPrompt).toBe("POSTURE\n\nMEMORY\n\nCONTEXT");
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

  test("contains coordination role statement", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture).toContain("coordination specialist");
  });

  test("contains working style directive", () => {
    const pkg = createManagerPackage();
    const meta = pkg.metadata as WorkerMetadata;
    expect(meta.posture).toContain("Be direct");
    expect(meta.posture).toContain("execute when authorized");
  });
});
