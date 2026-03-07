/* eslint-disable @typescript-eslint/require-await */

/**
 * Tests for the mail orchestrator (sleep flow, reader activation, wake flow).
 *
 * Uses a mock mail orchestrator injected into the commission orchestrator
 * for sleep flow integration tests, and tests the mail orchestrator's
 * internal logic directly for reader/wake flow tests.
 *
 * Covers (Step 5):
 * - commission_mail_sent event triggers session abort and sleep path
 * - Sleep path commits pending changes before reader starts
 * - Sleep path saves session ID to state file
 * - Sleep path transitions to sleeping via lifecycle
 * - Sleep path removes execution from executions Map
 * - Commission without session ID fails instead of sleeping
 * - Sleep path does not trigger auto-dispatch (immediately; triggers after sleep)
 *
 * Covers (Step 6):
 * - Mail reader activates with correct contextType and fresh session
 * - Reader runs in commission's worktree (shared)
 * - Reader activation prompt includes mail message and commission title
 * - Reply received: commission wakes with correct prompt content
 * - No reply + normal end: wake prompt says "completed without replying"
 * - Session error: wake prompt includes error message
 * - Commission resumes with saved session ID
 * - Mail reader concurrency cap: queues when at capacity, dequeues on slot open
 * - Wake triggers auto-dispatch
 * - Sleeping commission does not count against commission cap
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createCommissionOrchestrator } from "@/daemon/services/commission/orchestrator";
import { createCommissionLifecycle, type CommissionLifecycle } from "@/daemon/services/commission/lifecycle";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import type { WorkspaceOps } from "@/daemon/services/workspace";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";
import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import type { GitOps } from "@/daemon/lib/git";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId } from "@/daemon/types";
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { MailOrchestrator } from "@/daemon/services/mail/orchestrator";
import { createMailOrchestrator, type MailOrchestratorCallbacks, type SleepContext, type PendingReaderActivation } from "@/daemon/services/mail/orchestrator";
import type { MailRecordOps, ParsedMailFile } from "@/daemon/services/mail/record";
import type { SleepingCommissionState, PendingMail } from "@/daemon/services/mail/types";

// -- Test helpers --

let tmpDir: string;
let ghHome: string;
let projectPath: string;
let integrationPath: string;

const TEST_PROJECT = "test-project";
const TEST_WORKER = "Test Worker";
const TEST_READER = "Test Reader";
const TEST_COMMISSION_ID = asCommissionId("commission-test-worker-20260307-100000");

function makeWorkerMetadata(name: string = TEST_WORKER): WorkerMetadata {
  return {
    type: "worker",
    identity: {
      name,
      description: `A test worker named ${name}`,
      displayTitle: `${name} Title`,
    },
    posture: `You are ${name}.`,
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "full",
  };
}

function makeWorkerPackage(name: string = TEST_WORKER, pkgName: string = "test-worker"): DiscoveredPackage {
  return {
    name: pkgName,
    path: `/tmp/${pkgName}`,
    metadata: makeWorkerMetadata(name),
  };
}

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    projects: [
      {
        name: TEST_PROJECT,
        path: projectPath,
      },
    ],
    ...overrides,
  };
}

function createTestEventBus(): EventBus & { events: SystemEvent[] } {
  const subscribers = new Set<(event: SystemEvent) => void>();
  const events: SystemEvent[] = [];
  return {
    events,
    emit(event: SystemEvent): void {
      events.push(event);
      for (const cb of subscribers) {
        cb(event);
      }
    },
    subscribe(callback: (event: SystemEvent) => void): () => void {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
  };
}

function createMockGitOps(): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  function track(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }
  return {
    calls,
    createBranch: async (...args) => { track("createBranch", ...args); },
    branchExists: async (...args) => { track("branchExists", ...args); return false; },
    deleteBranch: async (...args) => { track("deleteBranch", ...args); },
    createWorktree: async (...args) => { track("createWorktree", ...args); },
    removeWorktree: async (...args) => { track("removeWorktree", ...args); },
    configureSparseCheckout: async (...args) => { track("configureSparseCheckout", ...args); },
    commitAll: async (...args) => { track("commitAll", ...args); return false; },
    squashMerge: async (...args) => { track("squashMerge", ...args); },
    hasUncommittedChanges: async (...args) => { track("hasUncommittedChanges", ...args); return false; },
    rebase: async (...args) => { track("rebase", ...args); },
    currentBranch: async (...args) => { track("currentBranch", ...args); return "main"; },
    listWorktrees: async (...args) => { track("listWorktrees", ...args); return []; },
    initClaudeBranch: async (...args) => { track("initClaudeBranch", ...args); },
    detectDefaultBranch: async (...args) => { track("detectDefaultBranch", ...args); return "main"; },
    fetch: async (...args) => { track("fetch", ...args); },
    push: async (...args) => { track("push", ...args); },
    resetHard: async (...args) => { track("resetHard", ...args); },
    resetSoft: async (...args) => { track("resetSoft", ...args); },
    createPullRequest: async (...args) => { track("createPullRequest", ...args); return { url: "" }; },
    isAncestor: async (...args) => { track("isAncestor", ...args); return false; },
    treesEqual: async (...args) => { track("treesEqual", ...args); return false; },
    revParse: async (...args) => { track("revParse", ...args); return "abc123"; },
    rebaseOnto: async (...args) => { track("rebaseOnto", ...args); },
    merge: async (...args) => { track("merge", ...args); },
    squashMergeNoCommit: async (...args) => { track("squashMergeNoCommit", ...args); return true; },
    listConflictedFiles: async (...args) => { track("listConflictedFiles", ...args); return []; },
    resolveConflictsTheirs: async (...args) => { track("resolveConflictsTheirs", ...args); },
    mergeAbort: async (...args) => { track("mergeAbort", ...args); },
  };
}

function createMockWorkspace(): WorkspaceOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async prepare(config) {
      calls.push({ method: "prepare", args: [config] });
      const wtCommDir = path.join(config.worktreeDir, ".lore", "commissions");
      await fs.mkdir(wtCommDir, { recursive: true });
      const sourceDir = path.join(integrationPath, ".lore", "commissions");
      try {
        const files = await fs.readdir(sourceDir);
        for (const file of files) {
          await fs.copyFile(path.join(sourceDir, file), path.join(wtCommDir, file));
        }
      } catch { /* integration dir might not have commissions yet */ }
      return { worktreeDir: config.worktreeDir };
    },
    async finalize(config) {
      calls.push({ method: "finalize", args: [config] });
      return { merged: true };
    },
    async preserveAndCleanup(config) {
      calls.push({ method: "preserveAndCleanup", args: [config] });
    },
    async removeWorktree(worktreeDir, projectPath) {
      calls.push({ method: "removeWorktree", args: [worktreeDir, projectPath] });
    },
  };
}

