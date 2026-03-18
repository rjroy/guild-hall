import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBaseToolbox,
  makeReadMemoryHandler,
  makeEditMemoryHandler,
  makeWriteMemoryHandler,
  makeRecordDecisionHandler,
} from "@/daemon/services/base-toolbox";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-base-toolbox-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- createBaseToolbox --

describe("createBaseToolbox", () => {
  test("returns an MCP server config with type sdk", () => {
    const result = createBaseToolbox({
      contextId: "meeting-001",
      contextType: "meeting",
      workerName: "test-worker",
      projectName: "test-project",
      guildHallHome,
    });

    expect(result.type).toBe("sdk");
    expect(result.name).toBe("guild-hall-base");
    expect(result.instance).toBeDefined();
  });
});

// -- read_memory --

describe("read_memory", () => {
  const workerName = "test-worker";
  const projectName = "test-project";

  test("full file read (no section param)", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    // Pre-populate the scope file
    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nSenior engineer\n", "utf-8");

    const result = await read({ scope: "worker" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("## User");
    expect(result.content[0].text).toContain("Senior engineer");
  });

  test("section read (case-insensitive)", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nSenior engineer\n\n## Feedback\nBe concise\n", "utf-8");

    const result = await read({ scope: "worker", section: "feedback" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Be concise");
  });

  test("section not found error", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nInfo\n", "utf-8");

    const result = await read({ scope: "worker", section: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Section not found");
  });

  test("file not found returns 'No memories saved yet.'", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    const result = await read({ scope: "worker" });
    expect(result.content[0].text).toBe("No memories saved yet.");
  });

  test("tracks scope in readScopes set", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    await read({ scope: "worker" });
    expect(readScopes.has("worker")).toBe(true);

    await read({ scope: "global" });
    expect(readScopes.has("global")).toBe(true);
  });

  test("reads from correct scope paths", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    // Set up global scope file
    const globalPath = path.join(guildHallHome, "memory", "global.md");
    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    await fs.writeFile(globalPath, "## Shared\nGlobal data\n", "utf-8");

    const result = await read({ scope: "global" });
    expect(result.content[0].text).toContain("Global data");

    // Set up project scope file
    const projectPath = path.join(guildHallHome, "memory", "projects", `${projectName}.md`);
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(projectPath, "## Project\nProject data\n", "utf-8");

    const result2 = await read({ scope: "project" });
    expect(result2.content[0].text).toContain("Project data");
  });
});

// -- edit_memory --

