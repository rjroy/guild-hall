import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createCommissionRecordOps,
  type CommissionRecordOps,
} from "@/daemon/services/commission/record";

let tmpDir: string;
let artifactPath: string;
let ops: CommissionRecordOps;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-record-ops-"));
  artifactPath = path.join(tmpDir, "commission-test-20260301-120000.md");
  ops = createCommissionRecordOps();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test commission artifact with the standard frontmatter structure.
 * Returns the exact content written so tests can verify byte-for-byte preservation.
 */
async function writeArtifact(
  overrides?: Partial<{
    status: string;
    dependencies: string;
    linked_artifacts: string;
    activity_timeline: string;
    current_progress: string;
    result_summary: string;
  }>,
): Promise<string> {
  const status = overrides?.status ?? "pending";
  const deps = overrides?.dependencies ?? "dependencies: []";
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
${deps}
${linkedArtifacts}
resource_overrides: {}
${timeline}
${progress}
${result}
projectName: guild-hall
---

# Commission Body

Some markdown content here.
`;

  await fs.writeFile(artifactPath, content, "utf-8");
  return content;
}

// -- readStatus --

describe("readStatus", () => {
  test("reads status from frontmatter", async () => {
    await writeArtifact({ status: "in_progress" });
    const status = await ops.readStatus(artifactPath);
    expect(status).toBe("in_progress");
  });

  test("reads pending status", async () => {
    await writeArtifact({ status: "pending" });
    const status = await ops.readStatus(artifactPath);
    expect(status).toBe("pending");
  });

  test("reads completed status", async () => {
    await writeArtifact({ status: "completed" });
    const status = await ops.readStatus(artifactPath);
    expect(status).toBe("completed");
  });

  test("reads dispatched status", async () => {
    await writeArtifact({ status: "dispatched" });
    const status = await ops.readStatus(artifactPath);
    expect(status).toBe("dispatched");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.readStatus(missing)).rejects.toThrow(/artifact not found/);
    await expect(ops.readStatus(missing)).rejects.toThrow(missing);
  });

  test("throws when no status field exists", async () => {
    await fs.writeFile(artifactPath, `---
title: "No status here"
---
`, "utf-8");
    await expect(ops.readStatus(artifactPath)).rejects.toThrow(/no status field found/);
  });
});

// -- writeStatus --

describe("writeStatus", () => {
  test("changes status field in frontmatter", async () => {
    await writeArtifact({ status: "pending" });
    await ops.writeStatus(artifactPath, "dispatched");

    const status = await ops.readStatus(artifactPath);
    expect(status).toBe("dispatched");
  });

  test("preserves other frontmatter fields byte-for-byte", async () => {
    const original = await writeArtifact({ status: "pending" });
    await ops.writeStatus(artifactPath, "completed");

    const updated = await fs.readFile(artifactPath, "utf-8");

    // The only change should be "pending" -> "completed" in the status line
    const expectedContent = original.replace("status: pending", "status: completed");
    expect(updated).toBe(expectedContent);
  });

  test("preserves title with special characters", async () => {
    await writeArtifact({ status: "pending" });
    await ops.writeStatus(artifactPath, "in_progress");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('title: "Commission: Research OAuth patterns"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain("projectName: guild-hall");
  });

  test("preserves markdown body content", async () => {
    await writeArtifact({ status: "pending" });
    await ops.writeStatus(artifactPath, "completed");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("# Commission Body");
    expect(raw).toContain("Some markdown content here.");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.writeStatus(missing, "pending")).rejects.toThrow(/artifact not found/);
  });

  test("throws when no status field exists", async () => {
    await fs.writeFile(artifactPath, `---
title: "No status here"
worker: researcher
---
`, "utf-8");
    await expect(ops.writeStatus(artifactPath, "pending")).rejects.toThrow(/no status field found/);
  });
});

// -- appendTimeline --

describe("appendTimeline", () => {
  test("adds timestamped entry before current_progress", async () => {
    await writeArtifact();

    await ops.appendTimeline(artifactPath, "dispatched", "Worker started processing");

    const raw = await fs.readFile(artifactPath, "utf-8");
    // The new entry should appear before current_progress
    const dispatchedIndex = raw.indexOf("event: dispatched");
    const progressIndex = raw.indexOf("current_progress:");
    expect(dispatchedIndex).toBeGreaterThan(-1);
    expect(progressIndex).toBeGreaterThan(dispatchedIndex);
  });

  test("includes ISO timestamp", async () => {
    await writeArtifact();
    const before = new Date();

    await ops.appendTimeline(artifactPath, "dispatched", "Starting work");

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Find the new timestamp line
    const match = raw.match(/timestamp: (\S+)\n\s+event: dispatched/);
    expect(match).not.toBeNull();
    const ts = new Date(match![1]);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(ts.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("includes event name and reason", async () => {
    await writeArtifact();

    await ops.appendTimeline(artifactPath, "status_in_progress", "Agent picked up the work");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("event: status_in_progress");
    expect(raw).toContain('reason: "Agent picked up the work"');
  });

  test("preserves existing timeline entries", async () => {
    await writeArtifact();

    await ops.appendTimeline(artifactPath, "dispatched", "Worker started");

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Original entry should still be there, unmodified
    expect(raw).toContain("timestamp: 2026-02-21T14:30:00.000Z");
    expect(raw).toContain("event: created");
    expect(raw).toContain('reason: "User created commission"');
  });

  test("includes extra fields when provided", async () => {
    await writeArtifact();

    await ops.appendTimeline(
      artifactPath,
      "question",
      "Need clarification",
      { detail: "What format should the output be?" },
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("event: question");
    expect(raw).toContain('detail: "What format should the output be?"');
  });

  test("escapes special characters in reason", async () => {
    await writeArtifact();

    await ops.appendTimeline(
      artifactPath,
      "note",
      'Found a "quoted" value with backslash\\path',
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Should be escaped so YAML stays valid
    expect(raw).toContain('\\"quoted\\"');
    expect(raw).toContain("\\\\path");
  });

  test("escapes newlines in reason to keep entry on expected lines", async () => {
    await writeArtifact();

    await ops.appendTimeline(
      artifactPath,
      "result_submitted",
      "Line 1\nLine 2\nLine 3",
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Reason should be a single YAML string value with escaped newlines
    expect(raw).toContain("\\n");
    // Frontmatter should remain parseable
    expect(raw).toContain("projectName: guild-hall");
  });

  test("escapes newlines in extra field values", async () => {
    await writeArtifact();

    await ops.appendTimeline(
      artifactPath,
      "question",
      "Need input",
      { detail: "Option A\nOption B" },
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("\\n");
  });

  test("falls back to inserting before closing --- when no current_progress", async () => {
    // Write artifact without current_progress field
    const content = `---
title: "Minimal commission"
status: pending
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Created"
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");

    await ops.appendTimeline(artifactPath, "dispatched", "Starting");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("event: dispatched");
    // Should end with closing ---
    expect(raw.trimEnd().endsWith("---")).toBe(true);
  });

  test("throws when no current_progress or closing --- exists", async () => {
    await fs.writeFile(
      artifactPath,
      `title: "Broken"
status: pending
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Created"
`,
      "utf-8",
    );

    await expect(
      ops.appendTimeline(artifactPath, "dispatched", "Starting"),
    ).rejects.toThrow(/no "current_progress:" field or closing "---" delimiter found/);
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(
      ops.appendTimeline(missing, "dispatched", "Starting"),
    ).rejects.toThrow(/artifact not found/);
  });

  test("multiple appends accumulate in order", async () => {
    await writeArtifact();

    await ops.appendTimeline(artifactPath, "dispatched", "First event");
    await ops.appendTimeline(artifactPath, "in_progress", "Second event");
    await ops.appendTimeline(artifactPath, "note", "Third event");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const dispatchedIdx = raw.indexOf("event: dispatched");
    const inProgressIdx = raw.indexOf("event: in_progress");
    const noteIdx = raw.indexOf("event: note");
    const createdIdx = raw.indexOf("event: created");

    // Original entry first, then appended entries in order
    expect(createdIdx).toBeLessThan(dispatchedIdx);
    expect(dispatchedIdx).toBeLessThan(inProgressIdx);
    expect(inProgressIdx).toBeLessThan(noteIdx);
  });
});

