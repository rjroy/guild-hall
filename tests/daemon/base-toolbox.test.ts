import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBaseToolbox,
  makeReadMemoryHandler,
  makeWriteMemoryHandler,
  makeReadArtifactHandler,
  makeWriteArtifactHandler,
  makeListArtifactsHandler,
  makeRecordDecisionHandler,
} from "@/daemon/services/base-toolbox";

let tmpDir: string;
let guildHallHome: string;
let projectPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-base-toolbox-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
  projectPath = path.join(tmpDir, "test-project");

  // Create project .lore directory
  await fs.mkdir(path.join(projectPath, ".lore"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test artifact into the project's .lore/ directory.
 */
async function writeTestArtifact(
  relativePath: string,
  frontmatter: string,
  body: string,
): Promise<void> {
  const fullPath = path.join(projectPath, ".lore", relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const content = frontmatter
    ? `---\n${frontmatter}\n---\n${body}`
    : body;
  await fs.writeFile(fullPath, content, "utf-8");
}

// -- createBaseToolbox --

describe("createBaseToolbox", () => {
  test("returns an MCP server config with type sdk", () => {
    const result = createBaseToolbox({
      projectPath,
      meetingId: "meeting-001",
      guildHallHome,
    });

    expect(result.type).toBe("sdk");
    expect(result.name).toBe("guild-hall-base");
    expect(result.instance).toBeDefined();
  });
});

// -- read_memory / write_memory --

describe("memory tools", () => {
  test("write then read global scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    const read = makeReadMemoryHandler(guildHallHome);

    await write({ scope: "global", path: "notes.md", content: "hello world" });
    const result = await read({ scope: "global", path: "notes.md" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "hello world" });
  });

  test("write then read project scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    const read = makeReadMemoryHandler(guildHallHome);

    await write({ scope: "project", path: "context.txt", content: "project data" });
    const result = await read({ scope: "project", path: "context.txt" });

    expect(result.content[0]).toEqual({ type: "text", text: "project data" });
  });

  test("write then read worker scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    const read = makeReadMemoryHandler(guildHallHome);

    await write({ scope: "worker", path: "prefs.json", content: '{"k":"v"}' });
    const result = await read({ scope: "worker", path: "prefs.json" });

    expect(result.content[0]).toEqual({ type: "text", text: '{"k":"v"}' });
  });

  test("write creates nested directories", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    const read = makeReadMemoryHandler(guildHallHome);

    await write({ scope: "global", path: "deep/nested/file.txt", content: "deep" });
    const result = await read({ scope: "global", path: "deep/nested/file.txt" });

    expect(result.content[0]).toEqual({ type: "text", text: "deep" });
  });

  test("read directory lists contents", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    const read = makeReadMemoryHandler(guildHallHome);

    await write({ scope: "global", path: "a.txt", content: "a" });
    await write({ scope: "global", path: "b.txt", content: "b" });
    await write({ scope: "global", path: "subdir/c.txt", content: "c" });

    const result = await read({ scope: "global" });
    const text = result.content[0];
    expect(text.type).toBe("text");
    // Should list entries (files and dirs)
    if (text.type === "text") {
      expect(text.text).toContain("a.txt");
      expect(text.text).toContain("b.txt");
      expect(text.text).toContain("subdir/");
    }
  });

  test("read nonexistent path returns error", async () => {
    const read = makeReadMemoryHandler(guildHallHome);
    const result = await read({ scope: "global", path: "nope.txt" });

    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Not found");
    }
  });

  test("read scope root when empty returns error", async () => {
    const read = makeReadMemoryHandler(guildHallHome);
    const result = await read({ scope: "global" });

    // The global directory doesn't exist yet, so ENOENT
    expect(result.isError).toBe(true);
  });

  test("path traversal in read_memory is rejected", async () => {
    const read = makeReadMemoryHandler(guildHallHome);
    await expect(
      read({ scope: "global", path: "../../etc/passwd" }),
    ).rejects.toThrow("Path traversal detected");
  });

  test("path traversal in write_memory is rejected", async () => {
    const write = makeWriteMemoryHandler(guildHallHome);
    await expect(
      write({ scope: "global", path: "../../../etc/evil", content: "bad" }),
    ).rejects.toThrow("Path traversal detected");
  });
});

// -- read_artifact --