describe("edit_memory", () => {
  const workerName = "test-worker";
  const projectName = "test-project";

  function makeHandlers() {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    const edit = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    return { read, edit, readScopes };
  }

  test("upsert creates file and section when neither exists", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" }); // read-before-write

    const result = await edit({
      scope: "worker",
      section: "User",
      operation: "upsert",
      content: "Senior engineer",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Memory updated");

    // Verify file exists with correct content
    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## User");
    expect(content).toContain("Senior engineer");
  });

  test("upsert replaces existing section content", async () => {
    const { read, edit } = makeHandlers();

    // Create initial content
    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nOld info\n", "utf-8");

    await read({ scope: "worker" });
    await edit({
      scope: "worker",
      section: "User",
      operation: "upsert",
      content: "New info",
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("New info");
    expect(content).not.toContain("Old info");
  });

  test("upsert creates new section in existing file", async () => {
    const { read, edit } = makeHandlers();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nExisting\n", "utf-8");

    await read({ scope: "worker" });
    await edit({
      scope: "worker",
      section: "Feedback",
      operation: "upsert",
      content: "Be concise",
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## User");
    expect(content).toContain("Existing");
    expect(content).toContain("## Feedback");
    expect(content).toContain("Be concise");
  });

  test("append to existing section (blank line separator)", async () => {
    const { read, edit } = makeHandlers();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## Log\nFirst entry\n", "utf-8");

    await read({ scope: "worker" });
    await edit({
      scope: "worker",
      section: "Log",
      operation: "append",
      content: "Second entry",
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("First entry");
    expect(content).toContain("Second entry");
    // Blank line separator between old and new content
    expect(content).toContain("First entry\n\nSecond entry");
  });

  test("append creates section if missing", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    await edit({
      scope: "worker",
      section: "Log",
      operation: "append",
      content: "First entry",
    });

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## Log");
    expect(content).toContain("First entry");
  });

  test("delete removes section", async () => {
    const { read, edit } = makeHandlers();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nKeep\n\n## Temp\nRemove me\n", "utf-8");

    await read({ scope: "worker" });
    await edit({
      scope: "worker",
      section: "Temp",
      operation: "delete",
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## User");
    expect(content).toContain("Keep");
    expect(content).not.toContain("## Temp");
    expect(content).not.toContain("Remove me");
  });

  test("delete is idempotent (missing section returns success)", async () => {
    const { read, edit } = makeHandlers();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## User\nInfo\n", "utf-8");

    await read({ scope: "worker" });
    const result = await edit({
      scope: "worker",
      section: "NonExistent",
      operation: "delete",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Memory updated");
  });

  test("section name validation: empty", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    const result = await edit({
      scope: "worker",
      section: "",
      operation: "upsert",
      content: "test",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("non-empty");
  });

  test("section name validation: contains newlines", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    const result = await edit({
      scope: "worker",
      section: "Bad\nName",
      operation: "upsert",
      content: "test",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("newlines");
  });

  test("section name validation: over 100 chars", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    const result = await edit({
      scope: "worker",
      section: "x".repeat(100),
      operation: "upsert",
      content: "test",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("under 100");
  });

  test("case-insensitive matching preserves original casing", async () => {
    const { read, edit } = makeHandlers();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## My Section\nOriginal\n", "utf-8");

    await read({ scope: "worker" });
    await edit({
      scope: "worker",
      section: "my section",  // lowercase
      operation: "upsert",
      content: "Updated",
    });

    const content = await fs.readFile(filePath, "utf-8");
    // Original casing "My Section" should be preserved
    expect(content).toContain("## My Section");
    expect(content).toContain("Updated");
  });

  test("budget warning when file exceeds 16k", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    const largeContent = "x".repeat(17000);
    const result = await edit({
      scope: "worker",
      section: "Big",
      operation: "upsert",
      content: largeContent,
    });

    expect(result.content[0].text).toContain("budget");
    expect(result.content[0].text).toContain("Consider condensing");
  });

  test("concurrent writes produce file with both updates", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    // Two concurrent upserts to different sections
    const [r1, r2] = await Promise.all([
      edit({ scope: "worker", section: "A", operation: "upsert", content: "Content A" }),
      edit({ scope: "worker", section: "B", operation: "upsert", content: "Content B" }),
    ]);

    expect(r1.isError).toBeUndefined();
    expect(r2.isError).toBeUndefined();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## A");
    expect(content).toContain("Content A");
    expect(content).toContain("## B");
    expect(content).toContain("Content B");
  });

  test("atomic write: uses temp file", async () => {
    const { read, edit } = makeHandlers();
    await read({ scope: "worker" });

    await edit({
      scope: "worker",
      section: "Test",
      operation: "upsert",
      content: "Atomic test",
    });

    // The .tmp file should not exist after successful write
    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const tmpPath = `${filePath}.tmp`;
    const tmpExists = await fs.access(tmpPath).then(() => true, () => false);
    expect(tmpExists).toBe(false);

    // The actual file should exist
    const fileExists = await fs.access(filePath).then(() => true, () => false);
    expect(fileExists).toBe(true);
  });
});

// -- read-before-write guard (REQ-MEM-27) --

describe("read-before-write guard", () => {
  const workerName = "test-worker";
  const projectName = "test-project";

  test("edit_memory rejected when read_memory not called for that scope", async () => {
    const readScopes = new Set<string>();
    const edit = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    const result = await edit({
      scope: "project",
      section: "Test",
      operation: "upsert",
      content: "data",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Read memory before editing");
    expect(result.content[0].text).toContain("'project'");
  });

  test("edit_memory succeeds after read_memory for same scope", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    const edit = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    await read({ scope: "project" });
    const result = await edit({
      scope: "project",
      section: "Test",
      operation: "upsert",
      content: "data",
    });

    expect(result.isError).toBeUndefined();
  });

  test("reading scope A does not authorize editing scope B", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    const edit = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    await read({ scope: "global" });
    const result = await edit({
      scope: "project",
      section: "Test",
      operation: "upsert",
      content: "data",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Read memory before editing");
  });

  test("write_memory alias also subject to guard", async () => {
    const readScopes = new Set<string>();
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    const result = await write({
      scope: "worker",
      path: "section-name",
      content: "data",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Read memory before editing");
  });
});

// -- write_memory alias --

describe("write_memory deprecation alias", () => {
  const workerName = "test-worker";
  const projectName = "test-project";

  test("maps to upsert correctly", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    await read({ scope: "worker" });
    const result = await write({
      scope: "worker",
      path: "MySection",
      content: "Test content",
    });

    expect(result.isError).toBeUndefined();

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## MySection");
    expect(content).toContain("Test content");
  });

  test("path parameter becomes section name", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName, readScopes);

    await read({ scope: "worker" });
    await write({
      scope: "worker",
      path: "decisions/auth.md",
      content: "Decision data",
    });

    const filePath = path.join(guildHallHome, "memory", "workers", `${workerName}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    // The path is used verbatim as section name
    expect(content).toContain("## decisions/auth.md");
  });
});

// -- record_decision --

describe("record_decision", () => {
  test("creates meeting directory and appends JSONL entry", async () => {
    const handler = makeRecordDecisionHandler(guildHallHome, "meeting-001", "meeting");

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
    const handler = makeRecordDecisionHandler(guildHallHome, "meeting-002", "meeting");

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

  test("commission context writes to commissions state directory", async () => {
    const handler = makeRecordDecisionHandler(guildHallHome, "commission-001", "commission");

    await handler({
      question: "Which approach?",
      decision: "Pattern A",
      reasoning: "Simpler implementation",
    });

    const logPath = path.join(
      guildHallHome,
      "state/commissions/commission-001/decisions.jsonl",
    );
    const raw = await fs.readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.question).toBe("Which approach?");
    expect(entry.decision).toBe("Pattern A");
  });
});