// -- readDependencies --

describe("readDependencies", () => {
  test("returns empty array for empty dependencies", async () => {
    await writeArtifact();
    const deps = await ops.readDependencies(artifactPath);
    expect(deps).toEqual([]);
  });

  test("parses dependency list", async () => {
    await writeArtifact({
      dependencies: `dependencies:
  - specs/auth-spec.md
  - notes/research-log.md`,
    });

    const deps = await ops.readDependencies(artifactPath);
    expect(deps).toEqual(["specs/auth-spec.md", "notes/research-log.md"]);
  });

  test("parses single dependency", async () => {
    await writeArtifact({
      dependencies: `dependencies:
  - specs/single.md`,
    });

    const deps = await ops.readDependencies(artifactPath);
    expect(deps).toEqual(["specs/single.md"]);
  });

  test("returns empty array when no dependencies field", async () => {
    await fs.writeFile(artifactPath, `---
title: "No deps"
status: pending
---
`, "utf-8");

    const deps = await ops.readDependencies(artifactPath);
    expect(deps).toEqual([]);
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.readDependencies(missing)).rejects.toThrow(/artifact not found/);
  });
});

// -- updateProgress --

describe("updateProgress", () => {
  test("sets progress value", async () => {
    await writeArtifact();

    await ops.updateProgress(artifactPath, "Analyzing OAuth patterns");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('current_progress: "Analyzing OAuth patterns"');
  });

  test("overwrites previous progress on second call", async () => {
    await writeArtifact();

    await ops.updateProgress(artifactPath, "Step 1 done");
    await ops.updateProgress(artifactPath, "Step 2 done");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('current_progress: "Step 2 done"');
    expect(raw).not.toContain("Step 1 done");
  });

  test("preserves other frontmatter fields", async () => {
    const _original = await writeArtifact();
    await ops.updateProgress(artifactPath, "Working");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('title: "Commission: Research OAuth patterns"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain("projectName: guild-hall");
    expect(raw).toContain("status: pending");
  });

  test("escapes newlines in progress value", async () => {
    await writeArtifact();

    await ops.updateProgress(artifactPath, "Step 1 done.\nStep 2 in progress.");

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Value should be on a single line
    const progressLine = raw.split("\n").find((l) => l.startsWith("current_progress:"));
    expect(progressLine).toBeDefined();
    expect(progressLine!.includes("\n", "current_progress:".length)).toBe(false);
  });

  test("escapes quotes in progress value", async () => {
    await writeArtifact();

    await ops.updateProgress(artifactPath, 'Found a "good" pattern');

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('\\"good\\"');
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.updateProgress(missing, "test")).rejects.toThrow(/artifact not found/);
  });

  test("throws when no current_progress field exists", async () => {
    await fs.writeFile(artifactPath, `---
title: "No progress field"
status: pending
result_summary: ""
---
`, "utf-8");
    await expect(ops.updateProgress(artifactPath, "Working")).rejects.toThrow(/no "current_progress" field found/);
  });
});

