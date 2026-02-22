import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeLinkArtifactHandler,
  makeProposeFollowupHandler,
  makeSummarizeProgressHandler,
} from "@/daemon/services/meeting-toolbox";

let tmpDir: string;
let projectPath: string;
let meetingId: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mtg-toolbox-"));
  projectPath = path.join(tmpDir, "test-project");
  meetingId = "audience-test-worker-20260221-100000";

  // Create .lore/meetings/ directory
  await fs.mkdir(path.join(projectPath, ".lore", "meetings"), {
    recursive: true,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a minimal meeting artifact for testing. Uses the same template
 * format as writeMeetingArtifact in meeting-session.ts.
 */
async function writeMeetingArtifact(
  projPath: string,
  mtgId: string,
  opts?: { linkedArtifacts?: string[] },
): Promise<void> {
  const artifactPath = path.join(
    projPath,
    ".lore",
    "meetings",
    `${mtgId}.md`,
  );
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });

  const linked = opts?.linkedArtifacts ?? [];
  const linkedYaml =
    linked.length === 0
      ? "linked_artifacts: []"
      : "linked_artifacts:\n" + linked.map((a) => `  - ${a}`).join("\n");

  const content = `---
title: "Audience with Test Worker"
date: 2026-02-21
status: open
tags: [meeting]
worker: test-worker
workerDisplayTitle: "Test Worker"
agenda: "Test agenda"
deferred_until: ""
${linkedYaml}
meeting_log:
  - timestamp: 2026-02-21T10:00:00.000Z
    event: opened
    reason: "User started audience"
notes_summary: ""
---
`;
  await fs.writeFile(artifactPath, content, "utf-8");
}

/**
 * Creates a test artifact file in the project's .lore/ directory.
 */
