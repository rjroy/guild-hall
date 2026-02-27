/**
 * Tests for Phase 7 concurrency hardening:
 *
 * 1. Meeting cap enforcement via withProjectLock (TOCTOU fix)
 *    - Two concurrent createMeeting calls: only one succeeds at cap
 *    - Two concurrent acceptMeetingRequest calls: only one succeeds at cap
 *
 * 2. Squash-merge conflict handling in commission completion
 *    - Clean merge: proceeds as before
 *    - .lore/-only conflicts: auto-resolved by accepting incoming changes
 *    - Non-.lore/ conflicts: commission marked failed with "merge conflict"
 *    - Mixed conflicts (.lore/ + non-.lore/): commission fails
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createMeetingSession,
  type MeetingSessionDeps,
  type QueryOptions,
} from "@/daemon/services/meeting-session";
import type { GuildHallEvent } from "@/daemon/types";
import { asMeetingId } from "@/daemon/types";
import type {
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import type { ToolboxResolverContext } from "@/daemon/services/toolbox-resolver";
import type { GitOps } from "@/daemon/lib/git";
import {
  integrationWorktreePath,
} from "@/lib/paths";
import { clearProjectLocks } from "@/daemon/lib/project-lock";
import {
  createCommissionSession,
  type CommissionSessionDeps,
} from "@/daemon/services/commission-session";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import { createEventBus, type EventBus, type SystemEvent } from "@/daemon/services/event-bus";
import {
  commissionArtifactPath,
} from "@/daemon/services/commission-artifact-helpers";
import {
  meetingArtifactPath,
} from "@/daemon/services/meeting-artifact-helpers";

// ============================================================
// Shared test fixtures
// ============================================================

const WORKER_META: WorkerMetadata = {
  type: "worker",
  identity: {
    name: "Assistant",
    description: "A test assistant.",
    displayTitle: "Guild Assistant",
  },
  posture: "You are a helpful assistant.",
  domainToolboxes: [],
  builtInTools: ["Read", "Glob"],
  checkoutScope: "sparse",
  resourceDefaults: { maxTurns: 30 },
};

const WORKER_PKG: DiscoveredPackage = {
  name: "guild-hall-sample-assistant",
  path: "/packages/sample-assistant",
  metadata: WORKER_META,
};

function makeInitMessage(sessionId = "sdk-session-123"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.50",
    cwd: "/tmp",
    tools: ["Read", "Glob"],
    mcp_servers: [],
    model: "claude-sonnet-4-6",
    permissionMode: "default",
    slash_commands: [],
    output_style: "text",
    skills: [],
    plugins: [],
  } as unknown as SDKMessage;
}

function makeTextDelta(text: string): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
  } as unknown as SDKMessage;
}

function makeActivationResult(): ActivationResult {
  return {
    systemPrompt: "You are a helpful assistant.",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Glob"],
    },
    resourceBounds: { maxTurns: 30 },
  };
}

async function collectEvents(
  gen: AsyncGenerator<GuildHallEvent>,
): Promise<GuildHallEvent[]> {
  const events: GuildHallEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Recursively copies a directory tree. */
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ============================================================
// Part 1: Meeting cap enforcement via withProjectLock
// ============================================================

