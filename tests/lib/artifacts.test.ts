import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  scanArtifacts,
  readArtifact,
  writeArtifactContent,
  writeRawArtifactContent,
  recentArtifacts,
  compareArtifactsByRecency,
} from "@/lib/artifacts";
import { statusToPriority, compareArtifactsByStatusAndTitle } from "@/lib/types"; 

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-artifact-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Helper: writes a markdown file with frontmatter into the temp lore dir.
 * Returns the full path.
 */
async function writeTestArtifact(
  relativePath: string,
  frontmatter: string,
  body: string
): Promise<string> {
  const fullPath = path.join(tmpDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const content = frontmatter
    ? `---\n${frontmatter}\n---\n${body}`
    : body;
  await fs.writeFile(fullPath, content, "utf-8");
  return fullPath;
}

describe("scanArtifacts", () => {
  test("finds all .md files recursively", async () => {
    await writeTestArtifact("root.md", "title: Root", "Root content");
    await writeTestArtifact(
      "specs/system.md",
      "title: System Spec",
      "System content"
    );
    await writeTestArtifact(
      "plans/deep/nested.md",
      "title: Nested",
      "Nested content"
    );

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(3);

    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toEqual(["plans/deep/nested.md", "root.md", "specs/system.md"]);
  });

  test("ignores unsupported file types", async () => {
    await writeTestArtifact("doc.md", "title: Doc", "Content");
    const txtPath = path.join(tmpDir, "notes.txt");
    await fs.writeFile(txtPath, "not markdown", "utf-8");
    const jsonPath = path.join(tmpDir, "data.json");
    await fs.writeFile(jsonPath, "{}", "utf-8");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].relativePath).toBe("doc.md");
  });

  test("parses valid frontmatter", async () => {
    await writeTestArtifact(
      "spec.md",
      `title: My Spec\ndate: 2026-01-15\nstatus: approved\ntags: [spec, system]\nmodules: [core]\nrelated:\n  - plans/impl.md`,
      "Body here"
    );

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);

    const meta = artifacts[0].meta;
    expect(meta.title).toBe("My Spec");
    expect(meta.date).toBe("2026-01-15");
    expect(meta.status).toBe("approved");
    expect(meta.tags).toEqual(["spec", "system"]);
    expect(meta.modules).toEqual(["core"]);
    expect(meta.related).toEqual(["plans/impl.md"]);
  });

  test("handles malformed frontmatter gracefully", async () => {
    // Write a file where the frontmatter section has bad YAML
    const fullPath = path.join(tmpDir, "broken.md");
    await fs.writeFile(
      fullPath,
      "---\n{{invalid yaml:::\n---\nBody content",
      "utf-8"
    );

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].meta.title).toBe("");
    expect(artifacts[0].meta.tags).toEqual([]);
  });

  test("handles files with no frontmatter", async () => {
    const fullPath = path.join(tmpDir, "plain.md");
    await fs.writeFile(fullPath, "# Just Markdown\n\nNo frontmatter here.", "utf-8");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].meta.title).toBe("");
    expect(artifacts[0].content).toContain("Just Markdown");
  });

  test("sorts by five-group status model, date, then title", async () => {
    await writeTestArtifact("impl.md", "title: Implemented Item\nstatus: implemented\ndate: 2026-03-01", "Body");
    await writeTestArtifact("draft.md", "title: Draft Item\nstatus: draft\ndate: 2026-01-01", "Body");
    await writeTestArtifact("active.md", "title: Active Item\nstatus: active\ndate: 2026-02-01", "Body");
    await writeTestArtifact("failed.md", "title: Failed Item\nstatus: failed\ndate: 2026-02-15", "Body");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(4);
    // Group 0 (active work) -> Group 1 (in progress) -> Group 2 (hard failures) -> Group 3 (terminal)
    expect(artifacts[0].meta.status).toBe("draft");
    expect(artifacts[1].meta.status).toBe("active");
    expect(artifacts[2].meta.status).toBe("failed");
    expect(artifacts[3].meta.status).toBe("implemented");
  });

  test("returns empty array for nonexistent directory", async () => {
    const artifacts = await scanArtifacts(path.join(tmpDir, "nonexistent"));
    expect(artifacts).toEqual([]);
  });

  test("returns empty array for empty directory", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir);
    const artifacts = await scanArtifacts(emptyDir);
    expect(artifacts).toEqual([]);
  });
});