describe("read_artifact", () => {
  test("returns content with parsed frontmatter", async () => {
    await writeTestArtifact(
      "specs/design.md",
      "title: Design Spec\ndate: 2025-01-01\nstatus: approved\ntags: [spec, design]",
      "\nThis is the design spec body.",
    );

    const handler = makeReadArtifactHandler(projectPath);
    const result = await handler({ relativePath: "specs/design.md" });

    expect(result.isError).toBeUndefined();
    const text = result.content[0];
    if (text.type === "text") {
      expect(text.text).toContain("title: Design Spec");
      expect(text.text).toContain("status: approved");
      expect(text.text).toContain("This is the design spec body.");
    }
  });

  test("returns error for nonexistent artifact", async () => {
    const handler = makeReadArtifactHandler(projectPath);
    const result = await handler({ relativePath: "nope.md" });

    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("not found");
    }
  });

  test("path traversal in read_artifact is rejected", async () => {
    const handler = makeReadArtifactHandler(projectPath);
    await expect(
      handler({ relativePath: "../../etc/passwd" }),
    ).rejects.toThrow("Path traversal detected");
  });
});

// -- write_artifact --

describe("write_artifact", () => {
  test("preserves existing frontmatter when updating body", async () => {
    await writeTestArtifact(
      "notes/update-me.md",
      "title: Update Me\ndate: 2025-06-01\nstatus: draft\ntags: [test]",
      "\nOriginal body content.",
    );

    const handler = makeWriteArtifactHandler(projectPath);
    const result = await handler({
      relativePath: "notes/update-me.md",
      content: "\nUpdated body content.",
    });

    expect(result.isError).toBeUndefined();

    // Verify the file on disk
    const raw = await fs.readFile(
      path.join(projectPath, ".lore", "notes/update-me.md"),
      "utf-8",
    );
    expect(raw).toContain("title: Update Me");
    expect(raw).toContain("Updated body content.");
    expect(raw).not.toContain("Original body content.");
  });

  test("returns error for nonexistent artifact", async () => {
    const handler = makeWriteArtifactHandler(projectPath);
    const result = await handler({
      relativePath: "nope.md",
      content: "new content",
    });

    expect(result.isError).toBe(true);
  });

  test("path traversal in write_artifact is rejected", async () => {
    const handler = makeWriteArtifactHandler(projectPath);
    await expect(
      handler({ relativePath: "../../../etc/evil", content: "bad" }),
    ).rejects.toThrow("Path traversal detected");
  });
});

// -- list_artifacts --

describe("list_artifacts", () => {
  test("lists all artifacts", async () => {
    await writeTestArtifact("specs/a.md", "title: A\nstatus: active\ntags: []", "\nbody a");
    await writeTestArtifact("notes/b.md", "title: B\nstatus: draft\ntags: []", "\nbody b");

    const handler = makeListArtifactsHandler(projectPath);
    const result = await handler({});

    const text = result.content[0];
    if (text.type === "text") {
      expect(text.text).toContain("specs/a.md");
      expect(text.text).toContain("notes/b.md");
    }
  });

  test("filters by directory prefix", async () => {
    await writeTestArtifact("specs/a.md", "title: A\nstatus: active\ntags: []", "\nbody a");
    await writeTestArtifact("notes/b.md", "title: B\nstatus: draft\ntags: []", "\nbody b");

    const handler = makeListArtifactsHandler(projectPath);
    const result = await handler({ directory: "specs/" });

    const text = result.content[0];
    if (text.type === "text") {
      expect(text.text).toContain("specs/a.md");
      expect(text.text).not.toContain("notes/b.md");
    }
  });

  test("returns message when no artifacts found", async () => {
    const handler = makeListArtifactsHandler(projectPath);
    const result = await handler({});

    const text = result.content[0];
    if (text.type === "text") {
      expect(text.text).toBe("(no artifacts found)");
    }
  });
});

// -- record_decision --

describe("record_decision", () => {
  test("creates meeting directory and appends JSONL entry", async () => {
    const handler = makeRecordDecisionHandler(guildHallHome, "meeting-001");

    await handler({
      question: "Which framework?",
      decision: "Next.js",
      reasoning: "SSR and routing built in",
    });

    const logPath = path.join(
      guildHallHome,
      "state/meetings/meeting-001/decisions.jsonl",
    );
    const raw = await fs.readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.question).toBe("Which framework?");
    expect(entry.decision).toBe("Next.js");
    expect(entry.reasoning).toBe("SSR and routing built in");
    expect(entry.timestamp).toBeDefined();
  });

  test("appends multiple decisions", async () => {
    const handler = makeRecordDecisionHandler(guildHallHome, "meeting-002");

    await handler({
      question: "Q1",
      decision: "D1",
      reasoning: "R1",
    });
    await handler({
      question: "Q2",
      decision: "D2",
      reasoning: "R2",
    });

    const logPath = path.join(
      guildHallHome,
      "state/meetings/meeting-002/decisions.jsonl",
    );
    const raw = await fs.readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    expect(first.question).toBe("Q1");
    expect(second.question).toBe("Q2");
  });
});
