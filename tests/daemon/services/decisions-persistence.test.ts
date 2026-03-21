import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readDecisions,
  formatDecisionsSection,
  appendDecisionsToArtifact,
  type DecisionEntry,
} from "@/daemon/services/decisions-persistence";
import { makeRecordDecisionHandler } from "@/daemon/services/base-toolbox";

let tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "decisions-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// -- Phase 1: readDecisions --

describe("readDecisions", () => {
  test("returns empty array when file does not exist (REQ-DSRF-1)", async () => {
    const tmpDir = await makeTmpDir();
    const result = await readDecisions(tmpDir, "commissions", "nonexistent-id", "commissions");
    expect(result).toEqual([]);
  });

  test("returns empty array for empty file (REQ-DSRF-1)", async () => {
    const tmpDir = await makeTmpDir();
    const dir = path.join(tmpDir, "state", "commissions", "c-empty");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "decisions.jsonl"), "", "utf-8");

    const result = await readDecisions(tmpDir, "commissions", "c-empty", "commissions");
    expect(result).toEqual([]);
  });

  test("returns parsed entries in order (REQ-DSRF-1)", async () => {
    const tmpDir = await makeTmpDir();
    const dir = path.join(tmpDir, "state", "commissions", "c-valid");
    await fs.mkdir(dir, { recursive: true });

    const entries = [
      { timestamp: "2026-03-20T10:00:00Z", question: "Q1", decision: "D1", reasoning: "R1" },
      { timestamp: "2026-03-20T10:01:00Z", question: "Q2", decision: "D2", reasoning: "R2" },
    ];
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fs.writeFile(path.join(dir, "decisions.jsonl"), jsonl, "utf-8");

    const result = await readDecisions(tmpDir, "commissions", "c-valid", "commissions");
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe("Q1");
    expect(result[1].question).toBe("Q2");
  });

  test("skips malformed lines, returns valid entries (REQ-DSRF-1)", async () => {
    const tmpDir = await makeTmpDir();
    const dir = path.join(tmpDir, "state", "commissions", "c-mixed");
    await fs.mkdir(dir, { recursive: true });

    const valid = { timestamp: "2026-03-20T10:00:00Z", question: "Q1", decision: "D1", reasoning: "R1" };
    const lines = [JSON.stringify(valid), "not valid json", "", JSON.stringify({ ...valid, question: "Q2" })];
    await fs.writeFile(path.join(dir, "decisions.jsonl"), lines.join("\n") + "\n", "utf-8");

    const result = await readDecisions(tmpDir, "commissions", "c-mixed", "commissions");
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe("Q1");
    expect(result[1].question).toBe("Q2");
  });

  test("path resolution matches makeRecordDecisionHandler (REQ-DSRF-7)", async () => {
    const tmpDir = await makeTmpDir();
    const contextId = "c-roundtrip";
    const contextType = "commissions";
    const stateSubdir = "commissions";

    // Write via the handler
    const handler = makeRecordDecisionHandler(tmpDir, contextId, contextType, stateSubdir);
    await handler({ question: "Should we use X?", decision: "Yes", reasoning: "Because Y" });

    // Read via readDecisions with the same parameters
    const result = await readDecisions(tmpDir, contextType, contextId, stateSubdir);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("Should we use X?");
    expect(result[0].decision).toBe("Yes");
    expect(result[0].reasoning).toBe("Because Y");
  });

  test("path resolution works for meetings stateSubdir", async () => {
    const tmpDir = await makeTmpDir();
    const contextId = "m-roundtrip";
    const stateSubdir = "meetings";

    const handler = makeRecordDecisionHandler(tmpDir, contextId, "meetings", stateSubdir);
    await handler({ question: "Meeting Q", decision: "Meeting D", reasoning: "Meeting R" });

    const result = await readDecisions(tmpDir, "meetings", contextId, stateSubdir);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("Meeting Q");
  });
});

// -- Phase 1: formatDecisionsSection --