// -- updateResult --

describe("updateResult", () => {
  test("writes result summary to markdown body", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, "Found 3 viable OAuth patterns");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Found 3 viable OAuth patterns");
  });

  test("overwrites previous result", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, "First result");
    await ops.updateResult(artifactPath, "Second result");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("Second result");
    expect(raw).not.toContain("First result");
  });

  test("preserves newlines in result body", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, "Line 1\nLine 2\nLine 3");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Line 1\nLine 2\nLine 3");
    // Frontmatter should still be parseable
    expect(parsed.data.projectName).toBe("guild-hall");
  });

  test("preserves quotes and backslashes in result body", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, 'Path is C:\\Users\\test and "quoted"');

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain('Path is C:\\Users\\test and "quoted"');
  });

  test("appends linked artifacts when provided", async () => {
    await writeArtifact();

    await ops.updateResult(
      artifactPath,
      "Research complete",
      ["specs/oauth-report.md", "notes/findings.md"],
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("specs/oauth-report.md");
    expect(raw).toContain("notes/findings.md");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Research complete");
  });

  test("appends to existing linked artifacts list", async () => {
    await writeArtifact({
      linked_artifacts: `linked_artifacts:
  - specs/existing.md`,
    });

    await ops.updateResult(
      artifactPath,
      "Done",
      ["specs/new.md"],
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("specs/existing.md");
    expect(raw).toContain("specs/new.md");
  });

  test("does not duplicate existing linked artifacts", async () => {
    await writeArtifact({
      linked_artifacts: `linked_artifacts:
  - specs/existing.md`,
    });

    await ops.updateResult(
      artifactPath,
      "Done",
      ["specs/existing.md"],
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    // Count occurrences of "specs/existing.md"
    const matches = raw.match(/specs\/existing\.md/g);
    expect(matches).toHaveLength(1);
  });

  test("works without artifacts parameter", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, "Done, no artifacts");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Done, no artifacts");
    expect(raw).toContain("linked_artifacts: []");
  });

  test("preserves other frontmatter fields", async () => {
    await writeArtifact();

    await ops.updateResult(artifactPath, "All done");

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('title: "Commission: Research OAuth patterns"');
    expect(raw).toContain("worker: researcher");
    expect(raw).toContain("status: pending");
    expect(raw).toContain("projectName: guild-hall");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.updateResult(missing, "test")).rejects.toThrow(/artifact not found/);
  });

  test("works even without result_summary field in frontmatter", async () => {
    await fs.writeFile(artifactPath, `---
title: "No result field"
status: pending
current_progress: ""
linked_artifacts: []
---
`, "utf-8");
    await ops.updateResult(artifactPath, "Done");
    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Done");
  });
});

