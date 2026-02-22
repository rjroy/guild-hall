import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readCommissionMeta,
  scanCommissions,
  parseActivityTimeline,
} from "@/lib/commissions";

let tmpDir: string;
let lorePath: string;
let commissionsDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commissions-lib-"));
  lorePath = path.join(tmpDir, ".lore");
  commissionsDir = path.join(lorePath, "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a commission artifact file with the given frontmatter content.
 */
async function writeCommission(
  filename: string,
  frontmatter: string,
  body: string = "",
): Promise<string> {
  const filePath = path.join(commissionsDir, filename);
  const content = `---\n${frontmatter}\n---\n${body}`;
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

const STANDARD_FRONTMATTER = `title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: pending
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools"
dependencies:
  - specs/auth-requirements.md
linked_artifacts:
  - notes/oauth-notes.md
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: "Analyzing patterns"
result_summary: ""
projectName: guild-hall`;

// -- readCommissionMeta --

describe("readCommissionMeta", () => {
  test("parses standard commission frontmatter correctly", async () => {
    const filePath = await writeCommission(
      "commission-researcher-20260221-143000.md",
      STANDARD_FRONTMATTER,
    );

    const meta = await readCommissionMeta(filePath, "guild-hall");

    expect(meta.commissionId).toBe("commission-researcher-20260221-143000");
    expect(meta.title).toBe("Commission: Research OAuth patterns");
    expect(meta.status).toBe("pending");
    expect(meta.worker).toBe("researcher");
    expect(meta.workerDisplayTitle).toBe("Research Specialist");
    expect(meta.prompt).toBe("Research OAuth 2.0 patterns for CLI tools");
    expect(meta.dependencies).toEqual(["specs/auth-requirements.md"]);
    expect(meta.linked_artifacts).toEqual(["notes/oauth-notes.md"]);
    expect(meta.resource_overrides).toEqual({ maxTurns: 150, maxBudgetUsd: 1.00 });
    expect(meta.current_progress).toBe("Analyzing patterns");
    expect(meta.result_summary).toBe("");
    expect(meta.projectName).toBe("guild-hall");
    expect(meta.date).toBe("2026-02-21");
  });

  test("extracts commissionId from filename", async () => {
    const filePath = await writeCommission(
      "commission-writer-20260301-090000.md",
      `title: Test\nstatus: pending\nworker: writer`,
    );

    const meta = await readCommissionMeta(filePath, "my-project");
    expect(meta.commissionId).toBe("commission-writer-20260301-090000");
  });

  test("returns safe defaults for malformed frontmatter", async () => {
    const filePath = path.join(commissionsDir, "bad.md");
    await fs.writeFile(filePath, "not valid yaml frontmatter at all", "utf-8");

    const meta = await readCommissionMeta(filePath, "test-project");

    expect(meta.commissionId).toBe("bad");
    expect(meta.title).toBe("");
    expect(meta.status).toBe("");
    expect(meta.worker).toBe("");
    expect(meta.dependencies).toEqual([]);
    expect(meta.linked_artifacts).toEqual([]);
    expect(meta.resource_overrides).toEqual({});
    expect(meta.current_progress).toBe("");
    expect(meta.result_summary).toBe("");
    expect(meta.projectName).toBe("test-project");
  });

  test("handles missing optional fields gracefully", async () => {
    const filePath = await writeCommission(
      "minimal.md",
      `title: Minimal\nstatus: pending`,
    );

    const meta = await readCommissionMeta(filePath, "test-project");

    expect(meta.title).toBe("Minimal");
    expect(meta.status).toBe("pending");
    expect(meta.worker).toBe("");
    expect(meta.prompt).toBe("");
    expect(meta.dependencies).toEqual([]);
    expect(meta.linked_artifacts).toEqual([]);
    expect(meta.resource_overrides).toEqual({
      maxTurns: undefined,
      maxBudgetUsd: undefined,
    });
    expect(meta.current_progress).toBe("");
    expect(meta.result_summary).toBe("");
  });
});

// -- scanCommissions --

describe("scanCommissions", () => {
  test("returns all commissions in directory", async () => {
    await writeCommission(
      "commission-a.md",
      `title: Commission A\nstatus: pending\nworker: researcher`,
    );
    await writeCommission(
      "commission-b.md",
      `title: Commission B\nstatus: completed\nworker: writer`,
    );

    const results = await scanCommissions(lorePath, "test-project");

    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(["Commission A", "Commission B"]);
  });

  test("returns empty array for missing directory", async () => {
    const missingPath = path.join(tmpDir, "nonexistent");
    const results = await scanCommissions(missingPath, "test-project");
    expect(results).toEqual([]);
  });

  test("skips non-.md files", async () => {
    await writeCommission(
      "commission-a.md",
      `title: Commission A\nstatus: pending`,
    );
    await fs.writeFile(
      path.join(commissionsDir, "readme.txt"),
      "not a commission",
      "utf-8",
    );

    const results = await scanCommissions(lorePath, "test-project");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Commission A");
  });

  test("sets projectName on all returned commissions", async () => {
    await writeCommission(
      "commission-a.md",
      `title: Test\nstatus: pending`,
    );

    const results = await scanCommissions(lorePath, "my-project");
    expect(results[0].projectName).toBe("my-project");
  });
});

// -- parseActivityTimeline --

describe("parseActivityTimeline", () => {
  test("parses entries correctly", () => {
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
    expect(entries[0]).toEqual({
      timestamp: "2026-02-21T14:30:00.000Z",
      event: "created",
      reason: "User created commission",
    });
    expect(entries[1]).toEqual({
      timestamp: "2026-02-21T15:00:00.000Z",
      event: "dispatched",
      reason: "Worker started",
    });
  });

  test("returns empty array when no timeline section exists", () => {
    const raw = `---
title: Something
status: pending
---
Some body content.
`;
    const entries = parseActivityTimeline(raw);
    expect(entries).toEqual([]);
  });

  test("handles single entry", () => {
    const raw = `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Initial creation"
current_progress: ""
`;
    const entries = parseActivityTimeline(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("created");
  });

  test("strips quotes from values", () => {
    const raw = `activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "Quoted reason"
current_progress: ""
`;
    const entries = parseActivityTimeline(raw);
    expect(entries[0].reason).toBe("Quoted reason");
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
    expect(entries[0].detail).toBe("What format?");
  });
});
