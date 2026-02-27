import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId } from "@/daemon/types";
import {
  makeReportProgressHandler,
  makeSubmitResultHandler,
  makeLogQuestionHandler,
  createCommissionToolbox,
} from "@/daemon/services/commission-toolbox";
import {
  readActivityTimeline,
  readLinkedArtifacts,
  commissionArtifactPath,
} from "@/daemon/services/commission-artifact-helpers";

let tmpDir: string;
let projectPath: string;
let commissionId: CommissionId;

// No-op callbacks matching the new CommissionToolboxDeps interface
const noopOnProgress = (_summary: string) => {};
const noopOnResult = (_summary: string, _artifacts?: string[]) => {};
const noopOnQuestion = (_question: string) => {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-toolbox-"));
  projectPath = path.join(tmpDir, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  // Create commissions directory
  await fs.mkdir(
    path.join(projectPath, ".lore", "commissions"),
    { recursive: true },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test commission artifact with the standard frontmatter structure.
 * Mirrors the helper in commission-artifact-helpers.test.ts.
 */
async function writeCommissionArtifact(
  overrides?: Partial<{
    status: string;
    linked_artifacts: string;
    activity_timeline: string;
    current_progress: string;
    result_summary: string;
  }>,
): Promise<void> {
  const status = overrides?.status ?? "in_progress";
  const linkedArtifacts = overrides?.linked_artifacts ?? "linked_artifacts: []";
  const timeline = overrides?.activity_timeline ??
    `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"`;
  const progress = overrides?.current_progress ?? 'current_progress: ""';
  const result = overrides?.result_summary ?? 'result_summary: ""';

  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
${linkedArtifacts}
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
${timeline}
${progress}
${result}
projectName: guild-hall
---
`;

  const artifactPath = commissionArtifactPath(projectPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- report_progress --

describe("report_progress", () => {
  test("appends timeline entry and updates current_progress", async () => {
    await writeCommissionArtifact();

    const handler = makeReportProgressHandler(
      projectPath,
      commissionId,
      noopOnProgress,
    );
    const result = await handler({ summary: "Analyzed 3 OAuth libraries" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(
      "Progress reported: Analyzed 3 OAuth libraries",
    );

    // Verify timeline entry was added
    const timeline = await readActivityTimeline(projectPath, commissionId);
    const progressEntries = timeline.filter(
      (e) => e.event === "progress_report",
    );
    expect(progressEntries).toHaveLength(1);
    expect(progressEntries[0].reason).toBe("Analyzed 3 OAuth libraries");

    // Verify current_progress was updated
    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.current_progress).toBe("Analyzed 3 OAuth libraries");
  });

  test("multiple progress reports accumulate in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeReportProgressHandler(
      projectPath,
      commissionId,
      noopOnProgress,
    );
    await handler({ summary: "Step 1 complete" });
    await handler({ summary: "Step 2 complete" });

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const progressEntries = timeline.filter(
      (e) => e.event === "progress_report",
    );
    expect(progressEntries).toHaveLength(2);

    // current_progress should show only the latest
    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.current_progress).toBe("Step 2 complete");
  });
});

// -- submit_result --

describe("submit_result", () => {
  test("sets result_summary and records in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );
    const result = await handler({
      summary: "Found 3 viable OAuth patterns",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(
      "Result submitted: Found 3 viable OAuth patterns",
    );

    // Verify result_summary was set
    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.result_summary).toBe("Found 3 viable OAuth patterns");

    // Verify timeline entry
    const timeline = await readActivityTimeline(projectPath, commissionId);
    const resultEntries = timeline.filter(
      (e) => e.event === "result_submitted",
    );
    expect(resultEntries).toHaveLength(1);
    expect(resultEntries[0].reason).toBe("Found 3 viable OAuth patterns");
  });

  test("adds linked_artifacts when provided", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );
    await handler({
      summary: "Research complete",
      artifacts: ["specs/oauth-report.md", "notes/findings.md"],
    });

    const linked = await readLinkedArtifacts(projectPath, commissionId);
    expect(linked).toContain("specs/oauth-report.md");
    expect(linked).toContain("notes/findings.md");
  });

  test("second call returns error text", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );

    // First call succeeds
    const first = await handler({ summary: "Done" });
    expect(first.isError).toBeUndefined();

    // Second call returns error
    const second = await handler({ summary: "Done again" });
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain("already submitted");
  });

  test("works without artifacts parameter", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );
    const result = await handler({ summary: "Minimal result" });

    expect(result.isError).toBeUndefined();

    // linked_artifacts should remain empty
    const linked = await readLinkedArtifacts(projectPath, commissionId);
    expect(linked).toEqual([]);
  });
});

// -- log_question --

describe("log_question", () => {
  test("appends question to timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeLogQuestionHandler(
      projectPath,
      commissionId,
      noopOnQuestion,
    );
    const result = await handler({
      question: "Should I include deprecated patterns?",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(
      "Question logged: Should I include deprecated patterns?",
    );

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const questionEntries = timeline.filter((e) => e.event === "question");
    expect(questionEntries).toHaveLength(1);
    expect(questionEntries[0].reason).toBe(
      "Should I include deprecated patterns?",
    );
  });

  test("multiple questions accumulate in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeLogQuestionHandler(
      projectPath,
      commissionId,
      noopOnQuestion,
    );
    await handler({ question: "First question?" });
    await handler({ question: "Second question?" });

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const questionEntries = timeline.filter((e) => e.event === "question");
    expect(questionEntries).toHaveLength(2);
  });
});

// -- Callback invocation --

describe("callback invocation", () => {
  test("report_progress invokes onProgress callback with summary", async () => {
    await writeCommissionArtifact();

    let calledWith = "";
    const handler = makeReportProgressHandler(
      projectPath,
      commissionId,
      (summary: string) => { calledWith = summary; },
    );
    const result = await handler({ summary: "Progress update" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Progress reported");
    expect(calledWith).toBe("Progress update");
  });

  test("submit_result invokes onResult callback with summary and artifacts", async () => {
    await writeCommissionArtifact();

    let calledSummary = "";
    let calledArtifacts: string[] | undefined;
    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      (summary: string, artifacts?: string[]) => {
        calledSummary = summary;
        calledArtifacts = artifacts;
      },
    );
    const result = await handler({
      summary: "Result with artifacts",
      artifacts: ["notes/finding.md"],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Result submitted");
    expect(calledSummary).toBe("Result with artifacts");
    expect(calledArtifacts).toEqual(["notes/finding.md"]);
  });

  test("log_question invokes onQuestion callback with question", async () => {
    await writeCommissionArtifact();

    let calledWith = "";
    const handler = makeLogQuestionHandler(
      projectPath,
      commissionId,
      (question: string) => { calledWith = question; },
    );
    const result = await handler({ question: "A question?" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Question logged");
    expect(calledWith).toBe("A question?");
  });
});

// -- Per-closure resultSubmitted flag --

describe("per-closure resultSubmitted flag", () => {
  test("each createCommissionToolbox() call gets its own flag", () => {
    // Creating two separate toolbox instances verifies the flag is per-closure
    const toolbox1 = createCommissionToolbox({
      projectPath,
      commissionId,
      onProgress: noopOnProgress,
      onResult: noopOnResult,
      onQuestion: noopOnQuestion,
    });
    const toolbox2 = createCommissionToolbox({
      projectPath,
      commissionId,
      onProgress: noopOnProgress,
      onResult: noopOnResult,
      onQuestion: noopOnQuestion,
    });

    // Both should be independent instances
    expect(toolbox1.server.type).toBe("sdk");
    expect(toolbox2.server.type).toBe("sdk");
    expect(toolbox1.server.name).toBe("guild-hall-commission");
    expect(toolbox2.server.name).toBe("guild-hall-commission");
    expect(toolbox1.server.instance).toBeDefined();
    expect(toolbox2.server.instance).toBeDefined();
    // They should be different instances
    expect(toolbox1.server.instance).not.toBe(toolbox2.server.instance);
    // Each has its own wasResultSubmitted callback
    expect(toolbox1.wasResultSubmitted()).toBe(false);
    expect(toolbox2.wasResultSubmitted()).toBe(false);
  });

  test("separate handler instances have independent resultSubmitted flags", async () => {
    await writeCommissionArtifact();

    const handler1 = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );
    const handler2 = makeSubmitResultHandler(
      projectPath,
      commissionId,
      noopOnResult,
    );

    // First handler submits successfully
    const result1 = await handler1({ summary: "Handler 1 result" });
    expect(result1.isError).toBeUndefined();

    // First handler can't submit again
    const result1Again = await handler1({ summary: "Handler 1 again" });
    expect(result1Again.isError).toBe(true);

    // Second handler is independent and can still submit
    const result2 = await handler2({ summary: "Handler 2 result" });
    expect(result2.isError).toBeUndefined();
  });
});

// -- createCommissionToolbox --

describe("createCommissionToolbox", () => {
  test("returns server config and wasResultSubmitted callback", () => {
    const result = createCommissionToolbox({
      projectPath,
      commissionId,
      onProgress: noopOnProgress,
      onResult: noopOnResult,
      onQuestion: noopOnQuestion,
    });

    expect(result.server.type).toBe("sdk");
    expect(result.server.name).toBe("guild-hall-commission");
    expect(result.server.instance).toBeDefined();
    expect(result.wasResultSubmitted).toBeFunction();
    expect(result.wasResultSubmitted()).toBe(false);
  });
});