describe("readArtifact", () => {
  test("reads artifact with parsed frontmatter and content", async () => {
    await writeTestArtifact(
      "specs/system.md",
      "title: System\nstatus: draft\ndate: 2026-02-20\ntags: [spec]",
      "# System\n\nFull content here."
    );

    const artifact = await readArtifact(tmpDir, "specs/system.md");
    expect(artifact.meta.title).toBe("System");
    expect(artifact.meta.status).toBe("draft");
    expect(artifact.meta.date).toBe("2026-02-20");
    expect(artifact.meta.tags).toEqual(["spec"]);
    expect(artifact.content).toContain("Full content here.");
    expect(artifact.relativePath).toBe("specs/system.md");
    expect(artifact.filePath).toBe(path.join(tmpDir, "specs/system.md"));
    expect(artifact.rawContent).toContain("---");
    expect(artifact.rawContent).toContain("title: System");
    expect(artifact.rawContent).toContain("Full content here.");
  });

  test("throws on path traversal attempt", async () => {
    await expect(
      readArtifact(tmpDir, "../../../etc/passwd")
    ).rejects.toThrow("Path traversal detected");
  });

  test("throws on absolute path outside lorePath", async () => {
    await expect(
      readArtifact(tmpDir, "/etc/passwd")
    ).rejects.toThrow("Path traversal detected");
  });

  test("throws when file does not exist", async () => {
    await expect(
      readArtifact(tmpDir, "nonexistent.md")
    ).rejects.toThrow();
  });

  test("handles file with no frontmatter", async () => {
    const fullPath = path.join(tmpDir, "plain.md");
    await fs.writeFile(fullPath, "# Title\n\nJust text.", "utf-8");

    const artifact = await readArtifact(tmpDir, "plain.md");
    expect(artifact.meta.title).toBe("");
    expect(artifact.content).toContain("Just text.");
  });

  test("returns rawContent for frontmatter-only file", async () => {
    const fullPath = path.join(tmpDir, "commission.md");
    await fs.writeFile(fullPath, "---\ntitle: Commission\nstatus: complete\ntags: []\n---\n", "utf-8");

    const artifact = await readArtifact(tmpDir, "commission.md");
    expect(artifact.content.trim()).toBe("");
    expect(artifact.rawContent).toContain("title: Commission");
    expect(artifact.rawContent).toContain("---");
  });
});

describe("writeArtifactContent", () => {
  test("preserves frontmatter and replaces body", async () => {
    const originalFrontmatter =
      "title: My Doc\ndate: 2026-01-01\nstatus: draft\ntags: [test]";
    await writeTestArtifact("doc.md", originalFrontmatter, "Old body.");

    await writeArtifactContent(tmpDir, "doc.md", "\nNew body content.");

    const raw = await fs.readFile(path.join(tmpDir, "doc.md"), "utf-8");

    // Frontmatter should be preserved exactly
    expect(raw).toContain("title: My Doc");
    expect(raw).toContain("date: 2026-01-01");
    expect(raw).toContain("status: draft");
    expect(raw).toContain("tags: [test]");

    // Body should be replaced
    expect(raw).toContain("New body content.");
    expect(raw).not.toContain("Old body.");
  });

  test("preserves exact frontmatter formatting (no YAML reformatting)", async () => {
    // Use specific formatting that gray-matter stringify would change:
    // block-style array, specific quoting
    const originalContent = `---
title: "My Document"
date: 2026-01-01
status: draft
tags:
  - spec
  - system
modules:
  - core
related:
  - specs/other.md
---
Old body here.`;

    const filePath = path.join(tmpDir, "formatted.md");
    await fs.writeFile(filePath, originalContent, "utf-8");

    await writeArtifactContent(tmpDir, "formatted.md", "\nNew body.");

    const result = await fs.readFile(filePath, "utf-8");

    // The frontmatter block should be preserved character-for-character
    const frontmatterEnd = result.indexOf("---", 4);
    const originalFrontmatterEnd = originalContent.indexOf("---", 4);
    expect(result.slice(0, frontmatterEnd)).toBe(
      originalContent.slice(0, originalFrontmatterEnd)
    );

    // Body should be the new content
    expect(result).toContain("New body.");
    expect(result).not.toContain("Old body here.");
  });

  test("handles file with no frontmatter", async () => {
    const filePath = path.join(tmpDir, "plain.md");
    await fs.writeFile(filePath, "Old plain content.", "utf-8");

    await writeArtifactContent(tmpDir, "plain.md", "New plain content.");

    const result = await fs.readFile(filePath, "utf-8");
    expect(result).toBe("New plain content.");
  });

  test("throws on path traversal attempt", async () => {
    await expect(
      writeArtifactContent(tmpDir, "../../../tmp/evil.md", "hacked")
    ).rejects.toThrow("Path traversal detected");
  });
});