// -- Cross-cutting: frontmatter integrity --

describe("frontmatter integrity", () => {
  test("gray-matter can parse frontmatter after writeStatus", async () => {
    await writeArtifact();
    await ops.writeStatus(artifactPath, "completed");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.data.status).toBe("completed");
    expect(parsed.data.title).toBe("Commission: Research OAuth patterns");
  });

  test("gray-matter can parse frontmatter after updateProgress", async () => {
    await writeArtifact();
    await ops.updateProgress(artifactPath, "Working on it\nwith newlines");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.data.current_progress).toContain("Working on it");
    expect(parsed.data.title).toBe("Commission: Research OAuth patterns");
  });

  test("gray-matter can parse frontmatter after updateResult with artifacts", async () => {
    await writeArtifact();
    await ops.updateResult(
      artifactPath,
      "Multi\nline\nresult",
      ["specs/output.md"],
    );

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.content).toContain("Multi");
    expect(parsed.content).toContain("line\nresult");
    expect(parsed.data.title).toBe("Commission: Research OAuth patterns");
    expect(parsed.data.linked_artifacts).toContain("specs/output.md");
  });

  test("gray-matter can parse frontmatter after appendTimeline", async () => {
    await writeArtifact();
    await ops.appendTimeline(artifactPath, "dispatched", "Starting work");

    const raw = await fs.readFile(artifactPath, "utf-8");
    const matter = (await import("gray-matter")).default;
    const parsed = matter(raw);
    expect(parsed.data.title).toBe("Commission: Research OAuth patterns");
    expect(parsed.data.activity_timeline).toHaveLength(2);
  });

  test("updateResult replaces markdown body with result summary", async () => {
    await writeArtifact();

    await ops.writeStatus(artifactPath, "in_progress");
    await ops.updateProgress(artifactPath, "Working");
    await ops.appendTimeline(artifactPath, "dispatched", "Started");
    await ops.updateResult(artifactPath, "Done", ["specs/output.md"]);

    const raw = await fs.readFile(artifactPath, "utf-8");
    // updateResult replaces the body with the result summary
    expect(raw).toContain("Done");
    // Original body is replaced
    expect(raw).not.toContain("# Commission Body");
    // Frontmatter is preserved
    expect(raw).toContain("status: in_progress");
    expect(raw).toContain("specs/output.md");
  });
});

// -- readType --

describe("readType", () => {
  test("returns 'one-shot' when type field is absent (backward compatibility)", async () => {
    await writeArtifact();
    const type = await ops.readType(artifactPath);
    expect(type).toBe("one-shot");
  });

  test("returns 'one-shot' for artifacts with type: one-shot", async () => {
    const content = `---
title: "Commission: Test"
date: 2026-03-09
status: pending
type: one-shot
tags: [commission]
worker: researcher
current_progress: ""
projectName: guild-hall
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
    const type = await ops.readType(artifactPath);
    expect(type).toBe("one-shot");
  });

  test("returns 'scheduled' for artifacts with type: scheduled", async () => {
    const content = `---
title: "Commission: Scheduled task"
date: 2026-03-09
status: pending
type: scheduled
source_schedule: schedule-nightly-20260309
tags: [commission]
worker: researcher
current_progress: ""
projectName: guild-hall
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
    const type = await ops.readType(artifactPath);
    expect(type).toBe("scheduled");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.readType(missing)).rejects.toThrow(/artifact not found/);
  });
});

// -- readScheduleMetadata --

/**
 * Writes a scheduled commission artifact for schedule-related tests.
 * Separate from the main writeArtifact helper because the frontmatter
 * structure differs significantly (includes schedule block, type field).
 */
