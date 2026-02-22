import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId } from "@/daemon/types";
import {
  commissionArtifactPath,
  readCommissionStatus,
  updateCommissionStatus,
  appendTimelineEntry,
  readActivityTimeline,
  parseActivityTimeline,
  updateCurrentProgress,
  updateResultSummary,
  readLinkedArtifacts,
  addLinkedArtifact,
} from "@/daemon/services/commission-artifact-helpers";

let tmpDir: string;
let projectPath: string;
let commissionId: CommissionId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commission-helpers-"));
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
  const status = overrides?.status ?? "pending";
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

// -- commissionArtifactPath --

describe("commissionArtifactPath", () => {
  test("constructs correct path", () => {
    const result = commissionArtifactPath(projectPath, commissionId);
    expect(result).toBe(
      path.join(
        projectPath,
        ".lore",
        "commissions",
        "commission-researcher-20260221-143000.md",
      ),
    );
  });
});

// -- readCommissionStatus --

describe("readCommissionStatus", () => {
  test("reads status from frontmatter", async () => {
    await writeCommissionArtifact({ status: "in_progress" });
    const status = await readCommissionStatus(projectPath, commissionId);
    expect(status).toBe("in_progress");
  });

  test("reads pending status", async () => {
    await writeCommissionArtifact({ status: "pending" });
    const status = await readCommissionStatus(projectPath, commissionId);
    expect(status).toBe("pending");
  });
});

// -- updateCommissionStatus --

describe("updateCommissionStatus", () => {
  test("changes status field in frontmatter", async () => {
    await writeCommissionArtifact({ status: "pending" });

    await updateCommissionStatus(projectPath, commissionId, "dispatched");

    const status = await readCommissionStatus(projectPath, commissionId);
    expect(status).toBe("dispatched");
  });

  test("preserves other frontmatter fields", async () => {
    await writeCommissionArtifact({ status: "pending" });

    await updateCommissionStatus(projectPath, commissionId, "completed");

    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('title: "Commission: Research OAuth patterns"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain("status: completed");
  });
});

// -- appendTimelineEntry --

describe("appendTimelineEntry", () => {
  test("adds timestamped entry before current_progress", async () => {
    await writeCommissionArtifact();

    await appendTimelineEntry(
      projectPath,
      commissionId,
      "dispatched",
      "Worker started processing",
    );

    const timeline = await readActivityTimeline(projectPath, commissionId);
    expect(timeline).toHaveLength(2);
    expect(timeline[1].event).toBe("dispatched");
    expect(timeline[1].reason).toBe("Worker started processing");
    expect(timeline[1].timestamp).toBeDefined();
  });

  test("throws on malformed frontmatter (no current_progress or closing ---)", async () => {
    // Write a file with neither current_progress nor a closing ---
    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    await fs.writeFile(
      artifactPath,
      `title: "Malformed commission"
status: pending
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
`,
      "utf-8",
    );

    await expect(
      appendTimelineEntry(
        projectPath,
        commissionId,
        "dispatched",
        "Worker started processing",
      ),
    ).rejects.toThrow(/no "current_progress:" field or closing "---" delimiter found/);
  });

  test("includes extra fields when provided", async () => {
    await writeCommissionArtifact();

    await appendTimelineEntry(
      projectPath,
      commissionId,
      "question",
      "Need clarification",
      { detail: "What format should the output be?" },
    );

    const timeline = await readActivityTimeline(projectPath, commissionId);
    const lastEntry = timeline[timeline.length - 1];
    expect(lastEntry.event).toBe("question");
    expect(lastEntry.detail).toBe("What format should the output be?");
  });
});

// -- readActivityTimeline / parseActivityTimeline --

describe("readActivityTimeline", () => {
  test("parses timeline entries from artifact", async () => {
    await writeCommissionArtifact();

    const timeline = await readActivityTimeline(projectPath, commissionId);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].timestamp).toBe("2026-02-21T14:30:00.000Z");
    expect(timeline[0].event).toBe("created");
    expect(timeline[0].reason).toBe("User created commission");
  });
});

