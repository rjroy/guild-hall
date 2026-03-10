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
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";

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

function createMockCommissionSession() {
  return {
    createCommission: () => Promise.resolve({ commissionId: "test-id" }),
    dispatchCommission: async () => {},
    cancelCommission: async () => {},
    abandonCommission: async () => {},
    addUserNote: async () => {},
  };
}

let tmpDir: string;

async function createBaseDeps(overrides?: {
  packages?: DiscoveredPackage[];
  recordOps?: CommissionRecordOps;
  scheduleLifecycle?: ScheduleLifecycle;
}): Promise<ManagerToolboxDeps> {
  // Create the integration worktree structure
  const projectDir = path.join(tmpDir, "projects", "test-project");
  const commissionsDir = path.join(projectDir, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  return {
    projectName: "test-project",
    guildHallHome: tmpDir,
    commissionSession: createMockCommissionSession() as never,
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
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("valid inputs produce a correct artifact written to disk", async () => {
    const deps = await createBaseDeps();
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
    expect(parsed.commissionId).toMatch(/^commission-Scribe-\d{8}-\d{6}$/);

    // Verify artifact on disk
    const artifactPath = path.join(
      tmpDir,
      "projects",
      "test-project",
      ".lore",
      "commissions",
      `${parsed.commissionId}.md`,
    );
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain("type: scheduled");
    expect(content).toContain("status: active");
    expect(content).toContain('cron: "0 9 * * *"');
    expect(content).toContain("repeat: null");
    expect(content).toContain("runs_completed: 0");
    expect(content).toContain("last_run: null");
    expect(content).toContain("last_spawned_id: null");
    expect(content).toContain("tags: [commission, scheduled]");
    expect(content).toContain('prompt: "Generate the daily status report"');
  });

  test("invalid cron expression returns isError: true", async () => {
    const deps = await createBaseDeps();
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

  test("invalid worker name returns isError: true", async () => {
    const deps = await createBaseDeps();
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

  test("returns Worker not found when packages is empty (regression guard for meeting wiring)", async () => {
    // Before the fix, create_scheduled_commission during a Guild Master meeting
    // always failed with this error because packages was not wired into the
    // manager toolbox services bag in the meeting orchestrator.
    // This test documents that behavior and guards against regression:
    // if the wiring breaks again, packages will be empty and this is what fails.
    const deps = await createBaseDeps({ packages: [] });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Daily report",
      workerName: "Scribe",
      prompt: "Generate the daily status report",
      cron: "0 9 * * *",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found in discovered packages");
  });

  test("with resourceOverrides writes model in artifact", async () => {
    const deps = await createBaseDeps();
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Model override",
      workerName: "Scribe",
      prompt: "Test with model",
      cron: "0 9 * * 1",
      resourceOverrides: { model: "haiku" },
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);

    const artifactPath = path.join(
      tmpDir,
      "projects",
      "test-project",
      ".lore",
      "commissions",
      `${parsed.commissionId}.md`,
    );
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain("model: haiku");
  });

  test("invalid model name returns isError: true", async () => {
    const deps = await createBaseDeps();
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

  test("registers with scheduleLifecycle", async () => {
    const lifecycle = createMockScheduleLifecycle();
    const deps = await createBaseDeps({ scheduleLifecycle: lifecycle as unknown as ScheduleLifecycle });
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Lifecycle test",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * *",
    });

    expect(result.isError).toBeUndefined();
    const registerCalls = lifecycle.calls.filter((c) => c.method === "register");
    expect(registerCalls).toHaveLength(1);
    expect(registerCalls[0].args[1]).toBe("test-project");
    expect(registerCalls[0].args[2]).toBe("active");
  });

  test("with repeat value writes it in artifact", async () => {
    const deps = await createBaseDeps();
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Limited runs",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * 1",
      repeat: 5,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);

    const artifactPath = path.join(
      tmpDir,
      "projects",
      "test-project",
      ".lore",
      "commissions",
      `${parsed.commissionId}.md`,
    );
    const content = await fs.readFile(artifactPath, "utf-8");
    expect(content).toContain("repeat: 5");
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

describe("config-aware model validation (create)", () => {
  test("create_scheduled_commission accepts configured local model name", async () => {
    const deps = await createBaseDeps();
    deps.config = {
      ...deps.config,
      models: [{ name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" }],
    };
    const handler = makeCreateScheduledCommissionHandler(deps);

    const result = await handler({
      title: "Local model test",
      workerName: "Scribe",
      prompt: "Test",
      cron: "0 9 * * *",
      resourceOverrides: { model: "llama3" },
    });

    expect(result.isError).toBeUndefined();
  });

  test("create_scheduled_commission rejects unconfigured model with hint", async () => {
    const deps = await createBaseDeps();
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
