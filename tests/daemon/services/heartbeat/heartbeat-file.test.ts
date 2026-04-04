import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ensureHeartbeatFile,
  repairHeartbeatHeader,
  readHeartbeatFile,
  hasContentBelowHeader,
  clearRecentActivity,
  appendToSection,
  countStandingOrders,
} from "@/daemon/services/heartbeat/heartbeat-file";

let tmpDir: string;
let projectPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-heartbeat-file-"));
  projectPath = path.join(tmpDir, "project");
  await fs.mkdir(path.join(projectPath, ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function heartbeatPath(): string {
  return path.join(projectPath, ".lore", "heartbeat.md");
}

describe("ensureHeartbeatFile (REQ-HBT-1, REQ-HBT-25)", () => {
  test("creates file where none exists", async () => {
    await ensureHeartbeatFile(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("## Standing Orders");
    expect(content).toContain("## Watch Items");
    expect(content).toContain("## Context Notes");
    expect(content).toContain("## Recent Activity");
  });

  test("creates .lore directory if missing", async () => {
    const freshProject = path.join(tmpDir, "fresh-project");
    await fs.mkdir(freshProject, { recursive: true });

    await ensureHeartbeatFile(freshProject);

    const content = await fs.readFile(
      path.join(freshProject, ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(content).toContain("# Heartbeat");
  });

  test("repairs corrupted header preserving section content", async () => {
    const existing = `Corrupted header content
Some random text here

## Standing Orders
- Review all PRs daily
- Check test coverage weekly

## Watch Items
- Memory usage trending up

## Context Notes
- Merge freeze until Friday

## Recent Activity
- 14:00 commission completed
`;
    await fs.writeFile(heartbeatPath(), existing, "utf-8");

    await ensureHeartbeatFile(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    // Header should be the template
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("This file controls what the guild does autonomously.");
    // Section content should be preserved
    expect(content).toContain("- Review all PRs daily");
    expect(content).toContain("- Check test coverage weekly");
    expect(content).toContain("- Memory usage trending up");
    expect(content).toContain("- Merge freeze until Friday");
    expect(content).toContain("- 14:00 commission completed");
    // Corrupted content should be gone
    expect(content).not.toContain("Corrupted header content");
  });
});

describe("repairHeartbeatHeader (REQ-HBT-25)", () => {
  test("replaces everything before first ## with template header", async () => {
    const existing = `Wrong header
## Standing Orders
- Do stuff
`;
    await fs.writeFile(heartbeatPath(), existing, "utf-8");

    await repairHeartbeatHeader(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("## Standing Orders");
    expect(content).toContain("- Do stuff");
    expect(content).not.toContain("Wrong header");
  });

  test("writes full template when file has no ## headings", async () => {
    await fs.writeFile(heartbeatPath(), "Just some text, no headings", "utf-8");

    await repairHeartbeatHeader(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("## Standing Orders");
    expect(content).toContain("## Recent Activity");
  });

  test("handles file with content before first ##", async () => {
    const existing = `User added text above headings

Some notes here

## Watch Items
- Important thing
`;
    await fs.writeFile(heartbeatPath(), existing, "utf-8");

    await repairHeartbeatHeader(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("## Watch Items");
    expect(content).toContain("- Important thing");
    expect(content).not.toContain("User added text above headings");
  });
});

describe("readHeartbeatFile", () => {
  test("returns content when file exists", async () => {
    await fs.writeFile(heartbeatPath(), "test content", "utf-8");
    const content = await readHeartbeatFile(projectPath);
    expect(content).toBe("test content");
  });

  test("returns null when file does not exist", async () => {
    const content = await readHeartbeatFile(projectPath);
    expect(content).toBeNull();
  });
});

describe("hasContentBelowHeader (REQ-HBT-3)", () => {
  test("returns false for template-only file", async () => {
    await ensureHeartbeatFile(projectPath);
    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(hasContentBelowHeader(content)).toBe(false);
  });

  test("returns true when standing orders have content", () => {
    const content = `# Heartbeat

## Standing Orders
- Review all PRs daily

## Watch Items

## Context Notes

## Recent Activity
`;
    expect(hasContentBelowHeader(content)).toBe(true);
  });

  test("returns true when recent activity has entries", () => {
    const content = `# Heartbeat

## Standing Orders

## Watch Items

## Context Notes

## Recent Activity
- 14:00 commission completed
`;
    expect(hasContentBelowHeader(content)).toBe(true);
  });

  test("returns false for content with only headings and whitespace", () => {
    const content = `# Heartbeat

## Standing Orders

## Watch Items

## Context Notes

## Recent Activity
`;
    expect(hasContentBelowHeader(content)).toBe(false);
  });
});

describe("clearRecentActivity (REQ-HBT-20)", () => {
  test("clears content under Recent Activity heading", async () => {
    const content = `# Heartbeat

## Standing Orders
- Do stuff

## Recent Activity
- 14:00 commission completed
- 14:30 review finished
`;
    await fs.writeFile(heartbeatPath(), content, "utf-8");

    await clearRecentActivity(projectPath);

    const result = await fs.readFile(heartbeatPath(), "utf-8");
    expect(result).toContain("## Standing Orders");
    expect(result).toContain("- Do stuff");
    expect(result).toContain("## Recent Activity");
    expect(result).not.toContain("commission completed");
    expect(result).not.toContain("review finished");
  });

  test("no-op when Recent Activity section doesn't exist", async () => {
    const content = `# Heartbeat

## Standing Orders
- Do stuff
`;
    await fs.writeFile(heartbeatPath(), content, "utf-8");

    await clearRecentActivity(projectPath);

    const result = await fs.readFile(heartbeatPath(), "utf-8");
    expect(result).toBe(content);
  });
});

describe("appendToSection (REQ-HBT-12)", () => {
  test("adds list item under correct heading", async () => {
    await ensureHeartbeatFile(projectPath);

    await appendToSection(projectPath, "Standing Orders", "- Review PRs daily");

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("## Standing Orders\n- Review PRs daily");
  });

  test("adds to Watch Items section", async () => {
    await ensureHeartbeatFile(projectPath);

    await appendToSection(projectPath, "Watch Items", "- Memory usage");

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("## Watch Items\n- Memory usage");
  });

  test("creates missing section before Recent Activity", async () => {
    const content = `# Heartbeat

## Standing Orders

## Recent Activity
`;
    await fs.writeFile(heartbeatPath(), content, "utf-8");

    await appendToSection(projectPath, "Custom Section", "- Custom entry");

    const result = await fs.readFile(heartbeatPath(), "utf-8");
    // Custom Section should appear before Recent Activity
    const customIndex = result.indexOf("## Custom Section");
    const recentIndex = result.indexOf("## Recent Activity");
    expect(customIndex).toBeGreaterThan(-1);
    expect(recentIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeLessThan(recentIndex);
    expect(result).toContain("- Custom entry");
  });

  test("creates missing section at end when no Recent Activity", async () => {
    const content = `# Heartbeat

## Standing Orders
`;
    await fs.writeFile(heartbeatPath(), content, "utf-8");

    await appendToSection(projectPath, "New Section", "- New entry");

    const result = await fs.readFile(heartbeatPath(), "utf-8");
    expect(result).toContain("## New Section");
    expect(result).toContain("- New entry");
  });

  test("appends to existing section with content", async () => {
    const content = `# Heartbeat

## Standing Orders
- Existing order

## Watch Items

## Recent Activity
`;
    await fs.writeFile(heartbeatPath(), content, "utf-8");

    await appendToSection(projectPath, "Standing Orders", "- New order");

    const result = await fs.readFile(heartbeatPath(), "utf-8");
    expect(result).toContain("- Existing order");
    expect(result).toContain("- New order");
    // Both should be in Standing Orders section (before Watch Items)
    const existingIndex = result.indexOf("- Existing order");
    const newIndex = result.indexOf("- New order");
    const watchIndex = result.indexOf("## Watch Items");
    expect(existingIndex).toBeLessThan(watchIndex);
    expect(newIndex).toBeLessThan(watchIndex);
  });
});

describe("repairHeartbeatHeader edge case: file starts with ##", () => {
  test("preserves section content when file starts with ## directly (F4 fix)", async () => {
    // File has no header at all, starts directly with a section heading
    const existing = `## Standing Orders
- Do stuff

## Watch Items
- Important thing
`;
    await fs.writeFile(heartbeatPath(), existing, "utf-8");

    await repairHeartbeatHeader(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("## Standing Orders");
    expect(content).toContain("- Do stuff");
    expect(content).toContain("## Watch Items");
    expect(content).toContain("- Important thing");
  });

  test("preserves all sections when file starts with ## and has no header", async () => {
    const existing = `## Standing Orders
- First order
- Second order

## Context Notes
- Note here
`;
    await fs.writeFile(heartbeatPath(), existing, "utf-8");

    await repairHeartbeatHeader(projectPath);

    const content = await fs.readFile(heartbeatPath(), "utf-8");
    expect(content).toContain("# Heartbeat");
    expect(content).toContain("- First order");
    expect(content).toContain("- Second order");
    expect(content).toContain("- Note here");
  });
});

describe("countStandingOrders", () => {
  test("counts list items under Standing Orders", () => {
    const content = `# Heartbeat

## Standing Orders
- First order
- Second order
- Third order

## Watch Items

## Recent Activity
`;
    expect(countStandingOrders(content)).toBe(3);
  });

  test("returns 0 when section is empty", () => {
    const content = `# Heartbeat

## Standing Orders

## Watch Items
`;
    expect(countStandingOrders(content)).toBe(0);
  });

  test("returns 0 when section is missing", () => {
    const content = `# Heartbeat

## Watch Items
- Something
`;
    expect(countStandingOrders(content)).toBe(0);
  });

  test("does not count items from other sections", () => {
    const content = `# Heartbeat

## Standing Orders
- Only this one

## Watch Items
- Not this
- Nor this

## Recent Activity
- Also not this
`;
    expect(countStandingOrders(content)).toBe(1);
  });

  test("handles Standing Orders as last section", () => {
    const content = `# Heartbeat

## Watch Items

## Standing Orders
- Order one
- Order two
`;
    expect(countStandingOrders(content)).toBe(2);
  });
});
