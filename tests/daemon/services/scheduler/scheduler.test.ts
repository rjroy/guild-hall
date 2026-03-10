/**
 * Tests for the SchedulerService.
 *
 * Uses temp directories with real schedule artifact files on disk.
 * Dependencies (recordOps, commissionSession, scheduleLifecycle, eventBus)
 * are mocked. tick() is called directly rather than using timers.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SchedulerService } from "@/daemon/services/scheduler/index";
import type { SchedulerDeps } from "@/daemon/services/scheduler/index";
import type { CommissionRecordOps, ScheduleMetadata } from "@/daemon/services/commission/record";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { ScheduleLifecycle, TransitionResult } from "@/daemon/services/scheduler/schedule-lifecycle";
import type { SystemEvent, EventBus } from "@/daemon/lib/event-bus";
import type { AppConfig } from "@/lib/types";
import type { CommissionId, ScheduledCommissionStatus } from "@/daemon/types";
// asCommissionId not used directly in tests - IDs are created via artifact writes

// -- Test helpers --

/** Creates a minimal schedule artifact on disk. */
async function writeScheduleArtifact(
  dir: string,
  scheduleId: string,
  overrides: {
    status?: string;
    type?: string;
    cron?: string;
    repeat?: number | null;
    runsCompleted?: number;
    lastRun?: string | null;
    lastSpawnedId?: string | null;
    worker?: string;
    prompt?: string;
    date?: string;
  } = {},
): Promise<string> {
  const commissionsDir = path.join(dir, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  const {
    status = "active",
    type = "scheduled",
    cron = "0 9 * * 1",
    repeat = null,
    runsCompleted = 0,
    lastRun = null,
    lastSpawnedId = null,
    worker = "test-worker",
    prompt = "Run the weekly report",
    date = "2026-01-01",
  } = overrides;

  const content = `---
title: "Schedule: ${scheduleId}"
date: ${date}
status: ${status}
type: ${type}
tags: [commission]
worker: ${worker}
prompt: "${prompt}"
dependencies: []
schedule:
  cron: "${cron}"
  repeat: ${repeat}
  runs_completed: ${runsCompleted}
  last_run: ${lastRun ?? "null"}
  last_spawned_id: ${lastSpawnedId ?? "null"}
activity_timeline:
  - timestamp: 2026-01-01T00:00:00.000Z
    event: created
    reason: "Schedule created"
current_progress: ""
---
`;

  const filePath = path.join(commissionsDir, `${scheduleId}.md`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/** Creates a minimal one-shot commission artifact for overlap testing. */
async function writeCommissionArtifact(
  dir: string,
  commissionId: string,
  overrides: { status?: string; date?: string } = {},
): Promise<string> {
  const commissionsDir = path.join(dir, ".lore", "commissions");
  await fs.mkdir(commissionsDir, { recursive: true });

  const { status = "in_progress", date = "2026-01-01" } = overrides;

  const content = `---
title: "Commission: ${commissionId}"
date: ${date}
status: ${status}
type: one-shot
tags: [commission]
worker: test-worker
prompt: "Do the thing"
dependencies: []
activity_timeline:
  - timestamp: 2026-01-01T00:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
---
`;

  const filePath = path.join(commissionsDir, `${commissionId}.md`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

type MockRecordOps = CommissionRecordOps & {
  calls: Array<{ method: string; args: unknown[] }>;
  readScheduleMetadataImpl: (artifactPath: string) => Promise<ScheduleMetadata>;
  readStatusImpl: (artifactPath: string) => Promise<string>;
  readTypeImpl: (artifactPath: string) => Promise<string>;
};

function createMockRecordOps(): MockRecordOps {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  // Default implementations that read from disk
  let readScheduleMetadataImpl: (artifactPath: string) => Promise<ScheduleMetadata> =
    async (artifactPath: string) => {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const cronMatch = raw.match(/^ {2}cron: "(.+)"$/m);
      const repeatMatch = raw.match(/^ {2}repeat: (.+)$/m);
      const runsMatch = raw.match(/^ {2}runs_completed: (.+)$/m);
      const lastRunMatch = raw.match(/^ {2}last_run: (.+)$/m);
      const lastSpawnedMatch = raw.match(/^ {2}last_spawned_id: (.+)$/m);

      const repeatVal = repeatMatch ? repeatMatch[1].trim() : "null";
      const lastRunVal = lastRunMatch ? lastRunMatch[1].trim() : "null";
      const lastSpawnedVal = lastSpawnedMatch ? lastSpawnedMatch[1].trim() : "null";

      return {
        cron: cronMatch ? cronMatch[1] : "0 9 * * 1",
        repeat: repeatVal === "null" ? null : Number(repeatVal),
        runsCompleted: runsMatch ? Number(runsMatch[1].trim()) : 0,
        lastRun: lastRunVal === "null" ? null : lastRunVal,
        lastSpawnedId: lastSpawnedVal === "null" ? null : lastSpawnedVal,
      };
    };

  let readStatusImpl: (artifactPath: string) => Promise<string> =
    async (artifactPath: string) => {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const match = raw.match(/^status: (\S+)$/m);
      return match ? match[1] : "unknown";
    };

  let readTypeImpl: (artifactPath: string) => Promise<string> =
    async (artifactPath: string) => {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const match = raw.match(/^type: (\S+)$/m);
      return match ? match[1] : "one-shot";
    };

  const ops: MockRecordOps = {
    calls,
    get readScheduleMetadataImpl() { return readScheduleMetadataImpl; },
    set readScheduleMetadataImpl(fn) { readScheduleMetadataImpl = fn; },
    get readStatusImpl() { return readStatusImpl; },
    set readStatusImpl(fn) { readStatusImpl = fn; },
    get readTypeImpl() { return readTypeImpl; },
    set readTypeImpl(fn) { readTypeImpl = fn; },

    async readStatus(artifactPath: string): Promise<string> {
      calls.push({ method: "readStatus", args: [artifactPath] });
      return readStatusImpl(artifactPath);
    },
    async readType(artifactPath: string): Promise<string> {
      calls.push({ method: "readType", args: [artifactPath] });
      return readTypeImpl(artifactPath);
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
    readDependencies(_artifactPath: string): Promise<string[]> {
      calls.push({ method: "readDependencies", args: [_artifactPath] });
      return Promise.resolve([]);
    },
    updateProgress(artifactPath: string, summary: string): Promise<void> {
      calls.push({ method: "updateProgress", args: [artifactPath, summary] });
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
    async readScheduleMetadata(artifactPath: string): Promise<ScheduleMetadata> {
      calls.push({ method: "readScheduleMetadata", args: [artifactPath] });
      return readScheduleMetadataImpl(artifactPath);
    },
    writeScheduleFields(
      artifactPath: string,
      updates: Partial<{ runsCompleted: number; lastRun: string; lastSpawnedId: string; cron: string; repeat: number | null }>,
    ): Promise<void> {
      calls.push({ method: "writeScheduleFields", args: [artifactPath, updates] });
      return Promise.resolve();
    },
  };

  return ops;
}

type MockCommissionSession = CommissionSessionForRoutes & {
  calls: Array<{ method: string; args: unknown[] }>;
  createCommissionResult: { commissionId: string };
  dispatchCommissionResult: { status: "accepted" | "queued" };
};

function createMockCommissionSession(): MockCommissionSession {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    calls,
    createCommissionResult: { commissionId: "spawned-commission-001" },
    dispatchCommissionResult: { status: "accepted" },

    createCommission(
      projectName: string,
      title: string,
      workerName: string,
      prompt: string,
      dependencies?: string[],
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string },
      options?: { type?: string; sourceSchedule?: string },
    ): Promise<{ commissionId: string }> {
      calls.push({
        method: "createCommission",
        args: [projectName, title, workerName, prompt, dependencies, resourceOverrides, options],
      });
      return Promise.resolve(this.createCommissionResult);
    },
    updateCommission(): Promise<void> { return Promise.resolve(); },
    dispatchCommission(commissionId: CommissionId): Promise<{ status: "accepted" | "queued" }> {
      calls.push({ method: "dispatchCommission", args: [commissionId] });
      return Promise.resolve(this.dispatchCommissionResult);
    },
    cancelCommission(): Promise<void> { return Promise.resolve(); },
    abandonCommission(): Promise<void> { return Promise.resolve(); },
    redispatchCommission(): Promise<{ status: "accepted" | "queued" }> {
      return Promise.resolve({ status: "accepted" });
    },
    addUserNote(): Promise<void> { return Promise.resolve(); },
    createScheduledCommission(): Promise<{ commissionId: string }> {
      return Promise.resolve({ commissionId: "schedule-test-001" });
    },
    updateScheduleStatus(): Promise<{ outcome: string; status?: string }> {
      return Promise.resolve({ outcome: "executed", status: "paused" });
    },
    checkDependencyTransitions(): Promise<void> { return Promise.resolve(); },
    recoverCommissions(): Promise<number> { return Promise.resolve(0); },
    getActiveCommissions(): number { return 0; },
    shutdown(): void {},
  };
}

type MockScheduleLifecycle = {
  calls: Array<{ method: string; args: unknown[] }>;
  complete(id: CommissionId, reason: string): Promise<TransitionResult>;
  fail(id: CommissionId, reason: string): Promise<TransitionResult>;
  register(id: CommissionId, projectName: string, status: ScheduledCommissionStatus, artifactPath: string): void;
  isTracked(id: CommissionId): boolean;
  getStatus(id: CommissionId): ScheduledCommissionStatus | undefined;
  registeredIds: Set<string>;
};

function createMockScheduleLifecycle(): MockScheduleLifecycle {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const registeredIds = new Set<string>();

  return {
    calls,
    registeredIds,
    register(id: CommissionId, projectName: string, status: ScheduledCommissionStatus, artifactPath: string): void {
      calls.push({ method: "register", args: [id, projectName, status, artifactPath] });
      registeredIds.add(id as string);
    },
    isTracked(id: CommissionId): boolean {
      return registeredIds.has(id as string);
    },
    complete(id: CommissionId, reason: string): Promise<TransitionResult> {
      calls.push({ method: "complete", args: [id, reason] });
      return Promise.resolve({ outcome: "executed", status: "completed" });
    },
    fail(id: CommissionId, reason: string): Promise<TransitionResult> {
      calls.push({ method: "fail", args: [id, reason] });
      return Promise.resolve({ outcome: "executed", status: "failed" });
    },
    getStatus(_id: CommissionId): ScheduledCommissionStatus | undefined {
      return undefined;
    },
  };
}

function createMockEventBus(): EventBus & { events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  return {
    events,
    emit(event: SystemEvent): void {
      events.push(event);
    },
    subscribe(): () => void {
      return () => {};
    },
  };
}

// -- Test setup --

let tmpDir: string;
let ghHome: string;
let projectDir: string;
let recordOps: MockRecordOps;
let commissionSession: MockCommissionSession;
let scheduleLifecycle: MockScheduleLifecycle;
let eventBus: ReturnType<typeof createMockEventBus>;
let meetingRequests: Array<{ projectName: string; workerName: string; reason: string }>;
let config: AppConfig;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scheduler-test-"));
  ghHome = path.join(tmpDir, ".guild-hall");

  // Set up the integration worktree structure for "test-project"
  projectDir = path.join(ghHome, "projects", "test-project");
  await fs.mkdir(projectDir, { recursive: true });

  recordOps = createMockRecordOps();
  commissionSession = createMockCommissionSession();
  scheduleLifecycle = createMockScheduleLifecycle();
  eventBus = createMockEventBus();
  meetingRequests = [];

  config = {
    projects: [{ name: "test-project", path: "/fake/project" }],
  };
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createScheduler(overrides: Partial<SchedulerDeps> = {}): SchedulerService {
  return new SchedulerService({
    scheduleLifecycle: scheduleLifecycle as unknown as ScheduleLifecycle,
    recordOps,
    commissionSession,
    createMeetingRequestFn: (params) => {
      meetingRequests.push(params);
      return Promise.resolve();
    },
    eventBus,
    config,
    guildHallHome: ghHome,
    ...overrides,
  });
}

// -- Tests --

describe("SchedulerService", () => {
  describe("tick spawns commission when cron is due", () => {
    test("creates and dispatches a commission with correct params", async () => {
      // Cron "* * * * *" fires every minute. With a last_run well in the past, it's due.
      await writeScheduleArtifact(projectDir, "schedule-weekly-report", {
        cron: "* * * * *",
        worker: "Sable",
        prompt: "Generate weekly report",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // Verify createCommission was called
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      const [pName, _title, wName, pPrompt, _deps, _res, options] = createCalls[0].args as [
        string, string, string, string, string[], unknown, { type?: string; sourceSchedule?: string },
      ];
      expect(pName).toBe("test-project");
      expect(wName).toBe("Sable");
      expect(pPrompt).toBe("Generate weekly report");
      expect(options).toEqual({
        type: "one-shot",
        sourceSchedule: "schedule-weekly-report",
      });

      // Verify dispatchCommission was called
      const dispatchCalls = commissionSession.calls.filter((c) => c.method === "dispatchCommission");
      expect(dispatchCalls).toHaveLength(1);

      // Verify schedule fields were updated
      const writeCalls = recordOps.calls.filter((c) => c.method === "writeScheduleFields");
      expect(writeCalls).toHaveLength(1);
      const updates = writeCalls[0].args[1] as { runsCompleted: number; lastSpawnedId: string };
      expect(updates.runsCompleted).toBe(1);
      expect(updates.lastSpawnedId).toBe("spawned-commission-001");

      // Verify timeline entry and its extra fields
      const timelineCalls = recordOps.calls.filter(
        (c) => c.method === "appendTimeline" && c.args[1] === "commission_spawned",
      );
      expect(timelineCalls).toHaveLength(1);
      const extra = timelineCalls[0].args[3] as Record<string, unknown>;
      expect(extra.spawned_id).toBe("spawned-commission-001");
      expect(extra.run_number).toBe("1");
      // No lastSpawnedId in this test, so previous_run_outcome should be absent
      expect(extra.previous_run_outcome).toBeUndefined();

      // Verify event emission
      const spawnEvents = eventBus.events.filter((e) => e.type === "schedule_spawned");
      expect(spawnEvents).toHaveLength(1);
      if (spawnEvents[0].type === "schedule_spawned") {
        expect(spawnEvents[0].scheduleId).toBe("schedule-weekly-report");
        expect(spawnEvents[0].spawnedId).toBe("spawned-commission-001");
        expect(spawnEvents[0].runNumber).toBe(1);
      }
    });

    test("includes previous_run_outcome in timeline when prior run exists", async () => {
      const previousSpawnedId = "commission-Sable-20260201-090000";

      await writeScheduleArtifact(projectDir, "schedule-with-prior-run", {
        cron: "* * * * *",
        worker: "Sable",
        prompt: "Generate weekly report",
        date: "2025-01-01",
        lastSpawnedId: previousSpawnedId,
        lastRun: "2025-01-01T00:00:00.000Z",
        runsCompleted: 1,
      });

      // Create the previous spawned commission as completed
      await writeCommissionArtifact(projectDir, previousSpawnedId, {
        status: "completed",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // Verify timeline entry includes previous_run_outcome
      const timelineCalls = recordOps.calls.filter(
        (c) => c.method === "appendTimeline" && c.args[1] === "commission_spawned",
      );
      expect(timelineCalls).toHaveLength(1);
      const extra = timelineCalls[0].args[3] as Record<string, unknown>;
      expect(extra.spawned_id).toBe("spawned-commission-001");
      expect(extra.run_number).toBe("2");
      expect(extra.previous_run_outcome).toBe("completed");
    });

    test("skips schedules that are not yet due", async () => {
      // Cron that runs once per year on Jan 1, with a recent lastRun
      await writeScheduleArtifact(projectDir, "schedule-annual", {
        cron: "0 0 1 1 *",
        lastRun: new Date().toISOString(), // Just ran
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });
  });

  describe("overlap prevention", () => {
    test("skips schedule when last spawned commission is still active", async () => {
      const spawnedId = "commission-Sable-20260301-090000";

      // Create the schedule with a lastSpawnedId
      await writeScheduleArtifact(projectDir, "schedule-overlap-test", {
        cron: "* * * * *",
        lastSpawnedId: spawnedId,
        lastRun: "2025-01-01T00:00:00.000Z",
      });

      // Create the spawned commission as still in_progress
      await writeCommissionArtifact(projectDir, spawnedId, {
        status: "in_progress",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // No new commission should be created
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });

    test("proceeds when last spawned commission has completed", async () => {
      const spawnedId = "commission-Sable-20260301-090000";

      await writeScheduleArtifact(projectDir, "schedule-completed-spawn", {
        cron: "* * * * *",
        lastSpawnedId: spawnedId,
        lastRun: "2025-01-01T00:00:00.000Z",
      });

      // Spawned commission is completed
      await writeCommissionArtifact(projectDir, spawnedId, {
        status: "completed",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);
    });
  });

  describe("repeat count auto-completion", () => {
    test("completes schedule when repeat count is reached", async () => {
      await writeScheduleArtifact(projectDir, "schedule-finite", {
        cron: "* * * * *",
        repeat: 3,
        runsCompleted: 2,
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // Verify createCommission was called (spawns the 3rd run)
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      // Verify schedule was completed via lifecycle
      const registerCalls = scheduleLifecycle.calls.filter((c) => c.method === "register");
      expect(registerCalls).toHaveLength(1);
      expect(registerCalls[0].args[2]).toBe("active");

      const completeCalls = scheduleLifecycle.calls.filter((c) => c.method === "complete");
      expect(completeCalls).toHaveLength(1);
      expect((completeCalls[0].args[1] as string)).toContain("3/3");
    });

    test("does not complete schedule when repeat count is not reached", async () => {
      await writeScheduleArtifact(projectDir, "schedule-still-going", {
        cron: "* * * * *",
        repeat: 5,
        runsCompleted: 1,
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // Should create commission but NOT complete schedule
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      const completeCalls = scheduleLifecycle.calls.filter((c) => c.method === "complete");
      expect(completeCalls).toHaveLength(0);
    });
  });

  describe("paused schedules", () => {
    test("tick skips paused schedules", async () => {
      await writeScheduleArtifact(projectDir, "schedule-paused", {
        cron: "* * * * *",
        status: "paused",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // No commission should be created for paused schedules
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });
  });

  describe("stuck run escalation", () => {
    test("escalates when spawned commission exceeds 2x cadence", async () => {
      const spawnedId = "commission-Sable-20260301-090000";

      // Every-minute cron. The spawned commission was created long ago.
      await writeScheduleArtifact(projectDir, "schedule-stuck", {
        cron: "* * * * *",
        lastSpawnedId: spawnedId,
        lastRun: "2025-01-01T00:00:00.000Z",
        worker: "Sable",
      });

      // The spawned commission is still active and was created long ago
      // (well over 2x the 60-second cadence)
      await writeCommissionArtifact(projectDir, spawnedId, {
        status: "in_progress",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // Should have escalated via createMeetingRequestFn
      expect(meetingRequests).toHaveLength(1);
      expect(meetingRequests[0].projectName).toBe("test-project");
      expect(meetingRequests[0].workerName).toBe("Sable");
      expect(meetingRequests[0].reason).toContain("stuck run");

      // Should have added escalation timeline entry with extra fields
      const escalationTimeline = recordOps.calls.filter(
        (c) => c.method === "appendTimeline" && c.args[1] === "escalation_created",
      );
      expect(escalationTimeline).toHaveLength(1);
      const extra = escalationTimeline[0].args[3] as Record<string, unknown>;
      expect(extra.stuck_commission_id).toBe(spawnedId);
      expect(extra.running_since).toBeDefined();
      expect(typeof extra.running_since).toBe("string");
      // running_since should be a valid ISO timestamp
      expect(new Date(extra.running_since as string).getTime()).not.toBeNaN();

      // No commission should be created (still overlapping)
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });

    test("does not duplicate escalation for same spawned ID", async () => {
      const spawnedId = "commission-Sable-20260301-090000";

      await writeScheduleArtifact(projectDir, "schedule-stuck-dedup", {
        cron: "* * * * *",
        lastSpawnedId: spawnedId,
        lastRun: "2025-01-01T00:00:00.000Z",
        worker: "Sable",
      });

      await writeCommissionArtifact(projectDir, spawnedId, {
        status: "in_progress",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();

      // First tick: escalates
      await scheduler.tick();
      expect(meetingRequests).toHaveLength(1);

      // Second tick: does NOT escalate again
      await scheduler.tick();
      expect(meetingRequests).toHaveLength(1);
    });
  });

  describe("consecutive failure threshold", () => {
    test("transitions to failed after 3 consecutive tick failures", async () => {
      await writeScheduleArtifact(projectDir, "schedule-failing", {
        cron: "* * * * *",
        date: "2025-01-01",
      });

      // Make readScheduleMetadata throw to simulate failure
      recordOps.readScheduleMetadataImpl = () => {
        return Promise.reject(new Error("Simulated metadata read failure"));
      };

      const scheduler = createScheduler();

      // Tick 1: failure count 1
      await scheduler.tick();
      let failCalls = scheduleLifecycle.calls.filter((c) => c.method === "fail");
      expect(failCalls).toHaveLength(0);

      // Tick 2: failure count 2
      await scheduler.tick();
      failCalls = scheduleLifecycle.calls.filter((c) => c.method === "fail");
      expect(failCalls).toHaveLength(0);

      // Tick 3: failure count 3 -> transition to failed
      await scheduler.tick();
      failCalls = scheduleLifecycle.calls.filter((c) => c.method === "fail");
      expect(failCalls).toHaveLength(1);
      expect((failCalls[0].args[1] as string)).toContain("3 consecutive");
    });

    test("resets failure count on successful tick", async () => {
      await writeScheduleArtifact(projectDir, "schedule-intermittent", {
        cron: "* * * * *",
        date: "2025-01-01",
      });

      let shouldFail = true;
      const originalImpl = recordOps.readScheduleMetadataImpl;
      recordOps.readScheduleMetadataImpl = (artifactPath: string) => {
        if (shouldFail) return Promise.reject(new Error("Temporary failure"));
        return originalImpl(artifactPath);
      };

      const scheduler = createScheduler();

      // Tick 1: failure (count 1)
      await scheduler.tick();

      // Tick 2: failure (count 2)
      await scheduler.tick();

      // Tick 3: succeeds (resets count)
      shouldFail = false;
      await scheduler.tick();

      // Tick 4: failure (count 1 again)
      shouldFail = true;
      await scheduler.tick();

      // Tick 5: failure (count 2)
      await scheduler.tick();

      // Should NOT have transitioned to failed (never hit 3 consecutive)
      const failCalls = scheduleLifecycle.calls.filter((c) => c.method === "fail");
      expect(failCalls).toHaveLength(0);
    });
  });

  describe("error isolation", () => {
    test("one failing schedule does not prevent others from processing", async () => {
      // Write two schedules: first will fail, second should succeed
      await writeScheduleArtifact(projectDir, "schedule-aaa-fails", {
        cron: "* * * * *",
        date: "2025-01-01",
      });

      await writeScheduleArtifact(projectDir, "schedule-zzz-succeeds", {
        cron: "* * * * *",
        date: "2025-01-01",
        worker: "GoodWorker",
        prompt: "This one works",
      });

      // Make readScheduleMetadata fail only for the first schedule
      const originalImpl = recordOps.readScheduleMetadataImpl;
      recordOps.readScheduleMetadataImpl = (artifactPath: string) => {
        if (artifactPath.includes("schedule-aaa-fails")) {
          return Promise.reject(new Error("This schedule is broken"));
        }
        return originalImpl(artifactPath);
      };

      const scheduler = createScheduler();
      await scheduler.tick();

      // The second schedule should still have spawned a commission
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      const [, , workerName] = createCalls[0].args as [string, string, string];
      expect(workerName).toBe("GoodWorker");
    });
  });

  describe("non-scheduled artifacts are ignored", () => {
    test("tick ignores one-shot commissions", async () => {
      // Write a one-shot commission (not scheduled)
      await writeCommissionArtifact(projectDir, "commission-one-shot", {
        status: "active",
      });

      const scheduler = createScheduler();
      await scheduler.tick();

      // readScheduleMetadata should not have been called
      const metadataCalls = recordOps.calls.filter((c) => c.method === "readScheduleMetadata");
      expect(metadataCalls).toHaveLength(0);
    });
  });

  describe("start and stop", () => {
    test("stop clears the interval", () => {
      // Suppress the initial tick by mocking config with no projects
      const emptyScheduler = createScheduler({ config: { projects: [] } });
      emptyScheduler.start();

      // Verify the service can be stopped without error
      emptyScheduler.stop();

      // Calling stop again is also safe
      emptyScheduler.stop();
    });
  });

  describe("catchUp", () => {
    test("spawns one catch-up commission when last_run is well in the past", async () => {
      // Cron "* * * * *" fires every minute. last_run is far in the past,
      // so many runs were missed. catchUp should spawn exactly one.
      await writeScheduleArtifact(projectDir, "schedule-catchup-due", {
        cron: "* * * * *",
        lastRun: "2025-01-01T00:00:00.000Z",
        worker: "Sable",
        prompt: "Run the catch-up report",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.catchUp();

      // Verify exactly one commission was created
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      // Verify it was dispatched
      const dispatchCalls = commissionSession.calls.filter((c) => c.method === "dispatchCommission");
      expect(dispatchCalls).toHaveLength(1);

      // Verify timeline records "commission_spawned_catchup" with missed_since
      const timelineCalls = recordOps.calls.filter(
        (c) => c.method === "appendTimeline" && c.args[1] === "commission_spawned_catchup",
      );
      expect(timelineCalls).toHaveLength(1);

      const extra = timelineCalls[0].args[3] as Record<string, unknown>;
      expect(extra.spawned_id).toBe("spawned-commission-001");
      expect(extra.missed_since).toBeDefined();
      // missed_since should be an ISO timestamp string
      expect(typeof extra.missed_since).toBe("string");
      expect(new Date(extra.missed_since as string).getTime()).not.toBeNaN();
    });

    test("does not spawn when last_run is within current cron window", async () => {
      // Cron that fires once per year on Jan 1. last_run is just now,
      // so the next occurrence is ~1 year away. No catch-up needed.
      await writeScheduleArtifact(projectDir, "schedule-catchup-recent", {
        cron: "0 0 1 1 *",
        lastRun: new Date().toISOString(),
        worker: "Sable",
        prompt: "Annual report",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.catchUp();

      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });

    test("skips schedule when lastSpawnedId is still active (overlap)", async () => {
      const spawnedId = "commission-Sable-20260301-090000";

      await writeScheduleArtifact(projectDir, "schedule-catchup-overlap", {
        cron: "* * * * *",
        lastRun: "2025-01-01T00:00:00.000Z",
        lastSpawnedId: spawnedId,
        worker: "Sable",
        prompt: "Overlapping run",
        date: "2025-01-01",
      });

      // The spawned commission is still in_progress
      await writeCommissionArtifact(projectDir, spawnedId, {
        status: "in_progress",
      });

      const scheduler = createScheduler();
      await scheduler.catchUp();

      // No new commission should be created
      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });

    test("skips catch-up when last_run is null (brand-new schedule)", async () => {
      // A schedule that has never run can't have missed a run.
      // catchUp should skip it; the normal tick loop handles the first firing.
      await writeScheduleArtifact(projectDir, "schedule-catchup-null-lastrun", {
        cron: "* * * * *",
        lastRun: null,
        worker: "Sable",
        prompt: "First-ever run catch-up",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();
      await scheduler.catchUp();

      const createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);
    });

    test("brand-new schedule is handled by tick, not catchUp", async () => {
      // Cron "* * * * *" fires every minute. No lastRun (brand-new).
      // catchUp should skip it, but tick should spawn it since the
      // date-based fallback in processSchedule makes it due.
      await writeScheduleArtifact(projectDir, "schedule-brand-new", {
        cron: "* * * * *",
        lastRun: null,
        worker: "Sable",
        prompt: "Brand new schedule",
        date: "2025-01-01",
      });

      const scheduler = createScheduler();

      // catchUp should not spawn anything
      await scheduler.catchUp();
      let createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(0);

      // tick should spawn the commission via the normal path
      await scheduler.tick();
      createCalls = commissionSession.calls.filter((c) => c.method === "createCommission");
      expect(createCalls).toHaveLength(1);

      // Verify it's a normal spawn, not a catch-up spawn
      const timelineCalls = recordOps.calls.filter(
        (c) => c.method === "appendTimeline" && c.args[1] === "commission_spawned",
      );
      expect(timelineCalls).toHaveLength(1);
    });
  });
});