describe("formatDecisionsSection", () => {
  test("returns empty string for empty array (REQ-DSRF-5)", () => {
    expect(formatDecisionsSection([])).toBe("");
  });

  test("formats single entry correctly (REQ-DSRF-2)", () => {
    const entries: DecisionEntry[] = [
      { timestamp: "2026-03-20T10:00:00Z", question: "Use X?", decision: "Yes, use X.", reasoning: "Because Y." },
    ];
    const result = formatDecisionsSection(entries);

    expect(result).toContain("## Decisions");
    expect(result).toContain("**Use X?**");
    expect(result).toContain("Yes, use X.");
    expect(result).toContain("*Reasoning: Because Y.*");
  });

  test("formats multiple entries in order (REQ-DSRF-2)", () => {
    const entries: DecisionEntry[] = [
      { timestamp: "2026-03-20T10:00:00Z", question: "Q1", decision: "D1", reasoning: "R1" },
      { timestamp: "2026-03-20T10:01:00Z", question: "Q2", decision: "D2", reasoning: "R2" },
    ];
    const result = formatDecisionsSection(entries);

    const q1Pos = result.indexOf("**Q1**");
    const q2Pos = result.indexOf("**Q2**");
    expect(q1Pos).toBeLessThan(q2Pos);
    expect(result).toContain("*Reasoning: R1*");
    expect(result).toContain("*Reasoning: R2*");
  });
});

// -- Phase 1: appendDecisionsToArtifact --

describe("appendDecisionsToArtifact", () => {
  test("appends section to artifact with frontmatter and body (REQ-DSRF-8)", async () => {
    const tmpDir = await makeTmpDir();
    const artifactPath = path.join(tmpDir, "artifact.md");

    const frontmatter = "---\ntitle: Test\nstatus: completed\n---\n";
    const body = "\nSome body content.\n";
    const original = frontmatter + body;
    await fs.writeFile(artifactPath, original, "utf-8");

    const section = formatDecisionsSection([
      { timestamp: "2026-03-20T10:00:00Z", question: "Q1", decision: "D1", reasoning: "R1" },
    ]);

    await appendDecisionsToArtifact(artifactPath, section);

    const result = await fs.readFile(artifactPath, "utf-8");

    // Frontmatter preserved byte-for-byte
    expect(result.startsWith(frontmatter)).toBe(true);
    // Original body preserved
    expect(result).toContain("Some body content.");
    // Decisions section appended
    expect(result).toContain("## Decisions");
    expect(result).toContain("**Q1**");
  });

  test("appends correctly after frontmatter with no existing body", async () => {
    const tmpDir = await makeTmpDir();
    const artifactPath = path.join(tmpDir, "artifact.md");

    const original = "---\ntitle: Test\nstatus: completed\n---\n";
    await fs.writeFile(artifactPath, original, "utf-8");

    const section = formatDecisionsSection([
      { timestamp: "2026-03-20T10:00:00Z", question: "Q1", decision: "D1", reasoning: "R1" },
    ]);

    await appendDecisionsToArtifact(artifactPath, section);

    const result = await fs.readFile(artifactPath, "utf-8");

    expect(result.startsWith(original)).toBe(true);
    expect(result).toContain("## Decisions");
  });
});

// -- Phase 2: Commission hook integration --

