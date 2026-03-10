import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadMemories } from "@/daemon/services/memory-injector";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-memory-inject-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helper to create a memory file with controlled mtime --

async function writeMemoryFile(
  scope: "global" | "project" | "worker",
  filename: string,
  content: string,
  opts?: { projectName?: string; workerName?: string; mtime?: Date },
): Promise<void> {
  const projectName = opts?.projectName ?? "test-project";
  const workerName = opts?.workerName ?? "test-worker";

  let dirPath: string;
  switch (scope) {
    case "global":
      dirPath = path.join(guildHallHome, "memory", "global");
      break;
    case "project":
      dirPath = path.join(guildHallHome, "memory", "projects", projectName);
      break;
    case "worker":
      dirPath = path.join(guildHallHome, "memory", "workers", workerName);
      break;
  }

  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, filename);
  await fs.writeFile(filePath, content, "utf-8");

  if (opts?.mtime) {
    await fs.utimes(filePath, opts.mtime, opts.mtime);
  }
}

// -- Empty directories --

describe("loadMemories: empty directories", () => {
  test("returns guidance block when no memory directories exist", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("write_memory");
    expect(result.memoryBlock).toContain("No memories saved yet.");
    expect(result.needsCompaction).toBe(false);
  });

  test("returns guidance block when all directories exist but are empty", async () => {
    await fs.mkdir(path.join(guildHallHome, "memory", "global"), {
      recursive: true,
    });
    await fs.mkdir(
      path.join(guildHallHome, "memory", "projects", "test-project"),
      { recursive: true },
    );
    await fs.mkdir(
      path.join(guildHallHome, "memory", "workers", "test-worker"),
      { recursive: true },
    );

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("write_memory");
    expect(result.memoryBlock).toContain("No memories saved yet.");
    expect(result.needsCompaction).toBe(false);
  });
});

// -- Single scope --

describe("loadMemories: single scope", () => {
  test("includes global scope files", async () => {
    await writeMemoryFile("global", "preferences.md", "Use dark mode");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("**preferences.md**");
    expect(result.memoryBlock).toContain("Use dark mode");
    expect(result.needsCompaction).toBe(false);
  });

  test("includes project scope files", async () => {
    await writeMemoryFile("project", "conventions.md", "Use camelCase");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Project: test-project");
    expect(result.memoryBlock).toContain("**conventions.md**");
    expect(result.memoryBlock).toContain("Use camelCase");
  });

  test("includes worker scope files", async () => {
    await writeMemoryFile("worker", "notes.md", "Worker-specific note");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Worker: test-worker");
    expect(result.memoryBlock).toContain("**notes.md**");
    expect(result.memoryBlock).toContain("Worker-specific note");
  });
});

// -- All three scopes --

describe("loadMemories: all three scopes", () => {
  test("assembles all three scopes into correct markdown structure", async () => {
    await writeMemoryFile("global", "global.md", "Global note");
    await writeMemoryFile("project", "project.md", "Project note");
    await writeMemoryFile("worker", "worker.md", "Worker note");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("### Project: test-project");
    expect(result.memoryBlock).toContain("### Worker: test-worker");

    // Verify ordering: Global comes before Project, Project before Worker
    const globalIdx = result.memoryBlock.indexOf("### Global");
    const projectIdx = result.memoryBlock.indexOf("### Project:");
    const workerIdx = result.memoryBlock.indexOf("### Worker:");
    expect(globalIdx).toBeLessThan(projectIdx);
    expect(projectIdx).toBeLessThan(workerIdx);

    expect(result.needsCompaction).toBe(false);
  });
});

// -- Mtime sorting --

describe("loadMemories: mtime sorting", () => {
  test("sorts files by mtime with most recent first", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const midDate = new Date("2024-06-01T00:00:00Z");
    const newDate = new Date("2025-01-01T00:00:00Z");

    await writeMemoryFile("global", "old.md", "Old content", {
      mtime: oldDate,
    });
    await writeMemoryFile("global", "mid.md", "Mid content", {
      mtime: midDate,
    });
    await writeMemoryFile("global", "new.md", "New content", {
      mtime: newDate,
    });

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    // Most recent file should appear first in the output
    const newIdx = result.memoryBlock.indexOf("**new.md**");
    const midIdx = result.memoryBlock.indexOf("**mid.md**");
    const oldIdx = result.memoryBlock.indexOf("**old.md**");

    expect(newIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(oldIdx);
  });
});

// -- Under limit --

describe("loadMemories: under limit", () => {
  test("returns full block when total is under limit", async () => {
    await writeMemoryFile("global", "a.md", "Short content A");
    await writeMemoryFile("project", "b.md", "Short content B");
    await writeMemoryFile("worker", "c.md", "Short content C");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 16000,
    });

    expect(result.memoryBlock).toContain("Short content A");
    expect(result.memoryBlock).toContain("Short content B");
    expect(result.memoryBlock).toContain("Short content C");
    expect(result.needsCompaction).toBe(false);
  });
});

// -- Over limit / truncation --

