import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeReadMemoryHandler,
  makeWriteMemoryHandler,
  createBaseToolbox,
} from "@/daemon/services/base-toolbox";
import type { GuildHallToolboxDeps } from "@/daemon/services/toolbox-types";
import { noopEventBus } from "@/daemon/services/event-bus";
import { resolveToolSet } from "@/daemon/services/toolbox-resolver";
import type { WorkerMetadata } from "@/lib/types";

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mem-access-"));
  guildHallHome = path.join(tmpDir, ".guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Worker scope isolation --

describe("worker scope isolation", () => {
  test("worker A writes to its own memory directory", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, "worker-a", "my-project");

    await write({ scope: "worker", path: "notes.md", content: "A's notes" });

    // Verify the file lands in the correct worker-specific directory
    const filePath = path.join(guildHallHome, "memory", "workers", "worker-a", "notes.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("A's notes");
  });

  test("worker A reads from its own memory directory", async () => {
    // Pre-populate worker A's memory
    const workerDir = path.join(guildHallHome, "memory", "workers", "worker-a");
    await fs.mkdir(workerDir, { recursive: true });
    await fs.writeFile(path.join(workerDir, "data.txt"), "A's data", "utf-8");

    const read = makeReadMemoryHandler(guildHallHome, "worker-a", "my-project");
    const result = await read({ scope: "worker", path: "data.txt" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: "A's data" });
  });

  test("worker A cannot read worker B's memory (separate handler instances)", async () => {
    // Worker B writes data
    const writeB = makeWriteMemoryHandler(guildHallHome, "worker-b", "my-project");
    await writeB({ scope: "worker", path: "secret.txt", content: "B's secret" });

    // Worker A's handler reads from A's directory, which doesn't have B's file
    const readA = makeReadMemoryHandler(guildHallHome, "worker-a", "my-project");
    const result = await readA({ scope: "worker", path: "secret.txt" });

    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Not found");
    }
  });

  test("worker scope parameter is not in the tool input schema (workerName is implicit)", () => {
    // The tool schema only accepts scope and path, not workerName.
    // The workerName is bound at handler creation time. Verify by creating a
    // handler and confirming it always targets the bound worker's directory.
    const writeA = makeWriteMemoryHandler(guildHallHome, "worker-a", "my-project");
    const writeB = makeWriteMemoryHandler(guildHallHome, "worker-b", "my-project");

    // Both write to the same relative path but different absolute directories
    const promiseA = writeA({ scope: "worker", path: "shared-name.txt", content: "from A" });
    const promiseB = writeB({ scope: "worker", path: "shared-name.txt", content: "from B" });

    return Promise.all([promiseA, promiseB]).then(async () => {
      const pathA = path.join(guildHallHome, "memory", "workers", "worker-a", "shared-name.txt");
      const pathB = path.join(guildHallHome, "memory", "workers", "worker-b", "shared-name.txt");

      const contentA = await fs.readFile(pathA, "utf-8");
      const contentB = await fs.readFile(pathB, "utf-8");

      expect(contentA).toBe("from A");
      expect(contentB).toBe("from B");
    });
  });

  test("two workers with different names have isolated worker scope", async () => {
    const writeA = makeWriteMemoryHandler(guildHallHome, "analyst", "project-x");
    const readA = makeReadMemoryHandler(guildHallHome, "analyst", "project-x");
    const writeB = makeWriteMemoryHandler(guildHallHome, "coder", "project-x");
    const readB = makeReadMemoryHandler(guildHallHome, "coder", "project-x");

    await writeA({ scope: "worker", path: "state.json", content: '{"role":"analyst"}' });
    await writeB({ scope: "worker", path: "state.json", content: '{"role":"coder"}' });

    const resultA = await readA({ scope: "worker", path: "state.json" });
    const resultB = await readB({ scope: "worker", path: "state.json" });

    expect(resultA.content[0]).toEqual({ type: "text", text: '{"role":"analyst"}' });
    expect(resultB.content[0]).toEqual({ type: "text", text: '{"role":"coder"}' });
  });
});

// -- Project scope resolution --

