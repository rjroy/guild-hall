import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
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
// Points at a socket that doesn't exist, so daemon notification will fail
// silently (testing best-effort behavior).
let fakeDaemonSocket: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-comm-toolbox-"));
  projectPath = path.join(tmpDir, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");
  fakeDaemonSocket = path.join(tmpDir, "nonexistent.sock");

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
      fakeDaemonSocket,
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
    expect(raw).toContain('current_progress: "Analyzed 3 OAuth libraries"');
  });

  test("multiple progress reports accumulate in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeReportProgressHandler(
      projectPath,
      commissionId,
      fakeDaemonSocket,
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
    expect(raw).toContain('current_progress: "Step 2 complete"');
    expect(raw).not.toContain('current_progress: "Step 1 complete"');
  });
});

// -- submit_result --

describe("submit_result", () => {
  test("sets result_summary and records in timeline", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      fakeDaemonSocket,
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
    expect(raw).toContain(
      'result_summary: "Found 3 viable OAuth patterns"',
    );

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
      fakeDaemonSocket,
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
      fakeDaemonSocket,
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
      fakeDaemonSocket,
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
      fakeDaemonSocket,
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
      fakeDaemonSocket,
    );
    await handler({ question: "First question?" });
    await handler({ question: "Second question?" });

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const questionEntries = timeline.filter((e) => e.event === "question");
    expect(questionEntries).toHaveLength(2);
  });
});

// -- HTTP callback failure resilience --

describe("HTTP callback failure", () => {
  test("report_progress succeeds even when daemon is unreachable", async () => {
    await writeCommissionArtifact();

    const handler = makeReportProgressHandler(
      projectPath,
      commissionId,
      "/tmp/this-socket-does-not-exist-ever.sock",
    );
    const result = await handler({ summary: "Progress despite no daemon" });

    // Tool call should succeed (file write happened)
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Progress reported");
  });

  test("submit_result succeeds even when daemon is unreachable", async () => {
    await writeCommissionArtifact();

    const handler = makeSubmitResultHandler(
      projectPath,
      commissionId,
      "/tmp/this-socket-does-not-exist-ever.sock",
    );
    const result = await handler({ summary: "Result despite no daemon" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Result submitted");
  });

  test("log_question succeeds even when daemon is unreachable", async () => {
    await writeCommissionArtifact();

    const handler = makeLogQuestionHandler(
      projectPath,
      commissionId,
      "/tmp/this-socket-does-not-exist-ever.sock",
    );
    const result = await handler({ question: "Question despite no daemon?" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Question logged");
  });
});

// -- Per-closure resultSubmitted flag --

describe("per-closure resultSubmitted flag", () => {
  test("each createCommissionToolbox() call gets its own flag", () => {
    // Creating two separate toolbox instances verifies the flag is per-closure
    const toolbox1 = createCommissionToolbox({
      projectPath,
      commissionId,
      daemonSocketPath: fakeDaemonSocket,
    });
    const toolbox2 = createCommissionToolbox({
      projectPath,
      commissionId,
      daemonSocketPath: fakeDaemonSocket,
    });

    // Both should be independent instances
    expect(toolbox1.type).toBe("sdk");
    expect(toolbox2.type).toBe("sdk");
    expect(toolbox1.name).toBe("guild-hall-commission");
    expect(toolbox2.name).toBe("guild-hall-commission");
    expect(toolbox1.instance).toBeDefined();
    expect(toolbox2.instance).toBeDefined();
    // They should be different instances
    expect(toolbox1.instance).not.toBe(toolbox2.instance);
  });

  test("separate handler instances have independent resultSubmitted flags", async () => {
    await writeCommissionArtifact();

    const handler1 = makeSubmitResultHandler(
      projectPath,
      commissionId,
      fakeDaemonSocket,
    );
    const handler2 = makeSubmitResultHandler(
      projectPath,
      commissionId,
      fakeDaemonSocket,
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
  test("returns an MCP server config with type sdk", () => {
    const result = createCommissionToolbox({
      projectPath,
      commissionId,
      daemonSocketPath: fakeDaemonSocket,
    });

    expect(result.type).toBe("sdk");
    expect(result.name).toBe("guild-hall-commission");
    expect(result.instance).toBeDefined();
  });
});