describe("parseActivityTimeline", () => {
  test("parses multiple entries", () => {
    const raw = `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
  - timestamp: 2026-02-21T15:00:00.000Z
    event: dispatched
    reason: "Worker started"
current_progress: ""
`;
    const entries = parseActivityTimeline(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe("created");
    expect(entries[1].event).toBe("dispatched");
    expect(entries[1].reason).toBe("Worker started");
  });

  test("returns empty array when no timeline section", () => {
    const raw = `---
title: Something
status: pending
---
`;
    const entries = parseActivityTimeline(raw);
    expect(entries).toEqual([]);
  });

  test("handles entries with extra fields", () => {
    const raw = `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: question
    reason: "Need clarification"
    detail: "What format?"
current_progress: ""
`;
    const entries = parseActivityTimeline(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toBe("What format?");
  });
});

// -- updateCurrentProgress --

describe("updateCurrentProgress", () => {
  test("replaces (not appends) the progress value", async () => {
    await writeCommissionArtifact();

    await updateCurrentProgress(
      projectPath,
      commissionId,
      "Analyzing OAuth patterns",
    );

    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('current_progress: "Analyzing OAuth patterns"');
  });

  test("overwrites previous progress on second call", async () => {
    await writeCommissionArtifact();

    await updateCurrentProgress(projectPath, commissionId, "Step 1 done");
    await updateCurrentProgress(projectPath, commissionId, "Step 2 done");

    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('current_progress: "Step 2 done"');
    expect(raw).not.toContain("Step 1 done");
  });
});

// -- readLinkedArtifacts --

describe("readLinkedArtifacts", () => {
  test("returns empty array for empty linked_artifacts", async () => {
    await writeCommissionArtifact();

    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toEqual([]);
  });

  test("parses linked artifact paths", async () => {
    await writeCommissionArtifact({
      linked_artifacts: `linked_artifacts:
  - specs/oauth-patterns.md
  - notes/research-log.md`,
    });

    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toEqual(["specs/oauth-patterns.md", "notes/research-log.md"]);
  });
});

// -- addLinkedArtifact --

describe("addLinkedArtifact", () => {
  test("adds artifact to empty list", async () => {
    await writeCommissionArtifact();

    const added = await addLinkedArtifact(
      projectPath,
      commissionId,
      "specs/new-spec.md",
    );

    expect(added).toBe(true);
    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toEqual(["specs/new-spec.md"]);
  });

  test("appends to existing list", async () => {
    await writeCommissionArtifact({
      linked_artifacts: `linked_artifacts:
  - specs/first.md`,
    });

    const added = await addLinkedArtifact(
      projectPath,
      commissionId,
      "specs/second.md",
    );

    expect(added).toBe(true);
    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toContain("specs/first.md");
    expect(artifacts).toContain("specs/second.md");
  });

  test("deduplicates: returns false if already present", async () => {
    await writeCommissionArtifact({
      linked_artifacts: `linked_artifacts:
  - specs/existing.md`,
    });

    const added = await addLinkedArtifact(
      projectPath,
      commissionId,
      "specs/existing.md",
    );

    expect(added).toBe(false);
    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toEqual(["specs/existing.md"]);
  });
});

// -- updateResultSummary --

describe("updateResultSummary", () => {
  test("sets result_summary field", async () => {
    await writeCommissionArtifact();

    await updateResultSummary(
      projectPath,
      commissionId,
      "Found 3 viable OAuth patterns",
    );

    const artifactPath = commissionArtifactPath(projectPath, commissionId);
    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('result_summary: "Found 3 viable OAuth patterns"');
  });

  test("appends linked artifacts when provided", async () => {
    await writeCommissionArtifact();

    await updateResultSummary(
      projectPath,
      commissionId,
      "Research complete",
      ["specs/oauth-report.md", "notes/findings.md"],
    );

    const artifacts = await readLinkedArtifacts(projectPath, commissionId);
    expect(artifacts).toContain("specs/oauth-report.md");
    expect(artifacts).toContain("notes/findings.md");
  });
});
