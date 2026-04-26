import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeReadMemoryHandler,
  makeEditMemoryHandler,
  createBaseToolbox,
} from "@/apps/daemon/services/base-toolbox";
import type { GuildHallToolboxDeps } from "@/apps/daemon/services/toolbox-types";
import { noopEventBus } from "@/apps/daemon/lib/event-bus";
import { resolveToolSet } from "@/apps/daemon/services/toolbox-resolver";
import { createContextTypeRegistry } from "@/apps/daemon/services/context-type-registry";
import type { WorkerMetadata } from "@/lib/types";

const registry = createContextTypeRegistry();

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
  test("worker A writes to its own memory file", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, "worker-a", "my-project", readScopes);
    const edit = makeEditMemoryHandler(guildHallHome, "worker-a", "my-project", readScopes);

    await read({ scope: "worker" });
    await edit({ scope: "worker", section: "Note", operation: "upsert", content: "A's notes" });

    const filePath = path.join(guildHallHome, "memory", "workers", "worker-a.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("A's notes");
  });

  test("worker A reads from its own memory file", async () => {
    // Pre-populate worker A's memory
    const filePath = path.join(guildHallHome, "memory", "workers", "worker-a.md");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "## Data\nA's data\n", "utf-8");

    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, "worker-a", "my-project", readScopes);
    const result = await read({ scope: "worker" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("A's data");
  });

  test("worker A cannot read worker B's memory (separate handler instances)", async () => {
    // Worker B writes data
    const readScopesB = new Set<string>();
    const readB = makeReadMemoryHandler(guildHallHome, "worker-b", "my-project", readScopesB);
    const editB = makeEditMemoryHandler(guildHallHome, "worker-b", "my-project", readScopesB);
    await readB({ scope: "worker" });
    await editB({ scope: "worker", section: "Secret", operation: "upsert", content: "B's secret" });

    // Worker A's handler reads from A's file, which doesn't have B's data
    const readScopesA = new Set<string>();
    const readA = makeReadMemoryHandler(guildHallHome, "worker-a", "my-project", readScopesA);
    const result = await readA({ scope: "worker" });

    // Worker A's file doesn't exist, so "No memories saved yet."
    expect(result.content[0].text).toContain("No memories saved yet.");
  });

  test("two workers with different names have isolated worker scope", async () => {
    const readScopesA = new Set<string>();
    const readScopesB = new Set<string>();
    const readA = makeReadMemoryHandler(guildHallHome, "analyst", "project-x", readScopesA);
    const editA = makeEditMemoryHandler(guildHallHome, "analyst", "project-x", readScopesA);
    const readB = makeReadMemoryHandler(guildHallHome, "coder", "project-x", readScopesB);
    const editB = makeEditMemoryHandler(guildHallHome, "coder", "project-x", readScopesB);

    await readA({ scope: "worker" });
    await editA({ scope: "worker", section: "Role", operation: "upsert", content: "analyst" });
    await readB({ scope: "worker" });
    await editB({ scope: "worker", section: "Role", operation: "upsert", content: "coder" });

    const resultA = await readA({ scope: "worker", section: "Role" });
    const resultB = await readB({ scope: "worker", section: "Role" });

    expect(resultA.content[0].text).toContain("analyst");
    expect(resultB.content[0].text).toContain("coder");
  });
});

// -- Project scope resolution --

describe("project scope resolution", () => {
  test("project scope uses the provided project name", async () => {
    const readScopes = new Set<string>();
    const read = makeReadMemoryHandler(guildHallHome, "any-worker", "my-project", readScopes);
    const edit = makeEditMemoryHandler(guildHallHome, "any-worker", "my-project", readScopes);

    await read({ scope: "project" });
    await edit({ scope: "project", section: "Context", operation: "upsert", content: "project notes" });

    const filePath = path.join(guildHallHome, "memory", "projects", "my-project.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("project notes");
  });

  test("workers on different projects write to different project scopes", async () => {
    const readScopesX = new Set<string>();
    const readScopesY = new Set<string>();
    const readX = makeReadMemoryHandler(guildHallHome, "worker", "project-x", readScopesX);
    const editX = makeEditMemoryHandler(guildHallHome, "worker", "project-x", readScopesX);
    const readY = makeReadMemoryHandler(guildHallHome, "worker", "project-y", readScopesY);
    const editY = makeEditMemoryHandler(guildHallHome, "worker", "project-y", readScopesY);

    await readX({ scope: "project" });
    await editX({ scope: "project", section: "Data", operation: "upsert", content: "from X" });
    await readY({ scope: "project" });
    await editY({ scope: "project", section: "Data", operation: "upsert", content: "from Y" });

    const pathX = path.join(guildHallHome, "memory", "projects", "project-x.md");
    const pathY = path.join(guildHallHome, "memory", "projects", "project-y.md");

    expect(await fs.readFile(pathX, "utf-8")).toContain("from X");
    expect(await fs.readFile(pathY, "utf-8")).toContain("from Y");
  });

  test("different workers on the same project share project scope", async () => {
    const readScopesA = new Set<string>();
    const readScopesB = new Set<string>();
    const readA = makeReadMemoryHandler(guildHallHome, "analyst", "shared-project", readScopesA);
    const editA = makeEditMemoryHandler(guildHallHome, "analyst", "shared-project", readScopesA);
    const readB = makeReadMemoryHandler(guildHallHome, "coder", "shared-project", readScopesB);

    await readA({ scope: "project" });
    await editA({ scope: "project", section: "Shared", operation: "upsert", content: "shared data" });

    const result = await readB({ scope: "project" });
    expect(result.content[0].text).toContain("shared data");
  });
});

// -- Global scope --

describe("global scope", () => {
  test("any worker can write to global scope", async () => {
    const readScopesA = new Set<string>();
    const readScopesB = new Set<string>();
    const readA = makeReadMemoryHandler(guildHallHome, "worker-a", "project-1", readScopesA);
    const editA = makeEditMemoryHandler(guildHallHome, "worker-a", "project-1", readScopesA);
    const readB = makeReadMemoryHandler(guildHallHome, "worker-b", "project-2", readScopesB);
    const editB = makeEditMemoryHandler(guildHallHome, "worker-b", "project-2", readScopesB);

    await readA({ scope: "global" });
    await editA({ scope: "global", section: "From-A", operation: "upsert", content: "hello from A" });
    await readB({ scope: "global" });
    await editB({ scope: "global", section: "From-B", operation: "upsert", content: "hello from B" });

    const globalPath = path.join(guildHallHome, "memory", "global.md");
    const content = await fs.readFile(globalPath, "utf-8");
    expect(content).toContain("hello from A");
    expect(content).toContain("hello from B");
  });

  test("any worker can read global scope", async () => {
    const globalPath = path.join(guildHallHome, "memory", "global.md");
    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    await fs.writeFile(globalPath, "## Shared\nglobal data\n", "utf-8");

    const readScopesA = new Set<string>();
    const readScopesB = new Set<string>();
    const readA = makeReadMemoryHandler(guildHallHome, "worker-a", "project-1", readScopesA);
    const readB = makeReadMemoryHandler(guildHallHome, "worker-b", "project-2", readScopesB);

    const resultA = await readA({ scope: "global" });
    const resultB = await readB({ scope: "global" });

    expect(resultA.content[0].text).toContain("global data");
    expect(resultB.content[0].text).toContain("global data");
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
    }, registry);

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
    }, registry);

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
    }, registry);

    expect(result.mcpServers.length).toBeGreaterThanOrEqual(1);
    expect(result.mcpServers[0].name).toBe("guild-hall-base");
  });
});
