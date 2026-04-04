import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeCreateScheduledCommissionHandler,
  makeUpdateScheduleHandler,
  makeCreateTriggeredCommissionHandler,
  makeUpdateTriggerHandler,
  serializeTriggerMatchBlock,
  TRIGGER_STATUS_TRANSITIONS,
} from "@/daemon/services/manager/toolbox";
import type { ManagerToolboxDeps } from "@/daemon/services/manager/toolbox";
import type { CommissionRecordOps, ScheduleMetadata } from "@/daemon/services/commission/record";
import type { ScheduleLifecycle } from "@/daemon/services/scheduler/schedule-lifecycle";
import type { TransitionResult } from "@/daemon/services/scheduler/schedule-lifecycle";
import type { CommissionId, ScheduledCommissionStatus } from "@/daemon/types";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { RouteCaller } from "@/daemon/services/manager/toolbox";

// -- Test helpers --

function createMockWorkerPackage(name: string): DiscoveredPackage {
  return {
    name: `guild-hall-${name}`,
    path: `/packages/guild-hall-${name}`,
    metadata: {
      type: "worker",
      identity: {
        name,
        description: `Test ${name} worker`,
        displayTitle: `The ${name}`,
      },
      posture: "Test posture",
      systemToolboxes: [],
      domainToolboxes: [],
      builtInTools: [],
      checkoutScope: "sparse",
    } satisfies WorkerMetadata,
  };
}

/**
 * Creates a mock RouteCaller that records calls and returns configured responses.
 * Use responseMap to configure per-route responses; unmatched routes return
 * a generic success with commissionId.
 */
function createMockRouteCaller(responseMap?: Record<string, Awaited<ReturnType<RouteCaller>>>): RouteCaller & {
  calls: Array<{ routePath: string; body: unknown }>;
} {
  const calls: Array<{ routePath: string; body: unknown }> = [];
  const fn = ((routePath: string, body: unknown) => {
    calls.push({ routePath, body });
    if (responseMap?.[routePath]) {
      return Promise.resolve(responseMap[routePath]);
    }
    return Promise.resolve({
      ok: true as const,
      status: 200,
      data: { commissionId: "commission-Scribe-20260309-090000" },
    });
  }) as RouteCaller & { calls: Array<{ routePath: string; body: unknown }> };
  fn.calls = calls;
  return fn;
}

