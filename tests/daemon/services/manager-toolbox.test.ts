import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { CommissionId } from "@/daemon/types";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { GitOps } from "@/daemon/lib/git";
import type { ManagerToolboxDeps } from "@/daemon/services/manager/toolbox";
import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import {
  makeCreateCommissionHandler,
  makeDispatchCommissionHandler,
  makeCancelCommissionHandler,
  makeCreatePrHandler,
  makeInitiateMeetingHandler,
  makeAddCommissionNoteHandler,
  createManagerToolbox,
} from "@/daemon/services/manager/toolbox";

let tmpDir: string;
let guildHallHome: string;

/** Derived integration path: guildHallHome/projects/test-project */
function derivedIntegrationPath(): string {
  return path.join(guildHallHome, "projects", "test-project");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-toolbox-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  const intPath = derivedIntegrationPath();
  await fs.mkdir(path.join(intPath, ".lore", "meetings"), {
    recursive: true,
  });
  await fs.mkdir(path.join(intPath, ".lore", "commissions"), {
    recursive: true,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Mock factories --

/* eslint-disable @typescript-eslint/require-await */

/**
 * Creates a mock CommissionSessionForRoutes that records calls and
 * returns predictable results. Override individual methods as needed.
 */
function makeMockCommissionSession(
  overrides?: Partial<CommissionSessionForRoutes>,
): CommissionSessionForRoutes & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    createCommission: [],
    dispatchCommission: [],
    updateCommission: [],
    cancelCommission: [],
    redispatchCommission: [],
    reportProgress: [],
    reportResult: [],
    reportQuestion: [],
    addUserNote: [],
  };

  return {
    calls,
    async createCommission(
      projectName: string,
      title: string,
      workerName: string,
      prompt: string,
      dependencies?: string[],
      resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number },
    ) {
      calls.createCommission.push([
        projectName, title, workerName, prompt, dependencies, resourceOverrides,
      ]);
      return { commissionId: "commission-test-worker-20260223-120000" };
    },
    async dispatchCommission(commissionId: CommissionId) {
      calls.dispatchCommission.push([commissionId]);
      return { status: "accepted" as const };
    },
    async updateCommission() {},
    async cancelCommission(cid: CommissionId, reason?: string) {
      calls.cancelCommission.push([cid, reason]);
    },
    async redispatchCommission() {
      return { status: "accepted" as const };
    },
    async addUserNote(cid: CommissionId, content: string) {
      calls.addUserNote.push([cid, content]);
    },
    async checkDependencyTransitions() {},
    async recoverCommissions() { return 0; },
    getActiveCommissions() { return 0; },
    shutdown() {},
    ...overrides,
  };
}

function makeMockGitOps(overrides?: Partial<GitOps>): GitOps {
  return {
    async createBranch() {},
    async branchExists() { return false; },
    async deleteBranch() {},
    async createWorktree() {},
    async removeWorktree() {},
    async configureSparseCheckout() {},
    async commitAll() { return false; },
    async squashMerge() {},
    async hasUncommittedChanges() { return false; },
    async rebase() {},
    async currentBranch() { return "claude/main"; },
    async listWorktrees() { return []; },
    async initClaudeBranch() {},
    async detectDefaultBranch() { return "main"; },
    async fetch() {},
    async push() {},
    async resetHard() {},
    async resetSoft() {},
    async createPullRequest() { return { url: "https://github.com/test/repo/pull/42" }; },
    async isAncestor() { return false; },
    async treesEqual() { return false; },
    async revParse() { return "abc123def456789012345678901234567890abcd"; },
    async rebaseOnto() {},
    async merge() {},
    async squashMergeNoCommit() { return true; },
    async listConflictedFiles() { return []; },
    async resolveConflictsTheirs() {},
    async mergeAbort() {},
    ...overrides,
  };
}