async function writeScheduleArtifact(
  overrides?: Partial<{
    cron: string;
    repeat: string;
    runs_completed: number;
    last_run: string;
    last_spawned_id: string;
    status: string;
    includeScheduleBlock: boolean;
  }>,
): Promise<string> {
  const status = overrides?.status ?? "active";
  const cron = overrides?.cron ?? "0 9 * * 1";
  const repeat = overrides?.repeat ?? "null";
  const runsCompleted = overrides?.runs_completed ?? 3;
  const lastRun = overrides?.last_run ?? "2026-03-08T09:00:01.123Z";
  const lastSpawnedId = overrides?.last_spawned_id ?? "commission-guild-hall-writer-20260308-090001";
  const includeSchedule = overrides?.includeScheduleBlock ?? true;

  const scheduleBlock = includeSchedule
    ? `schedule:
  cron: "${cron}"
  repeat: ${repeat}
  runs_completed: ${runsCompleted}
  last_run: ${lastRun}
  last_spawned_id: ${lastSpawnedId}
`
    : "";

  const content = `---
title: "Commission: Weekly maintenance"
date: 2026-03-09
status: ${status}
type: scheduled
tags: [commission, scheduled]
worker: guild-hall-writer
prompt: "Run tend skill"
dependencies: []
${scheduleBlock}activity_timeline:
  - timestamp: 2026-03-01T09:00:00.000Z
    event: created
    reason: "Schedule created"
current_progress: ""
projectName: test-project
---
`;

  await fs.writeFile(artifactPath, content, "utf-8");
  return content;
}

describe("readScheduleMetadata", () => {
  test("correctly parses all schedule block fields", async () => {
    await writeScheduleArtifact();

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.cron).toBe("0 9 * * 1");
    expect(meta.repeat).toBeNull();
    expect(meta.runsCompleted).toBe(3);
    expect(meta.lastRun).toBe("2026-03-08T09:00:01.123Z");
    expect(meta.lastSpawnedId).toBe("commission-guild-hall-writer-20260308-090001");
  });

  test("handles repeat: null", async () => {
    await writeScheduleArtifact({ repeat: "null" });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.repeat).toBeNull();
  });

  test("handles repeat: 5 (numeric)", async () => {
    await writeScheduleArtifact({ repeat: "5" });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.repeat).toBe(5);
  });

  test("handles last_run: null", async () => {
    await writeScheduleArtifact({ last_run: "null" });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.lastRun).toBeNull();
  });

  test("handles last_run with ISO date", async () => {
    await writeScheduleArtifact({ last_run: "2026-03-09T12:00:00.000Z" });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.lastRun).toBe("2026-03-09T12:00:00.000Z");
  });

  test("handles last_spawned_id: null", async () => {
    await writeScheduleArtifact({ last_spawned_id: "null" });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.lastSpawnedId).toBeNull();
  });

  test("throws when schedule block is missing", async () => {
    await writeScheduleArtifact({ includeScheduleBlock: false });

    await expect(ops.readScheduleMetadata(artifactPath)).rejects.toThrow(
      /no schedule block found/,
    );
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.readScheduleMetadata(missing)).rejects.toThrow(/artifact not found/);
  });
});

// -- writeScheduleFields --