describe("writeRawArtifactContent", () => {
  test("writes full raw content including frontmatter", async () => {
    const rawContent = "---\ntitle: Test\nstatus: draft\ntags: []\n---\nBody content.";
    await writeTestArtifact("doc.md", "title: Old", "Old body");

    await writeRawArtifactContent(tmpDir, "doc.md", rawContent);

    const result = await fs.readFile(path.join(tmpDir, "doc.md"), "utf-8");
    expect(result).toBe(rawContent);
  });

  test("overwrites entire file content", async () => {
    await writeTestArtifact("doc.md", "title: Original\nstatus: draft\ntags: [spec]", "Original body");

    const newContent = "---\ntitle: Replaced\ntags: []\n---\nNew body.";
    await writeRawArtifactContent(tmpDir, "doc.md", newContent);

    const result = await fs.readFile(path.join(tmpDir, "doc.md"), "utf-8");
    expect(result).toBe(newContent);
    expect(result).not.toContain("Original");
  });

  test("throws on path traversal attempt", async () => {
    await expect(
      writeRawArtifactContent(tmpDir, "../../../tmp/evil.md", "hacked")
    ).rejects.toThrow("Path traversal detected");
  });

  test("writes file with no frontmatter", async () => {
    const plainContent = "# Just a heading\n\nNo frontmatter here.";
    const filePath = path.join(tmpDir, "plain.md");
    await fs.writeFile(filePath, "old content", "utf-8");

    await writeRawArtifactContent(tmpDir, "plain.md", plainContent);

    const result = await fs.readFile(filePath, "utf-8");
    expect(result).toBe(plainContent);
  });
});

describe("recentArtifacts", () => {
  test("returns top N artifacts by modification time (newest first)", async () => {
    // Write files in sequence so their mtimes differ
    await writeTestArtifact("a.md", "title: Alpha\nstatus: implemented\ndate: 2026-01-01", "Body");
    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));
    await writeTestArtifact("b.md", "title: Beta\nstatus: draft\ndate: 2026-01-01", "Body");
    await new Promise((r) => setTimeout(r, 50));
    await writeTestArtifact("c.md", "title: Gamma\nstatus: abandoned\ndate: 2026-03-01", "Body");

    const recent = await recentArtifacts(tmpDir, 2);
    expect(recent).toHaveLength(2);
    // Newest mtime first, regardless of status or frontmatter date
    expect(recent[0].meta.title).toBe("Gamma");
    expect(recent[1].meta.title).toBe("Beta");
  });

  test("returns all when limit exceeds count", async () => {
    await writeTestArtifact("only.md", "title: Only", "Content");
    const recent = await recentArtifacts(tmpDir, 10);
    expect(recent).toHaveLength(1);
  });

  test("returns empty for nonexistent directory", async () => {
    const recent = await recentArtifacts(
      path.join(tmpDir, "nonexistent"),
      5
    );
    expect(recent).toEqual([]);
  });
});

describe("date parsing in frontmatter", () => {
  test("handles YAML date objects (gray-matter parses dates as Date)", async () => {
    // YAML spec treats bare dates like 2026-01-15 as Date objects.
    // gray-matter follows this, so our parseMeta must handle Date instances.
    await writeTestArtifact(
      "dated.md",
      "title: Dated\ndate: 2026-01-15\nstatus: active\ntags: []",
      "Content"
    );

    const artifact = await readArtifact(tmpDir, "dated.md");
    // Should be a string date regardless of how YAML parsed it
    expect(typeof artifact.meta.date).toBe("string");
    expect(artifact.meta.date).toContain("2026-01-15");
  });
});