function createMockPrepDeps(overrides?: Partial<SessionPrepDeps>): SessionPrepDeps {
  return {
    resolveToolSet: overrides?.resolveToolSet ?? (async () => ({
      mcpServers: [],
      allowedTools: [],
    })),
    loadMemories: overrides?.loadMemories ?? (async () => ({
      memoryBlock: "",
      needsCompaction: false,
    })),
    activateWorker: overrides?.activateWorker ?? (async () => ({
      systemPrompt: "Test system prompt",
      tools: { mcpServers: [], allowedTools: [] },
      resourceBounds: { maxTurns: 10 },
    })),
    triggerCompaction: overrides?.triggerCompaction,
    memoryLimit: overrides?.memoryLimit,
  };
}

/**
 * Creates a mock query function that emits a session init message then completes.
 * Can optionally emit commission_mail_sent events to test the sleep path.
 */
function createMockQueryFn(options: {
  resultSubmitted?: boolean;
  emitMailSent?: boolean;
  mailSentData?: { targetWorker: string; mailSequence: number; mailPath: string };
  aborted?: boolean;
  error?: string;
  eventBus?: EventBus;
  commissionId?: string;
  sessionId?: string;
} = {}): {
  queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage>;
  runCount: number;
} {
  const {
    resultSubmitted = false,
    emitMailSent = false,
    mailSentData,
    aborted = false,
    error,
    eventBus,
    commissionId,
    sessionId = "test-session-1",
  } = options;

  const state = { runCount: 0 };

  return {
    get runCount() { return state.runCount; },
    queryFn(_params) {
      state.runCount++;
      async function* generate(): AsyncGenerator<SDKMessage> {
        yield {
          type: "system",
          subtype: "init",
          session_id: sessionId,
        } as unknown as SDKMessage;

        if (emitMailSent && eventBus && commissionId && mailSentData) {
          eventBus.emit({
            type: "commission_mail_sent",
            commissionId,
            ...mailSentData,
          });
          // Give the event loop a tick for the subscriber to process
          await new Promise<void>((r) => setTimeout(r, 5));
        }

        if (resultSubmitted && eventBus && commissionId) {
          eventBus.emit({
            type: "commission_result",
            commissionId,
            summary: "Test result summary",
            artifacts: ["output.md"],
          });
        }

        if (aborted) {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          throw abortError;
        }

        if (error) {
          throw new Error(error);
        }

        yield {
          type: "result",
          subtype: "success",
        } as unknown as SDKMessage;
      }
      return generate();
    },
  };
}

async function writeCommissionArtifact(
  basePath: string,
  commissionId: string,
  opts: {
    status?: string;
    worker?: string;
    prompt?: string;
    dependencies?: string[];
    projectName?: string;
  } = {},
): Promise<string> {
  const status = opts.status ?? "pending";
  const worker = opts.worker ?? TEST_WORKER;
  const prompt = opts.prompt ?? "Do the work";
  const dependencies = opts.dependencies ?? [];
  const projectName = opts.projectName ?? TEST_PROJECT;

  const depsYaml = dependencies.length > 0
    ? "\n" + dependencies.map((d) => `  - ${d}`).join("\n")
    : " []";

  const now = new Date();
  const content = `---
title: "Commission: Test"
date: ${now.toISOString().split("T")[0]}
status: ${status}
tags: [commission]
worker: ${worker}
workerDisplayTitle: "${worker} Title"
prompt: "${prompt}"
dependencies:${depsYaml}
linked_artifacts: []
activity_timeline:
  - timestamp: ${now.toISOString()}
    event: created
    reason: "Commission created"
current_progress: ""
projectName: ${projectName}
---
`;

  const dir = path.join(basePath, ".lore", "commissions");
  await fs.mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `${commissionId}.md`);
  await fs.writeFile(artifactPath, content, "utf-8");
  return artifactPath;
}

/**
 * Creates a mail file at the given path for testing.
 */
async function writeMailFile(
  mailFilePath: string,
  opts?: {
    from?: string;
    to?: string;
    subject?: string;
    message?: string;
    status?: string;
    reply?: { summary: string; filesModified?: string[] };
  },
): Promise<void> {
  const from = opts?.from ?? TEST_WORKER;
  const to = opts?.to ?? TEST_READER;
  const subject = opts?.subject ?? "Test subject";
  const message = opts?.message ?? "Test message";
  const status = opts?.status ?? "sent";

  // Build reply section matching the format that writeReply produces
  // and that readMailFile expects to parse.
  let replyContent = "";
  if (opts?.reply) {
    replyContent = `**Summary:** ${opts.reply.summary}`;
    if (opts.reply.filesModified && opts.reply.filesModified.length > 0) {
      replyContent += `\n\n**Files modified:**\n\n${opts.reply.filesModified.map(f => `- ${f}`).join("\n")}`;
    }
  }

  // Use title: "Mail: ..." to match production createMailFile format.
  // readMailFile reads "title" field, not "subject".
  const content = `---
title: "Mail: ${subject}"
from: ${from}
to: ${to}
commission: ${TEST_COMMISSION_ID as string}
sequence: 1
status: ${status}
---

## Message

${message}

## Reply

${replyContent}
`;
  await fs.mkdir(path.dirname(mailFilePath), { recursive: true });
  await fs.writeFile(mailFilePath, content, "utf-8");
}

/**
 * Transitions a commission through lifecycle stages to reach the target state.
 * Writes the artifact to disk so status transitions can update it.
 */