describe("loadMemories: over limit / truncation", () => {
  test("drops older files when over limit and sets needsCompaction", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const newDate = new Date("2025-01-01T00:00:00Z");

    // Create files where only the newer one fits within a tight limit
    await writeMemoryFile("global", "old.md", "A".repeat(200), {
      mtime: oldDate,
    });
    await writeMemoryFile("global", "new.md", "B".repeat(200), {
      mtime: newDate,
    });

    // Set a limit that fits one file plus overhead but not both
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 350,
    });

    // Newer file should be included
    expect(result.memoryBlock).toContain("**new.md**");
    expect(result.memoryBlock).toContain("B".repeat(200));

    // Older file should be dropped
    expect(result.memoryBlock).not.toContain("**old.md**");

    // needsCompaction should be true
    expect(result.needsCompaction).toBe(true);
  });

  test("never cuts a file mid-content (soft cap)", async () => {
    // Create a single file that's too large for the limit
    const largeContent = "X".repeat(5000);
    await writeMemoryFile("global", "huge.md", largeContent);

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 100,
    });

    // The file shouldn't appear at all (not truncated mid-content)
    expect(result.memoryBlock).toContain("No memories fit within budget.");
    expect(result.memoryBlock).not.toContain("**huge.md**");
    expect(result.needsCompaction).toBe(true);
  });

  test("includes smaller files even when a larger file was skipped in another scope", async () => {
    const newDate = new Date("2025-01-01T00:00:00Z");

    // Global: large file that uses most of the budget
    await writeMemoryFile("global", "big.md", "G".repeat(300), {
      mtime: newDate,
    });

    // Worker: small file that should still fit in remaining budget
    await writeMemoryFile("worker", "small.md", "W", {
      mtime: newDate,
    });

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 500,
    });

    expect(result.memoryBlock).toContain("**big.md**");
    expect(result.memoryBlock).toContain("**small.md**");
    expect(result.needsCompaction).toBe(false);
  });
});

// -- Config memoryLimit --

describe("loadMemories: memoryLimit config", () => {
  test("uses default limit of 8000 when memoryLimit not specified", async () => {
    // Create content that's under 8000 chars total
    await writeMemoryFile("global", "note.md", "A".repeat(7000));

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      // No memoryLimit specified
    });

    expect(result.memoryBlock).toContain("A".repeat(7000));
    expect(result.needsCompaction).toBe(false);
  });

  test("respects custom memoryLimit", async () => {
    await writeMemoryFile("global", "note.md", "A".repeat(500));

    // Limit that won't fit the content
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 100,
    });

    // File shouldn't be included (soft cap), but guidance is present
    expect(result.memoryBlock).toContain("No memories fit within budget.");
    expect(result.memoryBlock).not.toContain("**note.md**");
    expect(result.needsCompaction).toBe(true);
  });
});

// -- Edge cases --

describe("loadMemories: edge cases", () => {
  test("skips subdirectories in memory directories", async () => {
    const globalDir = path.join(guildHallHome, "memory", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.mkdir(path.join(globalDir, "subdir"), { recursive: true });
    await fs.writeFile(
      path.join(globalDir, "subdir", "nested.md"),
      "nested content",
      "utf-8",
    );
    await fs.writeFile(
      path.join(globalDir, "top.md"),
      "top level content",
      "utf-8",
    );

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("**top.md**");
    expect(result.memoryBlock).not.toContain("**subdir**");
    expect(result.memoryBlock).not.toContain("**nested.md**");
    expect(result.memoryBlock).not.toContain("nested content");
  });

  test("handles missing only some scope directories", async () => {
    // Only create global scope, project and worker dirs don't exist
    await writeMemoryFile("global", "note.md", "Global only");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("Global only");
    expect(result.memoryBlock).not.toContain("### Project:");
    expect(result.memoryBlock).not.toContain("### Worker:");
  });

  test("handles empty content files", async () => {
    await writeMemoryFile("global", "empty.md", "");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    // Empty file still has a filename header
    expect(result.memoryBlock).toContain("**empty.md**");
  });

  test("uses correct worker name for scope resolution", async () => {
    await writeMemoryFile("worker", "note.md", "Worker A note", {
      workerName: "worker-a",
    });
    await writeMemoryFile("worker", "note.md", "Worker B note", {
      workerName: "worker-b",
    });

    const resultA = await loadMemories("worker-a", "test-project", {
      guildHallHome,
    });
    const resultB = await loadMemories("worker-b", "test-project", {
      guildHallHome,
    });

    expect(resultA.memoryBlock).toContain("Worker A note");
    expect(resultA.memoryBlock).not.toContain("Worker B note");

    expect(resultB.memoryBlock).toContain("Worker B note");
    expect(resultB.memoryBlock).not.toContain("Worker A note");
  });

  test("uses correct project name for scope resolution", async () => {
    await writeMemoryFile("project", "note.md", "Project Alpha note", {
      projectName: "alpha",
    });
    await writeMemoryFile("project", "note.md", "Project Beta note", {
      projectName: "beta",
    });

    const resultAlpha = await loadMemories("test-worker", "alpha", {
      guildHallHome,
    });
    const resultBeta = await loadMemories("test-worker", "beta", {
      guildHallHome,
    });

    expect(resultAlpha.memoryBlock).toContain("Project Alpha note");
    expect(resultAlpha.memoryBlock).not.toContain("Project Beta note");

    expect(resultBeta.memoryBlock).toContain("Project Beta note");
    expect(resultBeta.memoryBlock).not.toContain("Project Alpha note");
  });
});

// -- Budget allocation across scopes --

describe("loadMemories: budget allocation across scopes", () => {
  test("global scope consumes budget before project and worker", async () => {
    const newDate = new Date("2025-01-01T00:00:00Z");

    // Global fills most of the budget
    await writeMemoryFile("global", "big.md", "G".repeat(400), {
      mtime: newDate,
    });

    // Project has a file that won't fit in remaining budget
    await writeMemoryFile("project", "medium.md", "P".repeat(200), {
      mtime: newDate,
    });

    // Worker has a small file
    await writeMemoryFile("worker", "tiny.md", "W", {
      mtime: newDate,
    });

    // Set limit so global + worker fit but not global + project
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 600,
    });

    expect(result.memoryBlock).toContain("**big.md**");
    // Project file might not fit, but worker tiny should
    expect(result.memoryBlock).toContain("**tiny.md**");
    expect(result.needsCompaction).toBe(true);
  });
});