describe("writeScheduleFields", () => {
  test("updates only runs_completed, leaves other fields intact", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, { runsCompleted: 4 });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  runs_completed: 4");
    // Other schedule fields unchanged
    expect(raw).toContain('  cron: "0 9 * * 1"');
    expect(raw).toContain("  repeat: null");
    expect(raw).toContain("  last_run: 2026-03-08T09:00:01.123Z");
    expect(raw).toContain("  last_spawned_id: commission-guild-hall-writer-20260308-090001");
    // Non-schedule fields unchanged
    expect(raw).toContain("status: active");
    expect(raw).toContain('title: "Commission: Weekly maintenance"');
  });

  test("updates last_run", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, { lastRun: "2026-03-09T09:00:00.000Z" });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  last_run: 2026-03-09T09:00:00.000Z");
    // Previous value replaced
    expect(raw).not.toContain("2026-03-08T09:00:01.123Z");
  });

  test("updates last_spawned_id", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, {
      lastSpawnedId: "commission-guild-hall-writer-20260309-090000",
    });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  last_spawned_id: commission-guild-hall-writer-20260309-090000");
    expect(raw).not.toContain("commission-guild-hall-writer-20260308-090001");
  });

  test("updates cron expression", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, { cron: "0 0 * * *" });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain('  cron: "0 0 * * *"');
    expect(raw).not.toContain("0 9 * * 1");
  });

  test("sets repeat to null", async () => {
    await writeScheduleArtifact({ repeat: "10" });
    await ops.writeScheduleFields(artifactPath, { repeat: null });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  repeat: null");
    expect(raw).not.toContain("repeat: 10");
  });

  test("sets repeat to a number", async () => {
    await writeScheduleArtifact({ repeat: "null" });
    await ops.writeScheduleFields(artifactPath, { repeat: 5 });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  repeat: 5");
  });

  test("updates multiple fields at once", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, {
      runsCompleted: 4,
      lastRun: "2026-03-09T09:00:00.000Z",
      lastSpawnedId: "commission-new-20260309-090000",
    });

    const meta = await ops.readScheduleMetadata(artifactPath);
    expect(meta.runsCompleted).toBe(4);
    expect(meta.lastRun).toBe("2026-03-09T09:00:00.000Z");
    expect(meta.lastSpawnedId).toBe("commission-new-20260309-090000");
    // Untouched fields
    expect(meta.cron).toBe("0 9 * * 1");
    expect(meta.repeat).toBeNull();
  });

  test("preserves non-schedule frontmatter and body", async () => {
    await writeScheduleArtifact();
    await ops.writeScheduleFields(artifactPath, { runsCompleted: 99 });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: scheduled");
    expect(raw).toContain("worker: guild-hall-writer");
    expect(raw).toContain("event: created");
    expect(raw).toContain("projectName: test-project");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(
      ops.writeScheduleFields(missing, { runsCompleted: 1 }),
    ).rejects.toThrow(/artifact not found/);
  });
});

// -- Backward compatibility: readType without schedule block --

describe("readType backward compatibility with schedule artifacts", () => {
  test("readType works on artifacts without schedule block", async () => {
    await writeArtifact();
    const type = await ops.readType(artifactPath);
    expect(type).toBe("one-shot");
  });

  test("readType returns scheduled for schedule artifacts", async () => {
    await writeScheduleArtifact();
    const type = await ops.readType(artifactPath);
    expect(type).toBe("scheduled");
  });
});

// -- readProgress --

describe("readProgress", () => {
  test("reads empty progress", async () => {
    await writeArtifact();
    const progress = await ops.readProgress(artifactPath);
    expect(progress).toBe("");
  });

  test("reads non-empty progress", async () => {
    await writeArtifact({ current_progress: 'current_progress: "Working on step 3"' });
    const progress = await ops.readProgress(artifactPath);
    expect(progress).toBe("Working on step 3");
  });
});

// -- readTriggerMetadata --

/**
 * Writes a triggered commission artifact for trigger-related tests.
 */
async function writeTriggerArtifact(
  overrides?: Partial<{
    status: string;
    includeTriggerBlock: boolean;
    approval: string;
    maxDepth: number;
    runs_completed: number;
    last_triggered: string;
    last_spawned_id: string;
    matchType: string;
    fields: string;
  }>,
): Promise<string> {
  const status = overrides?.status ?? "active";
  const matchType = overrides?.matchType ?? "commission_result";
  const approval = overrides?.approval ?? "auto";
  const maxDepth = overrides?.maxDepth ?? 3;
  const runsCompleted = overrides?.runs_completed ?? 2;
  const lastTriggered = overrides?.last_triggered ?? "2026-03-20T12:00:00.000Z";
  const lastSpawnedId = overrides?.last_spawned_id ?? "commission-Thorne-20260320-120000";
  const includeTrigger = overrides?.includeTriggerBlock ?? true;
  const fieldsLine = overrides?.fields ?? `      status: completed`;

  const triggerBlock = includeTrigger
    ? `trigger:
  match:
    type: ${matchType}
${fieldsLine ? `    fields:\n${fieldsLine}\n` : ""}  approval: ${approval}
  maxDepth: ${maxDepth}
  runs_completed: ${runsCompleted}
  last_triggered: ${lastTriggered}
  last_spawned_id: ${lastSpawnedId}
`
    : "";

  const content = `---
title: "Commission: Auto-review trigger"
date: 2026-03-20
status: ${status}
type: triggered
tags: [commission, triggered]
worker: guild-hall-reviewer
prompt: "Review the completed commission"
dependencies: []
${triggerBlock}activity_timeline:
  - timestamp: 2026-03-20T10:00:00.000Z
    event: created
    reason: "Trigger created"
current_progress: ""
projectName: test-project
---
`;

  await fs.writeFile(artifactPath, content, "utf-8");
  return content;
}

