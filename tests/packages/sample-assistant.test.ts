import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import { discoverPackages, packageMetadataSchema } from "@/lib/packages";
import type {
  ActivationContext,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import { activate } from "@/packages/sample-assistant/index";

const PACKAGES_DIR = path.resolve(__dirname, "../../packages");

// -- Test data factories --

function makeResolvedTools(): ResolvedToolSet {
  return {
    mcpServers: [],
    allowedTools: ["Read", "Glob", "Grep"],
  };
}

function makeActivationContext(
  overrides: Partial<ActivationContext> = {}
): ActivationContext {
  return {
    posture: "You are a helpful assistant.",
    injectedMemory: "",
    resolvedTools: makeResolvedTools(),
    resourceDefaults: { maxTurns: 30 },
    projectPath: "/projects/test-project",
    workingDirectory: "/projects/test-project",
    ...overrides,
  };
}

// -- Discovery --

describe("sample-assistant discovery", () => {
  test("is discoverable by discoverPackages", async () => {
    const packages = await discoverPackages([PACKAGES_DIR]);
    const assistant = packages.find(
      (p) => p.name === "guild-hall-sample-assistant"
    );

    expect(assistant).toBeDefined();
    expect(assistant!.path).toBe(path.join(PACKAGES_DIR, "sample-assistant"));
  });

  test("has worker metadata with correct identity", async () => {
    const packages = await discoverPackages([PACKAGES_DIR]);
    const assistant = packages.find(
      (p) => p.name === "guild-hall-sample-assistant"
    );

    expect(assistant).toBeDefined();
    const meta = assistant!.metadata as WorkerMetadata;
    expect(meta.type).toBe("worker");
    expect(meta.identity.name).toBe("Assistant");
    expect(meta.identity.displayTitle).toBe("Guild Assistant");
    expect(meta.builtInTools).toEqual(["Read", "Glob", "Grep", "Write", "Edit"]);
    expect(meta.checkoutScope).toBe("sparse");
    expect(meta.resourceDefaults).toEqual({ maxTurns: 30 });
  });

  test("package validates against Zod schema", async () => {
    // Read the package.json directly and validate its guildHall key
    const pkgJsonPath = path.join(
      PACKAGES_DIR,
      "sample-assistant",
      "package.json"
    );
    const pkgJson = await Bun.file(pkgJsonPath).json();
    const result = packageMetadataSchema.safeParse(pkgJson.guildHall);

    expect(result.success).toBe(true);
  });
});

// -- Activation --

describe("sample-assistant activate()", () => {
  test("returns valid ActivationResult", () => {
    const context = makeActivationContext();
    const result = activate(context);

    expect(result).toHaveProperty("systemPrompt");
    expect(result).toHaveProperty("tools");
    expect(result).toHaveProperty("resourceBounds");
    expect(typeof result.systemPrompt).toBe("string");
    expect(result.tools.allowedTools).toBeArray();
    expect(result.tools.mcpServers).toBeArray();
  });

  test("system prompt includes posture", () => {
    const context = makeActivationContext({
      posture: "You are a careful researcher.",
    });
    const result = activate(context);

    expect(result.systemPrompt).toContain("You are a careful researcher.");
  });

  test("system prompt includes injected memory when present", () => {
    const context = makeActivationContext({
      injectedMemory: "The user prefers concise answers.",
    });
    const result = activate(context);

    expect(result.systemPrompt).toContain(
      "The user prefers concise answers."
    );
  });

  test("system prompt omits injected memory when empty", () => {
    const context = makeActivationContext({ injectedMemory: "" });
    const result = activate(context);

    // Should only contain the posture, no double newlines from empty memory
    expect(result.systemPrompt).toBe("You are a helpful assistant.");
  });

  test("system prompt includes meeting agenda when meeting context present", () => {
    const context = makeActivationContext({
      meetingContext: {
        meetingId: "mtg-123",
        agenda: "Review the authentication module design.",
        referencedArtifacts: ["specs/auth.md"],
      },
    });
    const result = activate(context);

    expect(result.systemPrompt).toContain(
      "Meeting agenda: Review the authentication module design."
    );
  });

  test("system prompt omits meeting agenda when no meeting context", () => {
    const context = makeActivationContext();
    // No meetingContext set
    const result = activate(context);

    expect(result.systemPrompt).not.toContain("Meeting agenda:");
  });

  test("system prompt concatenates posture, memory, and agenda in order", () => {
    const context = makeActivationContext({
      posture: "You are a researcher.",
      injectedMemory: "Remember: check sources.",
      meetingContext: {
        meetingId: "mtg-456",
        agenda: "Investigate the API layer.",
        referencedArtifacts: [],
      },
    });
    const result = activate(context);

    const parts = result.systemPrompt.split("\n\n");
    expect(parts[0]).toBe("You are a researcher.");
    expect(parts[1]).toBe("Remember: check sources.");
    expect(parts[2]).toBe("Meeting agenda: Investigate the API layer.");
  });

  test("passes through resolved tools from context", () => {
    const tools: ResolvedToolSet = {
      mcpServers: [
        { type: "sdk", name: "test-server", instance: {} as never },
      ],
      allowedTools: ["Read", "Write", "Bash"],
    };
    const context = makeActivationContext({ resolvedTools: tools });
    const result = activate(context);

    expect(result.tools.allowedTools).toEqual(tools.allowedTools);
    expect(result.tools.mcpServers).toHaveLength(1);
    expect(result.tools.mcpServers[0].name).toBe("test-server");
  });

  test("passes through resource bounds from context", () => {
    const context = makeActivationContext({
      resourceDefaults: { maxTurns: 50, maxBudgetUsd: 2.0 },
    });
    const result = activate(context);

    expect(result.resourceBounds).toEqual({
      maxTurns: 50,
      maxBudgetUsd: 2.0,
    });
  });

  test("handles undefined resource bound fields", () => {
    const context = makeActivationContext({
      resourceDefaults: {},
    });
    const result = activate(context);

    expect(result.resourceBounds.maxTurns).toBeUndefined();
    expect(result.resourceBounds.maxBudgetUsd).toBeUndefined();
  });
});
