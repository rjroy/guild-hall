import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  scanArtifacts,
  readArtifact,
  writeArtifactContent,
  recentArtifacts,
} from "@/lib/artifacts";

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

  test("ignores non-.md files", async () => {
    await writeTestArtifact("doc.md", "title: Doc", "Content");
    const txtPath = path.join(tmpDir, "notes.txt");
    await fs.writeFile(txtPath, "not markdown", "utf-8");

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

  test("sorts by lastModified descending", async () => {
    const oldPath = await writeTestArtifact("old.md", "title: Old", "Old");
    // Set the mtime to the past
    const pastDate = new Date("2025-01-01");
    await fs.utimes(oldPath, pastDate, pastDate);

    await writeTestArtifact("new.md", "title: New", "New");

    const artifacts = await scanArtifacts(tmpDir);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].relativePath).toBe("new.md");
    expect(artifacts[1].relativePath).toBe("old.md");
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

describe("recentArtifacts", () => {
  test("returns top N most recently modified", async () => {
    // Create three files with staggered timestamps
    const paths = [];
    for (const name of ["c.md", "b.md", "a.md"]) {
      paths.push(await writeTestArtifact(name, `title: ${name}`, "Body"));
    }

    // Make 'a.md' oldest and 'c.md' newest
    await fs.utimes(paths[2], new Date("2025-01-01"), new Date("2025-01-01"));
    await fs.utimes(paths[1], new Date("2025-06-01"), new Date("2025-06-01"));
    // c.md keeps its current timestamp (newest)

    const recent = await recentArtifacts(tmpDir, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].relativePath).toBe("c.md");
    expect(recent[1].relativePath).toBe("b.md");
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