describe("readTriggerMetadata", () => {
  test("correctly parses all trigger block fields including match with fields", async () => {
    await writeTriggerArtifact();

    const meta = await ops.readTriggerMetadata(artifactPath);
    expect(meta.match.type).toBe("commission_result");
    expect(meta.match.fields).toEqual({ status: "completed" });
    expect(meta.approval).toBe("auto");
    expect(meta.maxDepth).toBe(3);
    expect(meta.runs_completed).toBe(2);
    expect(meta.last_triggered).toBe("2026-03-20T12:00:00.000Z");
    expect(meta.last_spawned_id).toBe("commission-Thorne-20260320-120000");
  });

  test("handles null last_triggered and last_spawned_id", async () => {
    await writeTriggerArtifact({
      last_triggered: "null",
      last_spawned_id: "null",
    });

    const meta = await ops.readTriggerMetadata(artifactPath);
    expect(meta.last_triggered).toBeNull();
    expect(meta.last_spawned_id).toBeNull();
  });

  test("throws when no trigger block present", async () => {
    await writeTriggerArtifact({ includeTriggerBlock: false });

    await expect(ops.readTriggerMetadata(artifactPath)).rejects.toThrow(
      /no trigger block found/,
    );
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(ops.readTriggerMetadata(missing)).rejects.toThrow(/artifact not found/);
  });

  test("coerces gray-matter-parsed field values to strings", async () => {
    // gray-matter coerces "true" to boolean and "123" to number in YAML.
    // The fields Record<string, string> contract must survive this.
    await writeTriggerArtifact({
      fields: "      enabled: true\n      count: 123",
    });

    const meta = await ops.readTriggerMetadata(artifactPath);
    expect(meta.match.fields).toEqual({ enabled: "true", count: "123" });
    // Verify values are strings, not their coerced types
    expect(typeof meta.match.fields!.enabled).toBe("string");
    expect(typeof meta.match.fields!.count).toBe("string");
  });
});

// -- writeTriggerFields --

describe("writeTriggerFields", () => {
  test("updates only runs_completed, leaves other fields intact", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, { runs_completed: 5 });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  runs_completed: 5");
    expect(raw).toContain("  last_triggered: 2026-03-20T12:00:00.000Z");
    expect(raw).toContain("  last_spawned_id: commission-Thorne-20260320-120000");
  });

  test("updates last_triggered", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, { last_triggered: "2026-03-21T09:00:00.000Z" });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  last_triggered: 2026-03-21T09:00:00.000Z");
  });

  test("updates last_spawned_id", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, {
      last_spawned_id: "commission-Dalton-20260321-150000",
    });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  last_spawned_id: commission-Dalton-20260321-150000");
  });

  test("sets last_triggered to null", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, { last_triggered: null });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("  last_triggered: null");
  });

  test("updates multiple fields at once", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, {
      runs_completed: 10,
      last_triggered: "2026-03-21T15:00:00.000Z",
      last_spawned_id: "commission-Dalton-20260321-150000",
    });

    const meta = await ops.readTriggerMetadata(artifactPath);
    expect(meta.runs_completed).toBe(10);
    expect(meta.last_triggered).toBe("2026-03-21T15:00:00.000Z");
    expect(meta.last_spawned_id).toBe("commission-Dalton-20260321-150000");
  });

  test("preserves non-trigger frontmatter and body", async () => {
    await writeTriggerArtifact();
    await ops.writeTriggerFields(artifactPath, { runs_completed: 99 });

    const raw = await fs.readFile(artifactPath, "utf-8");
    expect(raw).toContain("type: triggered");
    expect(raw).toContain("worker: guild-hall-reviewer");
    expect(raw).toContain("activity_timeline:");
  });

  test("throws on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    await expect(
      ops.writeTriggerFields(missing, { runs_completed: 1 }),
    ).rejects.toThrow(/artifact not found/);
  });
});

// -- readTriggeredBy --

/**
 * Writes a commission artifact with a triggered_by block.
 */
