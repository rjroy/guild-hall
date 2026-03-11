/**
 * Tests for meeting recovery (recoverMeetings) in the orchestrator.
 *
 * Validates that recovery scans state files, registers valid open meetings
 * in the registry, closes meetings with stale worktrees, and skips meetings
 * for projects no longer in config.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createMeetingSession,
  type MeetingSessionDeps,
} from "@/daemon/services/meeting/orchestrator";
import { asMeetingId } from "@/daemon/types";
import type {
  ActivationContext,
  ActivationResult,
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { WorkspaceOps } from "@/daemon/services/workspace";

// -- Test fixtures --

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
  name: "test-assistant",
  path: "/packages/sample-assistant",
  metadata: WORKER_META,
};

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: "",
      },
    ],
    ...overrides,
  };
}

function makeActivationResult(): ActivationResult {
  return {
    systemPrompt: "You are a helpful assistant.",
    tools: {
      mcpServers: [],
      allowedTools: ["Read", "Glob"],
      builtInTools: [],
    },
    resourceBounds: { maxTurns: 30 },
  };
}

// -- Mock SDK messages --

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
    parent_tool_use_id: null,
    uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-123",
  } as unknown as SDKMessage;
}

function makeResultSuccess(cost = 0.01): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    total_cost_usd: cost,
    duration_ms: 5000,
    duration_api_ms: 4500,
    is_error: false,
    num_turns: 1,
    result: "Done.",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
    session_id: "sdk-session-123",
  } as unknown as SDKMessage;
}

// -- Mock factories --

function makeMockQueryFn() {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

  async function* mockQuery(params: {
    prompt: string;
    options: Record<string, unknown>;
  }): AsyncGenerator<SDKMessage> {
    await Promise.resolve();
    calls.push(params);
    yield makeInitMessage();
    yield makeTextDelta("Hello");
    yield makeResultSuccess();
  }

  return { queryFn: mockQuery, calls };
}

function makeMockActivateFn() {
  const calls: Array<{ pkg: DiscoveredPackage; context: ActivationContext }> = [];

  function mockActivate(
    pkg: DiscoveredPackage,
    context: ActivationContext,
  ): Promise<ActivationResult> {
    calls.push({ pkg, context });
    return Promise.resolve(makeActivationResult());
  }

  return { activateFn: mockActivate, calls };
}

function createMockGitOps(): GitOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createBranch: () => { calls.push("createBranch"); return Promise.resolve(); },
    branchExists: () => { calls.push("branchExists"); return Promise.resolve(false); },
    deleteBranch: () => { calls.push("deleteBranch"); return Promise.resolve(); },
    createWorktree: async (_repoPath, worktreePath) => {
      calls.push("createWorktree");
      await fs.mkdir(worktreePath, { recursive: true });
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
    hasCommitsBeyond: () => { calls.push("hasCommitsBeyond"); return Promise.resolve(false); },
  };
}

/**
 * Creates a mock WorkspaceOps that tracks calls. prepare() should never
 * be called during recovery (worktrees already exist).
 */
/* eslint-disable @typescript-eslint/require-await */
function createMockWorkspace(): WorkspaceOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    prepare: async () => {
      calls.push("prepare");
      return { worktreeDir: "/should-not-be-called" };
    },
    finalize: async () => {
      calls.push("finalize");
      return { merged: true as const };
    },
    preserveAndCleanup: async () => {
      calls.push("preserveAndCleanup");
    },
    removeWorktree: async () => {
      calls.push("removeWorktree");
    },
  };
}
/* eslint-enable @typescript-eslint/require-await */

// -- Test state --

let tmpRoot: string;
let projectDir: string;
let ghHomeDir: string;
let integrationDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recovery-test-"));
  projectDir = path.join(tmpRoot, "project");
  ghHomeDir = path.join(tmpRoot, "guild-hall-home");
  integrationDir = integrationWorktreePath(ghHomeDir, "test-project");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(ghHomeDir, { recursive: true });
  await fs.mkdir(integrationDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<MeetingSessionDeps> = {}): MeetingSessionDeps {
  const config = makeConfig();
  config.projects[0].path = projectDir;

  const mock = makeMockQueryFn();
  const activateMock = makeMockActivateFn();
  const mockGit = createMockGitOps();

  return {
    packages: [WORKER_PKG],
    config,
    guildHallHome: ghHomeDir,
    queryFn: mock.queryFn,
    activateFn: activateMock.activateFn,
    gitOps: mockGit,
    ...overrides,
  };
}