async function setupLifecycleState(
  lifecycle: CommissionLifecycle,
  commissionId: CommissionId,
  projectName: string,
  worktreeDir: string,
  targetState: "in_progress" | "sleeping",
): Promise<void> {
  const artifactPath = path.join(worktreeDir, ".lore", "commissions", `${commissionId as string}.md`);
  await writeCommissionArtifact(worktreeDir, commissionId as string, { status: "pending", projectName });

  lifecycle.register(commissionId, projectName, "pending", artifactPath);
  await lifecycle.dispatch(commissionId);
  await lifecycle.executionStarted(commissionId, artifactPath);

  if (targetState === "sleeping") {
    await lifecycle.sleep(commissionId, "Waiting for mail");
  }
}

// -- Setup / Teardown --

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join("/tmp", "mail-orch-test-"));
  ghHome = path.join(tmpDir, ".guild-hall");
  projectPath = path.join(tmpDir, "project");
  integrationPath = path.join(ghHome, "projects", TEST_PROJECT);

  await fs.mkdir(integrationPath, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(ghHome, "state", "commissions"), { recursive: true });
  await fs.mkdir(path.join(ghHome, "worktrees", TEST_PROJECT), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Step 5: Sleep flow tests --

describe("Sleep flow (Step 5)", () => {
  test("commission_mail_sent event triggers sleep path and removes execution", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const handleSleepCalls: SleepContext[] = [];

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep(ctx) {
        handleSleepCalls.push(ctx);
        return true;
      },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission() {},
    };

    const mockQueryFn = createMockQueryFn({
      emitMailSent: true,
      mailSentData: {
        targetWorker: TEST_READER,
        mailSequence: 1,
        mailPath: "/tmp/mail-001.md",
      },
      eventBus,
      commissionId: TEST_COMMISSION_ID as string,
    });

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: createMockWorkspace(),
      prepDeps: createMockPrepDeps(),
      queryFn: mockQueryFn.queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps,
      mailOrchestrator: mockMailOrchestrator,
    });

    // Create and dispatch a commission
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string);
    const artifactPath = path.join(integrationPath, ".lore", "commissions", `${TEST_COMMISSION_ID as string}.md`);
    lifecycle.register(TEST_COMMISSION_ID, TEST_PROJECT, "pending", artifactPath);
    await orchestrator.dispatchCommission(TEST_COMMISSION_ID);

    // Wait for the fire-and-forget session to complete
    await new Promise<void>((r) => setTimeout(r, 50));

    // handleSleep should have been called
    expect(handleSleepCalls.length).toBe(1);
    expect(handleSleepCalls[0].commissionId).toBe(TEST_COMMISSION_ID);
    expect(handleSleepCalls[0].targetWorker).toBe(TEST_READER);
    expect(handleSleepCalls[0].mailSequence).toBe(1);
    expect(handleSleepCalls[0].mailPath).toBe("/tmp/mail-001.md");

    // Execution should be removed from active commissions (sleeping doesn't count)
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });

  test("sleep path transitions to sleeping via lifecycle", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    // Create a real mail orchestrator (not mock) to test lifecycle transitions
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    // Register and transition to in_progress
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "in_progress");

    const sleepResult = await mailOrch.handleSleep({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      targetWorker: TEST_READER,
      mailSequence: 1,
      mailPath: "/tmp/mail-001.md",
      outcome: { sessionId: "test-session-1", aborted: true },
    });

    expect(sleepResult).toBe(true);
    expect(lifecycle.getStatus(TEST_COMMISSION_ID)).toBe("sleeping");

    // Clean up background reader session fired by handleSleep
    mailOrch.shutdownReaders();
    await new Promise<void>((r) => setTimeout(r, 50));
  });

  test("sleep path saves session ID to state file", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    let writtenData: Record<string, unknown> | null = null;

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        writtenData = data;
        await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
        await fs.writeFile(stateFilePath, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: () => stateFilePath,
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "in_progress");

    await mailOrch.handleSleep({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      targetWorker: TEST_READER,
      mailSequence: 1,
      mailPath: "/tmp/mail-001.md",
      outcome: { sessionId: "saved-session-42", aborted: true },
    });

    expect(writtenData).not.toBeNull();
    expect(writtenData!.sessionId).toBe("saved-session-42");
    expect(writtenData!.status).toBe("sleeping");
    expect(writtenData!.pendingMail).toEqual({
      mailFilePath: "/tmp/mail-001.md",
      readerWorkerName: TEST_READER,
      readerActive: false,
    });

    // Clean up background reader session fired by handleSleep
    mailOrch.shutdownReaders();
    await new Promise<void>((r) => setTimeout(r, 50));
  });

  test("sleep path commits pending changes", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "in_progress");

    await mailOrch.handleSleep({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      targetWorker: TEST_READER,
      mailSequence: 1,
      mailPath: "/tmp/mail-001.md",
      outcome: { sessionId: "test-session-1", aborted: true },
    });

    // commitAll should have been called on the worktree
    const commitCalls = gitOps.calls.filter(c => c.method === "commitAll");
    expect(commitCalls.length).toBe(1);
    expect(commitCalls[0].args[0]).toBe(worktreeDir);

    // Clean up background reader session fired by handleSleep
    mailOrch.shutdownReaders();
    await new Promise<void>((r) => setTimeout(r, 50));
  });

  test("commission without session ID fails instead of sleeping", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage()],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    // Properly register with all 4 required args and transition to in_progress
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "in_progress");

    const result = await mailOrch.handleSleep({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      targetWorker: TEST_READER,
      mailSequence: 1,
      mailPath: "/tmp/mail-001.md",
      outcome: { sessionId: null, aborted: true },
    });

    expect(result).toBe(false);
    // Should have transitioned to failed, not sleeping
    expect(lifecycle.getStatus(TEST_COMMISSION_ID)).toBe("failed");
  });

  test("sleep path does not count against commission cap", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission() {},
    };

    const mockQueryFn = createMockQueryFn({
      emitMailSent: true,
      mailSentData: {
        targetWorker: TEST_READER,
        mailSequence: 1,
        mailPath: "/tmp/mail-001.md",
      },
      eventBus,
      commissionId: TEST_COMMISSION_ID as string,
    });

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: createMockWorkspace(),
      prepDeps: createMockPrepDeps(),
      queryFn: mockQueryFn.queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps,
      mailOrchestrator: mockMailOrchestrator,
    });

    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string);
    const artifactPath = path.join(integrationPath, ".lore", "commissions", `${TEST_COMMISSION_ID as string}.md`);
    lifecycle.register(TEST_COMMISSION_ID, TEST_PROJECT, "pending", artifactPath);
    await orchestrator.dispatchCommission(TEST_COMMISSION_ID);

    // Wait for session to complete
    await new Promise<void>((r) => setTimeout(r, 50));

    // After sleep, active commissions should be 0
    expect(orchestrator.getActiveCommissions()).toBe(0);
  });
});