describe("commission hook integration", () => {
  test("end-to-end: writes decisions via handler, reads and appends to artifact (REQ-DSRF-3)", async () => {
    const tmpDir = await makeTmpDir();
    const commissionId = "commission-Test-20260320-120000";

    // Write decisions via the handler
    const handler = makeRecordDecisionHandler(tmpDir, commissionId, "commissions", "commissions");
    await handler({ question: "Use approach A?", decision: "Yes", reasoning: "More maintainable" });
    await handler({ question: "Include Phase 3?", decision: "Defer", reasoning: "Out of scope" });

    // Create a commission artifact with frontmatter and body
    const artifactDir = path.join(tmpDir, "worktree", ".lore", "commissions");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${commissionId}.md`);
    const frontmatter = "---\nworker: Dalton\ntask: Build feature\nstatus: completed\n---\n";
    const body = "\n## Result\n\nFeature built successfully.\n";
    await fs.writeFile(artifactPath, frontmatter + body, "utf-8");

    // Run the hook logic
    const decisions = await readDecisions(tmpDir, "commissions", commissionId, "commissions");
    const section = formatDecisionsSection(decisions);
    expect(section).not.toBe("");
    await appendDecisionsToArtifact(artifactPath, section);

    // Verify
    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result.startsWith(frontmatter)).toBe(true);
    expect(result).toContain("## Result");
    expect(result).toContain("## Decisions");
    expect(result).toContain("**Use approach A?**");
    expect(result).toContain("**Include Phase 3?**");
    expect(result).toContain("*Reasoning: More maintainable*");
  });

  test("no decisions: artifact unchanged (REQ-DSRF-5)", async () => {
    const tmpDir = await makeTmpDir();
    const commissionId = "commission-Test-20260320-130000";

    // Create artifact but no decisions
    const artifactDir = path.join(tmpDir, "worktree", ".lore", "commissions");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${commissionId}.md`);
    const original = "---\nworker: Dalton\nstatus: completed\n---\n\n## Result\n\nDone.\n";
    await fs.writeFile(artifactPath, original, "utf-8");

    // Run the hook logic
    const decisions = await readDecisions(tmpDir, "commissions", commissionId, "commissions");
    const section = formatDecisionsSection(decisions);
    expect(section).toBe("");

    // Artifact should be untouched
    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result).toBe(original);
  });

  test("frontmatter preserved byte-for-byte (REQ-DSRF-8)", async () => {
    const tmpDir = await makeTmpDir();
    const commissionId = "commission-Test-20260320-140000";

    const handler = makeRecordDecisionHandler(tmpDir, commissionId, "commissions", "commissions");
    await handler({ question: "Q", decision: "D", reasoning: "R" });

    const artifactDir = path.join(tmpDir, "worktree", ".lore", "commissions");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${commissionId}.md`);
    // Frontmatter with special characters that gray-matter might reformat
    const frontmatter = '---\nworker: Dalton\ntask: "Build: the thing"\nstatus: completed\nlinked_artifacts:\n  - specs/widget.md\n  - plans/widget.md\n---\n';
    const body = "\nBody content.\n";
    await fs.writeFile(artifactPath, frontmatter + body, "utf-8");

    const decisions = await readDecisions(tmpDir, "commissions", commissionId, "commissions");
    const section = formatDecisionsSection(decisions);
    await appendDecisionsToArtifact(artifactPath, section);

    const afterContent = await fs.readFile(artifactPath, "utf-8");
    // Frontmatter bytes identical
    expect(afterContent.startsWith(frontmatter)).toBe(true);
    // Original body still present
    expect(afterContent).toContain("Body content.");
    // Decisions appended
    expect(afterContent).toContain("## Decisions");
  });
});

// -- Phase 3: Meeting hook integration --

describe("meeting hook integration", () => {
  test("end-to-end: writes decisions via handler with meetings stateSubdir (REQ-DSRF-4)", async () => {
    const tmpDir = await makeTmpDir();
    const meetingId = "meeting-20260320-120000";

    // Write decisions via the handler with meetings stateSubdir
    const handler = makeRecordDecisionHandler(tmpDir, meetingId, "meetings", "meetings");
    await handler({ question: "Use event-driven?", decision: "Yes", reasoning: "Better decoupling" });

    // Create a meeting artifact with notes
    const artifactDir = path.join(tmpDir, "worktree", ".lore", "meetings");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${meetingId}.md`);
    const frontmatter = '---\nworker: "Guild Master"\nagenda: "Discuss architecture"\nstatus: closed\n---\n';
    const notes = "\n## Meeting Notes\n\nDiscussed event-driven approach.\n";
    await fs.writeFile(artifactPath, frontmatter + notes, "utf-8");

    // Run hook logic
    const decisions = await readDecisions(tmpDir, "meetings", meetingId, "meetings");
    const section = formatDecisionsSection(decisions);
    expect(section).not.toBe("");
    await appendDecisionsToArtifact(artifactPath, section);

    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result.startsWith(frontmatter)).toBe(true);
    expect(result).toContain("## Meeting Notes");
    expect(result).toContain("## Decisions");
    expect(result).toContain("**Use event-driven?**");
  });

  test("no decisions: artifact with notes unchanged (REQ-DSRF-5)", async () => {
    const tmpDir = await makeTmpDir();
    const meetingId = "meeting-20260320-130000";

    const artifactDir = path.join(tmpDir, "worktree", ".lore", "meetings");
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${meetingId}.md`);
    const original = '---\nworker: "Guild Master"\nstatus: closed\n---\n\n## Meeting Notes\n\nSome notes.\n';
    await fs.writeFile(artifactPath, original, "utf-8");

    const decisions = await readDecisions(tmpDir, "meetings", meetingId, "meetings");
    const section = formatDecisionsSection(decisions);
    expect(section).toBe("");

    const result = await fs.readFile(artifactPath, "utf-8");
    expect(result).toBe(original);
  });
});