describe("statusToPriority", () => {
  test("all PENDING_STATUSES map to group 0 (active work)", () => {
    const pendingStatuses = ["draft", "open", "pending", "requested", "queued"];
    for (const status of pendingStatuses) {
      expect(statusToPriority(status)).toBe(0);
    }
  });

  test("all ACTIVE_STATUSES (in-progress) map to group 1", () => {
    const activeStatuses = ["active", "current", "in_progress", "dispatched"];
    for (const status of activeStatuses) {
      expect(statusToPriority(status)).toBe(1);
    }
  });

  test("approved maps to group 0 (active work)", () => {
    expect(statusToPriority("approved")).toBe(0);
  });

  test("hard failures map to group 2", () => {
    const failureStatuses = ["blocked", "failed", "cancelled"];
    for (const status of failureStatuses) {
      expect(statusToPriority(status)).toBe(2);
    }
  });

  test("terminal statuses (done) map to group 3", () => {
    const terminalStatuses = ["complete", "resolved", "implemented"];
    for (const status of terminalStatuses) {
      expect(statusToPriority(status)).toBe(3);
    }
  });

  test("terminal statuses (closed negative) map to group 4", () => {
    const terminalStatuses = ["superseded", "outdated", "wontfix", "declined", "abandoned"];
    for (const status of terminalStatuses) {
      expect(statusToPriority(status)).toBe(4);
    }
  });

  test("empty status maps to group 2 (unknown)", () => {
    expect(statusToPriority("")).toBe(2);
  });

  test("unrecognized status maps to group 2 (unknown)", () => {
    expect(statusToPriority("nonexistent")).toBe(2);
  });

  test("status matching is case-insensitive and trims whitespace", () => {
    expect(statusToPriority("Draft")).toBe(0);
    expect(statusToPriority("ACTIVE")).toBe(1);
    expect(statusToPriority(" implemented ")).toBe(3);
  });
});

describe("compareArtifactsByStatusAndTitle", () => {
  function makeArtifact(overrides: {
    status?: string;
    date?: string;
    title?: string;
    relativePath?: string;
  }): import("@/lib/types").Artifact {
    return {
      meta: {
        title: overrides.title ?? "",
        date: overrides.date ?? "",
        status: overrides.status ?? "",
        tags: [],
      },
      filePath: "/tmp/test.md",
      relativePath: overrides.relativePath ?? "test.md",
      content: "",
      lastModified: new Date(),
    };
  }

  test("draft (group 0) sorts before active (group 1)", () => {
    const draft = makeArtifact({ status: "draft" });
    const active = makeArtifact({ status: "active" });

    const sorted = [active, draft].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.status)).toEqual(["draft", "active"]);
  });

  test("active (group 1) sorts before implemented (group 2)", () => {
    const active = makeArtifact({ status: "active" });
    const impl = makeArtifact({ status: "implemented" });

    const sorted = [impl, active].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.status)).toEqual(["active", "implemented"]);
  });

  test("failed (group 2) sorts before implemented (group 3)", () => {
    const failed = makeArtifact({ status: "failed" });
    const impl = makeArtifact({ status: "implemented" });

    const sorted = [impl, failed].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.status)).toEqual(["failed", "implemented"]);
  });

  test("abandoned (group 4) sorts after unknown (group 2)", () => {
    const abandoned = makeArtifact({ status: "abandoned" });
    const unknown = makeArtifact({ status: "something_weird" });

    const sorted = [unknown, abandoned].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.status)).toEqual(["something_weird", "abandoned"]);
  });

  test("empty status (group 4) sorts after all known statuses", () => {
    const draft = makeArtifact({ status: "draft" });
    const empty = makeArtifact({ status: "" });

    const sorted = [empty, draft].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.status)).toEqual(["draft", ""]);
  });

  test("within same status group, newer date sorts first", () => {
    const older = makeArtifact({ status: "open", date: "2026-01-01" });
    const newer = makeArtifact({ status: "open", date: "2026-03-01" });

    const sorted = [older, newer].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.date)).toEqual(["2026-03-01", "2026-01-01"]);
  });

  test("artifacts with date sort before those without", () => {
    const withDate = makeArtifact({ status: "open", date: "2026-01-01" });
    const noDate = makeArtifact({ status: "open", date: "" });

    const sorted = [noDate, withDate].sort(compareArtifactsByStatusAndTitle);
    expect(sorted[0].meta.date).toBe("2026-01-01");
    expect(sorted[1].meta.date).toBe("");
  });

  test("title is alphabetical tiebreaker", () => {
    const beta = makeArtifact({ status: "open", date: "2026-01-01", title: "Beta" });
    const alpha = makeArtifact({ status: "open", date: "2026-01-01", title: "Alpha" });

    const sorted = [beta, alpha].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.title)).toEqual(["Alpha", "Beta"]);
  });

  test("empty title falls back to relativePath for tiebreaker", () => {
    const noTitleA = makeArtifact({ status: "open", date: "2026-01-01", title: "", relativePath: "specs/aaa.md" });
    const noTitleB = makeArtifact({ status: "open", date: "2026-01-01", title: "", relativePath: "specs/zzz.md" });

    const sorted = [noTitleB, noTitleA].sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.relativePath)).toEqual(["specs/aaa.md", "specs/zzz.md"]);
  });

  test("full five-group sort with mixed statuses", () => {
    const artifacts = [
      makeArtifact({ status: "abandoned", date: "2026-03-01", title: "Abandoned" }),
      makeArtifact({ status: "draft", date: "2026-01-01", title: "Draft" }),
      makeArtifact({ status: "draft", date: "2026-02-01", title: "Draft" }),
      makeArtifact({ status: "active", date: "2026-02-15", title: "Active" }),
      makeArtifact({ status: "failed", date: "2026-02-01", title: "Failed" }),
      makeArtifact({ status: "pending", date: "2026-02-15", title: "Pending" }),
    ];

    const sorted = artifacts.sort(compareArtifactsByStatusAndTitle);
    expect(sorted.map((a) => a.meta.title)).toEqual([
      "Draft",         // group 0, 2026-01-01
      "Draft",         // group 0, 2026-02-01
      "Pending",       // group 0, 2026-02-15
      "Active",        // group 1, 2026-02-15
      "Failed",        // group 2, 2026-02-01
      "Abandoned",     // group 3, 2026-03-01
    ]);
  });

  test("handles all fields missing without crashing", () => {
    const a = makeArtifact({});
    const b = makeArtifact({});

    expect(() => [a, b].sort(compareArtifactsByStatusAndTitle)).not.toThrow();
  });
});

