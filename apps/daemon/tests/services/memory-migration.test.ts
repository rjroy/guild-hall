import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  migrateIfNeeded,
  memoryScopeFile,
  memoryScopeDir,
  loadMemories,
} from "@/apps/daemon/services/memory-injector";
import { makeReadMemoryHandler } from "@/apps/daemon/services/base-toolbox";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-memory-migrate-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

async function createLegacyDir(
  scope: "global" | "project" | "worker",
  scopeKey: string,
  files: Record<string, string>,
): Promise<string> {
  const dir = memoryScopeDir(guildHallHome, scope, scopeKey);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, "utf-8");
  }
  return dir;
}

// -- migrateIfNeeded tests --

describe("migrateIfNeeded: basic migration", () => {
  test("migrates legacy directory with multiple files", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {
      "_compacted.md": "Compacted summary content",
      "user_prefs.md": "Prefers dark mode",
      "feedback_testing.md": "Always run tests",
      "project_context.md": "Working on Guild Hall",
      "reference_docs.md": "API docs at /api",
    });
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    await migrateIfNeeded(scopeFile, legacyDir);

    // Single file should exist
    const content = await fs.readFile(scopeFile, "utf-8");

    // _compacted.md becomes preamble (no ## header)
    expect(content).toContain("Compacted summary content");

    // Other files become ## sections in alphabetical order
    expect(content).toContain("## feedback_testing.md");
    expect(content).toContain("## project_context.md");
    expect(content).toContain("## reference_docs.md");
    expect(content).toContain("## user_prefs.md");

    // Verify alphabetical order
    const feedbackIdx = content.indexOf("## feedback_testing.md");
    const projectIdx = content.indexOf("## project_context.md");
    const refIdx = content.indexOf("## reference_docs.md");
    const userIdx = content.indexOf("## user_prefs.md");
    expect(feedbackIdx).toBeLessThan(projectIdx);
    expect(projectIdx).toBeLessThan(refIdx);
    expect(refIdx).toBeLessThan(userIdx);

    // Legacy directory should be renamed
    const migratedExists = await fs.access(`${legacyDir}.migrated`).then(() => true, () => false);
    expect(migratedExists).toBe(true);

    // Original directory should be gone
    const originalExists = await fs.access(legacyDir).then(() => true, () => false);
    expect(originalExists).toBe(false);
  });

  test("MEMORY.md is excluded from sections (REQ-MEM-4)", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {
      "MEMORY.md": "# Memory Index\n- user_prefs.md\n- feedback.md",
      "user_prefs.md": "Dark mode preference",
    });
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    await migrateIfNeeded(scopeFile, legacyDir);

    const content = await fs.readFile(scopeFile, "utf-8");
    expect(content).not.toContain("Memory Index");
    expect(content).not.toContain("## MEMORY.md");
    expect(content).toContain("## user_prefs.md");
    expect(content).toContain("Dark mode preference");
  });

  test("no preamble when _compacted.md is absent", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {
      "notes.md": "Some notes",
      "prefs.md": "Some preferences",
    });
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    await migrateIfNeeded(scopeFile, legacyDir);

    const content = await fs.readFile(scopeFile, "utf-8");
    // Should start with the first ## section (no preamble)
    expect(content).toMatch(/^## notes\.md/);
  });

  test("empty legacy directory does not trigger migration", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {});
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    await migrateIfNeeded(scopeFile, legacyDir);

    // No single file should be created
    const exists = await fs.access(scopeFile).then(() => true, () => false);
    expect(exists).toBe(false);

    // Legacy dir should still exist (not renamed)
    const dirExists = await fs.access(legacyDir).then(() => true, () => false);
    expect(dirExists).toBe(true);
  });

  test("single file already exists: no migration (REQ-MEM-24)", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {
      "old_data.md": "Should not be migrated",
    });
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    // Pre-create the single file
    await fs.mkdir(path.dirname(scopeFile), { recursive: true });
    await fs.writeFile(scopeFile, "## Existing\n\nExisting content\n", "utf-8");

    await migrateIfNeeded(scopeFile, legacyDir);

    // Single file should be unchanged
    const content = await fs.readFile(scopeFile, "utf-8");
    expect(content).toContain("Existing content");
    expect(content).not.toContain("Should not be migrated");

    // Legacy dir should still exist (not renamed)
    const dirExists = await fs.access(legacyDir).then(() => true, () => false);
    expect(dirExists).toBe(true);
  });

  test("missing legacy directory: no error", async () => {
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");
    const legacyDir = memoryScopeDir(guildHallHome, "worker", "Octavia");

    // Neither exists, should not throw
    await migrateIfNeeded(scopeFile, legacyDir);

    const exists = await fs.access(scopeFile).then(() => true, () => false);
    expect(exists).toBe(false);
  });
});

// -- Migration via loadMemories --

describe("migration via loadMemories", () => {
  test("triggers migration and returns content from new file", async () => {
    await createLegacyDir("worker", "test-worker", {
      "prefs.md": "Use dark mode",
    });

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Worker: test-worker");
    expect(result.memoryBlock).toContain("Use dark mode");

    // Verify single file was created
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "test-worker");
    const exists = await fs.access(scopeFile).then(() => true, () => false);
    expect(exists).toBe(true);
  });
});

// -- Migration via read_memory --

describe("migration via read_memory", () => {
  test("triggers migration and returns content from new file", async () => {
    await createLegacyDir("worker", "test-worker", {
      "notes.md": "Worker notes here",
    });

    const readScopes = new Set<string>();
    const handler = makeReadMemoryHandler(
      guildHallHome,
      "test-worker",
      "test-project",
      readScopes,
    );

    const result = await handler({ scope: "worker" });

    expect(result.content[0]).toHaveProperty("text");
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Worker notes here");

    // Verify single file was created
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "test-worker");
    const exists = await fs.access(scopeFile).then(() => true, () => false);
    expect(exists).toBe(true);
  });
});

// -- Concurrent migration --

describe("migrateIfNeeded: concurrent access", () => {
  test("second caller sees the single file and skips", async () => {
    const legacyDir = await createLegacyDir("worker", "Octavia", {
      "data.md": "Important data",
    });
    const scopeFile = memoryScopeFile(guildHallHome, "worker", "Octavia");

    // Run two migrations concurrently
    await Promise.all([
      migrateIfNeeded(scopeFile, legacyDir),
      migrateIfNeeded(scopeFile, legacyDir),
    ]);

    // File should exist and contain the data
    const content = await fs.readFile(scopeFile, "utf-8");
    expect(content).toContain("Important data");
  });
});
