import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import {
  createCommissionSession,
} from "@/daemon/services/commission-session";
import type {
  CommissionSessionDeps,
  CommissionSessionForRoutes,
} from "@/daemon/services/commission-session";
import {
  commissionArtifactPath,
  readCommissionStatus,
  readActivityTimeline,
} from "@/daemon/services/commission-artifact-helpers";
import { createEventBus } from "@/daemon/services/event-bus";
import type { EventBus, SystemEvent } from "@/daemon/services/event-bus";
import type {
  AppConfig,
  DiscoveredPackage,
  ResolvedToolSet,
  WorkerMetadata,
} from "@/lib/types";
import type { GitOps } from "@/daemon/lib/git";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  integrationWorktreePath,
  commissionWorktreePath,
  commissionBranchName,
} from "@/lib/paths";

let tmpDir: string;
let projectPath: string;
let ghHome: string;
let integrationPath: string;
let commissionId: CommissionId;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-commission-session-"));
  projectPath = path.join(tmpDir, "test-project");
  ghHome = path.join(tmpDir, "guild-hall-home");
  integrationPath = integrationWorktreePath(ghHome, "test-project");
  commissionId = asCommissionId("commission-researcher-20260221-143000");

  // Create both the project directory and the integration worktree directory
  await fs.mkdir(
    path.join(projectPath, ".lore", "commissions"),
    { recursive: true },
  );
  await fs.mkdir(
    path.join(integrationPath, ".lore", "commissions"),
    { recursive: true },
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Writes a test commission artifact with a given initial status.
 * Artifacts are written to the integration worktree (where they live
 * before dispatch and after completion).
 */
async function writeCommissionArtifact(status: CommissionStatus): Promise<void> {
  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
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
  - timestamp: 2026-02-21T14:30:00.000Z
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

/**
 * Writes a test commission artifact with a custom timeline.
 * Used to simulate post-dispatch/failure states where the integration
 * worktree has accumulated timeline entries from syncStatusToIntegration.
 */
async function writeCommissionArtifactWithTimeline(
  status: CommissionStatus,
  timeline: Array<{ event: string; reason: string }>,
): Promise<void> {
  const timelineYaml = timeline
    .map(
      (entry) =>
        `  - timestamp: 2026-02-21T14:30:00.000Z\n    event: ${entry.event}\n    reason: "${entry.reason}"`,
    )
    .join("\n");

  const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
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
${timelineYaml}
current_progress: ""
result_summary: ""
projectName: test-project
---
`;

  const artifactPath = commissionArtifactPath(integrationPath, commissionId);
  await fs.writeFile(artifactPath, content, "utf-8");
}

// -- createCommissionSession --

// Test helpers for session management

/** Mock worker package that matches the expected DiscoveredPackage shape */
function createMockWorkerPackage(name = "guild-hall-sample-assistant"): DiscoveredPackage {
  return {
    name,
    path: "/tmp/fake-packages/sample-assistant",
    metadata: {
      type: "worker" as const,
      identity: {
        name: "researcher",
        description: "Research specialist",
        displayTitle: "Research Specialist",
      },
      posture: "You are a research specialist.",
      domainToolboxes: [],
      builtInTools: [],
      checkoutScope: "sparse" as const,
      resourceDefaults: {
        maxTurns: 150,
        maxBudgetUsd: 1.0,
      },
    },
  };
}

/**
 * Creates a mock GitOps that records all calls without running real git.
 * createWorktree simulates directory creation and copies commission artifacts
 * from the integration worktree so that subsequent file reads succeed.
 */
function createMockGitOps(): GitOps & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  async function copyCommissionsDir(worktreePath: string): Promise<void> {
    // The integration path is the source for commission artifacts.
    // Copy .lore/commissions/ so dispatch can read the artifact.
    const srcDir = path.join(integrationPath, ".lore", "commissions");
    const destDir = path.join(worktreePath, ".lore", "commissions");
    try {
      await fs.access(srcDir);
      await fs.mkdir(destDir, { recursive: true });
      const files = await fs.readdir(srcDir);
      for (const file of files) {
        await fs.copyFile(path.join(srcDir, file), path.join(destDir, file));
      }
    } catch {
      // Source may not exist in some tests, just create the directory
      await fs.mkdir(destDir, { recursive: true });
    }
  }

  /* eslint-disable @typescript-eslint/require-await */
  return {
    calls,
    async createBranch(...args) { calls.push({ method: "createBranch", args }); },
    async branchExists(...args) { calls.push({ method: "branchExists", args }); return false; },
    async deleteBranch(...args) { calls.push({ method: "deleteBranch", args }); },
    async createWorktree(...args) {
      calls.push({ method: "createWorktree", args });
      const worktreePath = args[1];
      await fs.mkdir(worktreePath, { recursive: true });
      await copyCommissionsDir(worktreePath);
    },
    async removeWorktree(...args) { calls.push({ method: "removeWorktree", args }); },
    async configureSparseCheckout(...args) { calls.push({ method: "configureSparseCheckout", args }); },
    async commitAll(...args) { calls.push({ method: "commitAll", args }); return false; },
    async squashMerge(...args) { calls.push({ method: "squashMerge", args }); },
    async hasUncommittedChanges(...args) { calls.push({ method: "hasUncommittedChanges", args }); return false; },
    async rebase(...args) { calls.push({ method: "rebase", args }); },
    async currentBranch(...args) { calls.push({ method: "currentBranch", args }); return "claude/main"; },
    async listWorktrees(...args) { calls.push({ method: "listWorktrees", args }); return []; },
    async initClaudeBranch(...args) { calls.push({ method: "initClaudeBranch", args }); },
    async detectDefaultBranch(...args) { calls.push({ method: "detectDefaultBranch", args }); return "main"; },
    async fetch(...args) { calls.push({ method: "fetch", args }); },
    async push(...args) { calls.push({ method: "push", args }); },
    async resetHard(...args) { calls.push({ method: "resetHard", args }); },
    async resetSoft(...args) { calls.push({ method: "resetSoft", args }); },
    async createPullRequest(...args) { calls.push({ method: "createPullRequest", args }); return { url: "" }; },
    async isAncestor(...args) { calls.push({ method: "isAncestor", args }); return false; },
    async treesEqual(...args) { calls.push({ method: "treesEqual", args }); return false; },
    async revParse(...args) { calls.push({ method: "revParse", args }); return "abc"; },
    async rebaseOnto(...args) { calls.push({ method: "rebaseOnto", args }); },
    async merge() {},
    async squashMergeNoCommit(...args) { calls.push({ method: "squashMergeNoCommit", args }); return true; },
    async listConflictedFiles(...args) { calls.push({ method: "listConflictedFiles", args }); return []; },
    async resolveConflictsTheirs(...args) { calls.push({ method: "resolveConflictsTheirs", args }); },
    async mergeAbort(...args) { calls.push({ method: "mergeAbort", args }); },
  };
  /* eslint-enable @typescript-eslint/require-await */
}

/**
 * Creates a mock in-process session that replaces the old createMockSpawn.
 *
 * Provides DI seams (queryFn, activateFn, resolveToolSetFn) that simulate
 * an SDK session running inside the daemon. The test controls when the
 * session completes via resolve/reject. Tool invocations are simulated by
 * emitting events directly to the EventBus (matching how the real commission
 * toolbox works after the callback removal).
 */
function createMockSession() {
  let resolveSession!: () => void;
  let rejectSession!: (err: Error) => void;

  const sessionPromise = new Promise<void>((resolve, reject) => {
    resolveSession = resolve;
    rejectSession = reject;
  });
  // Suppress unhandled rejection warnings. The rejection still propagates
  // through the await in the async generator; this just prevents bun from
  // treating it as an unhandled rejection when the follow-up session sees
  // the already-rejected promise.
  sessionPromise.catch(() => {});

  return {
    queryFn: (_params: { prompt: string; options: Record<string, unknown> }) => {
      const ac = _params.options.abortController as AbortController | undefined;
      return (async function* (): AsyncGenerator<SDKMessage> {
        yield { type: "system", subtype: "init", session_id: "test-session" } as unknown as SDKMessage;
        // Wait for test to resolve, or abort signal to fire
        await Promise.race([
          sessionPromise,
          ...(ac ? [new Promise<void>((_, reject) => {
            if (ac.signal.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            ac.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          })] : []),
        ]);
      })();
    },
    /* eslint-disable @typescript-eslint/require-await */
    activateFn: async (_pkg: DiscoveredPackage, _ctx: unknown) => ({
      systemPrompt: "Test worker activated",
      tools: { mcpServers: [] as never[], allowedTools: [] as string[] },
      resourceBounds: {},
    }),
    /* eslint-enable @typescript-eslint/require-await */
    // eslint-disable-next-line @typescript-eslint/require-await
    resolveToolSetFn: async (): Promise<ResolvedToolSet> => ({
      mcpServers: [],
      allowedTools: [],
    }),
    /** Simulate worker calling submit_result tool (emits to EventBus) */
    submitResult: (bus: EventBus, cid: string, summary: string, artifacts?: string[]) => {
      bus.emit({ type: "commission_result", commissionId: cid, summary, artifacts });
    },
    /** Simulate worker calling report_progress tool (emits to EventBus) */
    reportProgress: (bus: EventBus, cid: string, summary: string) => {
      bus.emit({ type: "commission_progress", commissionId: cid, summary });
    },
    /** Simulate worker calling log_question tool (emits to EventBus) */
    logQuestion: (bus: EventBus, cid: string, question: string) => {
      bus.emit({ type: "commission_question", commissionId: cid, question });
    },
    /** Complete the SDK session (generator finishes normally) */
    resolve: () => resolveSession(),
    /** Fail the SDK session with an error */
    reject: (err: Error) => rejectSession(err),
  };
}

function createTestConfig(): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: projectPath,
      },
    ],
  };
}

function createTestDeps(
  overrides: Partial<CommissionSessionDeps> = {},
): CommissionSessionDeps {
  return {
    packages: [createMockWorkerPackage()],
    config: createTestConfig(),
    guildHallHome: ghHome,
    eventBus: createEventBus(),
    packagesDir: "/tmp/fake-packages",
    gitOps: createMockGitOps(),
    ...overrides,
  };
}

describe("createCommissionSession", () => {
  let session: CommissionSessionForRoutes;
  let eventBus: EventBus;
  let emittedEvents: SystemEvent[];

  beforeEach(() => {
    eventBus = createEventBus();
    emittedEvents = [];
    eventBus.subscribe((event) => emittedEvents.push(event));
  });

  afterEach(() => {
    if (session) {
      session.shutdown();
    }
  });

  // -- createCommission --

  describe("createCommission", () => {
    test("writes artifact with correct frontmatter and returns ID", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Research OAuth patterns",
        "guild-hall-sample-assistant",
        "Research OAuth 2.0 patterns for CLI tools",
        ["dep1.md", "dep2.md"],
        { maxTurns: 200, maxBudgetUsd: 2.5 },
      );

      expect(result.commissionId).toMatch(/^commission-researcher-\d{8}-\d{6}$/);

      // Read the artifact from integration worktree and verify its contents
      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain('title: "Commission: Research OAuth patterns"');
      expect(raw).toContain("status: pending");
      expect(raw).toContain("tags: [commission]");
      expect(raw).toContain("worker: researcher");
      expect(raw).toContain('workerDisplayTitle: "Research Specialist"');
      expect(raw).toContain('prompt: "Research OAuth 2.0 patterns for CLI tools"');
      expect(raw).toContain("  - dep1.md");
      expect(raw).toContain("  - dep2.md");
      expect(raw).toContain("  maxTurns: 200");
      expect(raw).toContain("  maxBudgetUsd: 2.5");
      expect(raw).toContain("event: created");
      expect(raw).toContain('reason: "Commission created"');
      expect(raw).toContain('current_progress: ""');
      expect(raw).toContain('result_summary: ""');
      expect(raw).toContain("projectName: test-project");
    });

    test("rejects unknown project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.createCommission(
          "nonexistent-project",
          "Title",
          "guild-hall-sample-assistant",
          "prompt",
        ),
      ).rejects.toThrow('Project "nonexistent-project" not found');
    });

    test("rejects unknown worker", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.createCommission(
          "test-project",
          "Title",
          "nonexistent-worker",
          "prompt",
        ),
      ).rejects.toThrow(
        'Worker "nonexistent-worker" not found in discovered packages',
      );
    });

    test("creates commissions directory if it does not exist", async () => {
      // Remove the commissions directory from integration worktree
      await fs.rm(path.join(integrationPath, ".lore", "commissions"), {
        recursive: true,
        force: true,
      });

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
      );

      expect(result.commissionId).toBeTruthy();
    });

    test("sanitizes spaces in worker name for commission ID", async () => {
      const spacedWorker = createMockWorkerPackage("guild-hall-manager");
      (spacedWorker.metadata as WorkerMetadata).identity.name = "Guild Master";
      (spacedWorker.metadata as WorkerMetadata).identity.displayTitle = "The Guild Master";

      session = createCommissionSession(
        createTestDeps({ eventBus, packages: [spacedWorker] }),
      );

      const result = await session.createCommission(
        "test-project",
        "Coordinate tasks",
        "guild-hall-manager",
        "prompt",
      );

      // ID should have hyphens instead of spaces
      expect(result.commissionId).toMatch(/^commission-Guild-Master-\d{8}-\d{6}$/);
      // Verify the file was written with the sanitized ID
      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");
      expect(raw).toContain("worker: Guild Master");
    });

    test("omits resource overrides when none provided", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
      );

      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).not.toContain("resource_overrides:");
    });

    test("writes empty dependencies as YAML empty array", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Title",
        "guild-hall-sample-assistant",
        "prompt",
        [],
      );

      const id = asCommissionId(result.commissionId);
      const artifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(artifactPath, "utf-8");

      expect(raw).toContain("dependencies: []");
    });
  });

  // -- updateCommission --

  describe("updateCommission", () => {
    test("updates prompt on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        prompt: "Updated prompt text",
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");
      const { data } = matter(raw);

      expect(data.prompt).toBe("Updated prompt text");
    });

    test("updates dependencies on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        dependencies: ["new-dep1.md", "new-dep2.md"],
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");
      const { data } = matter(raw);
      const dependencies = data.dependencies as string[];

      expect(dependencies).toEqual(["new-dep1.md", "new-dep2.md"]);
    });

    test("updates resource overrides on pending commission", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        resourceOverrides: { maxTurns: 300, maxBudgetUsd: 5.0 },
      });

      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      const raw = await fs.readFile(artifactPath, "utf-8");
      const { data } = matter(raw);
      const resourceOverrides = data.resource_overrides as {
        maxTurns?: number;
        maxBudgetUsd?: number;
      };

      expect(resourceOverrides.maxTurns).toBe(300);
      expect(resourceOverrides.maxBudgetUsd).toBe(5);
    });

    test("adds resource overrides block when missing", async () => {
      const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: pending
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;
      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      await fs.writeFile(artifactPath, content, "utf-8");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.updateCommission(commissionId, {
        resourceOverrides: { maxBudgetUsd: 0 },
      });

      const raw = await fs.readFile(artifactPath, "utf-8");
      const { data } = matter(raw);
      const resourceOverrides = data.resource_overrides as {
        maxTurns?: number;
        maxBudgetUsd?: number;
      };
      expect(resourceOverrides.maxBudgetUsd).toBe(0);
    });

    test("rejects non-pending commission", async () => {
      await writeCommissionArtifact("in_progress");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.updateCommission(commissionId, {
          prompt: "Should fail",
        }),
      ).rejects.toThrow('status is "in_progress", must be "pending"');
    });

    test("rejects commission not found in any project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const fakeId = asCommissionId("commission-fake-20260101-000000");
      await expect(
        session.updateCommission(fakeId, { prompt: "fail" }),
      ).rejects.toThrow("not found in any project");
    });
  });

  // -- dispatchCommission --

  describe("dispatchCommission", () => {
    test("transitions pending -> dispatched -> in_progress and records in Map", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      const result = await session.dispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // The artifact in the activity worktree should now be in_progress
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const status = await readCommissionStatus(activityDir, commissionId);
      expect(status).toBe("in_progress");

      // Timeline should have: created, dispatched, in_progress
      const timeline = await readActivityTimeline(activityDir, commissionId);
      expect(timeline).toHaveLength(3);
      expect(timeline[1].event).toBe("status_dispatched");
      expect(timeline[2].event).toBe("status_in_progress");

      // Event bus should have received commission_status event
      const statusEvents = emittedEvents.filter(
        (e) => e.type === "commission_status",
      );
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0]).toMatchObject({
        type: "commission_status",
        commissionId: commissionId as string,
        status: "in_progress",
      });

      // Clean up (finish the mock session)
      mock.resolve();
    });

    test("rejects non-pending commissions", async () => {
      await writeCommissionArtifact("in_progress");

      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

        }),
      );

      await expect(
        session.dispatchCommission(commissionId),
      ).rejects.toThrow('status is "in_progress", must be "pending"');
    });

    test("writes state file with commission details", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const stateFilePath = path.join(
        ghHome,
        "state",
        "commissions",
        `${commissionId}.json`,
      );
      const stateRaw = await fs.readFile(stateFilePath, "utf-8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;

      expect(state.commissionId).toBe(commissionId as string);
      expect(state.projectName).toBe("test-project");
      expect(state.workerName).toBe("researcher");
      expect(state.branchName).toBe(commissionBranchName(commissionId as string));
      expect(state.worktreeDir).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );

      mock.resolve();
    });

    test("preserves multi-line prompt through dispatch", async () => {
      // gray-matter wraps prompts longer than ~80 chars as multi-line YAML.
      // The old regex parser silently dropped these, producing an empty prompt.
      const longPrompt =
        "Analyze the OAuth 2.0 PKCE flow for CLI tools and document the key " +
        "security considerations, token storage strategies, and recommended " +
        "libraries for TypeScript implementations. Include code examples.";

      const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: pending
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "${longPrompt}"
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;
      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      await fs.writeFile(artifactPath, content, "utf-8");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();

      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Verify the artifact in the activity worktree preserves the prompt
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const activityArtifactPath = commissionArtifactPath(activityDir, commissionId);
      const raw = await fs.readFile(activityArtifactPath, "utf-8");
      const { data } = matter(raw);
      expect(data.prompt).toBe(longPrompt);

      mock.resolve();
    });

    test("preserves zero-valued resource overrides through dispatch", async () => {
      const content = `---
title: "Commission: Research OAuth patterns"
date: 2026-02-21
status: pending
tags: [commission]
worker: researcher
workerDisplayTitle: "Research Specialist"
prompt: "Research OAuth 2.0 patterns for CLI tools..."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 0
  maxBudgetUsd: 0
activity_timeline:
  - timestamp: 2026-02-21T14:30:00.000Z
    event: created
    reason: "User created commission"
current_progress: ""
result_summary: ""
projectName: test-project
---
`;
      const artifactPath = commissionArtifactPath(integrationPath, commissionId);
      await fs.writeFile(artifactPath, content, "utf-8");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();

      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Verify the artifact in the activity worktree preserves zero-valued overrides
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const activityArtifactPath = commissionArtifactPath(activityDir, commissionId);
      const raw = await fs.readFile(activityArtifactPath, "utf-8");
      const { data } = matter(raw);
      const overrides = data.resource_overrides as {
        maxTurns?: number;
        maxBudgetUsd?: number;
      };
      expect(overrides?.maxTurns).toBe(0);
      expect(overrides?.maxBudgetUsd).toBe(0);

      mock.resolve();
    });
  });

  // -- Session completion handling --

  describe("session completion handling", () => {
    test("session completes with submit_result transitions to completed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      // Simulate submit_result tool call before session completes
      mock.submitResult(eventBus, commissionId as string, "Research complete", ["report.md"]);

      // Session finishes normally
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("session completes without submit_result transitions to failed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Session completes without calling submit_result
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("session error with submit_result transitions to completed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Simulate submit_result before error
      mock.submitResult(eventBus, commissionId as string, "Partial result saved");
      mock.reject(new Error("SDK session failed"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("session error without submit_result transitions to failed", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Session errors without result
      mock.reject(new Error("SDK session crashed"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("non-.lore/ squash-merge conflict calls createMeetingRequestFn with commission ID and branch", async () => {
      await writeCommissionArtifact("pending");

      // Configure git mock to report a non-.lore/ conflict
      const mockGitOps = createMockGitOps();
      mockGitOps.squashMergeNoCommit = (...args) => {
        mockGitOps.calls.push({ method: "squashMergeNoCommit", args });
        return Promise.resolve(false); // conflict detected
      };
      mockGitOps.listConflictedFiles = (...args) => {
        mockGitOps.calls.push({ method: "listConflictedFiles", args });
        return Promise.resolve(["src/app.ts"]); // non-.lore/ conflict
      };

      const meetingRequestCalls: Array<{
        projectName: string;
        workerName: string;
        reason: string;
      }> = [];
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
          createMeetingRequestFn: (params) => {
            meetingRequestCalls.push(params);
            return Promise.resolve();
          },
        }),
      );

      await session.dispatchCommission(commissionId);

      // Complete the commission with a result so it attempts the squash-merge
      mock.submitResult(eventBus, commissionId as string, "Research complete");
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Commission should have transitioned to failed
      const failedEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);

      // createMeetingRequestFn should have been called once
      expect(meetingRequestCalls).toHaveLength(1);
      expect(meetingRequestCalls[0].projectName).toBe("test-project");
      expect(meetingRequestCalls[0].workerName).toBe("guild-hall-manager");
      expect(meetingRequestCalls[0].reason).toContain(commissionId as string);
    });

    test("non-.lore/ squash-merge conflict does not fail when createMeetingRequestFn is absent", async () => {
      await writeCommissionArtifact("pending");

      // Configure git mock to report a non-.lore/ conflict
      const mockGitOps = createMockGitOps();
      mockGitOps.squashMergeNoCommit = (...args) => {
        mockGitOps.calls.push({ method: "squashMergeNoCommit", args });
        return Promise.resolve(false);
      };
      mockGitOps.listConflictedFiles = (...args) => {
        mockGitOps.calls.push({ method: "listConflictedFiles", args });
        return Promise.resolve(["src/app.ts"]);
      };

      const mock = createMockSession();
      // No createMeetingRequestFn provided
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      mock.submitResult(eventBus, commissionId as string, "Research complete");
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Commission should still transition to failed gracefully
      const failedEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "failed",
      );
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
      expect(session.getActiveCommissions()).toBe(0);
    });
  });

  // -- cancelCommission --

  describe("cancelCommission", () => {
    test("aborts session and transitions to cancelled", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      await session.cancelCommission(commissionId);
      // Let abort signal propagate through the async generator
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);

      // Should have emitted cancelled status
      const cancelEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "cancelled",
      );
      expect(cancelEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("rejects commission not in active map", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.cancelCommission(commissionId),
      ).rejects.toThrow("not found in active commissions");
    });

    test("custom reason flows through to emitted event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const customReason = "Blocking PR creation, stale work";
      await session.cancelCommission(commissionId, customReason);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const cancelEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "cancelled",
      );
      expect(cancelEvents.length).toBeGreaterThanOrEqual(1);
      expect("reason" in cancelEvents[0] && cancelEvents[0].reason).toBe(
        customReason,
      );
    });
  });

  // -- redispatchCommission --

  describe("redispatchCommission", () => {
    test("resets to pending and dispatches fresh", async () => {
      await writeCommissionArtifact("failed");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      const result = await session.redispatchCommission(commissionId);

      expect(result).toEqual({ status: "accepted" });
      expect(session.getActiveCommissions()).toBe(1);

      // Status should be in_progress in the activity worktree after redispatch
      const activityDir = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      const status = await readCommissionStatus(activityDir, commissionId);
      expect(status).toBe("in_progress");

      mock.resolve();
    });

    test("works for cancelled commissions", async () => {
      await writeCommissionArtifact("cancelled");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      const result = await session.redispatchCommission(commissionId);
      expect(result).toEqual({ status: "accepted" });

      mock.resolve();
    });

    test("rejects non-failed/cancelled commissions", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.redispatchCommission(commissionId),
      ).rejects.toThrow('must be "failed" or "cancelled"');
    });

    test("rejects in_progress commissions", async () => {
      await writeCommissionArtifact("in_progress");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await expect(
        session.redispatchCommission(commissionId),
      ).rejects.toThrow('must be "failed" or "cancelled"');
    });

    // -- Redispatch git branch naming --

    test("redispatch creates branch with attempt suffix after first failure", async () => {
      // Simulate a commission that was dispatched once and failed.
      // The integration worktree has the terminal status_failed entry
      // that syncStatusToIntegration would have written.
      await writeCommissionArtifactWithTimeline("failed", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed with exit code 1" },
      ]);

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // The createBranch call should use the attempt-2 suffixed branch name
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 2));

      mock.resolve();
    });

    test("multiple redispatches increment the attempt suffix", async () => {
      // Simulate a commission that failed twice (two terminal entries).
      // First dispatch failed, first redispatch also failed.
      await writeCommissionArtifactWithTimeline("failed", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed with exit code 1" },
        { event: "status_pending", reason: "Commission reset for redispatch" },
        { event: "status_failed", reason: "Worker crashed again" },
      ]);

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // Two previous failures, so this is attempt 3
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 3));

      mock.resolve();
    });

    test("redispatch from cancelled status uses correct attempt suffix", async () => {
      // Simulate a commission that was dispatched and cancelled.
      await writeCommissionArtifactWithTimeline("cancelled", [
        { event: "created", reason: "Commission created" },
        { event: "status_cancelled", reason: "Commission cancelled by user" },
      ]);

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      // One previous cancellation, so attempt 2
      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 2));

      mock.resolve();
    });

    test("mixed failed and cancelled attempts count correctly", async () => {
      // One failure + one cancellation = 2 previous attempts, next is attempt 3
      await writeCommissionArtifactWithTimeline("cancelled", [
        { event: "created", reason: "Commission created" },
        { event: "status_failed", reason: "Worker crashed" },
        { event: "status_pending", reason: "Commission reset for redispatch" },
        { event: "status_cancelled", reason: "Commission cancelled by user" },
      ]);

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.redispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string, 3));

      mock.resolve();
    });

    test("first dispatch (no previous failures) uses unsuffixed branch name", async () => {
      // Fresh commission with no terminal entries. This tests the default
      // dispatch path (no attempt parameter).
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      // No attempt suffix for first dispatch
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string));
      expect(branchCall!.args[1]).toBe(`claude/commission/${commissionId}`);

      mock.resolve();
    });
  });

  // -- reportProgress (via toolbox callback) --

  describe("reportProgress (via toolbox callback)", () => {
    test("emits commission_progress event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      mock.reportProgress(eventBus, commissionId as string, "50% complete");

      const progressEvents = emittedEvents.filter(
        (e) => e.type === "commission_progress",
      );
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0]).toMatchObject({
        type: "commission_progress",
        commissionId: commissionId as string,
        summary: "50% complete",
      });

      mock.resolve();
    });
  });

  // -- reportResult (via toolbox callback) --

  describe("reportResult (via toolbox callback)", () => {
    test("sets resultSubmitted flag and emits event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      mock.submitResult(eventBus, commissionId as string, "Research complete", [
        "report.md",
        "findings.md",
      ]);

      const resultEvents = emittedEvents.filter(
        (e) => e.type === "commission_result",
      );
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0]).toMatchObject({
        type: "commission_result",
        commissionId: commissionId as string,
        summary: "Research complete",
        artifacts: ["report.md", "findings.md"],
      });

      // Verify it affects completion handling (session ends -> should complete, not fail)
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -- reportQuestion (via toolbox callback) --

  describe("reportQuestion (via toolbox callback)", () => {
    test("emits commission_question event", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear events from dispatch
      emittedEvents.length = 0;

      mock.logQuestion(
        eventBus, commissionId as string, "Which OAuth flow should I focus on?",
      );

      const questionEvents = emittedEvents.filter(
        (e) => e.type === "commission_question",
      );
      expect(questionEvents).toHaveLength(1);
      expect(questionEvents[0]).toMatchObject({
        type: "commission_question",
        commissionId: commissionId as string,
        question: "Which OAuth flow should I focus on?",
      });

      mock.resolve();
    });
  });

  // -- addUserNote --

  describe("addUserNote", () => {
    test("appends user_note timeline entry", async () => {
      await writeCommissionArtifact("pending");

      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      await session.addUserNote(commissionId, "Focus on PKCE flow");

      const timeline = await readActivityTimeline(integrationPath, commissionId);
      expect(timeline).toHaveLength(2);

      const noteEntry = timeline[1];
      expect(noteEntry.event).toBe("user_note");
      expect(noteEntry.reason).toBe("Focus on PKCE flow");
      expect(noteEntry.timestamp).toBeDefined();
    });

    test("rejects commission not found in any project", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const fakeId = asCommissionId("commission-fake-20260101-000000");
      await expect(
        session.addUserNote(fakeId, "note"),
      ).rejects.toThrow("not found in any project");
    });
  });

  // -- getActiveCommissions --

  describe("getActiveCommissions", () => {
    test("returns count of active commissions", () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      expect(session.getActiveCommissions()).toBe(0);
    });

    test("increments when commission is dispatched", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      mock.resolve();
    });

    test("decrements when session completes", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      expect(session.getActiveCommissions()).toBe(1);

      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.getActiveCommissions()).toBe(0);
    });
  });

  // -- shutdown --

  describe("shutdown", () => {
    test("clears heartbeat interval", () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      // Should not throw
      session.shutdown();
    });
  });

  // -- Git integration --

  describe("git integration", () => {
    test("dispatchCommission calls createBranch with correct branch name", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const branchCall = mockGitOps.calls.find((c) => c.method === "createBranch");
      expect(branchCall).toBeDefined();
      expect(branchCall!.args[0]).toBe(projectPath); // repo path
      expect(branchCall!.args[1]).toBe(commissionBranchName(commissionId as string));
      expect(branchCall!.args[2]).toBe("claude/main"); // base ref

      mock.resolve();
    });

    test("dispatchCommission calls createWorktree with correct path", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const worktreeCall = mockGitOps.calls.find((c) => c.method === "createWorktree");
      expect(worktreeCall).toBeDefined();
      expect(worktreeCall!.args[0]).toBe(projectPath); // repo path
      expect(worktreeCall!.args[1]).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );
      expect(worktreeCall!.args[2]).toBe(commissionBranchName(commissionId as string));

      mock.resolve();
    });

    test("dispatchCommission configures sparse checkout for sparse-scope workers", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      // Default worker package has checkoutScope: "sparse"
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const sparseCall = mockGitOps.calls.find((c) => c.method === "configureSparseCheckout");
      expect(sparseCall).toBeDefined();
      const expectedWorktree = commissionWorktreePath(ghHome, "test-project", commissionId as string);
      expect(sparseCall!.args[0]).toBe(expectedWorktree);
      expect(sparseCall!.args[1]).toEqual([".lore/"]);

      mock.resolve();
    });

    test("dispatchCommission does not configure sparse checkout for full-scope workers", async () => {
      await writeCommissionArtifact("pending");

      // Create a worker with checkoutScope: "full" (no sparse checkout)
      const fullScopeWorker: DiscoveredPackage = {
        name: "guild-hall-sample-assistant",
        path: "/tmp/fake-packages/sample-assistant",
        metadata: {
          type: "worker" as const,
          identity: {
            name: "researcher",
            description: "Research specialist",
            displayTitle: "Research Specialist",
          },
          posture: "You are a research specialist.",
          domainToolboxes: [],
          builtInTools: [],
          checkoutScope: "full" as const,
          resourceDefaults: {
            maxTurns: 150,
            maxBudgetUsd: 1.0,
          },
        },
      };

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          packages: [fullScopeWorker],
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const sparseCall = mockGitOps.calls.find((c) => c.method === "configureSparseCheckout");
      expect(sparseCall).toBeUndefined();

      mock.resolve();
    });

    test("createCommission writes artifact to integration worktree", async () => {
      session = createCommissionSession(
        createTestDeps({ eventBus }),
      );

      const result = await session.createCommission(
        "test-project",
        "Test Commission",
        "guild-hall-sample-assistant",
        "Test prompt",
      );

      const id = asCommissionId(result.commissionId);

      // Artifact should exist in integration worktree
      const iArtifactPath = commissionArtifactPath(integrationPath, id);
      const raw = await fs.readFile(iArtifactPath, "utf-8");
      expect(raw).toContain("status: pending");

      // Artifact should NOT exist in the real project path
      const pArtifactPath = commissionArtifactPath(projectPath, id);
      await expect(fs.access(pArtifactPath)).rejects.toThrow();
    });

    test("state file contains worktreeDir and branchName", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const stateFilePath = path.join(
        ghHome,
        "state",
        "commissions",
        `${commissionId}.json`,
      );
      const stateRaw = await fs.readFile(stateFilePath, "utf-8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;

      expect(state.worktreeDir).toBe(
        commissionWorktreePath(ghHome, "test-project", commissionId as string),
      );
      expect(state.branchName).toBe(commissionBranchName(commissionId as string));

      mock.resolve();
    });

    // -- Exit/cleanup git operations --

    test("completion calls commitAll, squashMergeNoCommit, commitAll, removeWorktree, deleteBranch in order", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Clear calls from dispatch to isolate exit-path calls
      const dispatchCallCount = mockGitOps.calls.length;

      // Submit result so completion classifies as completed
      mock.submitResult(eventBus, commissionId as string, "Research complete", ["report.md"]);
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
      const exitMethods = exitCalls.map((c) => c.method);

      // resolveSquashMerge uses squashMergeNoCommit + commitAll instead of squashMerge
      expect(exitMethods).toContain("commitAll");
      expect(exitMethods).toContain("squashMergeNoCommit");
      expect(exitMethods).toContain("removeWorktree");
      expect(exitMethods).toContain("deleteBranch");

      // Verify ordering: commitAll before squashMergeNoCommit before removeWorktree before deleteBranch
      const commitIdx = exitMethods.indexOf("commitAll");
      const squashIdx = exitMethods.indexOf("squashMergeNoCommit");
      const removeIdx = exitMethods.indexOf("removeWorktree");
      const deleteIdx = exitMethods.indexOf("deleteBranch");

      expect(commitIdx).toBeLessThan(squashIdx);
      expect(squashIdx).toBeLessThan(removeIdx);
      expect(removeIdx).toBeLessThan(deleteIdx);

      // Verify squashMergeNoCommit targets integration worktree with the activity branch
      const squashCall = exitCalls.find((c) => c.method === "squashMergeNoCommit");
      expect(squashCall!.args[0]).toBe(integrationWorktreePath(ghHome, "test-project"));
      expect(squashCall!.args[1]).toBe(commissionBranchName(commissionId as string));

      // Verify deleteBranch targets the activity branch
      const deleteCall = exitCalls.find((c) => c.method === "deleteBranch");
      expect(deleteCall!.args[0]).toBe(projectPath);
      expect(deleteCall!.args[1]).toBe(commissionBranchName(commissionId as string));
    });

    test("failure preserves branch (commitAll + removeWorktree, no deleteBranch)", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const dispatchCallCount = mockGitOps.calls.length;

      // Session completes without result -> failure
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exitCalls = mockGitOps.calls.slice(dispatchCallCount);
      const exitMethods = exitCalls.map((c) => c.method);

      expect(exitMethods).toContain("commitAll");
      expect(exitMethods).toContain("removeWorktree");
      expect(exitMethods).not.toContain("squashMerge");
      expect(exitMethods).not.toContain("deleteBranch");
    });

    test("cancellation preserves branch (commitAll + removeWorktree, no deleteBranch)", async () => {
      await writeCommissionArtifact("pending");

      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      const dispatchCallCount = mockGitOps.calls.length;

      await session.cancelCommission(commissionId);
      // Let abort signal propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      const cancelCalls = mockGitOps.calls.slice(dispatchCallCount);
      const cancelMethods = cancelCalls.map((c) => c.method);

      expect(cancelMethods).toContain("commitAll");
      expect(cancelMethods).toContain("removeWorktree");
      expect(cancelMethods).not.toContain("squashMerge");
      expect(cancelMethods).not.toContain("deleteBranch");
    });

    test("git cleanup failure does not prevent commission from completing", async () => {
      await writeCommissionArtifact("pending");

      // Create a mock that throws on squashMerge
      const mockGitOps = createMockGitOps();
      const originalSquashMerge = mockGitOps.squashMerge.bind(mockGitOps);
      void originalSquashMerge; // suppress unused
      mockGitOps.squashMerge = () => {
        return Promise.reject(new Error("Merge conflict"));
      };

      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Submit result so completion classifies as completed
      mock.submitResult(eventBus, commissionId as string, "Research complete");
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Commission should still have been removed from active map
      expect(session.getActiveCommissions()).toBe(0);

      // Status event should still have been emitted as completed
      const statusEvents = emittedEvents.filter(
        (e) =>
          e.type === "commission_status" &&
          "status" in e &&
          e.status === "completed",
      );
      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    });

    test("commitAll returning false (nothing to commit) continues normally", async () => {
      await writeCommissionArtifact("pending");

      // Default mock commitAll already returns false. Verify the flow
      // completes without error for the failure path.
      const mockGitOps = createMockGitOps();
      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      // Session completes without result -> failure path, commitAll returns false
      mock.reject(new Error("SDK session crashed"));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(session.getActiveCommissions()).toBe(0);

      // removeWorktree should still be called even when nothing to commit
      const exitCalls = mockGitOps.calls.filter((c) => c.method === "removeWorktree");
      expect(exitCalls.length).toBeGreaterThanOrEqual(1);
    });

    // -- Pre-merge integration commit ordering --
    //
    // Before squashMergeNoCommit is called on the integration path, the code
    // must call commitAll on the integration path (the "Pre-merge sync" commit).
    // This ensures uncommitted integration writes from prior operations are
    // committed before the squash-merge attempts to read the tree.

    test("pre-merge sync: commitAll on integration path is called before squashMergeNoCommit", async () => {
      await writeCommissionArtifact("pending");

      // Track call sequence with args so we can distinguish which path each
      // commitAll targets (activity worktree vs integration path).
      const callSequence: Array<{ method: string; path: string }> = [];
      const mockGitOps = createMockGitOps();
      const iPath = integrationWorktreePath(ghHome, "test-project");

      // Wrap commitAll and squashMergeNoCommit to capture call order with paths.
      const origCommitAll = mockGitOps.commitAll.bind(mockGitOps);
      mockGitOps.commitAll = async (...args) => {
        callSequence.push({ method: "commitAll", path: args[0] });
        return origCommitAll(...args);
      };
      const origSquash = mockGitOps.squashMergeNoCommit.bind(mockGitOps);
      mockGitOps.squashMergeNoCommit = async (...args) => {
        callSequence.push({ method: "squashMergeNoCommit", path: args[0] });
        return origSquash(...args);
      };

      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);
      const dispatchSequenceLength = callSequence.length;

      // Complete the commission so the merge path executes.
      mock.submitResult(eventBus, commissionId as string, "Research complete", ["report.md"]);
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exitSequence = callSequence.slice(dispatchSequenceLength);

      // Locate the pre-merge sync commitAll: the commitAll that targets the
      // integration path (not the activity worktree).
      const integrationCommitIdx = exitSequence.findIndex(
        (c) => c.method === "commitAll" && c.path === iPath,
      );
      const squashIdx = exitSequence.findIndex(
        (c) => c.method === "squashMergeNoCommit",
      );

      expect(integrationCommitIdx).toBeGreaterThanOrEqual(0);
      expect(squashIdx).toBeGreaterThanOrEqual(0);
      expect(integrationCommitIdx).toBeLessThan(squashIdx);
    });

    test("pre-merge sync: commitAll on integration path is called even when integration tree is clean", async () => {
      await writeCommissionArtifact("pending");

      // commitAll returning false = clean tree (nothing to commit). The call
      // must still happen; the code should not skip it based on a precondition.
      const integrationCommitAllCalls: string[] = [];
      const mockGitOps = createMockGitOps();
      const iPath = integrationWorktreePath(ghHome, "test-project");

      // Make commitAll return false (clean) and record calls by path.
      mockGitOps.commitAll = (targetPath, message) => {
        mockGitOps.calls.push({ method: "commitAll", args: [targetPath, message] });
        if (targetPath === iPath) {
          integrationCommitAllCalls.push(message);
        }
        return Promise.resolve(false); // clean tree
      };

      const mock = createMockSession();
      session = createCommissionSession(
        createTestDeps({
          eventBus,
          queryFn: mock.queryFn,
          activateFn: mock.activateFn,
          resolveToolSetFn: mock.resolveToolSetFn,

          gitOps: mockGitOps,
        }),
      );

      await session.dispatchCommission(commissionId);

      mock.submitResult(eventBus, commissionId as string, "Research complete", ["report.md"]);
      mock.resolve();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // At least one commitAll call targeted the integration path.
      expect(integrationCommitAllCalls.length).toBeGreaterThanOrEqual(1);
      // One of those calls is the pre-merge sync.
      expect(
        integrationCommitAllCalls.some((msg) => msg.includes("Pre-merge sync")),
      ).toBe(true);
    });
  });
});
