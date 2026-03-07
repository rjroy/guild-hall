import { describe, test, expect } from "bun:test";
import type { ActivationContext, ResolvedToolSet } from "@/lib/types";
import { activateWorkerWithSharedPattern } from "@/packages/shared/worker-activation";

function makeResolvedTools(): ResolvedToolSet {
  return {
    mcpServers: [],
    allowedTools: ["Read", "Glob", "Grep"],
  };
}

function makeContext(overrides: Partial<ActivationContext> = {}): ActivationContext {
  return {
    identity: { name: "TestWorker", description: "A test worker", displayTitle: "Test Title" },
    posture: "POSTURE_CONTENT",
    injectedMemory: "",
    resolvedTools: makeResolvedTools(),
    resourceDefaults: { maxTurns: 30 },
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

  test("activity context still appended after memory", () => {
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

    const memoryIndex = result.systemPrompt.indexOf("MEMORY");
    const commissionIndex = result.systemPrompt.indexOf("Build the thing.");

    expect(memoryIndex).toBeGreaterThan(0);
    expect(commissionIndex).toBeGreaterThan(memoryIndex);
  });

  test("meeting context appended after memory", () => {
    const context = makeContext({
      injectedMemory: "MEMORY",
      meetingContext: {
        meetingId: "meeting-1",
        agenda: "Discuss the plan.",
        referencedArtifacts: [],
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    const memoryIndex = result.systemPrompt.indexOf("MEMORY");
    const meetingIndex = result.systemPrompt.indexOf("Discuss the plan.");

    expect(memoryIndex).toBeGreaterThan(0);
    expect(meetingIndex).toBeGreaterThan(memoryIndex);
  });

  test("stability: same inputs produce identical output", () => {
    const context = makeContext({
      soul: "SOUL",
      injectedMemory: "MEMORY",
    });
    const result1 = activateWorkerWithSharedPattern(context);
    const result2 = activateWorkerWithSharedPattern(context);

    expect(result1.systemPrompt).toBe(result2.systemPrompt);
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
      injectedMemory: "THE_MEMORY",
    });
    const result = activateWorkerWithSharedPattern(context);

    // Soul, identity, posture, memory should all be separated by \n\n
    expect(result.systemPrompt).toContain("THE_SOUL\n\n");
    expect(result.systemPrompt).toContain("THE_POSTURE\n\n");
    expect(result.systemPrompt).toContain("THE_MEMORY");
  });
});

describe("mail context rendering", () => {
  test("mail context renders subject, message, and commission title", () => {
    const context = makeContext({
      mailContext: {
        subject: "Review this spec",
        message: "Please check the types section for correctness.",
        commissionTitle: "Commission: Implement worker communication",
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).toContain("Review this spec");
    expect(result.systemPrompt).toContain("Please check the types section for correctness.");
    expect(result.systemPrompt).toContain("Commission: Implement worker communication");
  });

  test("mail context includes reply tool instructions", () => {
    const context = makeContext({
      mailContext: {
        subject: "Help needed",
        message: "What do you think?",
        commissionTitle: "Test commission",
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).toContain("reply");
    expect(result.systemPrompt).toContain("only be called once");
  });

  test("mail context appears after memory", () => {
    const context = makeContext({
      injectedMemory: "MEMORY_CONTENT",
      mailContext: {
        subject: "Review",
        message: "Please review.",
        commissionTitle: "Test",
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    const memoryIndex = result.systemPrompt.indexOf("MEMORY_CONTENT");
    const mailIndex = result.systemPrompt.indexOf("Please review.");

    expect(memoryIndex).toBeGreaterThan(0);
    expect(mailIndex).toBeGreaterThan(memoryIndex);
  });

  test("mail context does NOT include commission protocol", () => {
    const context = makeContext({
      mailContext: {
        subject: "Review",
        message: "Please review.",
        commissionTitle: "Test",
      },
    });
    const result = activateWorkerWithSharedPattern(context);

    expect(result.systemPrompt).not.toContain("submit_result");
    expect(result.systemPrompt).not.toContain("Commission protocol:");
  });
});
