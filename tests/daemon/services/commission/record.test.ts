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
  test("returns an object implementing all nine methods", () => {
    const recordOps = createCommissionRecordOps();
    expect(typeof recordOps.readStatus).toBe("function");
    expect(typeof recordOps.writeStatus).toBe("function");
    expect(typeof recordOps.appendTimeline).toBe("function");
    expect(typeof recordOps.readDependencies).toBe("function");
    expect(typeof recordOps.updateProgress).toBe("function");
    expect(typeof recordOps.updateResult).toBe("function");
    expect(typeof recordOps.readProgress).toBe("function");
    expect(typeof recordOps.writeStatusAndTimeline).toBe("function");
    expect(typeof recordOps.readSource).toBe("function");
  });
});