async function writeTestArtifact(
  projPath: string,
  relPath: string,
): Promise<void> {
  const fullPath = path.join(projPath, ".lore", relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(
    fullPath,
    `---\ntitle: "Test"\ndate: 2026-02-21\nstatus: draft\ntags: []\n---\nTest content\n`,
    "utf-8",
  );
}

// -- link_artifact tests --

describe("link_artifact", () => {
  test("adds artifact path to linked_artifacts", async () => {
    await writeMeetingArtifact(projectPath, meetingId);
    await writeTestArtifact(projectPath, "specs/api-design.md");

    const handler = makeLinkArtifactHandler(projectPath, meetingId);
    const result = await handler({ artifactPath: "specs/api-design.md" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Linked artifact: specs/api-design.md");

    // Verify the artifact was updated
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${meetingId}.md`),
      "utf-8",
    );
    expect(raw).toContain("linked_artifacts:\n  - specs/api-design.md");
    expect(raw).not.toContain("linked_artifacts: []");
  });

  test("appends to existing linked_artifacts", async () => {
    await writeMeetingArtifact(projectPath, meetingId, {
      linkedArtifacts: ["specs/existing.md"],
    });
    await writeTestArtifact(projectPath, "specs/new-one.md");

    const handler = makeLinkArtifactHandler(projectPath, meetingId);
    const result = await handler({ artifactPath: "specs/new-one.md" });

    expect(result.isError).toBeUndefined();

    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${meetingId}.md`),
      "utf-8",
    );
    expect(raw).toContain("  - specs/existing.md");
    expect(raw).toContain("  - specs/new-one.md");
  });

  test("deduplicates: linking same path twice returns 'already linked'", async () => {
    await writeMeetingArtifact(projectPath, meetingId);
    await writeTestArtifact(projectPath, "specs/api-design.md");

    const handler = makeLinkArtifactHandler(projectPath, meetingId);

    // Link once
    await handler({ artifactPath: "specs/api-design.md" });

    // Link again
    const result = await handler({ artifactPath: "specs/api-design.md" });
    expect(result.content[0].text).toBe(
      "Already linked: specs/api-design.md",
    );
  });

  test("returns error for nonexistent artifact", async () => {
    await writeMeetingArtifact(projectPath, meetingId);

    const handler = makeLinkArtifactHandler(projectPath, meetingId);
    const result = await handler({ artifactPath: "specs/nonexistent.md" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Artifact not found: specs/nonexistent.md",
    );
  });

  test("rejects path traversal attempts", async () => {
    await writeMeetingArtifact(projectPath, meetingId);

    const handler = makeLinkArtifactHandler(projectPath, meetingId);
    const result = await handler({ artifactPath: "../../secret.md" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path traversal rejected");
  });
});

// -- propose_followup tests --

describe("propose_followup", () => {
  test("creates a request artifact with correct frontmatter", async () => {
    const handler = makeProposeFollowupHandler(
      projectPath,
      meetingId,
      "test-worker",
    );
    const result = await handler({
      reason: "Need to review API changes",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(
      /^Follow-up meeting proposed: followup-test-worker-/,
    );

    // Extract the follow-up ID from the result
    const followupId = result.content[0].text.replace(
      "Follow-up meeting proposed: ",
      "",
    );

    // Read the created artifact
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${followupId}.md`),
      "utf-8",
    );

    expect(raw).toContain("status: requested");
    expect(raw).toContain("worker: test-worker");
    expect(raw).toContain('agenda: "Need to review API changes"');
    expect(raw).toContain("linked_artifacts: []");
    expect(raw).toContain("event: requested");
    expect(raw).toContain(
      `Worker proposed follow-up from meeting ${meetingId}`,
    );
  });

  test("generates ID with followup- prefix", async () => {
    const handler = makeProposeFollowupHandler(
      projectPath,
      meetingId,
      "test-worker",
    );
    const result = await handler({ reason: "Continue work" });

    expect(result.content[0].text).toMatch(
      /^Follow-up meeting proposed: followup-test-worker-\d{8}-\d{6}$/,
    );
  });

  test("includes referenced artifacts in frontmatter", async () => {
    const handler = makeProposeFollowupHandler(
      projectPath,
      meetingId,
      "test-worker",
    );
    const result = await handler({
      reason: "Continue work",
      referencedArtifacts: ["specs/api.md", "notes/review.md"],
    });

    const followupId = result.content[0].text.replace(
      "Follow-up meeting proposed: ",
      "",
    );
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${followupId}.md`),
      "utf-8",
    );

    expect(raw).toContain("linked_artifacts:\n  - specs/api.md\n  - notes/review.md");
  });

  test("handles empty referencedArtifacts", async () => {
    const handler = makeProposeFollowupHandler(
      projectPath,
      meetingId,
      "test-worker",
    );
    const result = await handler({
      reason: "Continue work",
      referencedArtifacts: [],
    });

    const followupId = result.content[0].text.replace(
      "Follow-up meeting proposed: ",
      "",
    );
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${followupId}.md`),
      "utf-8",
    );

    expect(raw).toContain("linked_artifacts: []");
  });
});

// -- summarize_progress tests --

describe("summarize_progress", () => {
  test("appends progress_summary event to meeting log", async () => {
    await writeMeetingArtifact(projectPath, meetingId);

    const handler = makeSummarizeProgressHandler(projectPath, meetingId);
    const result = await handler({
      summary: "Completed initial API review",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Progress summary recorded");

    // Verify the log entry was added
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${meetingId}.md`),
      "utf-8",
    );
    expect(raw).toContain("event: progress_summary");
    expect(raw).toContain("Completed initial API review");
  });

  test("preserves existing meeting log entries", async () => {
    await writeMeetingArtifact(projectPath, meetingId);

    const handler = makeSummarizeProgressHandler(projectPath, meetingId);
    await handler({ summary: "First checkpoint" });
    await handler({ summary: "Second checkpoint" });

    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "meetings", `${meetingId}.md`),
      "utf-8",
    );
    expect(raw).toContain("event: opened");
    expect(raw).toContain("First checkpoint");
    expect(raw).toContain("Second checkpoint");
  });
});