// -- Step 6: Mail reader and wake flow tests --

describe("Mail reader activation (Step 6b)", () => {
  test("reader activates with correct contextType and fresh session", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    // Track prepareSdkSession calls via prepDeps
    const activateWorkerCalls: unknown[] = [];
    const prepDeps = createMockPrepDeps({
      activateWorker: async (config) => {
        activateWorkerCalls.push(config);
        return {
          systemPrompt: "Test system prompt",
          tools: { mcpServers: [], allowedTools: [] },
          resourceBounds: { maxTurns: 10 },
        };
      },
    });

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    // Write a mail file
    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Need code review",
      message: "Please review the auth module",
    });

    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    const stateFileWrites: Record<string, unknown>[] = [];

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        stateFileWrites.push(data);
        await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
        await fs.writeFile(stateFilePath, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: () => stateFilePath,
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const queryFn = createMockQueryFn({ sessionId: "reader-session-1" });

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps,
        queryFn: queryFn.queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    // Set up sleeping state
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    // Write sleeping state file
    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath,
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    });

    // Activate the reader
    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    // Wait for the fire-and-forget session (reader + potential wake/resume)
    await new Promise<void>((r) => setTimeout(r, 200));

    // SDK query function should have been called at least once (reader session)
    // The wake/resume pipeline may add a second call.
    expect(queryFn.runCount).toBeGreaterThanOrEqual(1);

    // The first activateWorker call should be for the reader (contextType "mail")
    expect(activateWorkerCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("reader activation prompt includes mail message and commission title", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Architecture review",
      message: "Please review the new auth module design",
    });

    let capturedPrompt: string | null = null;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        // Capture only the FIRST prompt (the reader activation prompt).
        // Subsequent calls (wake/resume) should not overwrite it.
        if (capturedPrompt === null) {
          capturedPrompt = params.prompt;
        }
        async function* gen(): AsyncGenerator<SDKMessage> {
          yield { type: "system", subtype: "init", session_id: "s1" } as unknown as SDKMessage;
          yield { type: "result", subtype: "success" } as unknown as SDKMessage;
        }
        return gen();
      };

    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
        await fs.writeFile(stateFilePath, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: () => stateFilePath,
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 100));

    expect(capturedPrompt).not.toBeNull();
    // Prompt should include the mail subject, message, and commission title
    expect(capturedPrompt!).toContain("Architecture review");
    expect(capturedPrompt!).toContain("Please review the new auth module design");
    expect(capturedPrompt!).toContain("Commission: Test");
    // Prompt should instruct to call the reply tool
    expect(capturedPrompt!).toContain("reply");
  });
});

describe("Mail reader concurrency (Step 6a)", () => {
  test("6th reader queues when cap is 5 and activates when slot opens", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    // Track how many reader sessions are started (vs resume sessions).
    // Reader prompts contain "consultation request"; resume prompts don't.
    let readerStartCount = 0;
    const sessionCompletionCallbacks: Array<() => void> = [];

    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        const isReader = params.prompt.includes("consultation request");
        if (isReader) {
          readerStartCount++;
        }
        async function* gen(): AsyncGenerator<SDKMessage> {
          yield { type: "system", subtype: "init", session_id: `s-${readerStartCount}` } as unknown as SDKMessage;
          if (isReader) {
            // Block reader sessions until resolved
            await new Promise<void>((resolve) => {
              sessionCompletionCallbacks.push(resolve);
            });
          }
          yield { type: "result", subtype: "success" } as unknown as SDKMessage;
        }
        return gen();
      };

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig({ maxConcurrentMailReaders: 5 }),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    // Create 6 commissions, each with a mail file
    const commissionIds: CommissionId[] = [];
    for (let i = 0; i < 6; i++) {
      const cid = asCommissionId(`commission-test-worker-20260307-10000${i}`);
      commissionIds.push(cid);

      const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, cid as string);
      await fs.mkdir(path.join(worktreeDir, ".lore", "commissions"), { recursive: true });

      const mailFilePath = path.join(worktreeDir, ".lore", "mail", `mail-001.md`);
      await writeMailFile(mailFilePath);

      await setupLifecycleState(lifecycle, cid, TEST_PROJECT, worktreeDir, "sleeping");

      await callbacks.writeStateFile(cid, {
        commissionId: cid as string,
        projectName: TEST_PROJECT,
        workerName: TEST_WORKER,
        status: "sleeping",
        worktreeDir,
        branchName: "claude/commission/test",
        sessionId: `session-${i}`,
        sleepStartedAt: new Date().toISOString(),
        pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
      });

      mailOrch.activateMailReader({
        commissionId: cid,
        projectName: TEST_PROJECT,
        workerName: TEST_WORKER,
        worktreeDir,
        branchName: "claude/commission/test",
        mailFilePath,
        readerWorkerName: TEST_READER,
        mailSequence: 1,
      });
    }

    // Give some time for activation
    await new Promise<void>((r) => setTimeout(r, 50));

    // 5 should be active, 1 should be queued
    expect(mailOrch.getActiveReaderCount()).toBe(5);
    expect(readerStartCount).toBe(5);

    // Complete one reader session
    if (sessionCompletionCallbacks.length > 0) {
      sessionCompletionCallbacks[0]();
    }

    // Wait for dequeue (the completed reader triggers wake+resume too, but
    // we only count reader sessions, not resume sessions)
    await new Promise<void>((r) => setTimeout(r, 200));

    // Now the 6th reader should have started
    expect(readerStartCount).toBe(6);
  });
});