describe("compareArtifactsByRecency", () => {
  function makeArtifact(overrides: {
    status?: string;
    date?: string;
    title?: string;
    lastModified?: Date;
  }): import("@/lib/types").Artifact {
    return {
      meta: {
        title: overrides.title ?? "",
        date: overrides.date ?? "",
        status: overrides.status ?? "",
        tags: [],
      },
      filePath: "/tmp/test.md",
      relativePath: "test.md",
      content: "",
      lastModified: overrides.lastModified ?? new Date(),
    };
  }

  test("sorts by modification time descending (newest first)", () => {
    const old = makeArtifact({ title: "Old", lastModified: new Date("2026-01-01") });
    const mid = makeArtifact({ title: "Mid", lastModified: new Date("2026-02-01") });
    const recent = makeArtifact({ title: "Recent", lastModified: new Date("2026-03-01") });

    const sorted = [old, recent, mid].sort(compareArtifactsByRecency);
    expect(sorted.map((a) => a.meta.title)).toEqual(["Recent", "Mid", "Old"]);
  });

  test("ignores status and frontmatter date", () => {
    const draftOldFile = makeArtifact({
      title: "Draft",
      status: "draft",
      date: "2026-03-01",
      lastModified: new Date("2026-01-01"),
    });
    const implNewFile = makeArtifact({
      title: "Implemented",
      status: "implemented",
      date: "2026-01-01",
      lastModified: new Date("2026-03-01"),
    });

    const sorted = [draftOldFile, implNewFile].sort(compareArtifactsByRecency);
    expect(sorted[0].meta.title).toBe("Implemented");
    expect(sorted[1].meta.title).toBe("Draft");
  });

  test("equal modification times produce stable sort", () => {
    const sameTime = new Date("2026-02-15");
    const a = makeArtifact({ title: "A", lastModified: sameTime });
    const b = makeArtifact({ title: "B", lastModified: sameTime });

    expect(() => [a, b].sort(compareArtifactsByRecency)).not.toThrow();
  });
});

// -- Image artifact tests --

