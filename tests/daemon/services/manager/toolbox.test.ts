import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeCreateScheduledCommissionHandler,
  makeUpdateScheduleHandler,
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
