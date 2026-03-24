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
    createTriggeredCommission: () => Promise.resolve({ commissionId: "test" }),
    updateTriggerStatus: () => Promise.resolve({ commissionId: "test", status: "paused" }),
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

// -- Tests: List filtering --

describe("GET /commission/request/commission/list filtering", () => {
  async function seedCommissions() {
    await writeCommission(
      "commission-Dev-20260313-100000",
      `---
title: Dev Commission
status: in_progress
worker: guild-hall-developer
prompt: Build it
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T10:00:00.000Z
    event: created
---
`,
    );
    await writeCommission(
      "commission-Rev-20260313-110000",
      `---
title: Review Commission
status: completed
worker: guild-hall-reviewer
prompt: Review it
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T11:00:00.000Z
    event: created
---
`,
    );
    await writeCommission(
      "commission-Dev-20260313-120000",
      `---
title: Another Dev Commission
status: halted
worker: guild-hall-developer
prompt: Fix it
date: 2026-03-13
activity_timeline:
  - timestamp: 2026-03-13T12:00:00.000Z
    event: created
---
`,
    );
  }

  test("filters by status", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project&status=completed",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(1);
    expect(body.commissions[0].status).toBe("completed");
  });

  test("filters by worker", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project&worker=guild-hall-developer",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(2);
    for (const c of body.commissions) {
      expect(c.worker).toBe("guild-hall-developer");
    }
  });

  test("combines status and worker filters (intersection)", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project&status=halted&worker=guild-hall-developer",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(1);
    expect(body.commissions[0].status).toBe("halted");
    expect(body.commissions[0].worker).toBe("guild-hall-developer");
  });

  test("returns all commissions when no filters provided", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(3);
  });

  test("empty string status filter is treated as absent", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project&status=",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(3);
  });

  test("returns empty array when filter matches nothing", async () => {
    await seedCommissions();
    const app = makeTestApp();
    const res = await app.request(
      "/commission/request/commission/list?projectName=test-project&status=cancelled",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commissions).toHaveLength(0);
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

  test("returns triggerInfo for triggered commissions", async () => {
    const commissionId = "commission-Trigger-20260321-120000";
    await writeCommission(
      commissionId,
      `---
title: "Trigger: Review on commit"
status: active
type: triggered
worker: reviewer
workerDisplayTitle: Reviewer
prompt: Review new code
date: 2026-03-21
dependencies: []
linked_artifacts: []
resource_overrides: {}
current_progress: ""
trigger:
  match:
    type: commission_result
    projectName: guild-hall
    fields:
      worker: "developer*"
  approval: auto
  maxDepth: 5
  runs_completed: 3
  last_triggered: 2026-03-21T10:00:00.000Z
  last_spawned_id: commission-reviewer-20260321-100000
activity_timeline:
  - timestamp: 2026-03-21T08:00:00.000Z
    event: created
    reason: "User created trigger"
---
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/commission/request/commission/read?commissionId=${commissionId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.triggerInfo).toBeDefined();
    expect(body.triggerInfo.match.type).toBe("commission_result");
    expect(body.triggerInfo.match.projectName).toBe("guild-hall");
    expect(body.triggerInfo.match.fields).toEqual({ worker: "developer*" });
    expect(body.triggerInfo.approval).toBe("auto");
    expect(body.triggerInfo.maxDepth).toBe(5);
    expect(body.triggerInfo.runsCompleted).toBe(3);
    expect(body.triggerInfo.lastTriggered).toBe("2026-03-21T10:00:00.000Z");
    expect(body.triggerInfo.lastSpawnedId).toBe("commission-reviewer-20260321-100000");
  });

  test("omits triggerInfo for non-triggered commissions", async () => {
    const commissionId = "commission-Worker-20260321-120001";
    await writeCommission(
      commissionId,
      `---
title: Regular Commission
status: pending
worker: Worker
workerDisplayTitle: Test Worker
prompt: Do something
date: 2026-03-21
dependencies: []
linked_artifacts: []
resource_overrides: {}
current_progress: ""
activity_timeline: []
---
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/commission/request/commission/read?commissionId=${commissionId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.triggerInfo).toBeUndefined();
  });

  test("triggerInfo uses defaults for missing optional fields", async () => {
    const commissionId = "commission-Trigger-20260321-120002";
    await writeCommission(
      commissionId,
      `---
title: "Trigger: Minimal"
status: active
type: triggered
worker: reviewer
workerDisplayTitle: Reviewer
prompt: Review code
date: 2026-03-21
dependencies: []
linked_artifacts: []
resource_overrides: {}
current_progress: ""
trigger:
  match:
    type: commission_result
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline: []
---
`,
    );

    const app = makeTestApp();
    const res = await app.request(
      `/commission/request/commission/read?commissionId=${commissionId}&projectName=test-project`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.triggerInfo).toBeDefined();
    expect(body.triggerInfo.approval).toBe("confirm");
    expect(body.triggerInfo.maxDepth).toBe(3);
    expect(body.triggerInfo.runsCompleted).toBe(0);
    expect(body.triggerInfo.lastTriggered).toBeNull();
    expect(body.triggerInfo.lastSpawnedId).toBeNull();
  });
});