function createMockRecordOps(overrides?: {
  readTypeReturn?: string;
  readStatusReturn?: string;
  readScheduleMetadataReturn?: Partial<ScheduleMetadata>;
}): CommissionRecordOps & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    calls,
    readStatus(_artifactPath: string): Promise<string> {
      calls.push({ method: "readStatus", args: [_artifactPath] });
      return Promise.resolve(overrides?.readStatusReturn ?? "active");
    },
    readType(_artifactPath: string): Promise<string> {
      calls.push({ method: "readType", args: [_artifactPath] });
      return Promise.resolve(overrides?.readTypeReturn ?? "scheduled");
    },
    writeStatus(artifactPath: string, status: string): Promise<void> {
      calls.push({ method: "writeStatus", args: [artifactPath, status] });
      return Promise.resolve();
    },
    appendTimeline(
      artifactPath: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      calls.push({ method: "appendTimeline", args: [artifactPath, event, reason, extra] });
      return Promise.resolve();
    },
    readDependencies(_artifactPath: string): Promise<string[]> {
      calls.push({ method: "readDependencies", args: [_artifactPath] });
      return Promise.resolve([]);
    },
    updateProgress(artifactPath: string, summary: string): Promise<void> {
      calls.push({ method: "updateProgress", args: [artifactPath, summary] });
      return Promise.resolve();
    },
    writeStatusAndTimeline(
      artifactPath: string,
      status: string,
      event: string,
      reason: string,
      extra?: Record<string, unknown>,
    ): Promise<void> {
      calls.push({ method: "writeStatusAndTimeline", args: [artifactPath, status, event, reason, extra] });
      return Promise.resolve();
    },
    updateResult(
      artifactPath: string,
      summary: string,
      artifacts?: string[],
    ): Promise<void> {
      calls.push({ method: "updateResult", args: [artifactPath, summary, artifacts] });
      return Promise.resolve();
    },
    readScheduleMetadata(_artifactPath: string): Promise<ScheduleMetadata> {
      calls.push({ method: "readScheduleMetadata", args: [_artifactPath] });
      return Promise.resolve({
        cron: "0 9 * * 1",
        repeat: null,
        runsCompleted: 0,
        lastRun: null,
        lastSpawnedId: null,
        ...overrides?.readScheduleMetadataReturn,
      });
    },
    writeScheduleFields(
      artifactPath: string,
      updates: Partial<{ runsCompleted: number; lastRun: string; lastSpawnedId: string; cron: string; repeat: number | null }>,
    ): Promise<void> {
      calls.push({ method: "writeScheduleFields", args: [artifactPath, updates] });
      return Promise.resolve();
    },
    readProgress(_artifactPath: string): Promise<string> {
      calls.push({ method: "readProgress", args: [_artifactPath] });
      return Promise.resolve("");
    },
    readTriggerMetadata(_artifactPath: string) {
      calls.push({ method: "readTriggerMetadata", args: [_artifactPath] });
      return Promise.resolve({
        match: { type: "commission_status" },
        approval: "confirm" as const,
        maxDepth: 3,
        runs_completed: 0,
        last_triggered: null,
        last_spawned_id: null,
      });
    },
    writeTriggerFields(
      artifactPath: string,
      updates: Partial<{ runs_completed: number; last_triggered: string | null; last_spawned_id: string | null }>,
    ): Promise<void> {
      calls.push({ method: "writeTriggerFields", args: [artifactPath, updates] });
      return Promise.resolve();
    },
    readTriggeredBy(_artifactPath: string) {
      calls.push({ method: "readTriggeredBy", args: [_artifactPath] });
      return Promise.resolve(null);
    },
    readSource(_artifactPath: string) {
      calls.push({ method: "readSource", args: [_artifactPath] });
      return Promise.resolve(null);
    },
  };
}

function createMockScheduleLifecycle(): ScheduleLifecycle & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const executedResult: TransitionResult = { outcome: "executed", status: "active" };

  return {
    calls,
    register(
      id: CommissionId,
      projectName: string,
      status: ScheduledCommissionStatus,
      artifactPath: string,
    ): void {
      calls.push({ method: "register", args: [id, projectName, status, artifactPath] });
    },
    pause(id: CommissionId): Promise<TransitionResult> {
      calls.push({ method: "pause", args: [id] });
      return Promise.resolve({ outcome: "executed", status: "paused" });
    },
    resume(id: CommissionId): Promise<TransitionResult> {
      calls.push({ method: "resume", args: [id] });
      return Promise.resolve(executedResult);
    },
    complete(id: CommissionId, reason: string): Promise<TransitionResult> {
      calls.push({ method: "complete", args: [id, reason] });
      return Promise.resolve({ outcome: "executed", status: "completed" });
    },
    fail(id: CommissionId, reason: string): Promise<TransitionResult> {
      calls.push({ method: "fail", args: [id, reason] });
      return Promise.resolve({ outcome: "executed", status: "failed" });
    },
    reactivate(id: CommissionId): Promise<TransitionResult> {
      calls.push({ method: "reactivate", args: [id] });
      return Promise.resolve(executedResult);
    },
    getStatus(_id: CommissionId): ScheduledCommissionStatus | undefined {
      return "active";
    },
    getProjectName(_id: CommissionId): string | undefined {
      return "test-project";
    },
    getArtifactPath(_id: CommissionId): string | undefined {
      return "/tmp/test";
    },
    isTracked(_id: CommissionId): boolean {
      return true;
    },
  } as unknown as ScheduleLifecycle & { calls: Array<{ method: string; args: unknown[] }> };
}

