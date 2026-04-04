import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createApp, type AppDeps } from "@/daemon/app";
import type { HeartbeatService, LastTickState } from "@/daemon/services/heartbeat/index";
import type { AppConfig } from "@/lib/types";

// -- Test helpers --

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-hb-routes-"));
  guildHallHome = path.join(tmpDir, "guild-hall");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(): AppConfig {
  return {
    projects: [
      { name: "test-project", path: "/tmp/src/test-project", defaultBranch: "main" },
    ],
    heartbeatIntervalMinutes: 45,
  } as AppConfig;
}

function makeMockHeartbeatService(opts?: {
  tickResult?: { success: boolean; error?: string };
  lastTick?: LastTickState;
}) {
  const ticks: string[] = [];
  return {
    start: () => {},
    stop: () => {},
    tickProject: async (projectName: string) => {
      ticks.push(projectName);
      if (opts?.tickResult) return opts.tickResult;
      return { success: true };
    },
    getLastTick: (projectName: string) => {
      if (opts?.lastTick && projectName === "test-project") return opts.lastTick;
      return undefined;
    },
    // Expose for assertions
    get tickedProjects() { return ticks; },
  } as HeartbeatService & { tickedProjects: string[] };
}

function createTestApp(
  config: AppConfig,
  heartbeatService: HeartbeatService,
  heartbeatFilePath?: string,
) {
  const deps: AppDeps = {
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 0,
    },
    heartbeat: {
      heartbeatService,
      config,
      guildHallHome,
    },
  };
  return createApp(deps).app;
}

async function writeHeartbeatFile(projectName: string, content: string): Promise<void> {
  const filePath = path.join(guildHallHome, "projects", projectName, ".lore", "heartbeat.md");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// -- Tests --

describe("POST /heartbeat/:projectName/tick", () => {
  test("triggers evaluation and returns success", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    const res = await app.request("/heartbeat/test-project/tick", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as { triggered: boolean };
    expect(body.triggered).toBe(true);
    expect((service as ReturnType<typeof makeMockHeartbeatService>).tickedProjects).toContain("test-project");
  });

  test("returns error for nonexistent project", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService({
      tickResult: { success: false, error: "Project \"nonexistent\" not found" },
    });
    const app = createTestApp(config, service);

    const res = await app.request("/heartbeat/nonexistent/tick", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });

  test("returns error when tick fails", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService({
      tickResult: { success: false, error: "Session failed" },
    });
    const app = createTestApp(config, service);

    const res = await app.request("/heartbeat/test-project/tick", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Session failed");
  });
});

describe("GET /heartbeat/:projectName/status", () => {
  test("returns correct standing order count", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    await writeHeartbeatFile("test-project", [
      "# Heartbeat",
      "",
      "## Standing Orders",
      "- After any Dalton implementation, dispatch a Thorne review",
      "- Run tests nightly",
      "",
      "## Watch Items",
      "",
      "## Context Notes",
      "",
      "## Recent Activity",
      "",
    ].join("\n"));

    const res = await app.request("/heartbeat/test-project/status");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      hasContent: boolean;
      standingOrderCount: number;
      lastTick: number | null;
      commissionsCreatedLastTick: number;
      intervalMinutes: number;
    };
    expect(body.hasContent).toBe(true);
    expect(body.standingOrderCount).toBe(2);
    expect(body.lastTick).toBeNull();
    expect(body.commissionsCreatedLastTick).toBe(0);
    expect(body.intervalMinutes).toBe(45);
  });

  test("reflects last tick timestamp after a tick", async () => {
    const config = makeConfig();
    const tickTime = Date.now();
    const service = makeMockHeartbeatService({
      lastTick: { timestamp: tickTime, commissionsCreated: 3 },
    });
    const app = createTestApp(config, service);

    await writeHeartbeatFile("test-project", [
      "# Heartbeat",
      "",
      "## Standing Orders",
      "- Do something",
      "",
      "## Watch Items",
      "",
      "## Context Notes",
      "",
      "## Recent Activity",
      "",
    ].join("\n"));

    const res = await app.request("/heartbeat/test-project/status");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      lastTick: number;
      commissionsCreatedLastTick: number;
    };
    expect(body.lastTick).toBe(tickTime);
    expect(body.commissionsCreatedLastTick).toBe(3);
  });

  test("returns 404 for nonexistent project", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    const res = await app.request("/heartbeat/nonexistent/status");
    expect(res.status).toBe(404);
  });

  test("returns hasContent false for empty heartbeat file", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    await writeHeartbeatFile("test-project", [
      "# Heartbeat",
      "",
      "## Standing Orders",
      "",
      "## Watch Items",
      "",
      "## Context Notes",
      "",
      "## Recent Activity",
      "",
    ].join("\n"));

    const res = await app.request("/heartbeat/test-project/status");
    expect(res.status).toBe(200);
    const body = await res.json() as { hasContent: boolean; standingOrderCount: number };
    expect(body.hasContent).toBe(false);
    expect(body.standingOrderCount).toBe(0);
  });

  test("returns hasContent false when heartbeat file is missing", async () => {
    const config = makeConfig();
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    // Don't create heartbeat file
    const res = await app.request("/heartbeat/test-project/status");
    expect(res.status).toBe(200);
    const body = await res.json() as { hasContent: boolean; standingOrderCount: number };
    expect(body.hasContent).toBe(false);
    expect(body.standingOrderCount).toBe(0);
  });

  test("defaults interval to 60 when not configured", async () => {
    const config = { ...makeConfig(), heartbeatIntervalMinutes: undefined };
    const service = makeMockHeartbeatService();
    const app = createTestApp(config, service);

    await writeHeartbeatFile("test-project", "# Heartbeat\n\n## Standing Orders\n\n## Recent Activity\n");

    const res = await app.request("/heartbeat/test-project/status");
    expect(res.status).toBe(200);
    const body = await res.json() as { intervalMinutes: number };
    expect(body.intervalMinutes).toBe(60);
  });
});
