import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadMemories, memoryScopeFile } from "@/daemon/services/memory-injector";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-memory-inject-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helper to write a single-file scope memory --

async function writeScopeFile(
  scope: "global" | "project" | "worker",
  content: string,
  opts?: { projectName?: string; workerName?: string },
): Promise<void> {
  const projectName = opts?.projectName ?? "test-project";
  const workerName = opts?.workerName ?? "test-worker";
  const scopeKey = scope === "global" ? "global" : scope === "project" ? projectName : workerName;
  const filePath = memoryScopeFile(guildHallHome, scope, scopeKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// -- No memory files --

describe("loadMemories: no files", () => {
  test("returns guidance block when no memory files exist", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("edit_memory");
    expect(result.memoryBlock).toContain("No memories saved yet.");
  });

  test("result has no needsCompaction field", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect("needsCompaction" in result).toBe(false);
  });
});

// -- Single scope --

describe("loadMemories: single scope", () => {
  test("includes global scope content", async () => {
    await writeScopeFile("global", "## Preferences\n\nUse dark mode\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("## Memories");
    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("## Preferences");
    expect(result.memoryBlock).toContain("Use dark mode");
  });

  test("includes project scope content", async () => {
    await writeScopeFile("project", "## Conventions\n\nUse camelCase\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Project: test-project");
    expect(result.memoryBlock).toContain("## Conventions");
    expect(result.memoryBlock).toContain("Use camelCase");
  });

  test("includes worker scope content", async () => {
    await writeScopeFile("worker", "## Notes\n\nWorker-specific note\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Worker: test-worker");
    expect(result.memoryBlock).toContain("## Notes");
    expect(result.memoryBlock).toContain("Worker-specific note");
  });
});

// -- All three scopes --

describe("loadMemories: all three scopes", () => {
  test("assembles all three scopes with correct ### headings", async () => {
    await writeScopeFile("global", "## User\n\nGlobal note\n");
    await writeScopeFile("project", "## Project\n\nProject note\n");
    await writeScopeFile("worker", "## Feedback\n\nWorker note\n");

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
  });
});

// -- Budget enforcement (section-level) --

describe("loadMemories: budget enforcement", () => {
  test("drops worker sections first when over budget", async () => {
    await writeScopeFile("global", "## GlobalSec\n\nG-content\n");
    await writeScopeFile("project", "## ProjSec\n\nP-content\n");
    // Worker has two sections, the second is large
    await writeScopeFile(
      "worker",
      "## Important\n\nKeep this\n\n## Bulk\n\n" + "X".repeat(15000) + "\n",
    );

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 1000,
    });

    // Global and project should survive
    expect(result.memoryBlock).toContain("G-content");
    expect(result.memoryBlock).toContain("P-content");
    // Worker's bulk section should be dropped but important might survive
    expect(result.memoryBlock).not.toContain("X".repeat(100));
  });

  test("drops last sections in file first within a scope", async () => {
    // Worker with three sections, each about 200 chars
    const sec1 = "First section content " + "A".repeat(180);
    const sec2 = "Second section content " + "B".repeat(180);
    const sec3 = "Third section content " + "C".repeat(180);
    await writeScopeFile(
      "worker",
      `## One\n\n${sec1}\n\n## Two\n\n${sec2}\n\n## Three\n\n${sec3}\n`,
    );

    // Budget that fits maybe one or two sections plus overhead
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 500,
    });

    // First section should be preserved (highest priority within scope)
    expect(result.memoryBlock).toContain("First section content");
    // Third section should be dropped first
    expect(result.memoryBlock).not.toContain("Third section content");
  });

  test("returns 'no memories fit' when everything exceeds budget", async () => {
    await writeScopeFile("global", "## Huge\n\n" + "X".repeat(20000) + "\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 100,
    });

    expect(result.memoryBlock).toContain("No memories fit within budget.");
    expect(result.memoryBlock).not.toContain("Huge");
  });

  test("MEMORY_GUIDANCE is not counted against budget", async () => {
    // Small content that fits in a tiny budget
    await writeScopeFile("global", "## Note\n\nSmall\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 200,
    });

    // Guidance should be present even though the total memoryBlock is much larger
    expect(result.memoryBlock).toContain("edit_memory");
    expect(result.memoryBlock).toContain("Small");
  });

  test("sections are complete, never truncated mid-content", async () => {
    const content = "Important paragraph with details " + "Y".repeat(300);
    await writeScopeFile("worker", `## Details\n\n${content}\n`);

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 500,
    });

    // Either the full section is present or it's completely absent
    if (result.memoryBlock.includes("Details")) {
      expect(result.memoryBlock).toContain(content);
    }
  });
});

// -- Config memoryLimit --

describe("loadMemories: memoryLimit config", () => {
  test("uses default limit of 16000 when memoryLimit not specified", async () => {
    await writeScopeFile("global", "## Note\n\n" + "A".repeat(7000) + "\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("A".repeat(7000));
  });

  test("respects custom memoryLimit", async () => {
    await writeScopeFile("global", "## Note\n\n" + "A".repeat(500) + "\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
      memoryLimit: 100,
    });

    expect(result.memoryBlock).toContain("No memories fit within budget.");
  });
});

// -- Edge cases --

describe("loadMemories: edge cases", () => {
  test("handles missing only some scope files", async () => {
    await writeScopeFile("global", "## Note\n\nGlobal only\n");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("Global only");
    expect(result.memoryBlock).not.toContain("### Project:");
    expect(result.memoryBlock).not.toContain("### Worker:");
  });

  test("handles empty scope files", async () => {
    await writeScopeFile("global", "");

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("No memories saved yet.");
  });

  test("uses correct worker name for scope resolution", async () => {
    await writeScopeFile("worker", "## Note\n\nWorker A note\n", {
      workerName: "worker-a",
    });
    await writeScopeFile("worker", "## Note\n\nWorker B note\n", {
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
    await writeScopeFile("project", "## Note\n\nProject Alpha note\n", {
      projectName: "alpha",
    });
    await writeScopeFile("project", "## Note\n\nProject Beta note\n", {
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

  test("file content appears as-is under scope heading (REQ-MEM-19)", async () => {
    const content = "## User\n\nPreferences here\n\n## Feedback\n\nDon't do X\n";
    await writeScopeFile("global", content);

    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    // The ## headers from the file should appear under ### Global
    expect(result.memoryBlock).toContain("### Global");
    expect(result.memoryBlock).toContain("## User");
    expect(result.memoryBlock).toContain("## Feedback");
    expect(result.memoryBlock).toContain("Preferences here");
    expect(result.memoryBlock).toContain("Don't do X");
  });
});

// -- MEMORY_GUIDANCE content --

describe("loadMemories: MEMORY_GUIDANCE", () => {
  test("references edit_memory not write_memory", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("edit_memory");
    expect(result.memoryBlock).toContain("read_memory");
    // write_memory mentioned only as deprecated
    expect(result.memoryBlock).toContain("write_memory");
    expect(result.memoryBlock).toContain("deprecated");
  });

  test("describes section-based organization", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("section");
    expect(result.memoryBlock).toContain("upsert");
    expect(result.memoryBlock).toContain("append");
    expect(result.memoryBlock).toContain("delete");
  });

  test("suggests standard section names", async () => {
    const result = await loadMemories("test-worker", "test-project", {
      guildHallHome,
    });

    expect(result.memoryBlock).toContain("User");
    expect(result.memoryBlock).toContain("Feedback");
    expect(result.memoryBlock).toContain("Project");
    expect(result.memoryBlock).toContain("Reference");
  });
});