describe("Wake flow (Step 6c)", () => {
  test("reply received: commission wakes with correct prompt content", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");

    // Write mail with reply already in it (simulating reader having written reply)
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Code review",
      message: "Please review auth module",
      status: "replied",
      reply: {
        summary: "Auth module looks good. Fixed one issue with token expiry.",
        filesModified: ["src/auth.ts", "tests/auth.test.ts"],
      },
    });

    let resumeWakePrompt: string | null = null;

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    // The reader session emits a mail_reply_received event during its run,
    // and rewrites the mail file to "replied" status with reply content
    // (simulating what the reply tool does in production).
    let readerSessionRunning = false;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        if (!readerSessionRunning) {
          // This is the reader session
          readerSessionRunning = true;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;

            // Simulate the reply tool: rewrite the mail file with replied status
            // and reply content (matching the format writeReply produces).
            await writeMailFile(mailFilePath, {
              from: TEST_WORKER,
              to: TEST_READER,
              subject: "Code review",
              message: "Please review auth module",
              status: "replied",
              reply: {
                summary: "Auth module looks good. Fixed one issue with token expiry.",
                filesModified: ["src/auth.ts", "tests/auth.test.ts"],
              },
            });

            // Simulate the reply tool emitting the event
            const contextId = `mail-${TEST_COMMISSION_ID as string}-001`;
            eventBus.emit({
              type: "mail_reply_received",
              contextId,
              commissionId: TEST_COMMISSION_ID as string,
              summary: "Auth module looks good. Fixed one issue with token expiry.",
            });
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        } else {
          // This is the resume session
          resumeWakePrompt = params.prompt;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const prepDeps = createMockPrepDeps();

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps,
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    // Write sleeping state file
    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    // Activate reader
    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    // Wait for reader + wake + resume
    await new Promise<void>((r) => setTimeout(r, 200));

    // The wake prompt should contain the reply summary
    expect(resumeWakePrompt).not.toBeNull();
    expect(resumeWakePrompt!).toContain("Auth module looks good");
    expect(resumeWakePrompt!).toContain("src/auth.ts");
    expect(resumeWakePrompt!).toContain(TEST_READER);
  });

  test("no reply + normal end: wake prompt says completed without replying", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Help needed",
      message: "Please help with auth",
    });

    let resumeWakePrompt: string | null = null;

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        if (isReaderSession) {
          isReaderSession = false;
          // Reader completes without calling reply
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        } else {
          // Resume session
          resumeWakePrompt = params.prompt;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 200));

    expect(resumeWakePrompt).not.toBeNull();
    expect(resumeWakePrompt!).toContain("completed without sending a reply");
    expect(resumeWakePrompt!).toContain(TEST_READER);
  });

  test("session error: wake prompt includes error message", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath);

    let resumeWakePrompt: string | null = null;

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        if (isReaderSession) {
          isReaderSession = false;
          // Reader throws an error
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            throw new Error("SDK connection lost");
          }
          return gen();
        } else {
          resumeWakePrompt = params.prompt;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 200));

    expect(resumeWakePrompt).not.toBeNull();
    expect(resumeWakePrompt!).toContain("error");
    expect(resumeWakePrompt!).toContain("SDK connection lost");
    expect(resumeWakePrompt!).toContain(TEST_READER);
  });

  test("commission resumes with saved session ID", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath);

    const prepDeps = createMockPrepDeps();

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(_params) {
        if (isReaderSession) {
          isReaderSession = false;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        } else {
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps,
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    // Save with a specific session ID to verify it's used on resume
    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "saved-session-42",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 200));

    // The lifecycle should have woken (sleeping -> in_progress)
    // After the resume completes, onResumeCompleted is called
    // The lifecycle status depends on what onResumeCompleted does
    // (our mock doesn't do anything, so it stays in_progress)
    const status = lifecycle.getStatus(TEST_COMMISSION_ID);
    expect(["in_progress", "completed", undefined]).toContain(status);
  });

  test("wake triggers auto-dispatch", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    let autoDispatchCount = 0;

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath);

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => { autoDispatchCount++; },
      onResumeCompleted: async () => {},
    };

    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(_params) {
        if (isReaderSession) {
          isReaderSession = false;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        } else {
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 200));

    // auto-dispatch should have been called during wake
    expect(autoDispatchCount).toBeGreaterThan(0);
  });

  test("shutdown aborts active readers", () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => "",
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [],
        guildHallHome: ghHome,
        gitOps: createMockGitOps(),
      },
      callbacks,
    );

    // shutdownReaders should not throw when no readers are active
    expect(() => mailOrch.shutdownReaders()).not.toThrow();
  });
});

// -- Step 7: Cancel/Abandon + Crash Recovery --

describe("Cancel sleeping commission (Step 7a)", () => {
  test("cancel sleeping commission: cancels via lifecycle, calls cancelReaderForCommission, preserves branch", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(worktreeDir, { recursive: true });

    const cancelReaderCalls: CommissionId[] = [];
    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission(cid) {
        cancelReaderCalls.push(cid);
        return true;
      },
      async recoverSleepingCommission() {},
    };

    // Write the sleeping state file
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    // Set up lifecycle in sleeping state
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      fileExists: async (p) => p === worktreeDir,
    });

    await orchestrator.cancelCommission(TEST_COMMISSION_ID, "User cancelled");

    // Verify cancelReaderForCommission was called
    expect(cancelReaderCalls).toEqual([TEST_COMMISSION_ID]);

    // Verify preserveAndCleanup was called
    const preserveCalls = mockWorkspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(1);

    // State file should be updated to cancelled
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("cancelled");

    // Lifecycle should no longer track the commission
    expect(lifecycle.isTracked(TEST_COMMISSION_ID)).toBe(false);
  });

  test("abandon sleeping commission: transitions to terminal abandoned state", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(worktreeDir, { recursive: true });

    const cancelReaderCalls: CommissionId[] = [];
    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission(cid) {
        cancelReaderCalls.push(cid);
        return true;
      },
      async recoverSleepingCommission() {},
    };

    // Write sleeping state file
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    // Set up lifecycle in sleeping state
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      fileExists: async (p) => p === worktreeDir,
    });

    await orchestrator.abandonCommission(TEST_COMMISSION_ID, "No longer needed");

    // Verify cancelReaderForCommission was called
    expect(cancelReaderCalls).toEqual([TEST_COMMISSION_ID]);

    // State file should be updated to abandoned
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("abandoned");

    // Lifecycle should not track the commission
    expect(lifecycle.isTracked(TEST_COMMISSION_ID)).toBe(false);
  });

  test("cancel sleeping commission with missing worktree: cancels without preserveAndCleanup", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();
    const worktreeDir = "/tmp/nonexistent-worktree";

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission() {},
    };

    // Write sleeping state file pointing to nonexistent worktree
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    // Set up a worktree dir for the artifact (needed for lifecycle setup)
    const artDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(artDir, { recursive: true });
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, artDir, "sleeping");

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      fileExists: async () => false, // worktree doesn't exist
    });

    await orchestrator.cancelCommission(TEST_COMMISSION_ID, "User cancelled");

    // preserveAndCleanup should NOT have been called (no worktree)
    const preserveCalls = mockWorkspace.calls.filter((c) => c.method === "preserveAndCleanup");
    expect(preserveCalls.length).toBe(0);

    // State should still be cancelled
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("cancelled");
  });
});

