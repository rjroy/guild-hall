import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createEventBus } from "@/apps/daemon/lib/event-bus";
import { createHeartbeatService } from "@/apps/daemon/services/heartbeat/index";
import type { HeartbeatSessionDeps } from "@/apps/daemon/services/heartbeat/session";
import type { AppConfig } from "@/lib/types";
import { ensureHeartbeatFile, appendToSection } from "@/apps/daemon/services/heartbeat/heartbeat-file";

// -- Helpers --

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-heartbeat-svc-"));
  guildHallHome = path.join(tmpDir, "guild-hall");
  await fs.mkdir(path.join(guildHallHome, "projects"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function projectPath(name: string): string {
  return path.join(tmpDir, "src", name);
}

function integrationPath(name: string): string {
  return path.join(guildHallHome, "projects", name);
}

async function setupProject(name: string): Promise<void> {
  const srcPath = path.join(tmpDir, "src", name);
  await fs.mkdir(srcPath, { recursive: true });
  const intPath = integrationPath(name);
  await fs.mkdir(path.join(intPath, ".lore"), { recursive: true });
  await ensureHeartbeatFile(intPath);
}

function createMockSessionDeps(): HeartbeatSessionDeps {
  return {
    queryFn: (async function*() {})() as never,
    prepDeps: {} as never,
    packages: [],
    config: { projects: [] } as never,
    guildHallHome,
    commissionSession: {} as never,
    eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
    gitOps: {} as never,
    getProjectConfig: () => Promise.resolve(undefined),
  };
}

function makeConfig(projects: Array<{ name: string; path: string }>): AppConfig {
  return {
    projects: projects.map((p) => ({
      name: p.name,
      path: p.path,
      defaultBranch: "main",
    })),
    heartbeatIntervalMinutes: 60,
    heartbeatBackoffMinutes: 300,
  } as AppConfig;
}

// -- Condensation subscriber tests (REQ-HBT-50) --

describe("HeartbeatService condensation subscriber", () => {
  test("registers condensation subscriber on creation (REQ-HBT-50)", async () => {
    const eventBus = createEventBus();
    await setupProject("test-project");

    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config: makeConfig([{ name: "test-project", path: projectPath("test-project") }]),
      eventBus,
      guildHallHome,
    });

    // Emit a terminal event; should be processed by the condensation subscriber
    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-svc-test",
      status: "completed",
      projectName: "test-project",
    });

    await new Promise((r) => setTimeout(r, 50));

    const content = await fs.readFile(
      path.join(integrationPath("test-project"), ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(content).toContain("comm-svc-test completed");

    service.stop();
  });

  test("stop() unsubscribes condensation", async () => {
    const eventBus = createEventBus();
    await setupProject("test-project");

    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config: makeConfig([{ name: "test-project", path: projectPath("test-project") }]),
      eventBus,
      guildHallHome,
    });

    service.stop();

    eventBus.emit({
      type: "commission_status",
      commissionId: "comm-after-stop",
      status: "completed",
      projectName: "test-project",
    });

    await new Promise((r) => setTimeout(r, 50));

    const content = await fs.readFile(
      path.join(integrationPath("test-project"), ".lore", "heartbeat.md"),
      "utf-8",
    );
    expect(content).not.toContain("comm-after-stop");
  });
});

// -- Lifecycle and loop tests --

describe("createHeartbeatService", () => {
  test("start() and stop() lifecycle", () => {
    const config = makeConfig([]);
    const eventBus = createEventBus();
    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config,
      eventBus,
      guildHallHome,
    });

    service.start();
    service.stop();
    // No errors, no hanging timers
  });

  test("tickProject returns error for unknown project", async () => {
    const config = makeConfig([]);
    const eventBus = createEventBus();
    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config,
      eventBus,
      guildHallHome,
    });

    const result = await service.tickProject("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");

    service.stop();
  });

  test("tickProject succeeds for empty heartbeat file (skips session)", async () => {
    await setupProject("test-project");
    const config = makeConfig([
      { name: "test-project", path: projectPath("test-project") },
    ]);
    const eventBus = createEventBus();

    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config,
      eventBus,
      guildHallHome,
    });

    // Template-only file should be skipped
    const result = await service.tickProject("test-project");
    expect(result.success).toBe(true);

    service.stop();
  });
});

describe("heartbeat file content detection", () => {
  test("template-only file is skipped (no session started)", async () => {
    await setupProject("empty-project");
    const config = makeConfig([
      { name: "empty-project", path: projectPath("empty-project") },
    ]);
    const eventBus = createEventBus();

    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config,
      eventBus,
      guildHallHome,
    });

    const result = await service.tickProject("empty-project");
    expect(result.success).toBe(true);

    service.stop();
  });

  test("file with standing orders is not skipped", async () => {
    await setupProject("active-project");
    const intPath = integrationPath("active-project");
    await appendToSection(intPath, "Standing Orders", "- Review PRs daily");

    const config = makeConfig([
      { name: "active-project", path: projectPath("active-project") },
    ]);
    const eventBus = createEventBus();

    // This will fail because the session deps are stubs,
    // but it proves the file content was detected and the session was attempted
    const service = createHeartbeatService({
      sessionDeps: createMockSessionDeps(),
      config,
      eventBus,
      guildHallHome,
    });

    const result = await service.tickProject("active-project");
    // Session fails because deps are stubs, which is expected
    expect(result.success).toBe(false);

    service.stop();
  });
});
