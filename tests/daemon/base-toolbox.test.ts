import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBaseToolbox,
  makeReadMemoryHandler,
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

// -- read_memory / write_memory --

describe("memory tools", () => {
  const workerName = "test-worker";
  const projectName = "test-project";

  test("write then read global scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);

    await write({ scope: "global", path: "notes.md", content: "hello world" });
    const result = await read({ scope: "global", path: "notes.md" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "hello world" });
  });

  test("write then read project scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);

    await write({ scope: "project", path: "context.txt", content: "project data" });
    const result = await read({ scope: "project", path: "context.txt" });

    expect(result.content[0]).toEqual({ type: "text", text: "project data" });
  });

  test("write then read worker scope", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);

    await write({ scope: "worker", path: "prefs.json", content: '{"k":"v"}' });
    const result = await read({ scope: "worker", path: "prefs.json" });

    expect(result.content[0]).toEqual({ type: "text", text: '{"k":"v"}' });
  });

  test("write creates nested directories", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);

    await write({ scope: "global", path: "deep/nested/file.txt", content: "deep" });
    const result = await read({ scope: "global", path: "deep/nested/file.txt" });

    expect(result.content[0]).toEqual({ type: "text", text: "deep" });
  });

  test("read directory lists contents", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);

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
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);
    const result = await read({ scope: "global", path: "nope.txt" });

    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Not found");
    }
  });

  test("read scope root when empty returns error", async () => {
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);
    const result = await read({ scope: "global" });

    // The global directory doesn't exist yet, so ENOENT
    expect(result.isError).toBe(true);
  });

  test("path traversal in read_memory is rejected", async () => {
    const read = makeReadMemoryHandler(guildHallHome, workerName, projectName);
    await expect(
      read({ scope: "global", path: "../../etc/passwd" }),
    ).rejects.toThrow("Path traversal detected");
  });

  test("path traversal in write_memory is rejected", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, workerName, projectName);
    await expect(
      write({ scope: "global", path: "../../../etc/evil", content: "bad" }),
    ).rejects.toThrow("Path traversal detected");
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