function makeMockEventBus(): EventBus & { emitted: SystemEvent[] } {
  const emitted: SystemEvent[] = [];
  return {
    emitted,
    emit(event: SystemEvent) {
      emitted.push(event);
    },
    subscribe() {
      return () => {};
    },
  };
}

/* eslint-enable @typescript-eslint/require-await */

function makeDeps(
  overrides?: Partial<ManagerToolboxDeps>,
): ManagerToolboxDeps {
  return {
    projectName: "test-project",
    guildHallHome,
    commissionSession: makeMockCommissionSession(),
    eventBus: makeMockEventBus(),
    gitOps: makeMockGitOps(),
    getProjectConfig(name: string) {
      if (name === "test-project") {
        return Promise.resolve({
          name: "test-project",
          path: path.join(tmpDir, "repo"),
          defaultBranch: "main",
        });
      }
      return Promise.resolve(undefined);
    },
    ...overrides,
  };
}

/**
 * Writes a minimal commission artifact so appendTimelineEntry can find it
 * after create_commission + dispatch.
 */
async function writeCommissionArtifact(
  basePath: string,
  commissionId: string,
): Promise<void> {
  const artifactDir = path.join(basePath, ".lore", "commissions");
  await fs.mkdir(artifactDir, { recursive: true });

  const content = `---
title: "Commission: Test task"
date: 2026-02-23
status: pending
tags: [commission]
worker: test-worker
workerDisplayTitle: "Test Worker"
prompt: "Do the work"
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-23T12:00:00.000Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: test-project
---
`;

  await fs.writeFile(
    path.join(artifactDir, `${commissionId}.md`),
    content,
    "utf-8",
  );
}

// -- Parsed JSON result helper --

/** Type-safe accessor for JSON.parse results from tool content. */
function parseResult(text: string): { commissionId?: string; dispatched?: boolean; artifactPath?: string } {
  return JSON.parse(text) as { commissionId?: string; dispatched?: boolean; artifactPath?: string };
}

// -- create_commission --