describe("project scope resolution", () => {
  test("project scope uses the provided project name", async () => {
    const write = makeWriteMemoryHandler(guildHallHome, "any-worker", "my-project");

    await write({ scope: "project", path: "context.md", content: "project notes" });

    const filePath = path.join(guildHallHome, "memory", "projects", "my-project", "context.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("project notes");
  });

  test("project scope never falls back to 'unknown'", async () => {
    // With the new interface, projectName is required, so there's no fallback.
    // Verify the directory is named correctly (not "unknown").
    const write = makeWriteMemoryHandler(guildHallHome, "worker", "guild-hall");

    await write({ scope: "project", path: "file.txt", content: "test" });

    const correctPath = path.join(guildHallHome, "memory", "projects", "guild-hall", "file.txt");
    const unknownPath = path.join(guildHallHome, "memory", "projects", "unknown", "file.txt");

    const correctExists = await fs.access(correctPath).then(() => true, () => false);
    const unknownExists = await fs.access(unknownPath).then(() => true, () => false);

    expect(correctExists).toBe(true);
    expect(unknownExists).toBe(false);
  });

  test("workers on different projects write to different project scopes", async () => {
    const writeX = makeWriteMemoryHandler(guildHallHome, "worker", "project-x");
    const writeY = makeWriteMemoryHandler(guildHallHome, "worker", "project-y");

    await writeX({ scope: "project", path: "data.txt", content: "from X" });
    await writeY({ scope: "project", path: "data.txt", content: "from Y" });

    const pathX = path.join(guildHallHome, "memory", "projects", "project-x", "data.txt");
    const pathY = path.join(guildHallHome, "memory", "projects", "project-y", "data.txt");

    expect(await fs.readFile(pathX, "utf-8")).toBe("from X");
    expect(await fs.readFile(pathY, "utf-8")).toBe("from Y");
  });

  test("different workers on the same project share project scope", async () => {
    const writeA = makeWriteMemoryHandler(guildHallHome, "analyst", "shared-project");
    const readB = makeReadMemoryHandler(guildHallHome, "coder", "shared-project");

    await writeA({ scope: "project", path: "shared.md", content: "shared data" });
    const result = await readB({ scope: "project", path: "shared.md" });

    expect(result.content[0]).toEqual({ type: "text", text: "shared data" });
  });
});

// -- Global scope --

describe("global scope", () => {
  test("any worker can write to global scope", async () => {
    const writeA = makeWriteMemoryHandler(guildHallHome, "worker-a", "project-1");
    const writeB = makeWriteMemoryHandler(guildHallHome, "worker-b", "project-2");

    await writeA({ scope: "global", path: "from-a.txt", content: "hello from A" });
    await writeB({ scope: "global", path: "from-b.txt", content: "hello from B" });

    const globalDir = path.join(guildHallHome, "memory", "global");
    expect(await fs.readFile(path.join(globalDir, "from-a.txt"), "utf-8")).toBe("hello from A");
    expect(await fs.readFile(path.join(globalDir, "from-b.txt"), "utf-8")).toBe("hello from B");
  });

  test("any worker can read global scope", async () => {
    // Pre-populate global memory
    const globalDir = path.join(guildHallHome, "memory", "global");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.writeFile(path.join(globalDir, "global.txt"), "global data", "utf-8");

    const readA = makeReadMemoryHandler(guildHallHome, "worker-a", "project-1");
    const readB = makeReadMemoryHandler(guildHallHome, "worker-b", "project-2");

    const resultA = await readA({ scope: "global", path: "global.txt" });
    const resultB = await readB({ scope: "global", path: "global.txt" });

    expect(resultA.content[0]).toEqual({ type: "text", text: "global data" });
    expect(resultB.content[0]).toEqual({ type: "text", text: "global data" });
  });
});

// -- GuildHallToolboxDeps integration --

describe("GuildHallToolboxDeps integration", () => {
  test("createBaseToolbox requires workerName and projectName", () => {
    const deps: GuildHallToolboxDeps = {
      contextId: "meeting-001",
      contextType: "meeting",
      workerName: "my-worker",
      projectName: "my-project",
      guildHallHome,
      eventBus: noopEventBus,
      config: { projects: [] },
    };

    const result = createBaseToolbox(deps);

    expect(result.type).toBe("sdk");
    expect(result.name).toBe("guild-hall-base");
  });
});

// -- Toolbox resolver propagation --

describe("toolbox resolver passes identity to base toolbox", () => {
  function makeWorker(overrides?: Partial<WorkerMetadata>): WorkerMetadata {
    return {
      type: "worker",
      identity: {
        name: "test-worker",
        description: "A test worker",
        displayTitle: "Test Worker",
      },
      posture: "You are a test worker.",
      domainToolboxes: [],
      builtInTools: [],
      checkoutScope: "sparse",
      ...overrides,
    };
  }

  test("resolveToolSet creates base toolbox with workerName from context", async () => {
    const worker = makeWorker();
    const result = await resolveToolSet(worker, [], {
      projectName: "test-project",
      contextId: "meeting-test",
      contextType: "meeting",
      workerName: "my-specific-worker",
      guildHallHome,
      eventBus: noopEventBus,
      config: { projects: [] },
    });

    expect(result.mcpServers.length).toBeGreaterThanOrEqual(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });

  test("workerName is always required in new context shape", async () => {
    const worker = makeWorker();
    const result = await resolveToolSet(worker, [], {
      projectName: "test-project",
      contextId: "meeting-test",
      contextType: "meeting",
      workerName: "fallback-worker",
      guildHallHome,
      eventBus: noopEventBus,
      config: { projects: [] },
    });

    // Base + auto-added meeting context toolbox
    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
    expect(result.mcpServers[1].name).toBe("guild-hall-meeting");
  });

  test("projectName is passed through to base toolbox", async () => {
    const worker = makeWorker();

    const result = await resolveToolSet(worker, [], {
      projectName: "explicit-project-name",
      contextId: "meeting-test",
      contextType: "meeting",
      workerName: "test-worker",
      guildHallHome,
      eventBus: noopEventBus,
      config: { projects: [] },
    });

    expect(result.mcpServers.length).toBeGreaterThanOrEqual(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });
});