function createMockGitOps() {
  return {
    commitAll: async (_worktreePath: string, _message: string) => {},
    fetch: async (_repoPath: string) => {},
    push: async (_repoPath: string, _branch: string) => {},
    createPullRequest: () => Promise.resolve({ url: "https://github.com/test/pr/1" }),
    revParse: () => Promise.resolve("abc123"),
    createBranch: async () => {},
    createWorktree: async () => {},
    removeWorktree: async () => {},
    sparseCheckout: async () => {},
    branchExists: () => Promise.resolve(false),
    cherryPick: async () => {},
    merge: async () => {},
    rebase: async () => {},
    log: () => Promise.resolve([]),
    diffStat: () => Promise.resolve(""),
    getRemoteUrl: () => Promise.resolve("https://github.com/test/repo.git"),
  };
}

let tmpDir: string;

async function createBaseDeps(overrides?: {
  packages?: DiscoveredPackage[];
  recordOps?: CommissionRecordOps;
  scheduleLifecycle?: ScheduleLifecycle;
  callRoute?: RouteCaller;
}): Promise<ManagerToolboxDeps> {
  // Create the integration worktree structure
  const projectDir = path.join(tmpDir, "projects", "test-project");
  const commissionsDir = path.join(projectDir, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  return {
    projectName: "test-project",
    guildHallHome: tmpDir,
    callRoute: overrides?.callRoute ?? createMockRouteCaller(),
    eventBus: { emit: () => {}, subscribe: () => () => {} } as never,
    gitOps: createMockGitOps() as never,
    config: { projects: [{ name: "test-project", path: "/repos/test-project" }] },
    getProjectConfig: () => Promise.resolve({
      name: "test-project",
      path: "/repos/test-project",
    }),
    packages: overrides?.packages ?? [createMockWorkerPackage("Scribe")],
    recordOps: overrides?.recordOps ?? createMockRecordOps(),
    scheduleLifecycle: overrides?.scheduleLifecycle ?? createMockScheduleLifecycle(),
  };
}

describe("makeCreateScheduledCommissionHandler", () => {
  // Phase 7: create_scheduled_commission now delegates to the daemon route
  // via callRoute. Tests verify correct route invocation and response handling.

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("calls the commission create route with scheduled type and returns commissionId", async () => {
    const mockRoute = createMockRouteCaller();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Daily report",
      workerName: "Scribe",
      prompt: "Generate the daily status report",
      cron: "0 9 * * *",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.created).toBe(true);
    expect(parsed.status).toBe("active");
    expect(parsed.commissionId).toBe("commission-Scribe-20260309-090000");

    // Verify the route was called with correct args
    expect(mockRoute.calls).toHaveLength(1);
    expect(mockRoute.calls[0].routePath).toBe("/commission/request/commission/create");
    const body = mockRoute.calls[0].body as Record<string, unknown>;
    expect(body.projectName).toBe("test-project");
    expect(body.title).toBe("Daily report");
    expect(body.workerName).toBe("Scribe");
    expect(body.prompt).toBe("Generate the daily status report");
    expect(body.type).toBe("scheduled");
    expect(body.cron).toBe("0 9 * * *");
  });

  test("passes repeat and resourceOverrides to route", async () => {
    const mockRoute = createMockRouteCaller();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    await handler({
      title: "With overrides",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * 1",
      repeat: 5,
      resourceOverrides: { model: "haiku" },
    });

    const body = mockRoute.calls[0].body as Record<string, unknown>;
    expect(body.repeat).toBe(5);
    expect(body.resourceOverrides).toEqual({ model: "haiku" });
  });

  test("propagates route error as isError result", async () => {
    const mockRoute = createMockRouteCaller({
      "/commission/request/commission/create": {
        ok: false,
        error: "Invalid cron expression: not a cron",
      },
    });
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Bad cron",
      workerName: "Scribe",
      prompt: "Test",
      cron: "not a cron",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid cron expression");
  });

  test("propagates worker-not-found route error", async () => {
    const mockRoute = createMockRouteCaller({
      "/commission/request/commission/create": {
        ok: false,
        error: 'Worker "NonExistent" not found in discovered packages',
      },
    });
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Bad worker",
      workerName: "NonExistent",
      prompt: "Test",
      cron: "0 9 * * *",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("propagates model validation error from route", async () => {
    const mockRoute = createMockRouteCaller({
      "/commission/request/commission/create": {
        ok: false,
        error: "Invalid model name: gpt-4",
      },
    });
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Bad model",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * *",
      resourceOverrides: { model: "gpt-4" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid model name");
  });
});

describe("makeUpdateScheduleHandler", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeScheduledArtifact(
    commissionId: string,
    overrides?: { status?: string; runsCompleted?: number },
  ): Promise<string> {
    const projectDir = path.join(tmpDir, "projects", "test-project");
    const commissionsDir = path.join(projectDir, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    const status = overrides?.status ?? "active";
    const runsCompleted = overrides?.runsCompleted ?? 0;

    const content = `---
title: "Commission: Test scheduled"
date: 2026-03-09
status: ${status}
type: scheduled
tags: [commission, scheduled]
worker: Scribe
workerDisplayTitle: "The Scribe"
prompt: "Original prompt"
dependencies: []
linked_artifacts: []
schedule:
  cron: "0 9 * * 1"
  repeat: null
  runs_completed: ${runsCompleted}
  last_run: null
  last_spawned_id: null
activity_timeline:
  - timestamp: 2026-03-09T00:00:00.000Z
    event: created
    reason: "Scheduled commission created"
current_progress: ""
projectName: test-project
---
`;

    const artifactPath = path.join(commissionsDir, `${commissionId}.md`);
    await fs.writeFile(artifactPath, content, "utf-8");
    return artifactPath;
  }

  test("valid status transition (active -> paused) succeeds", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const lifecycle = createMockScheduleLifecycle();
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({
      scheduleLifecycle: lifecycle as unknown as ScheduleLifecycle,
      recordOps,
    });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      status: "paused",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updated).toBe(true);
    expect(parsed.status).toBe("paused");

    const pauseCalls = lifecycle.calls.filter((c) => c.method === "pause");
    expect(pauseCalls).toHaveLength(1);
  });

  test("invalid status transition returns isError: true", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "completed" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId, { status: "completed" });

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      status: "active",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a valid schedule status transition");
  });

  test("setting repeat below runs_completed triggers auto-completion", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const lifecycle = createMockScheduleLifecycle();
    const recordOps = createMockRecordOps({
      readStatusReturn: "active",
      readScheduleMetadataReturn: { runsCompleted: 5 },
    });
    const deps = await createBaseDeps({
      scheduleLifecycle: lifecycle as unknown as ScheduleLifecycle,
      recordOps,
    });
    await writeScheduledArtifact(commissionId, { runsCompleted: 5 });

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      repeat: 3,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("completed");

    const completeCalls = lifecycle.calls.filter((c) => c.method === "complete");
    expect(completeCalls).toHaveLength(1);
    expect((completeCalls[0].args[1] as string)).toContain("Repeat limit (3) reached");
  });

  test("update with resourceOverrides model succeeds", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      resourceOverrides: { model: "sonnet" },
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updated).toBe(true);

    // Verify artifact was updated
    const artifactPath = path.join(
      tmpDir,
      "projects",
      "test-project",
      ".lore",
      "commissions",
      `${commissionId}.md`,
    );
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain("model: sonnet");
  });

  test("invalid model in resourceOverrides returns isError: true", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      resourceOverrides: { model: "gpt-4" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid model name");
  });

  test("trying to update a non-scheduled commission returns isError: true", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readTypeReturn: "one-shot" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      cron: "0 12 * * *",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not "scheduled"');
  });

  test("updating cron with invalid expression returns isError: true", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      cron: "bad cron",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid cron expression");
  });

  test("updating prompt writes new value to artifact", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      prompt: "Updated prompt text",
    });

    expect(result.isError).toBeUndefined();

    const artifactPath = path.join(
      tmpDir,
      "projects",
      "test-project",
      ".lore",
      "commissions",
      `${commissionId}.md`,
    );
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain('prompt: "Updated prompt text"');
    expect(content).not.toContain("Original prompt");
  });

  test("failed -> active transition uses reactivate", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const lifecycle = createMockScheduleLifecycle();
    const recordOps = createMockRecordOps({ readStatusReturn: "failed" });
    const deps = await createBaseDeps({
      scheduleLifecycle: lifecycle as unknown as ScheduleLifecycle,
      recordOps,
    });
    await writeScheduledArtifact(commissionId, { status: "failed" });

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      status: "active",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("active");

    const reactivateCalls = lifecycle.calls.filter((c) => c.method === "reactivate");
    expect(reactivateCalls).toHaveLength(1);
  });

  // -- Local model validation for update_schedule --

  test("accepts configured local model name", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    deps.config = {
      ...deps.config,
      models: [{ name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" }],
    };
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      resourceOverrides: { model: "llama3" },
    });

    expect(result.isError).toBeUndefined();
  });

  test("rejects unconfigured model with config.yaml hint", async () => {
    const commissionId = "commission-Scribe-20260309-090000";
    const recordOps = createMockRecordOps({ readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    await writeScheduledArtifact(commissionId);

    const handler = makeUpdateScheduleHandler(deps);
    const result = await handler({
      commissionId,
      resourceOverrides: { model: "unknown-model" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid model name");
    expect(result.content[0].text).toContain("Local models must be defined in config.yaml");
  });
});

// -- Local model validation for create_scheduled_commission --
// Phase 7: Model validation for create_scheduled_commission now happens in
// the daemon route. These tests verify the handler passes resourceOverrides
// through and propagates route-level errors correctly.

describe("config-aware model validation (create)", () => {
  test("create_scheduled_commission passes model in resourceOverrides to route", async () => {
    const mockRoute = createMockRouteCaller();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Local model test",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * *",
      resourceOverrides: { model: "llama3" },
    });

    expect(result.isError).toBeUndefined();
    const body = mockRoute.calls[0].body as Record<string, unknown>;
    expect(body.resourceOverrides).toEqual({ model: "llama3" });
  });

  test("create_scheduled_commission propagates model rejection from route", async () => {
    const mockRoute = createMockRouteCaller({
      "/commission/request/commission/create": {
        ok: false,
        error: "Invalid model name: unknown-model. Local models must be defined in config.yaml",
      },
    });
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Bad model",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * *",
      resourceOverrides: { model: "unknown-model" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid model name");
    expect(result.content[0].text).toContain("Local models must be defined in config.yaml");
  });
});


// -- Triggered commission tests --

function createMockTriggerEvaluator() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    initialize() { calls.push({ method: "initialize", args: [] }); return Promise.resolve(); },
    registerTrigger(artifactPath: string, projectName: string) {
      calls.push({ method: "registerTrigger", args: [artifactPath, projectName] });
      return Promise.resolve();
    },
    unregisterTrigger(commissionId: string) {
      calls.push({ method: "unregisterTrigger", args: [commissionId] });
    },
    shutdown() { calls.push({ method: "shutdown", args: [] }); },
  };
}