describe("create_commission", () => {
  test("creates and dispatches commission by default", async () => {
    const mockSession = makeMockCommissionSession();

    // Write the artifact so appendTimelineEntry can find it
    await writeCommissionArtifact(
      derivedIntegrationPath(),
      "commission-test-worker-20260223-120000",
    );

    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCreateCommissionHandler(deps);

    const result = await handler({
      title: "Research OAuth",
      workerName: "test-worker",
      prompt: "Research OAuth patterns",
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    expect(parsed.commissionId).toBe("commission-test-worker-20260223-120000");
    expect(parsed.dispatched).toBe(true);

    // Verify createCommission was called with correct args
    expect(mockSession.calls.createCommission).toHaveLength(1);
    expect(mockSession.calls.createCommission[0][0]).toBe("test-project");
    expect(mockSession.calls.createCommission[0][1]).toBe("Research OAuth");
    expect(mockSession.calls.createCommission[0][2]).toBe("test-worker");
    expect(mockSession.calls.createCommission[0][3]).toBe("Research OAuth patterns");

    // Verify dispatchCommission was called
    expect(mockSession.calls.dispatchCommission).toHaveLength(1);
  });

  test("creates without dispatching when dispatch=false", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCreateCommissionHandler(deps);

    const result = await handler({
      title: "Deferred task",
      workerName: "test-worker",
      prompt: "Do something later",
      dispatch: false,
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    expect(parsed.dispatched).toBe(false);

    // createCommission called but dispatchCommission not called
    expect(mockSession.calls.createCommission).toHaveLength(1);
    expect(mockSession.calls.dispatchCommission).toHaveLength(0);
  });

  test("passes through dependencies and resourceOverrides", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCreateCommissionHandler(deps);

    await handler({
      title: "Dependent task",
      workerName: "test-worker",
      prompt: "Work on it",
      dependencies: ["commission-a", "commission-b"],
      resourceOverrides: { maxTurns: 50, maxBudgetUsd: 2.0 },
      dispatch: false,
    });

    const call = mockSession.calls.createCommission[0];
    expect(call[4]).toEqual(["commission-a", "commission-b"]);
    expect(call[5]).toEqual({ maxTurns: 50, maxBudgetUsd: 2.0 });
  });

  test("returns error when createCommission throws", async () => {
    const mockSession = makeMockCommissionSession({
      createCommission() {
        return Promise.reject(new Error('Worker "nonexistent" not found'));
      },
    });
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCreateCommissionHandler(deps);

    const result = await handler({
      title: "Bad task",
      workerName: "nonexistent",
      prompt: "This will fail",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nonexistent");
  });

  test("returns commissionId and error when dispatchCommission throws", async () => {
    const mockSession = makeMockCommissionSession({
      dispatchCommission() {
        return Promise.reject(new Error("Cannot dispatch: status is blocked"));
      },
    });
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCreateCommissionHandler(deps);

    const result = await handler({
      title: "Blocked task",
      workerName: "test-worker",
      prompt: "This dispatch will fail",
    });

    expect(result.isError).toBe(true);

    const parsed = JSON.parse(result.content[0].text) as {
      commissionId?: string;
      dispatched?: boolean;
      error?: string;
    };
    expect(parsed.commissionId).toBe("commission-test-worker-20260223-120000");
    expect(parsed.dispatched).toBe(false);
    expect(parsed.error).toContain("Cannot dispatch");
  });
});

// -- dispatch_commission --

describe("dispatch_commission", () => {
  test("dispatches an existing commission", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeDispatchCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-researcher-20260223-140000",
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    expect(parsed.commissionId).toBe("commission-researcher-20260223-140000");
    expect(parsed.dispatched).toBe(true);

    expect(mockSession.calls.dispatchCommission).toHaveLength(1);
  });

  test("returns error when dispatch fails", async () => {
    const mockSession = makeMockCommissionSession({
      dispatchCommission() {
        return Promise.reject(new Error('Commission "xyz" not found in any project'));
      },
    });
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeDispatchCommissionHandler(deps);

    const result = await handler({ commissionId: "xyz" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

// -- cancel_commission --

describe("cancel_commission", () => {
  test("cancels an active commission and returns success", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCancelCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-researcher-20260223-140000",
    });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      commissionId?: string;
      status?: string;
    };
    expect(parsed.commissionId).toBe("commission-researcher-20260223-140000");
    expect(parsed.status).toBe("cancelled");

    expect(mockSession.calls.cancelCommission).toHaveLength(1);
  });

  test("passes custom reason to cancelCommission", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCancelCommissionHandler(deps);

    await handler({
      commissionId: "commission-researcher-20260223-140000",
      reason: "Blocking PR creation, stale work",
    });

    expect(mockSession.calls.cancelCommission).toHaveLength(1);
    expect(mockSession.calls.cancelCommission[0][1]).toBe(
      "Blocking PR creation, stale work",
    );
  });

  test("returns error when commission not found", async () => {
    const mockSession = makeMockCommissionSession({
      cancelCommission() {
        return Promise.reject(
          new Error('Commission "xyz" not found in active commissions'),
        );
      },
    });
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCancelCommissionHandler(deps);

    const result = await handler({ commissionId: "xyz" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("returns error on invalid transition", async () => {
    const mockSession = makeMockCommissionSession({
      cancelCommission() {
        return Promise.reject(
          new Error('Invalid commission transition: "completed" -> "cancelled"'),
        );
      },
    });
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCancelCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-done-20260223-140000",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid commission transition");
  });

  test("uses default reason when none provided", async () => {
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeCancelCommissionHandler(deps);

    await handler({
      commissionId: "commission-researcher-20260223-140000",
    });

    expect(mockSession.calls.cancelCommission).toHaveLength(1);
    expect(mockSession.calls.cancelCommission[0][1]).toBe(
      "Commission cancelled by manager",
    );
  });
});

// -- create_pr --

describe("create_pr", () => {
  test("blocks when active activities exist", async () => {
    // Write a commission state file that marks a commission as in_progress
    const stateDir = path.join(guildHallHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-active.json"),
      JSON.stringify({ projectName: "test-project", status: "in_progress" }),
    );

    const deps = makeDeps();
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "My PR" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Cannot create PR");
    expect(result.content[0].text).toContain("active commissions");
  });

  test("succeeds when no activities: fetches, pushes, then creates PR", async () => {
    const callOrder: string[] = [];
    const pushCalls: string[][] = [];
    const createPrCalls: string[][] = [];

    const mockGit = makeMockGitOps({
      fetch() {
        callOrder.push("fetch");
        return Promise.resolve();
      },
      push(_repoPath: string, branchName: string, remote?: string) {
        callOrder.push("push");
        pushCalls.push([branchName, remote ?? "origin"]);
        return Promise.resolve();
      },
      createPullRequest(
        _repoPath: string,
        baseBranch: string,
        headBranch: string,
        title: string,
        body: string,
      ) {
        callOrder.push("createPullRequest");
        createPrCalls.push([baseBranch, headBranch, title, body]);
        return Promise.resolve({ url: "https://github.com/test/repo/pull/99" });
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "Feature PR", body: "PR description" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as { url?: string };
    expect(parsed.url).toBe("https://github.com/test/repo/pull/99");

    // Verify fetch is called before push
    expect(callOrder).toEqual(["fetch", "push", "createPullRequest"]);

    // Verify push was called with claude/main
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0][0]).toBe("claude/main");

    // Verify createPullRequest was called with correct args
    expect(createPrCalls).toHaveLength(1);
    expect(createPrCalls[0][0]).toBe("main"); // base branch
    expect(createPrCalls[0][1]).toBe("claude/main"); // head branch
    expect(createPrCalls[0][2]).toBe("Feature PR");
    expect(createPrCalls[0][3]).toBe("PR description");
  });

  test("writes PR marker file on success", async () => {
    const deps = makeDeps();
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "Marker test PR" });

    expect(result.isError).toBeUndefined();

    // Read the marker file
    const markerPath = path.join(
      guildHallHome, "state", "pr-pending", "test-project.json",
    );
    const raw = await fs.readFile(markerPath, "utf-8");
    const marker = JSON.parse(raw) as {
      claudeMainTip?: string;
      createdAt?: string;
      prUrl?: string;
    };

    expect(marker.claudeMainTip).toBe("abc123def456789012345678901234567890abcd");
    expect(marker.prUrl).toBe("https://github.com/test/repo/pull/42");
    expect(marker.createdAt).toBeDefined();
    // createdAt should be an ISO timestamp
    expect(new Date(marker.createdAt!).toISOString()).toBe(marker.createdAt!);
  });

  test("returns error when push fails", async () => {
    const mockGit = makeMockGitOps({
      push() {
        return Promise.reject(new Error("git push failed (exit 128): remote rejected"));
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "Push fail PR" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("git push failed");
  });

  test("returns error when createPullRequest fails", async () => {
    const mockGit = makeMockGitOps({
      createPullRequest() {
        return Promise.reject(new Error("GitHub CLI (gh) is not installed or not in PATH."));
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "No GH CLI PR" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("GitHub CLI");
  });

  test("uses empty string for body when not provided", async () => {
    const createPrCalls: string[][] = [];
    const mockGit = makeMockGitOps({
      createPullRequest(
        _repoPath: string,
        _baseBranch: string,
        _headBranch: string,
        _title: string,
        body: string,
      ) {
        createPrCalls.push([body]);
        return Promise.resolve({ url: "https://github.com/test/repo/pull/1" });
      },
    });

    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeCreatePrHandler(deps);

    await handler({ title: "No body PR" });

    expect(createPrCalls).toHaveLength(1);
    expect(createPrCalls[0][0]).toBe("");
  });
});

// -- initiate_meeting --

describe("initiate_meeting", () => {
  test("creates meeting request artifact with correct frontmatter", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "research-specialist",
      reason: "Discuss API design",
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    expect(parsed.artifactPath).toMatch(/^meetings\//);
    expect(parsed.artifactPath).toContain("discuss-api-design");
    expect(parsed.artifactPath).toEndWith(".md");

    // Read the created file
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const raw = await fs.readFile(fullPath, "utf-8");

    expect(raw).toContain("status: requested");
    expect(raw).toContain("worker: research-specialist");
    expect(raw).toContain('agenda: "Discuss API design"');
    expect(raw).toContain("event: requested");
    expect(raw).toContain("Guild Master initiated meeting request");
    expect(raw).toContain("linked_artifacts: []");
  });

  test("includes referenced artifacts in frontmatter", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "research-specialist",
      reason: "Review findings",
      referencedArtifacts: ["specs/api.md", "notes/review.md"],
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const raw = await fs.readFile(fullPath, "utf-8");

    expect(raw).toContain("linked_artifacts:\n  - specs/api.md\n  - notes/review.md");
  });

  test("handles empty referencedArtifacts", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: "Quick sync",
      referencedArtifacts: [],
    });

    const parsed = parseResult(result.content[0].text);
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const raw = await fs.readFile(fullPath, "utf-8");

    expect(raw).toContain("linked_artifacts: []");
  });

  test("sanitizes reason for filename", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: 'Complex "reason" with special/chars & stuff!',
    });

    const parsed = parseResult(result.content[0].text);
    // Extract just the filename (after meetings/) to check sanitization
    const filename = String(parsed.artifactPath).replace("meetings/", "");
    expect(filename).not.toMatch(/["&!]/);
    expect(parsed.artifactPath).toMatch(/^meetings\/meeting-request-\d{8}-\d{6}-/);
  });

  test("escapes quotes in reason for YAML", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: 'Review "critical" issues',
    });

    const parsed = parseResult(result.content[0].text);
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const raw = await fs.readFile(fullPath, "utf-8");

    expect(raw).toContain('agenda: "Review \\"critical\\" issues"');
  });

  test("escapes backslashes and newlines in reason for YAML", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: 'Path C:\\Users\\test\nand more',
    });

    const parsed = parseResult(result.content[0].text);
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const raw = await fs.readFile(fullPath, "utf-8");

    // Backslashes should be double-escaped, newlines replaced with \n
    expect(raw).toContain('agenda: "Path C:\\\\Users\\\\test\\nand more"');
    expect(raw).toContain('title: "Meeting request: Path C:\\\\Users\\\\test\\nand more"');
  });

  test("sanitizeForFilename does not produce trailing hyphen on truncation", async () => {
    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    // 40 char limit: "a]b]c]d]..." pattern where truncation at 40 would leave a trailing hyphen
    // "this-is-a-long-reason-that-will-be-trunc" = 40 chars, but let's pick one that hits the boundary
    const result = await handler({
      workerName: "test-worker",
      reason: "this is a very long reason that will definitely be truncated by the sanitizer",
    });

    const parsed = parseResult(result.content[0].text);
    const filename = String(parsed.artifactPath).replace("meetings/", "");
    // Filename should not end with a hyphen before .md
    expect(filename).not.toMatch(/-\.md$/);
  });

  test("creates meetings directory if it does not exist", async () => {
    // Remove the meetings directory
    await fs.rm(path.join(derivedIntegrationPath(), ".lore", "meetings"), {
      recursive: true,
    });

    const deps = makeDeps();
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: "First meeting",
    });

    expect(result.isError).toBeUndefined();

    // Verify directory was created and file exists
    const parsed = parseResult(result.content[0].text);
    const fullPath = path.join(derivedIntegrationPath(), ".lore", parsed.artifactPath!);
    const stat = await fs.stat(fullPath);
    expect(stat.isFile()).toBe(true);
  });

  test("returns error on filesystem failure", async () => {
    const deps = makeDeps({
      // Use a guildHallHome under a non-writable path so the derived
      // integration path can't be created
      guildHallHome: "/nonexistent/readonly/path",
    });
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "test-worker",
      reason: "This will fail",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});

// -- add_commission_note --

describe("add_commission_note", () => {
  test("delegates to commissionSession.addUserNote with correct args", async () => {
    const commissionId = "commission-test-worker-20260223-120000";
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeAddCommissionNoteHandler(deps);

    const result = await handler({
      commissionId,
      content: "Worker seems stalled, consider re-dispatching",
    });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      commissionId?: string;
      noted?: boolean;
    };
    expect(parsed.commissionId).toBe(commissionId);
    expect(parsed.noted).toBe(true);

    // Verify addUserNote was called with the commission ID and content
    expect(mockSession.calls.addUserNote).toHaveLength(1);
    expect(mockSession.calls.addUserNote[0][0]).toBe(commissionId);
    expect(mockSession.calls.addUserNote[0][1]).toBe(
      "Worker seems stalled, consider re-dispatching",
    );
  });

  test("does not emit events directly (delegated to commissionSession)", async () => {
    const commissionId = "commission-test-worker-20260223-120000";
    const mockEventBus = makeMockEventBus();
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ eventBus: mockEventBus, commissionSession: mockSession });
    const handler = makeAddCommissionNoteHandler(deps);

    await handler({
      commissionId,
      content: "Status update: good progress",
    });

    // The handler delegates to commissionSession.addUserNote(), which
    // handles both timeline writes and EventBus emission internally.
    // The handler itself should not emit events directly.
    expect(mockEventBus.emitted).toHaveLength(0);
    expect(mockSession.calls.addUserNote).toHaveLength(1);
  });

  test("returns error when addUserNote throws", async () => {
    const mockSession = makeMockCommissionSession({
      addUserNote() {
        return Promise.reject(
          new Error('Commission "commission-nonexistent-20260223-999999" not found in any project'),
        );
      },
    });
    const mockEventBus = makeMockEventBus();
    const deps = makeDeps({ eventBus: mockEventBus, commissionSession: mockSession });
    const handler = makeAddCommissionNoteHandler(deps);

    const result = await handler({
      commissionId: "commission-nonexistent-20260223-999999",
      content: "This should fail",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");

    // No event should be emitted on failure
    expect(mockEventBus.emitted).toHaveLength(0);
  });

  test("passes commission ID as branded type to addUserNote", async () => {
    const commissionId = "commission-test-worker-20260223-120000";
    const mockSession = makeMockCommissionSession();
    const deps = makeDeps({ commissionSession: mockSession });
    const handler = makeAddCommissionNoteHandler(deps);

    await handler({
      commissionId,
      content: "Note for active commission",
    });

    // The handler converts the string to a CommissionId via asCommissionId
    // before passing to addUserNote
    expect(mockSession.calls.addUserNote).toHaveLength(1);
    expect(mockSession.calls.addUserNote[0][0]).toBe(commissionId);
    expect(mockSession.calls.addUserNote[0][1]).toBe("Note for active commission");
  });
});

// -- createManagerToolbox factory --

describe("createManagerToolbox", () => {
  test("returns MCP server config with correct name", () => {
    const deps = makeDeps();
    const server = createManagerToolbox(deps);

    expect(server.type).toBe("sdk");
    expect(server.name).toBe("guild-hall-manager");
    expect(server.instance).toBeDefined();
  });

  test("different deps produce different server instances", () => {
    const deps1 = makeDeps();
    const deps2 = makeDeps({ projectName: "other-project" });
    const server1 = createManagerToolbox(deps1);
    const server2 = createManagerToolbox(deps2);

    expect(server1.instance).toBeDefined();
    expect(server2.instance).toBeDefined();
    expect(server1.instance).not.toBe(server2.instance);
  });
});