async function writeTriggeredByArtifact(
  overrides?: Partial<{
    includeTriggeredBy: boolean;
    source_id: string;
    trigger_artifact: string;
    depth: number;
  }>,
): Promise<string> {
  const includeBlock = overrides?.includeTriggeredBy ?? true;
  const sourceId = overrides?.source_id ?? "commission-Dalton-20260320-100000";
  const triggerArtifact = overrides?.trigger_artifact ?? "commission-auto-review-trigger-20260301-000000";
  const depth = overrides?.depth ?? 1;

  const triggeredByBlock = includeBlock
    ? `triggered_by:
  source_id: ${sourceId}
  trigger_artifact: ${triggerArtifact}
  depth: ${depth}
`
    : "";

  const content = `---
title: "Commission: Auto review"
date: 2026-03-20
status: pending
type: one-shot
${triggeredByBlock}tags: [commission]
worker: guild-hall-reviewer
prompt: "Review the thing"
dependencies: []
linked_artifacts: []
activity_timeline:
  - timestamp: 2026-03-20T12:00:00.000Z
    event: created
    reason: "Commission created by trigger"
current_progress: ""
projectName: test-project
---
`;

  await fs.writeFile(artifactPath, content, "utf-8");
  return content;
}

describe("readTriggeredBy", () => {
  test("returns the block when present", async () => {
    await writeTriggeredByArtifact();

    const result = await ops.readTriggeredBy(artifactPath);
    expect(result).not.toBeNull();
    expect(result!.source_id).toBe("commission-Dalton-20260320-100000");
    expect(result!.trigger_artifact).toBe("commission-auto-review-trigger-20260301-000000");
    expect(result!.depth).toBe(1);
  });

  test("returns null when absent", async () => {
    await writeTriggeredByArtifact({ includeTriggeredBy: false });

    const result = await ops.readTriggeredBy(artifactPath);
    expect(result).toBeNull();
  });

  test("returns null gracefully on nonexistent file", async () => {
    const missing = path.join(tmpDir, "does-not-exist.md");
    const result = await ops.readTriggeredBy(missing);
    expect(result).toBeNull();
  });

  test("returns correct depth value", async () => {
    await writeTriggeredByArtifact({ depth: 3 });

    const result = await ops.readTriggeredBy(artifactPath);
    expect(result).not.toBeNull();
    expect(result!.depth).toBe(3);
  });
});

// -- Factory --

describe("readSource (REQ-HBT-45)", () => {
  test("reads source from artifact with source block", async () => {
    const content = `---
title: "Commission: Test"
date: 2026-04-01
status: pending
tags: [commission]
source:
  description: "Heartbeat: dispatch review after implementation"
worker: tester
prompt: "Do the thing"
dependencies: []
linked_artifacts: []
activity_timeline:
  - timestamp: 2026-04-01T10:00:00.000Z
    event: created
    reason: "Commission created (Heartbeat: dispatch review after implementation)"
current_progress: ""
projectName: test-project
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
    const source = await ops.readSource(artifactPath);
    expect(source).not.toBeNull();
    expect(source!.description).toBe("Heartbeat: dispatch review after implementation");
  });

  test("returns null for artifact without source block", async () => {
    const content = `---
title: "Commission: Test"
date: 2026-04-01
status: pending
tags: [commission]
worker: tester
prompt: "Do the thing"
dependencies: []
linked_artifacts: []
activity_timeline:
  - timestamp: 2026-04-01T10:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: test-project
---
`;
    await fs.writeFile(artifactPath, content, "utf-8");
    const source = await ops.readSource(artifactPath);
    expect(source).toBeNull();
  });

  test("returns null for nonexistent artifact", async () => {
    const source = await ops.readSource(path.join(tmpDir, "nonexistent.md"));
    expect(source).toBeNull();
  });
});

describe("createCommissionRecordOps", () => {
  test("returns an object implementing all fifteen methods", () => {
    const recordOps = createCommissionRecordOps();
    expect(typeof recordOps.readStatus).toBe("function");
    expect(typeof recordOps.readType).toBe("function");
    expect(typeof recordOps.writeStatus).toBe("function");
    expect(typeof recordOps.appendTimeline).toBe("function");
    expect(typeof recordOps.readDependencies).toBe("function");
    expect(typeof recordOps.updateProgress).toBe("function");
    expect(typeof recordOps.updateResult).toBe("function");
    expect(typeof recordOps.readProgress).toBe("function");
    expect(typeof recordOps.readScheduleMetadata).toBe("function");
    expect(typeof recordOps.writeScheduleFields).toBe("function");
    expect(typeof recordOps.readTriggerMetadata).toBe("function");
    expect(typeof recordOps.writeTriggerFields).toBe("function");
    expect(typeof recordOps.readTriggeredBy).toBe("function");
    expect(typeof recordOps.readSource).toBe("function");
  });
});