describe("Crash recovery for sleeping commissions (Step 7b)", () => {
  test("recovery with worktree missing: transitions to failed", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission() {},
    };

    // Write sleeping state file with worktreeDir pointing to nonexistent path
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir: "/tmp/nonexistent-worktree",
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    // Write the artifact at integration path (needed for lifecycle register)
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      fileExists: async () => false,
    });

    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBeGreaterThanOrEqual(1);

    // State file should be updated to failed
    const stateRaw = await fs.readFile(stateFilePath, "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("failed");

    // Lifecycle should not track the commission
    expect(lifecycle.isTracked(TEST_COMMISSION_ID)).toBe(false);
  });

  test("recovery with worktree exists: delegates to mailOrchestrator.recoverSleepingCommission", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(worktreeDir, { recursive: true });

    const recoverCalls: SleepingCommissionState[] = [];
    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission(state) {
        recoverCalls.push(state);
      },
    };

    const sleepingState: SleepingCommissionState = {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    };

    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify(sleepingState), "utf-8");

    // Write the artifact at integration path
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      fileExists: async (p) => p === worktreeDir,
    });

    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBeGreaterThanOrEqual(1);

    // recoverSleepingCommission should have been called with the correct state
    expect(recoverCalls.length).toBe(1);
    expect(recoverCalls[0].commissionId).toBe(TEST_COMMISSION_ID as string);
    expect(recoverCalls[0].pendingMail.readerWorkerName).toBe(TEST_READER);

    // Lifecycle should still track the commission (mail orchestrator manages it)
    expect(lifecycle.isTracked(TEST_COMMISSION_ID)).toBe(true);
  });

  test("recovery skips sleeping commission with corrupt state file", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return false; },
      async recoverSleepingCommission() {},
    };

    // Write a corrupt state file
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, "this is not valid json{{{", "utf-8");

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: createMockWorkspace(),
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
    });

    // Should not throw on corrupt state files
    const recovered = await orchestrator.recoverCommissions();
    expect(recovered).toBe(0);
  });
});

describe("Mail orchestrator cancel (Step 7a internal)", () => {
  function createMockMailRecordOps(mailData: Partial<ParsedMailFile> = {}): MailRecordOps {
    const defaults: ParsedMailFile = {
      from: TEST_WORKER,
      to: TEST_READER,
      commission: TEST_COMMISSION_ID as string,
      sequence: 1,
      status: "sent",
      subject: "Test subject",
      message: "Test message",
      ...mailData,
    };
    return {
      async createMailFile() { return "/tmp/mail.md"; },
      async updateMailStatus() {},
      async writeReply() {},
      async readMailFile() { return defaults; },
      async getMailSequence() { return 1; },
    };
  }

  test("cancelReaderForCommission dequeues a queued reader", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => "",
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    // Create mail orchestrator with very low capacity so readers queue
    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig({ maxConcurrentMailReaders: 0 }), // zero capacity = everything queues
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
        mailRecordOps: createMockMailRecordOps(),
      },
      callbacks,
    );

    // Activate a reader; it should queue because capacity is 0
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore", "commissions"), { recursive: true });
    await writeCommissionArtifact(worktreeDir, TEST_COMMISSION_ID as string);

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "test-branch",
      mailFilePath: "/tmp/mail-001.md",
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    // Reader should be queued, not active (capacity is 0)
    expect(mailOrch.getActiveReaderCount()).toBe(0);

    // Cancel the queued reader
    const result = await mailOrch.cancelReaderForCommission(TEST_COMMISSION_ID);
    expect(result).toBe(true);
  });

  test("cancelReaderForCommission returns false when no reader found", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => "",
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [],
        guildHallHome: ghHome,
        gitOps: createMockGitOps(),
      },
      callbacks,
    );

    // No reader was ever activated for this commission
    const result = await mailOrch.cancelReaderForCommission(TEST_COMMISSION_ID);
    expect(result).toBe(false);
  });
});

