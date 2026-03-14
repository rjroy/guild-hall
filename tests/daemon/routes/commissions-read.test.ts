import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { AppConfig } from "@/lib/types";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";

// -- Test fixtures --

let tmpDir: string;
let guildHallHome: string;
let lorePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "commission-read-routes-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");
  const integrationPath = path.join(guildHallHome, "projects", "test-project");
  lorePath = path.join(integrationPath, ".lore");
  await fs.mkdir(path.join(lorePath, "commissions"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(projectName = "test-project"): AppConfig {
  return {
    projects: [{ name: projectName, path: path.join(tmpDir, "repo") }],
  };
}

function makeMockCommissionSession(): CommissionSessionForRoutes {
  return {
    createCommission: () => Promise.resolve({ commissionId: "test" }),
    createScheduledCommission: () => Promise.resolve({ commissionId: "test" }),
    updateCommission: () => Promise.resolve(),
    dispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    cancelCommission: () => Promise.resolve(),
    redispatchCommission: () => Promise.resolve({ status: "accepted" as const }),
    abandonCommission: () => Promise.resolve(),
    addUserNote: () => Promise.resolve(),
    checkDependencyTransitions: () => Promise.resolve(),
    getActiveCommissions: () => 0,
    recoverCommissions: () => Promise.resolve(0),
    updateScheduleStatus: () => Promise.resolve({ outcome: "ok" as const, status: "active" }),
    shutdown: () => {},
  } as CommissionSessionForRoutes;
}

function makeTestApp(config?: AppConfig) {
  const cfg = config ?? makeConfig();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    commissionSession: makeMockCommissionSession(),
    config: cfg,
    configRoutes: {
      config: cfg,
      guildHallHome,
    },
  }).app;
}

async function writeCommission(id: string, content: string): Promise<void> {
  const filePath = path.join(lorePath, "commissions", `${id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
}

// -- Tests: GET /commission/request/commission/list --

describe("GET /commission/request/commission/list", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns empty array for project with no commissions", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toEqual([]);
  });

  test("lists commissions with parsed metadata", async () => {
    await writeCommission(
      "commission-Worker-20260313-120000",
      `---
title: Test Commission
status: pending
worker: Worker
prompt: Do something
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T12:00:00.000Z
    event: created
---
`,
    );

    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(1);

    const commission = body.commissions[0];
    expect(commission.commissionId).toBe("commission-Worker-20260313-120000");
    expect(commission.title).toBe("Test Commission");
    expect(commission.status).toBe("pending");
    expect(commission.worker).toBe("Worker");
    expect(commission.prompt).toBe("Do something");
    expect(commission.projectName).toBe("test-project");
  });

  test("returns multiple commissions sorted by status group", async () => {
    await writeCommission(
      "commission-A-20260313-100000",
      `---
title: Completed Commission
status: completed
worker: Worker
prompt: Done
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T10:00:00.000Z
    event: created
---
`,
    );
    await writeCommission(
      "commission-B-20260313-110000",
      `---
title: Pending Commission
status: pending
worker: Worker
prompt: Waiting
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T11:00:00.000Z
    event: created
---
`,
    );

    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=test-project");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(2);
    // Pending (group 0) sorts before completed (group 3)
    expect(body.commissions[0].status).toBe("pending");
    expect(body.commissions[1].status).toBe("completed");
  });

  test("response wraps commissions in an object", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=test-project");
    const body = await res.json();
    expect(body).toHaveProperty("commissions");
    expect(Array.isArray(body.commissions)).toBe(true);
  });

  test("content-type is application/json", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/list?projectName=test-project");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// -- Tests: GET /commission/request/commission/read --

describe("GET /commission/request/commission/read", () => {
  test("returns 400 when projectName is missing", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/read?commissionId=some-id");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectName");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/read?commissionId=some-id&projectName=nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns 404 for nonexistent commission", async () => {
    const app = makeTestApp();
    const res = await app.request("/commission/request/commission/read?commissionId=does-not-exist&projectName=test-project");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("does-not-exist");
  });

  test("reads commission detail with metadata and timeline", async () => {
    const commissionId = "commission-Worker-20260313-120000";
    await writeCommission(
      commissionId,
      `---
title: Detailed Commission
status: in_progress
worker: Worker
workerDisplayTitle: Test Worker
prompt: Implement something
date: 2026-03-13
dependencies:
  - commissions/commission-other-20260313-000000.md
linked_artifacts:
  - specs/test-spec.md
resource_overrides:
  maxTurns: 50
  model: sonnet
current_progress: Working on it
activity_timeline:
  - timestamp: 2026-03-13T12:00:00.000Z
    event: created
  - timestamp: 2026-03-13T12:01:00.000Z
    event: status_dispatched
  - timestamp: 2026-03-13T12:02:00.000Z
    event: status_in_progress
---

Result summary here.
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/commission/request/commission/read?commissionId=${commissionId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.commission.commissionId).toBe(commissionId);
    expect(body.commission.title).toBe("Detailed Commission");
    expect(body.commission.status).toBe("in_progress");
    expect(body.commission.worker).toBe("Worker");
    expect(body.commission.workerDisplayTitle).toBe("Test Worker");
    expect(body.commission.prompt).toBe("Implement something");
    expect(body.commission.dependencies).toEqual([
      "commissions/commission-other-20260313-000000.md",
    ]);
    expect(body.commission.linked_artifacts).toEqual(["specs/test-spec.md"]);
    expect(body.commission.resource_overrides.maxTurns).toBe(50);
    expect(body.commission.resource_overrides.model).toBe("sonnet");
    expect(body.commission.current_progress).toBe("Working on it");
    expect(body.commission.result_summary).toBe("Result summary here.");
    expect(body.commission.projectName).toBe("test-project");

    expect(body.timeline).toHaveLength(3);
    expect(body.timeline[0].event).toBe("created");
    expect(body.timeline[1].event).toBe("status_dispatched");
    expect(body.timeline[2].event).toBe("status_in_progress");

    expect(body.rawContent).toBeDefined();
    expect(typeof body.rawContent).toBe("string");
  });
});
