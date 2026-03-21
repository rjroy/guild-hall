import { describe, expect, test } from "bun:test";
import { buildSubAgentDescription } from "@/packages/shared/sub-agent-description";
import type { WorkerIdentity } from "@/lib/types";

function makeIdentity(overrides: Partial<WorkerIdentity> = {}): WorkerIdentity {
  return {
    name: "TestWorker",
    displayTitle: "Guild Tester",
    description: "Runs tests and validates behavior.",
    ...overrides,
  };
}

describe("buildSubAgentDescription", () => {
  test("known worker uses lookup table entry", () => {
    const identity = makeIdentity({
      name: "Thorne",
      displayTitle: "Guild Warden",
      description: "Reviews code for correctness and convention adherence.",
    });

    const result = buildSubAgentDescription(identity, "Some posture text");

    expect(result).toContain("critical review");
    expect(result).toContain("reads and evaluates but does not modify code");
    expect(result).not.toContain("Invoke this worker when:");
  });

  test("unknown worker falls back to identity.description", () => {
    const identity = makeIdentity({
      name: "NewWorker",
      displayTitle: "Guild Newcomer",
      description: "Does something novel.",
    });

    const result = buildSubAgentDescription(identity, "Some posture text");

    expect(result).toContain("Invoke this worker when: Does something novel.");
  });

  test("description starts with displayTitle (name)", () => {
    const identity = makeIdentity({
      name: "Dalton",
      displayTitle: "Guild Artificer",
      description: "Builds what is commissioned.",
    });

    const result = buildSubAgentDescription(identity, "Some posture text");

    expect(result).toStartWith("Guild Artificer (Dalton).");
  });

  test("description includes identity.description", () => {
    const identity = makeIdentity({
      name: "Octavia",
      displayTitle: "Guild Chronicler",
      description: "Documents specifications and maintains clarity.",
    });

    const result = buildSubAgentDescription(identity, "Some posture text");

    expect(result).toContain(
      "Documents specifications and maintains clarity.",
    );
  });

  test("function is pure - same inputs produce same output", () => {
    const identity = makeIdentity({ name: "Sable" });
    const posture = "Breaks things to find what's fragile.";

    const result1 = buildSubAgentDescription(identity, posture);
    const result2 = buildSubAgentDescription(identity, posture);

    expect(result1).toBe(result2);
  });

  test("all current workers have lookup table entries", () => {
    const workerNames = [
      "Thorne",
      "Octavia",
      "Dalton",
      "Celeste",
      "Edmund",
      "Verity",
      "Sable",
      "Sienna",
    ];

    for (const name of workerNames) {
      const identity = makeIdentity({ name });
      const result = buildSubAgentDescription(identity, "posture");
      // Known workers should NOT have the fallback prefix
      expect(result).not.toContain("Invoke this worker when:");
    }
  });
});