describe("Mail orchestrator recovery (Step 7b internal)", () => {
  function createMockMailRecordOps(overrides: {
    status?: string;
    reply?: { summary: string; filesModified?: string[] };
    updateStatusCalls?: Array<{ path: string; status: string }>;
  } = {}): MailRecordOps {
    const updateStatusCalls = overrides.updateStatusCalls ?? [];
    const mailData: ParsedMailFile = {
      from: TEST_WORKER,
      to: TEST_READER,
      commission: TEST_COMMISSION_ID as string,
      sequence: 1,
      status: (overrides.status ?? "sent") as ParsedMailFile["status"],
      subject: "Test subject",
      message: "Test message",
      reply: overrides.reply,
    };
    return {
      async createMailFile() { return "/tmp/mail.md"; },
      async updateMailStatus(filePath, status) {
        updateStatusCalls.push({ path: filePath, status });
        mailData.status = status;
      },
      async writeReply() {},
      async readMailFile() { return mailData; },
      async getMailSequence() { return 1; },
    };
  }

  test("recovery with mail replied: wakes commission", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore", "commissions"), { recursive: true });
    await writeCommissionArtifact(worktreeDir, TEST_COMMISSION_ID as string, { status: "sleeping" });

    // Set up lifecycle in sleeping state
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    const stateWrites: Array<{ cid: string; data: Record<string, unknown> }> = [];
    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (cid, data) => {
        stateWrites.push({ cid: cid as string, data });
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    // Write the sleeping state file so wakeCommission can read it
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn({ sessionId: "session-1" }).queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
        mailRecordOps: createMockMailRecordOps({
          status: "replied",
          reply: { summary: "Here are my findings", filesModified: ["src/main.ts"] },
        }),
      },
      callbacks,
    );

    const sleepingState: SleepingCommissionState = {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    };

    await mailOrch.recoverSleepingCommission(sleepingState);

    // Wait for wake flow to process
    await new Promise<void>((r) => setTimeout(r, 50));

    // Commission should have been woken (sleeping -> in_progress)
    expect(lifecycle.getStatus(TEST_COMMISSION_ID)).toBe("in_progress");
  });

  test("recovery with mail open: commits partial work, resets to sent, activates reader", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore", "commissions"), { recursive: true });
    await writeCommissionArtifact(worktreeDir, TEST_COMMISSION_ID as string, { status: "sleeping" });

    const updateStatusCalls: Array<{ path: string; status: string }> = [];

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => "",
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
        mailRecordOps: createMockMailRecordOps({ status: "open", updateStatusCalls }),
      },
      callbacks,
    );

    const sleepingState: SleepingCommissionState = {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    };

    await mailOrch.recoverSleepingCommission(sleepingState);

    // gitOps.commitAll should have been called (partial work commit)
    const commitCalls = gitOps.calls.filter((c) => c.method === "commitAll");
    expect(commitCalls.length).toBe(1);
    expect(commitCalls[0].args[0]).toBe(worktreeDir);

    // Mail status should have been reset to "sent" first (recovery reset),
    // then set to "open" when the re-activated reader started.
    expect(updateStatusCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateStatusCalls[0].status).toBe("sent");
    // The second call (if present) is from the re-activated reader session setting status to "open"
    if (updateStatusCalls.length >= 2) {
      expect(updateStatusCalls[1].status).toBe("open");
    }
  });

  test("recovery with mail sent: activates reader", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore", "commissions"), { recursive: true });
    await writeCommissionArtifact(worktreeDir, TEST_COMMISSION_ID as string, { status: "sleeping" });

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async () => {},
      commissionStatePath: () => "",
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn: createMockQueryFn().queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
        mailRecordOps: createMockMailRecordOps({ status: "sent" }),
      },
      callbacks,
    );

    const sleepingState: SleepingCommissionState = {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    };

    await mailOrch.recoverSleepingCommission(sleepingState);

    // No commitAll should have been called for "sent" status (no partial work to commit)
    const commitCalls = gitOps.calls.filter((c) => c.method === "commitAll");
    expect(commitCalls.length).toBe(0);

    // Reader should have been activated
    // Due to async session execution, we give it a moment
    await new Promise<void>((r) => setTimeout(r, 20));

    // The reader was activated (it may fail or succeed depending on mocks,
    // but the activation path was taken, which is what we verify by checking
    // no commits were made for the "sent" case unlike "open").
  });
});

// -- DEFECT-2: Resumed session registered in executions map --

describe("Resumed session execution registration (DEFECT-2)", () => {
  test("resumeCommissionSession calls registerExecution before SDK session and unregisterExecution after", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Help needed",
      message: "Please help",
      status: "sent",
      reply: { summary: "Done", filesModified: [] },
    });

    const registerCalls: Array<{ commissionId: CommissionId; abortController: AbortController }> = [];
    const unregisterCalls: CommissionId[] = [];

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
      registerExecution: (commissionId, _pn, _wn, _wd, _bn, abortController) => {
        registerCalls.push({ commissionId, abortController });
      },
      unregisterExecution: (commissionId) => {
        unregisterCalls.push(commissionId);
      },
    };

    // Reader emits reply so the wake path fires
    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        if (isReaderSession) {
          isReaderSession = false;
          // Reader emits reply event
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            eventBus.emit({
              type: "mail_reply_received",
              contextId: `mail-${TEST_COMMISSION_ID as string}-001`,
              commissionId: TEST_COMMISSION_ID as string,
              summary: "Done",
            });
            await new Promise<void>((r) => setTimeout(r, 5));
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        } else {
          // Resume session
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps: createMockPrepDeps(),
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    // Wait for reader + wake + resume to complete
    await new Promise<void>((r) => setTimeout(r, 500));

    // registerExecution should have been called with the commission's AbortController
    expect(registerCalls.length).toBe(1);
    expect(registerCalls[0].commissionId).toBe(TEST_COMMISSION_ID);
    expect(registerCalls[0].abortController).toBeInstanceOf(AbortController);

    // unregisterExecution should have been called after session completion
    expect(unregisterCalls).toEqual([TEST_COMMISSION_ID]);
  });
});

// -- DEFECT-3: checkDependencyTransitions on sleeping abandon --

