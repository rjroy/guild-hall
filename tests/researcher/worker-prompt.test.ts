import { describe, expect, it } from "bun:test";

import { buildWorkerPrompt } from "@/guild-members/researcher/worker-prompt";

describe("buildWorkerPrompt", () => {
  it("includes task text", () => {
    const prompt = buildWorkerPrompt("Find papers on AI safety", "");

    expect(prompt).toContain("Find papers on AI safety");
  });

  it("includes task text in a Task section", () => {
    const prompt = buildWorkerPrompt("Research quantum computing", "");

    expect(prompt).toContain("## Task");
    expect(prompt).toContain("Research quantum computing");
  });

  it("includes injected memories when provided", () => {
    const memories = "API rate limit is 100 req/min\n---\nProject uses TypeScript";
    const prompt = buildWorkerPrompt("Do research", memories);

    expect(prompt).toContain("## Prior Memories");
    expect(prompt).toContain("API rate limit is 100 req/min");
    expect(prompt).toContain("Project uses TypeScript");
  });

  it("shows 'No prior memories.' when memories is empty", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("No prior memories.");
  });

  it("does not show 'No prior memories.' when memories are provided", () => {
    const prompt = buildWorkerPrompt("Do research", "Some memory content");

    expect(prompt).not.toContain("No prior memories.");
  });

  it("includes tool usage instructions for update_summary", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("### update_summary");
    expect(prompt).toContain("report your progress");
  });

  it("includes tool usage instructions for record_decision", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("### record_decision");
    expect(prompt).toContain("judgment call");
  });

  it("includes tool usage instructions for log_question", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("### log_question");
    expect(prompt).toContain("cannot resolve");
  });

  it("includes tool usage instructions for store_memory", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("### store_memory");
    expect(prompt).toContain("future research jobs");
  });

  it("includes output instructions for structured report", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("## Output");
    expect(prompt).toContain("structured research report");
    expect(prompt).toContain("Summary");
    expect(prompt).toContain("Key Findings");
    expect(prompt).toContain("Sources");
    expect(prompt).toContain("Open Questions");
    expect(prompt).toContain("Recommendations");
  });

  it("includes role description", () => {
    const prompt = buildWorkerPrompt("Do research", "");

    expect(prompt).toContain("research agent");
  });
});