describe("TRIGGER_STATUS_TRANSITIONS", () => {
  test("active can transition to paused or completed", () => {
    expect(TRIGGER_STATUS_TRANSITIONS.active).toEqual(["paused", "completed"]);
  });

  test("paused can transition to active or completed", () => {
    expect(TRIGGER_STATUS_TRANSITIONS.paused).toEqual(["active", "completed"]);
  });

  test("completed has no outgoing transitions", () => {
    expect(TRIGGER_STATUS_TRANSITIONS.completed).toBeUndefined();
  });

  test("failed has no outgoing transitions", () => {
    expect(TRIGGER_STATUS_TRANSITIONS.failed).toBeUndefined();
  });
});

describe("serializeTriggerMatchBlock", () => {
  test("serializes match with type only", () => {
    const result = serializeTriggerMatchBlock({ type: "commission_status" });
    expect(result).toBe("  match:\n    type: commission_status\n");
  });

  test("serializes match with projectName", () => {
    const result = serializeTriggerMatchBlock({
      type: "commission_result",
      projectName: "my-project",
    });
    expect(result).toContain("    projectName: my-project\n");
  });

  test("serializes match with fields", () => {
    const result = serializeTriggerMatchBlock({
      type: "commission_status",
      fields: { status: "completed", commissionId: "commission-*" },
    });
    expect(result).toContain("    fields:\n");
    expect(result).toContain("      status: completed\n");
    expect(result).toContain("      commissionId: commission-*\n");
  });
});

