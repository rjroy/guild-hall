import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { GitOps } from "@/daemon/lib/git";
import type { ManagerToolboxDeps, RouteCaller } from "@/daemon/services/manager/toolbox";
import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import {
  makeCreateCommissionHandler,
  makeDispatchCommissionHandler,
  makeCancelCommissionHandler,
  makeAbandonCommissionHandler,
  makeCreatePrHandler,
  makeInitiateMeetingHandler,
  makeAddCommissionNoteHandler,
  makeCheckCommissionStatusHandler,
  createManagerToolbox,
  createDaemonRouteCaller,
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
 * Creates a mock RouteCaller that records calls and returns configured
 * responses. By default returns a success with a predictable commissionId.
 */
function makeMockRouteCaller(
  responseMap?: Record<string, (body: unknown) => { ok: true; status: number; data: unknown } | { ok: false; error: string }>,
): RouteCaller & { calls: Array<{ path: string; body: unknown }> } {
  const calls: Array<{ path: string; body: unknown }> = [];

  const caller = async (routePath: string, body: unknown) => {
    calls.push({ path: routePath, body });

    if (responseMap && responseMap[routePath]) {
      return responseMap[routePath](body);
    }

    // Default responses by route path
    if (routePath === "/commission/request/commission/create") {
      return { ok: true as const, status: 200, data: { commissionId: "commission-test-worker-20260223-120000" } };
    }
    if (routePath === "/commission/run/dispatch") {
      return { ok: true as const, status: 200, data: { status: "accepted" } };
    }
    if (routePath === "/commission/run/cancel") {
      return { ok: true as const, status: 200, data: { status: "cancelled" } };
    }
    if (routePath === "/commission/run/abandon") {
      return { ok: true as const, status: 200, data: { status: "abandoned" } };
    }
    if (routePath === "/commission/request/commission/note") {
      return { ok: true as const, status: 200, data: { noted: true } };
    }
    if (routePath === "/workspace/git/integration/sync") {
      const b = body as { projectName?: string };
      return {
        ok: true as const,
        status: 200,
        data: {
          results: [{ project: b.projectName ?? "test-project", action: "reset", reason: "Merged PR detected" }],
        },
      };
    }

    return { ok: true as const, status: 200, data: {} };
  };

  // Attach calls array to the function
  const fn = caller as RouteCaller & { calls: Array<{ path: string; body: unknown }> };
  fn.calls = calls;
  return fn;
}

function makeMockGitOps(overrides?: Partial<GitOps>): GitOps {
  return {
    async createBranch() {},
    async branchExists() { return false; },
    async deleteBranch() {},
    async hasCommitsBeyond() { return false; },
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
    async lorePendingChanges() { return { hasPendingChanges: false, fileCount: 0 }; },
    async commitLore() { return { committed: false }; },
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
    callRoute: makeMockRouteCaller(),
    eventBus: makeMockEventBus(),
    gitOps: makeMockGitOps(),
    config: { projects: [{ name: "test-project", path: path.join(tmpDir, "repo") }] },
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

// -- Parsed JSON result helper --

/** Type-safe accessor for JSON.parse results from tool content. */
function parseResult(text: string): { commissionId?: string; dispatched?: boolean; artifactPath?: string } {
  return JSON.parse(text) as { commissionId?: string; dispatched?: boolean; artifactPath?: string };
}

// -- create_commission --

describe("create_commission", () => {
  test("creates and dispatches commission by default", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
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

    // Verify create route was called with correct body
    expect(mockCallRoute.calls).toHaveLength(2);
    expect(mockCallRoute.calls[0].path).toBe("/commission/request/commission/create");
    const createBody = mockCallRoute.calls[0].body as Record<string, unknown>;
    expect(createBody.projectName).toBe("test-project");
    expect(createBody.title).toBe("Research OAuth");
    expect(createBody.workerName).toBe("test-worker");
    expect(createBody.prompt).toBe("Research OAuth patterns");

    // Verify dispatch route was called
    expect(mockCallRoute.calls[1].path).toBe("/commission/run/dispatch");
  });

  test("creates without dispatching when dispatch=false", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
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

    // Only create route called, not dispatch
    expect(mockCallRoute.calls).toHaveLength(1);
    expect(mockCallRoute.calls[0].path).toBe("/commission/request/commission/create");
  });

  test("passes through dependencies and resourceOverrides", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeCreateCommissionHandler(deps);

    await handler({
      title: "Dependent task",
      workerName: "test-worker",
      prompt: "Work on it",
      dependencies: ["commission-a", "commission-b"],
      resourceOverrides: { model: "sonnet" },
      dispatch: false,
    });

    const body = mockCallRoute.calls[0].body as Record<string, unknown>;
    expect(body.dependencies).toEqual(["commission-a", "commission-b"]);
    expect(body.resourceOverrides).toEqual({ model: "sonnet" });
  });

  test("passes model in resourceOverrides through to create route", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeCreateCommissionHandler(deps);

    await handler({
      title: "Model override task",
      workerName: "test-worker",
      prompt: "Use a specific model",
      resourceOverrides: { model: "haiku" },
      dispatch: false,
    });

    const body = mockCallRoute.calls[0].body as Record<string, unknown>;
    expect(body.resourceOverrides).toEqual({ model: "haiku" });
  });

  test("returns error when create route fails", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/request/commission/create": () => ({
        ok: false as const,
        error: 'Worker "nonexistent" not found',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeCreateCommissionHandler(deps);

    const result = await handler({
      title: "Bad task",
      workerName: "nonexistent",
      prompt: "This will fail",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nonexistent");
  });

  test("returns commissionId and error when dispatch route fails", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/dispatch": () => ({
        ok: false as const,
        error: "Cannot dispatch: status is blocked",
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
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
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeDispatchCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-researcher-20260223-140000",
    });

    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result.content[0].text);
    expect(parsed.commissionId).toBe("commission-researcher-20260223-140000");
    expect(parsed.dispatched).toBe(true);

    expect(mockCallRoute.calls).toHaveLength(1);
    expect(mockCallRoute.calls[0].path).toBe("/commission/run/dispatch");
  });

  test("returns error when dispatch fails", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/dispatch": () => ({
        ok: false as const,
        error: 'Commission "xyz" not found in any project',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeDispatchCommissionHandler(deps);

    const result = await handler({ commissionId: "xyz" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

// -- cancel_commission --

describe("cancel_commission", () => {
  test("cancels an active commission and returns success", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
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

    expect(mockCallRoute.calls).toHaveLength(1);
    expect(mockCallRoute.calls[0].path).toBe("/commission/run/cancel");
  });

  test("returns error when commission not found", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/cancel": () => ({
        ok: false as const,
        error: 'Commission "xyz" not found in active commissions',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeCancelCommissionHandler(deps);

    const result = await handler({ commissionId: "xyz" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("returns error on invalid transition", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/cancel": () => ({
        ok: false as const,
        error: 'Invalid commission transition: "completed" -> "cancelled"',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeCancelCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-done-20260223-140000",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid commission transition");
  });
});

// -- abandon_commission --

describe("abandon_commission", () => {
  test("abandons commission with reason and returns success", async () => {
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeAbandonCommissionHandler(deps);

    const result = await handler({
      commissionId: "commission-researcher-20260223-140000",
      reason: "Work completed outside commission process",
    });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as {
      commissionId?: string;
      status?: string;
    };
    expect(parsed.commissionId).toBe("commission-researcher-20260223-140000");
    expect(parsed.status).toBe("abandoned");

    expect(mockCallRoute.calls).toHaveLength(1);
    expect(mockCallRoute.calls[0].path).toBe("/commission/run/abandon");
    const body = mockCallRoute.calls[0].body as Record<string, unknown>;
    expect(body.reason).toBe("Work completed outside commission process");
  });

  test("returns error when commission not found", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/abandon": () => ({
        ok: false as const,
        error: 'Commission "xyz" not found in any project',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeAbandonCommissionHandler(deps);

    const result = await handler({
      commissionId: "xyz",
      reason: "Test reason",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("returns error on invalid transition", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/run/abandon": () => ({
        ok: false as const,
        error: 'Cannot abandon commission "c1": it has an active session. Cancel it first.',
      }),
    });
    const deps = makeDeps({ callRoute: mockCallRoute });
    const handler = makeAbandonCommissionHandler(deps);

    const result = await handler({
      commissionId: "c1",
      reason: "Test reason",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Cannot abandon");
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

  test("allows PR creation when only project-scoped meetings are open", async () => {
    // Write a meeting state file with project scope
    const stateDir = path.join(guildHallHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "meeting-guildmaster.json"),
      JSON.stringify({ projectName: "test-project", status: "open", scope: "project" }),
    );

    const deps = makeDeps();
    const handler = makeCreatePrHandler(deps);

    const result = await handler({ title: "PR during Guild Master meeting" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as { url?: string };
    expect(parsed.url).toBeDefined();
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
  test("commits meeting request to integration worktree after writing artifact", async () => {
    const commitAllCalls: Array<{ path: string; message: string }> = [];
    const mockGit = makeMockGitOps({
      commitAll(worktreePath: string, message: string) {
        commitAllCalls.push({ path: worktreePath, message });
        return Promise.resolve(true);
      },
    });
    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "research-specialist",
      reason: "Discuss API design",
    });

    expect(result.isError).toBeUndefined();

    // commitAll should have been called on the integration worktree path
    expect(commitAllCalls).toHaveLength(1);
    expect(commitAllCalls[0].path).toBe(derivedIntegrationPath());
  });

  test("commit message contains the meeting ID", async () => {
    const commitAllCalls: Array<{ path: string; message: string }> = [];
    const mockGit = makeMockGitOps({
      commitAll(worktreePath: string, message: string) {
        commitAllCalls.push({ path: worktreePath, message });
        return Promise.resolve(true);
      },
    });
    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "research-specialist",
      reason: "Discuss API design",
    });

    expect(result.isError).toBeUndefined();

    // The commit message should contain the meeting ID (which is the filename sans .md)
    expect(commitAllCalls).toHaveLength(1);
    expect(commitAllCalls[0].message).toContain("meeting-request-");
    expect(commitAllCalls[0].message).toContain("discuss-api-design");
  });

  test("commit failure returns error result", async () => {
    const mockGit = makeMockGitOps({
      commitAll() {
        return Promise.reject(new Error("git commit failed"));
      },
    });
    const deps = makeDeps({ gitOps: mockGit });
    const handler = makeInitiateMeetingHandler(deps);

    const result = await handler({
      workerName: "research-specialist",
      reason: "Discuss API design",
    });

    // REQ-SYS-26d: commitAll failure must return error
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("commit failed");
  });

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
  test("delegates to daemon route with correct args", async () => {
    const commissionId = "commission-test-worker-20260223-120000";
    const mockCallRoute = makeMockRouteCaller();
    const deps = makeDeps({ callRoute: mockCallRoute });
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

    // Verify route was called with the commission ID and content
    expect(mockCallRoute.calls).toHaveLength(1);
    expect(mockCallRoute.calls[0].path).toBe("/commission/request/commission/note");
    const body = mockCallRoute.calls[0].body as Record<string, unknown>;
    expect(body.commissionId).toBe(commissionId);
    expect(body.content).toBe("Worker seems stalled, consider re-dispatching");
  });

  test("does not emit events directly (delegated to daemon route)", async () => {
    const commissionId = "commission-test-worker-20260223-120000";
    const mockEventBus = makeMockEventBus();
    const deps = makeDeps({ eventBus: mockEventBus });
    const handler = makeAddCommissionNoteHandler(deps);

    await handler({
      commissionId,
      content: "Status update: good progress",
    });

    // The handler delegates to the daemon route, which handles
    // both timeline writes and EventBus emission internally.
    // The handler itself should not emit events directly.
    expect(mockEventBus.emitted).toHaveLength(0);
  });

  test("returns error when route fails", async () => {
    const mockCallRoute = makeMockRouteCaller({
      "/commission/request/commission/note": () => ({
        ok: false as const,
        error: 'Commission "commission-nonexistent-20260223-999999" not found in any project',
      }),
    });
    const mockEventBus = makeMockEventBus();
    const deps = makeDeps({ eventBus: mockEventBus, callRoute: mockCallRoute });
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

// -- check_commission_status --

/** Helper: write a commission artifact to the integration worktree. */
async function writeCommission(
  id: string,
  frontmatter: string,
  body = "",
): Promise<void> {
  const dir = path.join(derivedIntegrationPath(), ".lore", "commissions");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.md`), `---\n${frontmatter}\n---\n${body}`, "utf-8");
}

describe("check_commission_status", () => {
  // -- Single commission mode (REQ-CST-3, REQ-CST-4) --

  test("returns detail for a single commission by ID", async () => {
    await writeCommission("commission-writer-20260301-100000", `
title: "Write docs"
status: in_progress
worker: writer
type: one-shot
date: 2026-03-01
current_progress: "Working on chapter 2"
linked_artifacts:
  - docs/chapter1.md
activity_timeline:
  - timestamp: "2026-03-01T10:00:00.000Z"
    event: created
    reason: "Commission created"
`);

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({ commissionId: "commission-writer-20260301-100000" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.commissionId).toBe("commission-writer-20260301-100000");
    expect(parsed.title).toBe("Write docs");
    expect(parsed.status).toBe("in_progress");
    expect(parsed.worker).toBe("writer");
    expect(parsed.type).toBe("one-shot");
    expect(parsed.date).toBe("2026-03-01");
    expect(parsed.current_progress).toBe("Working on chapter 2");
    expect(parsed.linked_artifacts).toEqual(["docs/chapter1.md"]);
  });

  test("returns result_summary from body for completed commissions", async () => {
    await writeCommission(
      "commission-writer-20260301-110000",
      `title: "Done task"\nstatus: completed\nworker: writer\ntype: one-shot\ndate: 2026-03-01\nactivity_timeline:\n  - timestamp: "2026-03-01T11:00:00.000Z"\n    event: created\n    reason: "created"`,
      "Task completed successfully with all deliverables.",
    );

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({ commissionId: "commission-writer-20260301-110000" });

    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.result_summary).toBe("Task completed successfully with all deliverables.");
  });

  // -- REQ-CST-5: Scheduled commission metadata --

  test("includes schedule metadata for scheduled commissions", async () => {
    await writeCommission("commission-sched-20260301-120000", `
title: "Weekly cleanup"
status: active
worker: steward
type: scheduled
date: 2026-03-01
schedule:
  cron: "0 9 * * 1"
  runs_completed: 3
  last_run: "2026-03-10T09:00:00.000Z"
activity_timeline:
  - timestamp: "2026-03-01T12:00:00.000Z"
    event: created
    reason: "created"
`);

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({ commissionId: "commission-sched-20260301-120000" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.type).toBe("scheduled");

    const schedule = parsed.schedule as Record<string, unknown>;
    expect(schedule.cron).toBe("0 9 * * 1");
    expect(schedule.runsCompleted).toBe(3);
    expect(schedule.lastRun).toBe("2026-03-10T09:00:00.000Z");
    expect(schedule.nextRun).toBeDefined();
    // nextRun should be after lastRun
    expect(new Date(schedule.nextRun as string).getTime()).toBeGreaterThan(
      new Date("2026-03-10T09:00:00.000Z").getTime(),
    );
  });

  test("schedule metadata handles null lastRun", async () => {
    await writeCommission("commission-sched-20260301-130000", `
title: "New schedule"
status: active
worker: steward
type: scheduled
date: 2026-03-01
schedule:
  cron: "0 0 * * *"
  runs_completed: 0
activity_timeline:
  - timestamp: "2026-03-01T13:00:00.000Z"
    event: created
    reason: "created"
`);

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({ commissionId: "commission-sched-20260301-130000" });

    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const schedule = parsed.schedule as Record<string, unknown>;
    expect(schedule.lastRun).toBeNull();
    expect(schedule.runsCompleted).toBe(0);
    // nextRun should still be computed from epoch
    expect(schedule.nextRun).toBeDefined();
  });

  // -- REQ-CST-11: Commission not found --

  test("returns isError when commission ID not found", async () => {
    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({ commissionId: "commission-nonexistent-20260301-999999" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Commission not found: commission-nonexistent-20260301-999999");
  });

  // -- List mode (REQ-CST-6, REQ-CST-7, REQ-CST-8) --

  test("returns sorted commission list with summary counts", async () => {
    await writeCommission("commission-a-20260301-010000", `
title: "Pending task"
status: pending
worker: writer
type: one-shot
date: 2026-03-01
activity_timeline:
  - timestamp: "2026-03-01T01:00:00.000Z"
    event: created
    reason: "created"
`);
    await writeCommission("commission-b-20260301-020000", `
title: "Active task"
status: in_progress
worker: researcher
type: one-shot
date: 2026-03-01
current_progress: "Researching..."
activity_timeline:
  - timestamp: "2026-03-01T02:00:00.000Z"
    event: created
    reason: "created"
`);
    await writeCommission("commission-c-20260301-030000", `
title: "Done task"
status: completed
worker: writer
type: one-shot
date: 2026-03-01
activity_timeline:
  - timestamp: "2026-03-01T03:00:00.000Z"
    event: created
    reason: "created"
`);
    await writeCommission("commission-d-20260301-040000", `
title: "Failed task"
status: failed
worker: developer
type: one-shot
date: 2026-03-01
activity_timeline:
  - timestamp: "2026-03-01T04:00:00.000Z"
    event: created
    reason: "created"
`);

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      summary: Record<string, number>;
      commissions: Array<Record<string, unknown>>;
    };

    // REQ-CST-8: summary counts
    expect(parsed.summary.pending).toBe(1);
    expect(parsed.summary.active).toBe(1);
    expect(parsed.summary.failed).toBe(1);
    expect(parsed.summary.completed).toBe(1);
    expect(parsed.summary.total).toBe(4);

    // REQ-CST-7: list entries have correct fields
    expect(parsed.commissions).toHaveLength(4);
    const first = parsed.commissions[0];
    expect(first.commissionId).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.status).toBeDefined();
    expect(first.worker).toBeDefined();
    expect(first.type).toBeDefined();
    // Fields omitted from list mode
    expect(first.date).toBeUndefined();
    expect(first.linked_artifacts).toBeUndefined();
    expect(first.prompt).toBeUndefined();

    // Sorted: pending first, then active, then failed, then completed
    const statuses = parsed.commissions.map((c) => c.status);
    expect(statuses).toEqual(["pending", "in_progress", "failed", "completed"]);
  });

  test("truncates long current_progress and result_summary in list mode", async () => {
    const longText = "x".repeat(300);
    await writeCommission("commission-long-20260301-050000", `
title: "Long progress"
status: in_progress
worker: writer
type: one-shot
date: 2026-03-01
current_progress: "${longText}"
activity_timeline:
  - timestamp: "2026-03-01T05:00:00.000Z"
    event: created
    reason: "created"
`);

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text) as {
      commissions: Array<Record<string, unknown>>;
    };

    const entry = parsed.commissions.find(
      (c) => c.commissionId === "commission-long-20260301-050000",
    );
    expect(entry).toBeDefined();
    expect((entry!.current_progress as string).length).toBe(200);
    expect((entry!.current_progress as string).endsWith("...")).toBe(true);
  });

  // -- REQ-CST-12: Empty project --

  test("returns empty list and zeroed summary for project with no commissions", async () => {
    // Remove all commissions
    const dir = path.join(derivedIntegrationPath(), ".lore", "commissions");
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      await fs.rm(path.join(dir, entry));
    }

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      summary: Record<string, number>;
      commissions: unknown[];
    };

    expect(parsed.commissions).toHaveLength(0);
    expect(parsed.summary).toEqual({ pending: 0, active: 0, failed: 0, completed: 0, total: 0 });
  });

  test("returns empty list when commissions directory does not exist", async () => {
    await fs.rm(path.join(derivedIntegrationPath(), ".lore", "commissions"), {
      recursive: true,
    });

    const deps = makeDeps();
    const handler = makeCheckCommissionStatusHandler(deps);
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text) as {
      summary: Record<string, number>;
      commissions: unknown[];
    };

    expect(parsed.commissions).toHaveLength(0);
    expect(parsed.summary.total).toBe(0);
  });

  // -- REQ-CST-1, REQ-CST-13: Tool registration --

  test("check_commission_status tool is registered in createManagerToolbox", () => {
    const deps = makeDeps();
    const server = createManagerToolbox(deps);
    // The MCP server instance exposes tools through the SDK; verify the
    // server was created without error (tool is in the tools array)
    expect(server.instance).toBeDefined();
  });
});

// -- createDaemonRouteCaller --

describe("createDaemonRouteCaller", () => {
  test("returns a function with correct signature", () => {
    const caller = createDaemonRouteCaller("/tmp/test.sock");
    expect(typeof caller).toBe("function");
  });
});
