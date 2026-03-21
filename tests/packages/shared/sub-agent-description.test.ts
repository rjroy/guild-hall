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
  test("worker with guidance uses guidance string", () => {
    const identity = makeIdentity({
      name: "Thorne",
      displayTitle: "Guild Warden",
      description: "Reviews code for correctness and convention adherence.",
      guidance:
        "Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code.",
    });

    const result = buildSubAgentDescription(identity);

    expect(result).toContain("critical review");
    expect(result).toContain("reads and evaluates but does not modify code");
    expect(result).not.toContain("Invoke this worker when:");
  });

  test("worker without guidance falls back to identity.description", () => {
    const identity = makeIdentity({
      name: "NewWorker",
      displayTitle: "Guild Newcomer",
      description: "Does something novel.",
    });

    const result = buildSubAgentDescription(identity);

    expect(result).toContain("Invoke this worker when: Does something novel.");
  });

  test("description starts with displayTitle (name)", () => {
    const identity = makeIdentity({
      name: "Dalton",
      displayTitle: "Guild Artificer",
      description: "Builds what is commissioned.",
    });

    const result = buildSubAgentDescription(identity);

    expect(result).toStartWith("Guild Artificer (Dalton).");
  });

  test("description includes identity.description", () => {
    const identity = makeIdentity({
      name: "Octavia",
      displayTitle: "Guild Chronicler",
      description: "Documents specifications and maintains clarity.",
    });

    const result = buildSubAgentDescription(identity);

    expect(result).toContain(
      "Documents specifications and maintains clarity.",
    );
  });

  test("function is pure - same inputs produce same output", () => {
    const identity = makeIdentity({ name: "Sable" });

    const result1 = buildSubAgentDescription(identity);
    const result2 = buildSubAgentDescription(identity);

    expect(result1).toBe(result2);
  });

  test("worker with guidance includes both header and guidance", () => {
    const identity = makeIdentity({
      name: "Verity",
      displayTitle: "Guild Pathfinder",
      description: "Ventures beyond the guild walls.",
      guidance: "Invoke this worker when you need external research.",
    });

    const result = buildSubAgentDescription(identity);

    expect(result).toContain("Guild Pathfinder (Verity). Ventures beyond the guild walls.");
    expect(result).toContain("Invoke this worker when you need external research.");
  });
});