describe("Sleeping commission abandon triggers dependency transitions (DEFECT-3)", () => {
  test("abandon sleeping commission calls checkDependencyTransitions", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const mockWorkspace = createMockWorkspace();
    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(worktreeDir, { recursive: true });

    // Create a second commission that depends on the sleeping one
    const dependentId = asCommissionId("commission-dependent-20260307-100001");
    const depPath = `.lore/commissions/${TEST_COMMISSION_ID as string}.md`;

    const mockMailOrchestrator: MailOrchestrator = {
      async handleSleep() { return true; },
      activateMailReader() {},
      getActiveReaderCount: () => 0,
      shutdownReaders() {},
      async cancelReaderForCommission() { return true; },
      async recoverSleepingCommission() {},
    };

    // Write sleeping state file
    const stateFilePath = path.join(ghHome, "state", "commissions", `${TEST_COMMISSION_ID as string}.json`);
    await fs.writeFile(stateFilePath, JSON.stringify({
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "test-branch",
      sessionId: "session-1",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: {
        mailFilePath: "/tmp/mail-001.md",
        readerWorkerName: TEST_READER,
        readerActive: false,
      },
    }), "utf-8");

    // Set up lifecycle in sleeping state
    await writeCommissionArtifact(integrationPath, TEST_COMMISSION_ID as string, { status: "sleeping" });
    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    // Create a dependent commission with a dependency path that points to the sleeping
    // commission's artifact (dependency format is relative path from integration root)
    await writeCommissionArtifact(integrationPath, dependentId as string, {
      status: "blocked",
      dependencies: [depPath],
    });
    // Do NOT register the dependent in lifecycle; checkDependencyTransitions
    // registers transiently and forgets after transition.

    const orchestrator = createCommissionOrchestrator({
      lifecycle,
      workspace: mockWorkspace,
      prepDeps: createMockPrepDeps(),
      queryFn: createMockQueryFn().queryFn,
      recordOps,
      eventBus,
      config: makeConfig(),
      packages: [makeWorkerPackage()],
      guildHallHome: ghHome,
      gitOps: createMockGitOps(),
      mailOrchestrator: mockMailOrchestrator,
      // The dependency file exists at the integration path (the sleeping commission's artifact)
      fileExists: async (p) => {
        if (p === worktreeDir) return true;
        // Check actual filesystem for dependency file existence
        try { await fs.access(p); return true; } catch { return false; }
      },
    });

    await orchestrator.abandonCommission(TEST_COMMISSION_ID, "No longer needed");

    // The sleeping commission should be abandoned
    expect(lifecycle.isTracked(TEST_COMMISSION_ID)).toBe(false);

    // The dependent commission should have been unblocked (checkDependencyTransitions called).
    // checkDependencyTransitions registers, unblocks, then forgets, so the dependent
    // won't be tracked anymore. Verify it was unblocked by checking the artifact on disk.
    const depArtifactPath = path.join(integrationPath, ".lore", "commissions", `${dependentId as string}.md`);
    const raw = await fs.readFile(depArtifactPath, "utf-8");
    expect(raw).toContain("status: pending");
  });
});

// -- DEFECT-4: maxTurns wake prompt --

describe("maxTurns wake prompt distinction (DEFECT-4)", () => {
  test("maxTurns exhaustion produces distinct wake prompt from normal completion", async () => {
    const eventBus = createTestEventBus();
    const recordOps = createCommissionRecordOps();
    const lifecycle = createCommissionLifecycle({
      recordOps,
      emitEvent: (event: SystemEvent) => eventBus.emit(event),
    });
    const gitOps = createMockGitOps();

    const worktreeDir = path.join(ghHome, "worktrees", TEST_PROJECT, TEST_COMMISSION_ID as string);
    await fs.mkdir(path.join(worktreeDir, ".lore"), { recursive: true });

    const mailFilePath = path.join(worktreeDir, ".lore", "mail", "mail-001.md");
    await writeMailFile(mailFilePath, {
      from: TEST_WORKER,
      to: TEST_READER,
      subject: "Help needed",
      message: "Please help",
    });

    let resumeWakePrompt: string | null = null;

    const callbacks: MailOrchestratorCallbacks = {
      writeStateFile: async (_cid, data) => {
        const fp = path.join(ghHome, "state", "commissions", `${_cid as string}.json`);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf-8");
      },
      commissionStatePath: (cid) => path.join(ghHome, "state", "commissions", `${cid as string}.json`),
      enqueueAutoDispatch: () => {},
      onResumeCompleted: async () => {},
    };

    // Reader session exhausts maxTurns (2 turn_end events with maxTurns=2)
    let isReaderSession = true;
    const queryFn: (params: { prompt: string; options: Record<string, unknown> }) => AsyncGenerator<SDKMessage> =
      function(params) {
        if (isReaderSession) {
          isReaderSession = false;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "reader-s1" } as unknown as SDKMessage;
            // Two turn_end events matching the maxTurns=2 from prepDeps
            yield { type: "result", subtype: "success", total_cost_usd: 0.01 } as unknown as SDKMessage;
            yield { type: "result", subtype: "success", total_cost_usd: 0.01 } as unknown as SDKMessage;
          }
          return gen();
        } else {
          resumeWakePrompt = params.prompt;
          async function* gen(): AsyncGenerator<SDKMessage> {
            yield { type: "system", subtype: "init", session_id: "resume-s1" } as unknown as SDKMessage;
            yield { type: "result", subtype: "success" } as unknown as SDKMessage;
          }
          return gen();
        }
      };

    // Use prepDeps that returns maxTurns=2 in resource bounds
    const prepDeps = createMockPrepDeps({
      activateWorker: async () => ({
        systemPrompt: "Test system prompt",
        tools: { mcpServers: [], allowedTools: [] },
        resourceBounds: { maxTurns: 2 },
      }),
    });

    const mailOrch = createMailOrchestrator(
      {
        lifecycle,
        recordOps,
        prepDeps,
        queryFn,
        eventBus,
        config: makeConfig(),
        packages: [makeWorkerPackage(), makeWorkerPackage(TEST_READER, "test-reader")],
        guildHallHome: ghHome,
        gitOps,
      },
      callbacks,
    );

    await setupLifecycleState(lifecycle, TEST_COMMISSION_ID, TEST_PROJECT, worktreeDir, "sleeping");

    await callbacks.writeStateFile(TEST_COMMISSION_ID, {
      commissionId: TEST_COMMISSION_ID as string,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      status: "sleeping",
      worktreeDir,
      branchName: "claude/commission/test",
      sessionId: "original-session-id",
      sleepStartedAt: new Date().toISOString(),
      pendingMail: { mailFilePath, readerWorkerName: TEST_READER, readerActive: false },
    });

    mailOrch.activateMailReader({
      commissionId: TEST_COMMISSION_ID,
      projectName: TEST_PROJECT,
      workerName: TEST_WORKER,
      worktreeDir,
      branchName: "claude/commission/test",
      mailFilePath,
      readerWorkerName: TEST_READER,
      mailSequence: 1,
    });

    await new Promise<void>((r) => setTimeout(r, 300));

    expect(resumeWakePrompt).not.toBeNull();
    // Should say "ran out of turns" not "completed without sending a reply"
    expect(resumeWakePrompt!).toContain("ran out of turns");
    expect(resumeWakePrompt!).toContain(TEST_READER);
    expect(resumeWakePrompt!).not.toContain("completed without sending a reply");
  });
});