async function writeStateFile(
  meetingId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const stateDir = path.join(ghHomeDir, "state", "meetings");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(
    path.join(stateDir, `${meetingId}.json`),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

// -- Tests --

describe("recoverMeetings", () => {
  test("registry contains recovered entries from valid state files", async () => {
    const meetingId = "audience-Assistant-20260301-090000";
    const worktreeDir = path.join(tmpRoot, "wt-valid");
    await fs.mkdir(worktreeDir, { recursive: true });

    await writeStateFile(meetingId, {
      meetingId,
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-old",
      worktreeDir,
      branchName: "claude/meeting/" + meetingId,
      status: "open",
    });

    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    expect(recovered).toBe(1);
    expect(session.getActiveMeetings()).toBe(1);

    const openMeetings = session.getOpenMeetingsForProject("test-project");
    expect(openMeetings).toHaveLength(1);
    expect(openMeetings[0].meetingId).toBe(asMeetingId(meetingId));
    expect(openMeetings[0].projectName).toBe("test-project");
    expect(openMeetings[0].workerName).toBe("Assistant");
    expect(openMeetings[0].worktreeDir).toBe(worktreeDir);
  });

  test("stale worktree: artifact status is closed, log has stale message, state file deleted, not in registry", async () => {
    const meetingId = "audience-Assistant-20260301-090001";
    const nonExistentDir = path.join(tmpRoot, "gone-worktree");

    await writeStateFile(meetingId, {
      meetingId,
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-stale",
      worktreeDir: nonExistentDir,
      branchName: "claude/meeting/" + meetingId,
      status: "open",
    });

    // Write the meeting artifact to the integration worktree so recovery
    // can update its status and log.
    const meetingsDir = path.join(integrationDir, ".lore", "meetings");
    await fs.mkdir(meetingsDir, { recursive: true });
    const now = new Date();
    await fs.writeFile(
      path.join(meetingsDir, `${meetingId}.md`),
      `---
title: "Audience with Guild Assistant"
date: ${now.toISOString().split("T")[0]}
status: open
tags: [meeting]
worker: Assistant
workerDisplayTitle: "Guild Assistant"
agenda: "Test stale recovery"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: ${now.toISOString()}
    event: opened
    reason: "User started audience"
---
`,
      "utf-8",
    );

    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    // Not in registry
    expect(recovered).toBe(0);
    expect(session.getActiveMeetings()).toBe(0);

    // Artifact status is "closed"
    const artifactContent = await fs.readFile(
      path.join(meetingsDir, `${meetingId}.md`),
      "utf-8",
    );
    expect(artifactContent).toContain("status: closed");

    // Meeting log has "Stale worktree detected on recovery"
    expect(artifactContent).toContain("Stale worktree detected on recovery");

    // State file is deleted
    const stateDir = path.join(ghHomeDir, "state", "meetings");
    const stateFileExists = await fs.access(
      path.join(stateDir, `${meetingId}.json`),
    ).then(() => true).catch(() => false);
    expect(stateFileExists).toBe(false);
  });

  test("project removed from config: state file is skipped, no error", async () => {
    const meetingId = "audience-Assistant-20260301-090002";

    await writeStateFile(meetingId, {
      meetingId,
      projectName: "deleted-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-orphan",
      worktreeDir: "/tmp/orphan-worktree",
      branchName: "claude/meeting/" + meetingId,
      status: "open",
    });

    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    expect(recovered).toBe(0);
    expect(session.getActiveMeetings()).toBe(0);
  });

  test("recovery does not call workspace.prepare()", async () => {
    const meetingId = "audience-Assistant-20260301-090003";
    const worktreeDir = path.join(tmpRoot, "wt-no-prepare");
    await fs.mkdir(worktreeDir, { recursive: true });

    await writeStateFile(meetingId, {
      meetingId,
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-existing",
      worktreeDir,
      branchName: "claude/meeting/" + meetingId,
      status: "open",
    });

    const mockWorkspace = createMockWorkspace();
    const session = createMeetingSession(
      makeDeps({ workspace: mockWorkspace }),
    );
    await session.recoverMeetings();

    expect(session.getActiveMeetings()).toBe(1);
    expect(mockWorkspace.calls).not.toContain("prepare");
  });

  test("recovered entries have sdkSessionId set to null", async () => {
    const meetingId = "audience-Assistant-20260301-090004";
    const worktreeDir = path.join(tmpRoot, "wt-null-session");
    await fs.mkdir(worktreeDir, { recursive: true });

    await writeStateFile(meetingId, {
      meetingId,
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-should-be-null",
      worktreeDir,
      branchName: "claude/meeting/" + meetingId,
      status: "open",
    });

    const session = createMeetingSession(makeDeps());
    await session.recoverMeetings();

    const openMeetings = session.getOpenMeetingsForProject("test-project");
    expect(openMeetings).toHaveLength(1);
    expect(openMeetings[0].sdkSessionId).toBeNull();
  });

  test("multiple valid state files are all registered", async () => {
    const wt1 = path.join(tmpRoot, "wt-multi-a");
    const wt2 = path.join(tmpRoot, "wt-multi-b");
    await fs.mkdir(wt1, { recursive: true });
    await fs.mkdir(wt2, { recursive: true });

    await writeStateFile("audience-Assistant-20260301-100001", {
      meetingId: "audience-Assistant-20260301-100001",
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-a",
      worktreeDir: wt1,
      branchName: "claude/meeting/audience-Assistant-20260301-100001",
      status: "open",
    });

    await writeStateFile("audience-Assistant-20260301-100002", {
      meetingId: "audience-Assistant-20260301-100002",
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-b",
      worktreeDir: wt2,
      branchName: "claude/meeting/audience-Assistant-20260301-100002",
      status: "open",
    });

    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    expect(recovered).toBe(2);
    expect(session.getActiveMeetings()).toBe(2);
  });

  test("closed state files are skipped", async () => {
    await writeStateFile("audience-Assistant-20260301-100003", {
      meetingId: "audience-Assistant-20260301-100003",
      projectName: "test-project",
      workerName: "Assistant",
      packageName: "test-assistant",
      sdkSessionId: "sdk-closed",
      worktreeDir: "/tmp/closed-wt",
      branchName: "claude/meeting/audience-Assistant-20260301-100003",
      status: "closed",
    });

    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    expect(recovered).toBe(0);
    expect(session.getActiveMeetings()).toBe(0);
  });

  test("returns 0 when state directory does not exist", async () => {
    const session = createMeetingSession(makeDeps());
    const recovered = await session.recoverMeetings();

    expect(recovered).toBe(0);
  });
});