describe("makeCreateTriggeredCommissionHandler", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("calls the route with type triggered and returns commissionId", async () => {
    const mockRoute = createMockRouteCaller();
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeCreateTriggeredCommissionHandler(deps);

    const result = await handler({
      title: "On completion",
      workerName: "Scribe",
      prompt: "Process {{commissionId}}",
      match: { type: "commission_status", fields: { status: "completed" } },
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.created).toBe(true);
    expect(parsed.status).toBe("active");

    const body = mockRoute.calls[0].body as Record<string, unknown>;
    expect(body.type).toBe("triggered");
    expect(body.match).toEqual({ type: "commission_status", fields: { status: "completed" } });
  });

  test("calls registerTrigger after successful creation", async () => {
    const mockRoute = createMockRouteCaller();
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeCreateTriggeredCommissionHandler(deps);

    await handler({
      title: "Test",
      workerName: "Scribe",
      prompt: "Do work",
      match: { type: "commission_status" },
    });

    expect(mockTrigger.calls.some((c) => c.method === "registerTrigger")).toBe(true);
    const registerCall = mockTrigger.calls.find((c) => c.method === "registerTrigger");
    expect((registerCall!.args[0] as string)).toContain("commission-Scribe-20260309-090000.md");
    expect(registerCall!.args[1]).toBe("test-project");
  });

  test("rejects invalid match.type with descriptive error", async () => {
    const deps = await createBaseDeps();
    const handler = makeCreateTriggeredCommissionHandler(deps);

    const result = await handler({
      title: "Bad type",
      workerName: "Scribe",
      prompt: "Test",
      match: { type: "nonexistent_event" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid match type");
    expect(result.content[0].text).toContain("nonexistent_event");
  });

  test("rejects unknown worker with available worker list", async () => {
    const deps = await createBaseDeps();
    const handler = makeCreateTriggeredCommissionHandler(deps);

    const result = await handler({
      title: "Bad worker",
      workerName: "NonExistent",
      prompt: "Test",
      match: { type: "commission_status" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NonExistent");
    expect(result.content[0].text).toContain("Available workers");
  });

  test("route failure returns error without calling registerTrigger", async () => {
    const mockRoute = createMockRouteCaller({
      "/commission/request/commission/create": {
        ok: false,
        error: "Worker not found",
      },
    });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeCreateTriggeredCommissionHandler(deps);

    const result = await handler({
      title: "Will fail",
      workerName: "Scribe",
      prompt: "Test",
      match: { type: "commission_status" },
    });

    expect(result.isError).toBe(true);
    expect(mockTrigger.calls.some((c) => c.method === "registerTrigger")).toBe(false);
  });

  test("registerTrigger failure still returns success", async () => {
    const mockRoute = createMockRouteCaller();
    const mockTrigger = createMockTriggerEvaluator();
    mockTrigger.registerTrigger = () => { return Promise.reject(new Error("Registration failed")); };
    const deps = await createBaseDeps({ callRoute: mockRoute });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeCreateTriggeredCommissionHandler(deps);

    const result = await handler({
      title: "Test",
      workerName: "Scribe",
      prompt: "Do work",
      match: { type: "commission_status" },
    });

    // Still succeeds because the artifact was created
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.created).toBe(true);
  });

  test("passes approval, maxDepth, and dependencies to route", async () => {
    const mockRoute = createMockRouteCaller();
    const deps = await createBaseDeps({ callRoute: mockRoute });
    const handler = makeCreateTriggeredCommissionHandler(deps);

    await handler({
      title: "Full options",
      workerName: "Scribe",
      prompt: "Work",
      match: { type: "commission_result", projectName: "my-proj" },
      approval: "auto",
      maxDepth: 5,
      dependencies: ["dep-1"],
    });

    const body = mockRoute.calls[0].body as Record<string, unknown>;
    expect(body.approval).toBe("auto");
    expect(body.maxDepth).toBe(5);
    expect(body.dependencies).toEqual(["dep-1"]);
  });
});

describe("makeUpdateTriggerHandler", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("rejects non-triggered commissions", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "one-shot" });
    const deps = await createBaseDeps({ recordOps });
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-commission" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not \"triggered\"");
  });

  test("active to paused calls unregisterTrigger", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "paused" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("paused");
    expect(mockTrigger.calls.some((c) => c.method === "unregisterTrigger")).toBe(true);

    const statusWrite = recordOps.calls.find(
      (c) => c.method === "writeStatusAndTimeline" && c.args[1] === "paused",
    );
    expect(statusWrite).toBeDefined();
  });

  test("paused to active calls registerTrigger", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "paused" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "active" });

    expect(result.isError).toBeUndefined();
    expect(mockTrigger.calls.some((c) => c.method === "registerTrigger")).toBe(true);
  });

  test("active to completed calls unregisterTrigger", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "completed" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("completed");
    expect(mockTrigger.calls.some((c) => c.method === "unregisterTrigger")).toBe(true);
  });

  test("paused to completed does not call unregisterTrigger", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "paused" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "completed" });

    expect(result.isError).toBeUndefined();
    expect(mockTrigger.calls.some((c) => c.method === "unregisterTrigger")).toBe(false);
  });

  test("completed to active returns error (terminal state)", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "completed" });
    const deps = await createBaseDeps({ recordOps });
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "active" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a valid trigger status transition");
  });

  test("failed to active returns error (terminal state)", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "failed" });
    const deps = await createBaseDeps({ recordOps });
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "active" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a valid trigger status transition");
  });

  test("updates match field and replaces subscription on active trigger", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;

    // Write a trigger artifact to the filesystem for the field update to read
    const intPath = path.join(tmpDir, "projects", "test-project");
    const artifactPath = path.join(intPath, ".lore", "commissions", "test-trigger.md");
    await fs.writeFile(artifactPath, `---
title: "Commission: Test trigger"
status: active
type: triggered
worker: Scribe
prompt: "Do work"
trigger:
  match:
    type: commission_status
    fields:
      status: completed
  approval: confirm
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline: []
---
`, "utf-8");

    const handler = makeUpdateTriggerHandler(deps);
    const result = await handler({
      commissionId: "test-trigger",
      match: { type: "commission_result" },
    });

    expect(result.isError).toBeUndefined();

    // Verify subscription replacement: unregister then register
    const unregIdx = mockTrigger.calls.findIndex((c) => c.method === "unregisterTrigger");
    const regIdx = mockTrigger.calls.findIndex((c) => c.method === "registerTrigger");
    expect(unregIdx).toBeGreaterThanOrEqual(0);
    expect(regIdx).toBeGreaterThan(unregIdx);

    // Verify the file was updated
    const updatedRaw = await fs.readFile(artifactPath, "utf-8");
    expect(updatedRaw).toContain("type: commission_result");
    expect(updatedRaw).not.toContain("type: commission_status");
  });

  test("updates approval on active trigger replaces subscription", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;

    const intPath = path.join(tmpDir, "projects", "test-project");
    const artifactPath = path.join(intPath, ".lore", "commissions", "test-trigger.md");
    await fs.writeFile(artifactPath, `---
title: "Commission: Test"
status: active
type: triggered
worker: Scribe
prompt: "Do work"
trigger:
  match:
    type: commission_status
  approval: confirm
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline: []
---
`, "utf-8");

    const handler = makeUpdateTriggerHandler(deps);
    await handler({
      commissionId: "test-trigger",
      approval: "auto",
    });

    const updatedRaw = await fs.readFile(artifactPath, "utf-8");
    expect(updatedRaw).toContain("approval: auto");

    // Subscription replaced
    expect(mockTrigger.calls.some((c) => c.method === "unregisterTrigger")).toBe(true);
    expect(mockTrigger.calls.some((c) => c.method === "registerTrigger")).toBe(true);
  });

  test("updates fields on paused trigger without subscription management", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "paused" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;

    const intPath = path.join(tmpDir, "projects", "test-project");
    const artifactPath = path.join(intPath, ".lore", "commissions", "test-trigger.md");
    await fs.writeFile(artifactPath, `---
title: "Commission: Test"
status: paused
type: triggered
worker: Scribe
prompt: "Old prompt"
trigger:
  match:
    type: commission_status
  approval: confirm
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline: []
---
`, "utf-8");

    const handler = makeUpdateTriggerHandler(deps);
    await handler({
      commissionId: "test-trigger",
      prompt: "New prompt",
    });

    const updatedRaw = await fs.readFile(artifactPath, "utf-8");
    expect(updatedRaw).toContain('prompt: "New prompt"');

    // No subscription management on paused trigger
    expect(mockTrigger.calls).toHaveLength(0);
  });

  test("rejects invalid match.type without modifying artifact", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({
      commissionId: "test-trigger",
      match: { type: "bogus_event" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid match type");
  });

  test("combined status active + match update produces single subscription", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "paused" });
    const mockTrigger = createMockTriggerEvaluator();
    const deps = await createBaseDeps({ recordOps });
    deps.triggerEvaluator = mockTrigger;

    const intPath = path.join(tmpDir, "projects", "test-project");
    const artifactPath = path.join(intPath, ".lore", "commissions", "test-trigger.md");
    await fs.writeFile(artifactPath, `---
title: "Commission: Test"
status: paused
type: triggered
worker: Scribe
prompt: "Work"
trigger:
  match:
    type: commission_status
  approval: confirm
  maxDepth: 3
  runs_completed: 0
  last_triggered: null
  last_spawned_id: null
activity_timeline: []
---
`, "utf-8");

    const handler = makeUpdateTriggerHandler(deps);
    await handler({
      commissionId: "test-trigger",
      status: "active",
      match: { type: "commission_result" },
    });

    // The status transition to active skips registration (field updates will do it)
    // Field updates do unregister + register
    // Net result: one register call (from the field update path)
    const registerCalls = mockTrigger.calls.filter((c) => c.method === "registerTrigger");
    expect(registerCalls).toHaveLength(1);
  });

  test("returns updated state on success", async () => {
    const recordOps = createMockRecordOps({ readTypeReturn: "triggered", readStatusReturn: "active" });
    const deps = await createBaseDeps({ recordOps });
    const handler = makeUpdateTriggerHandler(deps);

    const result = await handler({ commissionId: "test-trigger", status: "paused" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.commissionId).toBe("test-trigger");
    expect(parsed.updated).toBe(true);
    expect(parsed.status).toBe("paused");
  });
});