describe("meeting cap enforcement via withProjectLock", () => {
  let tmpRoot: string;
  let projectDir: string;
  let ghHomeDir: string;
  let integrationDir: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "concurrency-meeting-"));
    projectDir = path.join(tmpRoot, "project");
    ghHomeDir = path.join(tmpRoot, "guild-hall-home");
    integrationDir = integrationWorktreePath(ghHomeDir, "test-project");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(ghHomeDir, { recursive: true });
    await fs.mkdir(integrationDir, { recursive: true });
  });

  afterEach(async () => {
    clearProjectLocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  function createMockGitOps(options?: {
    copyFromDir?: string;
  }): GitOps & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      createBranch: () => { calls.push("createBranch"); return Promise.resolve(); },
      branchExists: () => { calls.push("branchExists"); return Promise.resolve(false); },
      deleteBranch: () => { calls.push("deleteBranch"); return Promise.resolve(); },
      createWorktree: async (_repoPath, worktreePath) => {
        calls.push("createWorktree");
        await fs.mkdir(worktreePath, { recursive: true });
        if (options?.copyFromDir) {
          await copyDir(options.copyFromDir, worktreePath);
        }
      },
      removeWorktree: () => { calls.push("removeWorktree"); return Promise.resolve(); },
      configureSparseCheckout: () => { calls.push("configureSparseCheckout"); return Promise.resolve(); },
      commitAll: () => { calls.push("commitAll"); return Promise.resolve(false); },
      squashMerge: () => { calls.push("squashMerge"); return Promise.resolve(); },
      hasUncommittedChanges: () => { calls.push("hasUncommittedChanges"); return Promise.resolve(false); },
      rebase: () => { calls.push("rebase"); return Promise.resolve(); },
      currentBranch: () => { calls.push("currentBranch"); return Promise.resolve("main"); },
      listWorktrees: () => { calls.push("listWorktrees"); return Promise.resolve([]); },
      initClaudeBranch: () => { calls.push("initClaudeBranch"); return Promise.resolve(); },
      detectDefaultBranch: () => { calls.push("detectDefaultBranch"); return Promise.resolve("main"); },
      fetch: () => { calls.push("fetch"); return Promise.resolve(); },
      push: () => { calls.push("push"); return Promise.resolve(); },
      resetHard: () => { calls.push("resetHard"); return Promise.resolve(); },
      resetSoft: () => { calls.push("resetSoft"); return Promise.resolve(); },
      createPullRequest: () => { calls.push("createPullRequest"); return Promise.resolve({ url: "" }); },
      isAncestor: () => { calls.push("isAncestor"); return Promise.resolve(false); },
      treesEqual: () => { calls.push("treesEqual"); return Promise.resolve(false); },
      revParse: () => { calls.push("revParse"); return Promise.resolve("abc"); },
      rebaseOnto: () => { calls.push("rebaseOnto"); return Promise.resolve(); },
      merge: async () => {},
      squashMergeNoCommit: () => { calls.push("squashMergeNoCommit"); return Promise.resolve(true); },
      listConflictedFiles: () => { calls.push("listConflictedFiles"); return Promise.resolve([]); },
      resolveConflictsTheirs: () => { calls.push("resolveConflictsTheirs"); return Promise.resolve(); },
      mergeAbort: () => { calls.push("mergeAbort"); return Promise.resolve(); },
    };
  }

  /**
   * Creates a mock queryFn that introduces a delay before yielding,
   * allowing concurrent operations to interleave. The delay parameter
   * controls how long to wait (in ms) before yielding the first message.
   */
  function makeMockQueryFn(delay = 0) {
    async function* queryFn(_: {
      prompt: string;
      options: QueryOptions;
    }): AsyncGenerator<SDKMessage> {
      if (delay > 0) {
        await new Promise<void>((r) => setTimeout(r, delay));
      }
      yield makeInitMessage();
      yield makeTextDelta("Hello");
    }
    return { queryFn };
  }

  function makeMockActivateFn() {
    return {
      activateFn: () => Promise.resolve(makeActivationResult()),
    };
  }

  function makeDeps(overrides: Partial<MeetingSessionDeps> = {}): MeetingSessionDeps {
    const config: AppConfig = {
      projects: [{
        name: "test-project",
        path: projectDir,
        meetingCap: 1, // Cap of 1 to easily test concurrent access
      }],
    };
    const mock = makeMockQueryFn();
    const activateMock = makeMockActivateFn();

    return {
      packages: [WORKER_PKG],
      config,
      guildHallHome: ghHomeDir,
      queryFn: mock.queryFn,
      activateFn: activateMock.activateFn,
      gitOps: createMockGitOps(),
      ...overrides,
    };
  }

  test("two concurrent createMeeting calls: only one succeeds at cap=1", async () => {
    const session = createMeetingSession(makeDeps());

    // Fire both creates concurrently
    const gen1 = session.createMeeting("test-project", "guild-hall-sample-assistant", "First meeting");
    const gen2 = session.createMeeting("test-project", "guild-hall-sample-assistant", "Second meeting");

    const [events1, events2] = await Promise.all([
      collectEvents(gen1),
      collectEvents(gen2),
    ]);

    // One should succeed (has session and text events), the other should
    // get a cap error. The lock serializes them, so the first to acquire
    // the lock registers in the map, and the second sees cap reached.
    const errors1 = events1.filter((e) => e.type === "error");
    const errors2 = events2.filter((e) => e.type === "error");

    const firstCapError = errors1.some((e) =>
      "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );
    const secondCapError = errors2.some((e) =>
      "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );

    // Exactly one should hit the cap error
    expect(firstCapError !== secondCapError).toBe(true);

    // The successful one should have non-error events
    const successEvents = firstCapError ? events2 : events1;
    const hasSession = successEvents.some((e) => e.type === "session");
    expect(hasSession).toBe(true);
  });

  test("two concurrent acceptMeetingRequest calls: only one succeeds at cap=1", async () => {
    // Write two meeting request artifacts on the integration worktree
    const meetingId1 = asMeetingId("audience-Assistant-20260223-100000");
    const meetingId2 = asMeetingId("audience-Assistant-20260223-100001");

    for (const mid of [meetingId1, meetingId2]) {
      const artifactFilePath = meetingArtifactPath(integrationDir, mid);
      await fs.mkdir(path.dirname(artifactFilePath), { recursive: true });
      await fs.writeFile(artifactFilePath, `---
title: "Audience with Guild Assistant"
date: 2026-02-23
status: requested
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test meeting"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-02-23T10:00:00.000Z
    event: requested
    reason: "Meeting requested"
notes_summary: ""
---
`, "utf-8");
    }

    const mockGit = createMockGitOps({ copyFromDir: integrationDir });
    const session = createMeetingSession(makeDeps({ gitOps: mockGit }));

    // Fire both accepts concurrently
    const gen1 = session.acceptMeetingRequest(meetingId1, "test-project");
    const gen2 = session.acceptMeetingRequest(meetingId2, "test-project");

    const [events1, events2] = await Promise.all([
      collectEvents(gen1),
      collectEvents(gen2),
    ]);

    const errors1 = events1.filter((e) => e.type === "error");
    const errors2 = events2.filter((e) => e.type === "error");

    const firstCapError = errors1.some((e) =>
      "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );
    const secondCapError = errors2.some((e) =>
      "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );

    // Exactly one should hit the cap error
    expect(firstCapError !== secondCapError).toBe(true);

    // The successful one should have non-error events
    const successEvents = firstCapError ? events2 : events1;
    const hasSession = successEvents.some((e) => e.type === "session");
    expect(hasSession).toBe(true);
  });

  test("createMeeting and acceptMeetingRequest serialize with each other at cap=1", async () => {
    // Write one meeting request artifact on the integration worktree
    const meetingId = asMeetingId("audience-Assistant-20260223-110000");
    const artifactFilePath = meetingArtifactPath(integrationDir, meetingId);
    await fs.mkdir(path.dirname(artifactFilePath), { recursive: true });
    await fs.writeFile(artifactFilePath, `---
title: "Audience with Guild Assistant"
date: 2026-02-23
status: requested
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Requested meeting"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-02-23T11:00:00.000Z
    event: requested
    reason: "Meeting requested"
notes_summary: ""
---
`, "utf-8");

    const mockGit = createMockGitOps({ copyFromDir: integrationDir });
    const session = createMeetingSession(makeDeps({ gitOps: mockGit }));

    // Fire create and accept concurrently
    const genCreate = session.createMeeting("test-project", "guild-hall-sample-assistant", "New meeting");
    const genAccept = session.acceptMeetingRequest(meetingId, "test-project");

    const [eventsCreate, eventsAccept] = await Promise.all([
      collectEvents(genCreate),
      collectEvents(genAccept),
    ]);

    const createCapError = eventsCreate.some((e) =>
      e.type === "error" && "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );
    const acceptCapError = eventsAccept.some((e) =>
      e.type === "error" && "reason" in e && typeof e.reason === "string" && e.reason.includes("Meeting cap reached"),
    );

    // Exactly one should hit the cap error
    expect(createCapError !== acceptCapError).toBe(true);
  });
});

// ============================================================
// Part 2: Squash-merge conflict handling
// ============================================================

describe("squash-merge conflict handling", () => {
  let tmpDir: string;
  let projectPath: string;
  let ghHome: string;
  let integrationPath: string;
  let commissionId: CommissionId;
  let eventBus: EventBus;
  let capturedEvents: SystemEvent[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "concurrency-commission-"));
    projectPath = path.join(tmpDir, "test-project");
    ghHome = path.join(tmpDir, "guild-hall-home");
    integrationPath = integrationWorktreePath(ghHome, "test-project");
    commissionId = asCommissionId("commission-researcher-20260223-150000");

    await fs.mkdir(
      path.join(projectPath, ".lore", "commissions"),
      { recursive: true },
    );
    await fs.mkdir(
      path.join(integrationPath, ".lore", "commissions"),
      { recursive: true },
    );

    eventBus = createEventBus();
    capturedEvents = [];
    eventBus.subscribe((event) => capturedEvents.push(event));
  });

  afterEach(async () => {
    clearProjectLocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeCommissionArtifact(status: CommissionStatus): Promise<void> {
    const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-23
status: ${status}
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-23T15:00:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;
    const artifactPath = commissionArtifactPath(integrationPath, commissionId);
    await fs.writeFile(artifactPath, content, "utf-8");
  }

  const RESEARCHER_META: WorkerMetadata = {
    type: "worker",
    identity: {
      name: "researcher",
      description: "A research specialist.",
      displayTitle: "Research Specialist",
    },
    posture: "You are a research specialist.",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "sparse",
    resourceDefaults: { maxTurns: 150 },
  };

  const RESEARCHER_PKG: DiscoveredPackage = {
    name: "guild-hall-researcher",
    path: "/packages/researcher",
    metadata: RESEARCHER_META,
  };

  /**
   * Creates a mock GitOps with configurable squash-merge behavior.
   *
   * squashMergeResult: true = clean merge, false = conflicts
   * conflictedFiles: files returned by listConflictedFiles when conflicts exist
   */
  function createMockGitOps(options?: {
    squashMergeResult?: boolean;
    conflictedFiles?: string[];
  }): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const squashResult = options?.squashMergeResult ?? true;
    const conflicts = options?.conflictedFiles ?? [];

    /* eslint-disable @typescript-eslint/require-await */
    return {
      calls,
      async createBranch(...args) { calls.push({ method: "createBranch", args }); },
      async branchExists(...args) { calls.push({ method: "branchExists", args }); return false; },
      async deleteBranch(...args) { calls.push({ method: "deleteBranch", args }); },
      async createWorktree(_repoPath, worktreePath) {
        calls.push({ method: "createWorktree", args: [_repoPath, worktreePath] });
        await fs.mkdir(worktreePath, { recursive: true });
        // Copy the integration worktree content (including the commission artifact)
        const commissionsDir = path.join(integrationPath, ".lore", "commissions");
        const destDir = path.join(worktreePath, ".lore", "commissions");
        await fs.mkdir(destDir, { recursive: true });
        try {
          const files = await fs.readdir(commissionsDir);
          for (const file of files) {
            await fs.copyFile(
              path.join(commissionsDir, file),
              path.join(destDir, file),
            );
          }
        } catch {
          // commissionsDir may not exist yet
        }
      },
      async removeWorktree(...args) { calls.push({ method: "removeWorktree", args }); },
      async configureSparseCheckout(...args) { calls.push({ method: "configureSparseCheckout", args }); },
      async commitAll(...args) { calls.push({ method: "commitAll", args }); return false; },
      async squashMerge(...args) { calls.push({ method: "squashMerge", args }); },
      async hasUncommittedChanges() { return false; },
      async rebase(...args) { calls.push({ method: "rebase", args }); },
      async currentBranch() { return "main"; },
      async listWorktrees() { return []; },
      async initClaudeBranch() {},
      async detectDefaultBranch() { return "main"; },
      async fetch() {},
      async push() {},
      async resetHard(...args) { calls.push({ method: "resetHard", args }); },
      async resetSoft(...args) { calls.push({ method: "resetSoft", args }); },
      async createPullRequest() { return { url: "" }; },
      async isAncestor() { return false; },
      async treesEqual() { return false; },
      async revParse() { return "abc"; },
      async rebaseOnto(...args) { calls.push({ method: "rebaseOnto", args }); },
      async merge() {},
      async squashMergeNoCommit(...args) {
        calls.push({ method: "squashMergeNoCommit", args });
        return squashResult;
      },
      async listConflictedFiles(...args) {
        calls.push({ method: "listConflictedFiles", args });
        return conflicts;
      },
      async resolveConflictsTheirs(...args) {
        calls.push({ method: "resolveConflictsTheirs", args });
      },
      async mergeAbort(...args) {
        calls.push({ method: "mergeAbort", args });
      },
    };
    /* eslint-enable @typescript-eslint/require-await */
  }

  /**
   * Creates a mock session for in-process commission execution.
   */
  function createMockCommissionSession() {
    let resolveSession!: () => void;
    let _rejectSession!: (err: Error) => void;
    let resultSubmitted = false;
    let capturedOnResult: ((summary: string, artifacts?: string[]) => void) | undefined;

    const sessionPromise = new Promise<void>((resolve, reject) => {
      resolveSession = resolve;
      _rejectSession = reject;
    });

    return {
      queryFn: (params: { prompt: string; options: Record<string, unknown> }) => {
        const ac = params.options.abortController as AbortController | undefined;
        return (async function* (): AsyncGenerator<SDKMessage> {
          yield { type: "system", subtype: "init", session_id: "test-session" } as unknown as SDKMessage;
          await Promise.race([
            sessionPromise,
            ...(ac ? [new Promise<void>((_, reject) => {
              if (ac.signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
              ac.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            })] : []),
          ]);
        })();
      },
      /* eslint-disable @typescript-eslint/require-await */
      activateFn: async (_pkg: DiscoveredPackage, _ctx: unknown) => ({
        systemPrompt: "Test", tools: { mcpServers: [] as never[], allowedTools: [] as string[] }, resourceBounds: {},
      }),
      /* eslint-enable @typescript-eslint/require-await */
      resolveToolSetFn: (_w: WorkerMetadata, _p: DiscoveredPackage[], ctx: ToolboxResolverContext): ResolvedToolSet => {
        capturedOnResult = ctx.onResult;
        return { mcpServers: [], allowedTools: [], wasResultSubmitted: () => resultSubmitted };
      },
      submitResult: (summary: string, artifacts?: string[]) => { resultSubmitted = true; capturedOnResult?.(summary, artifacts); },
      resolve: () => resolveSession(),
    };
  }

  function createTestDeps(overrides: Partial<CommissionSessionDeps> = {}): CommissionSessionDeps {
    return {
      packages: [RESEARCHER_PKG],
      config: {
        projects: [{
          name: "test-project",
          path: projectPath,
        }],
      },
      guildHallHome: ghHome,
      eventBus,
      packagesDir: "/packages",
      fileExists: () => Promise.resolve(true),
      ...overrides,
    };
  }

  test("clean squash-merge: calls squashMergeNoCommit and commitAll, then cleans up", async () => {
    await writeCommissionArtifact("pending");

    const mockGitOps = createMockGitOps({ squashMergeResult: true });
    const mock = createMockCommissionSession();
    const session = createCommissionSession(
      createTestDeps({
        queryFn: mock.queryFn,
        activateFn: mock.activateFn,
        resolveToolSetFn: mock.resolveToolSetFn,
        gitOps: mockGitOps,
      }),
    );

    await session.dispatchCommission(commissionId);
    const dispatchCallCount = mockGitOps.calls.length;

    mock.submitResult("Research complete");
    mock.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
    const exitMethods = exitCalls.map((c) => c.method);

    // Should use squashMergeNoCommit (not squashMerge)
    expect(exitMethods).toContain("squashMergeNoCommit");
    expect(exitMethods).not.toContain("squashMerge");

    // Should clean up (remove worktree and delete branch)
    expect(exitMethods).toContain("removeWorktree");
    expect(exitMethods).toContain("deleteBranch");

    // Should NOT have called mergeAbort or resolveConflictsTheirs
    expect(exitMethods).not.toContain("mergeAbort");
    expect(exitMethods).not.toContain("resolveConflictsTheirs");

    // Final status should be completed
    const statusEvents = capturedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "completed",
    );
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);

    session.shutdown();
  });

  test(".lore/-only conflicts: auto-resolved by accepting incoming changes", async () => {
    await writeCommissionArtifact("pending");

    const loreConflicts = [
      ".lore/commissions/commission-researcher-20260223-150000.md",
      ".lore/specs/some-spec.md",
    ];
    const mockGitOps = createMockGitOps({
      squashMergeResult: false,
      conflictedFiles: loreConflicts,
    });
    const mock = createMockCommissionSession();
    const session = createCommissionSession(
      createTestDeps({
        queryFn: mock.queryFn,
        activateFn: mock.activateFn,
        resolveToolSetFn: mock.resolveToolSetFn,
        gitOps: mockGitOps,
      }),
    );

    await session.dispatchCommission(commissionId);
    const dispatchCallCount = mockGitOps.calls.length;

    mock.submitResult("Research complete");
    mock.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
    const exitMethods = exitCalls.map((c) => c.method);

    // Should have detected conflicts
    expect(exitMethods).toContain("squashMergeNoCommit");
    expect(exitMethods).toContain("listConflictedFiles");

    // Should have resolved them with --theirs
    expect(exitMethods).toContain("resolveConflictsTheirs");
    const resolveCall = exitCalls.find((c) => c.method === "resolveConflictsTheirs");
    expect(resolveCall).toBeDefined();
    // The files argument should be the .lore/ conflicted files
    expect(resolveCall!.args[1]).toEqual(loreConflicts);

    // Should NOT have aborted
    expect(exitMethods).not.toContain("mergeAbort");

    // Should have cleaned up (merge succeeded after resolution)
    expect(exitMethods).toContain("removeWorktree");
    expect(exitMethods).toContain("deleteBranch");

    // Final status should be completed (not failed)
    const failedEvents = capturedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents).toHaveLength(0);

    session.shutdown();
  });

  test("non-.lore/ conflicts: commission marked failed with merge conflict reason", async () => {
    await writeCommissionArtifact("pending");

    const nonLoreConflicts = ["src/main.ts", "README.md"];
    const mockGitOps = createMockGitOps({
      squashMergeResult: false,
      conflictedFiles: nonLoreConflicts,
    });
    const mock = createMockCommissionSession();
    const session = createCommissionSession(
      createTestDeps({
        queryFn: mock.queryFn,
        activateFn: mock.activateFn,
        resolveToolSetFn: mock.resolveToolSetFn,
        gitOps: mockGitOps,
      }),
    );

    await session.dispatchCommission(commissionId);
    const dispatchCallCount = mockGitOps.calls.length;

    mock.submitResult("Research complete");
    mock.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
    const exitMethods = exitCalls.map((c) => c.method);

    // Should have detected conflicts and aborted
    expect(exitMethods).toContain("squashMergeNoCommit");
    expect(exitMethods).toContain("listConflictedFiles");
    expect(exitMethods).toContain("mergeAbort");

    // Should NOT have resolved conflicts
    expect(exitMethods).not.toContain("resolveConflictsTheirs");

    // Branch should NOT be deleted (preserved for manual resolution)
    expect(exitMethods).not.toContain("deleteBranch");

    // Should emit a failed status event with merge conflict reason
    const failedEvents = capturedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
    const failReason = (failedEvents[failedEvents.length - 1] as { reason?: string }).reason ?? "";
    expect(failReason).toContain("non-.lore/");

    session.shutdown();
  });

  test("mixed conflicts (.lore/ + non-.lore/): commission fails (non-.lore/ takes precedence)", async () => {
    await writeCommissionArtifact("pending");

    const mixedConflicts = [
      ".lore/commissions/commission-researcher-20260223-150000.md",
      "src/utils.ts",
    ];
    const mockGitOps = createMockGitOps({
      squashMergeResult: false,
      conflictedFiles: mixedConflicts,
    });
    const mock = createMockCommissionSession();
    const session = createCommissionSession(
      createTestDeps({
        queryFn: mock.queryFn,
        activateFn: mock.activateFn,
        resolveToolSetFn: mock.resolveToolSetFn,
        gitOps: mockGitOps,
      }),
    );

    await session.dispatchCommission(commissionId);
    const dispatchCallCount = mockGitOps.calls.length;

    mock.submitResult("Research complete");
    mock.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
    const exitMethods = exitCalls.map((c) => c.method);

    // Should abort (non-.lore/ conflicts present)
    expect(exitMethods).toContain("mergeAbort");
    expect(exitMethods).not.toContain("resolveConflictsTheirs");

    // Branch preserved
    expect(exitMethods).not.toContain("deleteBranch");

    // Failed event emitted
    const failedEvents = capturedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);

    session.shutdown();
  });

  test("squashMergeNoCommit returns false but no conflicted files: treated as failure", async () => {
    await writeCommissionArtifact("pending");

    // squashMergeNoCommit returns false (conflict) but listConflictedFiles returns []
    const mockGitOps = createMockGitOps({
      squashMergeResult: false,
      conflictedFiles: [],
    });
    const mock = createMockCommissionSession();
    const session = createCommissionSession(
      createTestDeps({
        queryFn: mock.queryFn,
        activateFn: mock.activateFn,
        resolveToolSetFn: mock.resolveToolSetFn,
        gitOps: mockGitOps,
      }),
    );

    await session.dispatchCommission(commissionId);
    const dispatchCallCount = mockGitOps.calls.length;

    mock.submitResult("Research complete");
    mock.resolve();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
    const exitMethods = exitCalls.map((c) => c.method);

    // Should abort the merge
    expect(exitMethods).toContain("mergeAbort");

    // Branch preserved (no deleteBranch)
    expect(exitMethods).not.toContain("deleteBranch");

    // Failed event
    const failedEvents = capturedEvents.filter(
      (e) => e.type === "commission_status" && "status" in e && e.status === "failed",
    );
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);

    session.shutdown();
  });
});