describe("scanArtifacts with images", () => {
  async function writeImageFile(relativePath: string): Promise<void> {
    const fullPath = path.join(tmpDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    // Write a small binary buffer (not a real image, but enough for scanner)
    await fs.writeFile(fullPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }

  test("discovers image files alongside markdown", async () => {
    await writeTestArtifact("specs/design.md", "title: Design\nstatus: draft", "Content");
    await writeImageFile("generated/hero.png");
    await writeImageFile("specs/diagram.svg");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(3);

    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toEqual(["generated/hero.png", "specs/design.md", "specs/diagram.svg"]);
  });

  test("sets artifactType to 'image' for image files", async () => {
    await writeImageFile("photo.jpg");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].artifactType).toBe("image");
  });

  test("sets artifactType to 'document' for markdown files", async () => {
    await writeTestArtifact("doc.md", "title: Doc\nstatus: draft", "Content");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].artifactType).toBe("document");
  });

  test("generates synthetic metadata for image artifacts", async () => {
    await writeImageFile("generated/my-hero-image.png");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);

    const img = artifacts[0];
    expect(img.meta.title).toBe("My Hero Image");
    expect(img.meta.status).toBe("complete");
    expect(img.meta.tags).toEqual([]);
    expect(img.meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(img.content).toBe("");
    expect(img.rawContent).toBeUndefined();
  });

  test("skips unsupported extensions", async () => {
    await writeImageFile("photo.png");
    const bmpPath = path.join(tmpDir, "photo.bmp");
    await fs.writeFile(bmpPath, Buffer.from([0x42, 0x4d]));
    const tiffPath = path.join(tmpDir, "photo.tiff");
    await fs.writeFile(tiffPath, Buffer.from([0x49, 0x49]));

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].relativePath).toBe("photo.png");
  });

  test("discovers all six supported image extensions", async () => {
    await writeImageFile("a.png");
    await writeImageFile("b.jpg");
    await writeImageFile("c.jpeg");
    await writeImageFile("d.webp");
    await writeImageFile("e.gif");
    await writeImageFile("f.svg");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(6);
    expect(artifacts.every((a) => a.artifactType === "image")).toBe(true);
  });

  test("discovers images in nested directories", async () => {
    await writeImageFile("generated/covers/album.webp");
    await writeImageFile("specs/ui/mockup.png");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(2);
    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toEqual(["generated/covers/album.webp", "specs/ui/mockup.png"]);
  });

  test("image artifacts sort alongside markdown using status and title", async () => {
    await writeTestArtifact("draft.md", "title: Draft Doc\nstatus: draft\ndate: 2026-01-01", "Body");
    await writeImageFile("generated/complete-image.png");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(2);
    // draft (group 0) sorts before complete (group 3)
    expect(artifacts[0].meta.status).toBe("draft");
    expect(artifacts[1].meta.status).toBe("complete");
  });

  test("handles empty directory (no images or markdown)", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir);
    const artifacts = await scanArtifacts(emptyDir);
    expect(artifacts).toEqual([]);
  });

  test("title derivation replaces hyphens and underscores with spaces", async () => {
    await writeImageFile("some_test-image.png");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts[0].meta.title).toBe("Some Test Image");
  });
});

describe("IMAGE_MIME_TYPES", () => {
  // Import is tested indirectly through the daemon route tests,
  // but we verify the mapping is correct here for completeness.
  test("maps all six supported extensions correctly", async () => {
    const { IMAGE_MIME_TYPES } = await import("@/lib/artifacts");
    expect(IMAGE_MIME_TYPES[".png"]).toBe("image/png");
    expect(IMAGE_MIME_TYPES[".jpg"]).toBe("image/jpeg");
    expect(IMAGE_MIME_TYPES[".jpeg"]).toBe("image/jpeg");
    expect(IMAGE_MIME_TYPES[".webp"]).toBe("image/webp");
    expect(IMAGE_MIME_TYPES[".gif"]).toBe("image/gif");
    expect(IMAGE_MIME_TYPES[".svg"]).toBe("image/svg+xml");
  });

  test("returns undefined for unknown extensions", async () => {
    const { IMAGE_MIME_TYPES } = await import("@/lib/artifacts");
    expect(IMAGE_MIME_TYPES[".bmp"]).toBeUndefined();
    expect(IMAGE_MIME_TYPES[".tiff"]).toBeUndefined();
  });
});
