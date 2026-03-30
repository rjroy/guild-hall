import { describe, test, expect } from "bun:test";
import type { ActivationContext, ResolvedToolSet } from "@/lib/types";
import { activateWorkerWithSharedPattern } from "@/packages/shared/worker-activation";

function makeResolvedTools(): ResolvedToolSet {
  return {
    mcpServers: [],
    allowedTools: ["Read", "Glob", "Grep"],
    builtInTools: [],
  };
}

function makeContext(overrides: Partial<ActivationContext> = {}): ActivationContext {
  return {
    identity: { name: "TestWorker", description: "A test worker", displayTitle: "Test Title" },
    posture: "POSTURE_CONTENT",
    injectedMemory: "",
    resolvedTools: makeResolvedTools(),
    projectPath: "/projects/test",
    workingDirectory: "/projects/test",
    ...overrides,
  };
}

describe("buildSystemPrompt assembly order", () => {
  test("prompt order: soul before identity before posture", () => {
    const context = makeContext({
      soul: "SOUL_CONTENT",
      posture: "POSTURE_CONTENT",
    });
    const result = activateWorkerWithSharedPattern(context);

    const soulIndex = result.systemPrompt.indexOf("SOUL_CONTENT");
    const identityIndex = result.systemPrompt.indexOf("Your name is:");
    const postureIndex = result.systemPrompt.indexOf("POSTURE_CONTENT");

    expect(soulIndex).toBeGreaterThanOrEqual(0);
    expect(identityIndex).toBeGreaterThan(soulIndex);
    expect(postureIndex).toBeGreaterThan(identityIndex);
  });

  test("identity before posture when soul is absent", () => {
    const context = makeContext({
      soul: undefined,
      posture: "POSTURE_CONTENT",
    });
    const result = activateWorkerWithSharedPattern(context);

    // Prompt should NOT contain soul content
    expect(result.systemPrompt).not.toContain("SOUL_CONTENT");

    // Identity should come before posture
    const identityIndex = result.systemPrompt.indexOf("Your name is:");
    const postureIndex = result.systemPrompt.indexOf("POSTURE_CONTENT");

    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(postureIndex).toBeGreaterThan(identityIndex);
  });

  test("soul content is included verbatim", () => {
    const soulText = "## Character\n\nYou are a steadfast builder.\n\n## Voice\n\nSpeak plainly.\n\n## Vibe\n\nSteady and focused.";
    const context = makeContext({ soul: soulText });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).toContain(soulText);
  });

  test("commission context is in sessionContext, not systemPrompt", () => {
    const context = makeContext({
      soul: "SOUL",
      injectedMemory: "MEMORY",
      commissionContext: {
        commissionId: "test-123",
        prompt: "Build the thing.",
        dependencies: [],
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    // Commission context belongs in sessionContext (REQ-SPO-14)
    expect(result.sessionContext).toContain("Build the thing.");
    expect(result.sessionContext).toContain("Commission protocol");
    expect(result.systemPrompt).not.toContain("Build the thing.");
    expect(result.systemPrompt).not.toContain("Commission protocol");

    // Memory content is in sessionContext
    expect(result.sessionContext).toContain("MEMORY");
  });

  test("meeting context is in sessionContext, not systemPrompt", () => {
    const context = makeContext({
      injectedMemory: "MEMORY",
      meetingContext: {
        meetingId: "meeting-1",
        agenda: "Discuss the plan.",
        referencedArtifacts: [],
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    // Meeting context belongs in sessionContext (REQ-SPO-14)
    expect(result.sessionContext).toContain("Discuss the plan.");
    expect(result.systemPrompt).not.toContain("Discuss the plan.");

    // Memory content is in sessionContext
    expect(result.sessionContext).toContain("MEMORY");
  });

  test("memoryGuidance is included in systemPrompt (REQ-SPO-9)", () => {
    const context = makeContext({
      memoryGuidance: "GUIDANCE_TEXT_HERE",
    });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).toContain("GUIDANCE_TEXT_HERE");
    expect(result.systemPrompt).toContain("Injected Memory");
  });

  test("sessionContext is empty when no memory or activity context", () => {
    const context = makeContext({ soul: "SOUL" });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.sessionContext).toBe("");
  });

  test("stability: same inputs produce identical systemPrompt (REQ-SPO-13)", () => {
    const context = makeContext({
      soul: "SOUL",
      memoryGuidance: "GUIDANCE",
    });
    const result1 = activateWorkerWithSharedPattern(context);
    const result2 = activateWorkerWithSharedPattern(context);

    expect(result1.systemPrompt).toBe(result2.systemPrompt);
    expect(result1.sessionContext).toBe(result2.sessionContext);
  });

  test("identity metadata block includes name, title, description", () => {
    const context = makeContext({
      identity: { name: "Dalton", displayTitle: "Guild Artificer", description: "Master craftsman." },
    });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).toContain("Your name is: Dalton");
    expect(result.systemPrompt).toContain("Your title is: Guild Artificer");
    expect(result.systemPrompt).toContain("You are described as: Master craftsman.");
  });

  test("sections separated by double newlines", () => {
    const context = makeContext({
      soul: "THE_SOUL",
      posture: "THE_POSTURE",
      memoryGuidance: "THE_GUIDANCE",
    });
    const result = activateWorkerWithSharedPattern(context);

    // Soul, identity, posture, guidance should all be separated by \n\n in systemPrompt
    expect(result.systemPrompt).toContain("THE_SOUL\n\n");
    expect(result.systemPrompt).toContain("THE_POSTURE\n\n");
    expect(result.systemPrompt).toContain("THE_GUIDANCE");
  });
});

describe("model selection", () => {
  test("context with explicit model passes it through to result", () => {
    const context = makeContext({ model: "haiku" });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.model).toBe("haiku");
  });

  test("context without model defaults to opus", () => {
    const context = makeContext();
    const result = activateWorkerWithSharedPattern(context);

    expect(result.model).toBe("opus");
  });
});
