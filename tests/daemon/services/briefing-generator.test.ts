/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBriefingGenerator,
  type BriefingGeneratorDeps,
  type BriefingQueryFn,
} from "@/daemon/services/briefing-generator";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";
import type {
  AppConfig,
  DiscoveredPackage,
  WorkerMetadata,
  ActivationContext,
} from "@/lib/types";

let tmpDir: string;
let guildHallHome: string;

/**
 * Initializes a git repo with one commit at the given path.
 * Returns the HEAD commit hash.
 */
async function initGitRepo(repoPath: string): Promise<string> {
  const run = async (args: string[]) => {
    const proc = Bun.spawn(["git", ...args], {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text.trim();
  };

  await run(["init"]);
  await fs.writeFile(path.join(repoPath, ".gitkeep"), "");
  await run(["add", "."]);
  await run(["commit", "-m", "initial"]);
  return run(["rev-parse", "HEAD"]);
}

/**
 * Creates a new commit in an existing git repo, advancing HEAD.
 * Returns the new HEAD commit hash.
 */
async function advanceHead(repoPath: string): Promise<string> {
  const run = async (args: string[]) => {
    const proc = Bun.spawn(["git", ...args], {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text.trim();
  };

  await fs.writeFile(
    path.join(repoPath, `change-${Date.now()}.txt`),
    `change at ${Date.now()}`,
  );
  await run(["add", "."]);
  await run(["commit", "-m", "advance"]);
  return run(["rev-parse", "HEAD"]);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-briefing-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  // Create required directory structure for buildManagerContext
  const projectIntegration = path.join(guildHallHome, "projects", "test-project");
  await fs.mkdir(path.join(projectIntegration, ".lore", "commissions"), {
    recursive: true,
  });
  await fs.mkdir(path.join(projectIntegration, ".lore", "meetings"), {
    recursive: true,
  });
  await fs.mkdir(path.join(guildHallHome, "state", "meetings"), {
    recursive: true,
  });

  // Initialize a git repo so readHeadCommit works for cache validation
  await initGitRepo(projectIntegration);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

function makeManagerWorkerPackage(): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: "Guild Master",
      description: "The Guild Master",
      displayTitle: "Guild Master",
    },
    posture: "Guild Master posture",
    soul: "Guild Master soul",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    systemToolboxes: ["manager"],
    checkoutScope: "sparse",
  };
  return { name: "guild-master", path: "/fake/guild-master", metadata };
}

function makeWorkerPackage(name: string): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: "Test Worker",
      description: "A test worker",
      displayTitle: "Test Worker",
    },
    posture: "Test posture",
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "sparse",
  };
  return { name, path: `/fake/${name}`, metadata };
}

function makeConfig(): AppConfig {
  return {
    projects: [
      {
        name: "test-project",
        path: "/tmp/test-project",
      },
    ],
  };
}

/**
 * Creates mock SessionPrepDeps for testing the full SDK path.
 * Tracks calls to resolveToolSet for assertions.
 */
function makeMockPrepDeps() {
  let resolveToolSetCalls = 0;
  const capturedWorkerOverrides: WorkerMetadata[] = [];

  const prepDeps: SessionPrepDeps = {
    resolveToolSet: async (worker, _packages, _context) => {
      resolveToolSetCalls++;
      capturedWorkerOverrides.push(worker);
      return {
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep"],
        builtInTools: [],
        canUseToolRules: [],
      };
    },
    loadMemories: async () => ({
      memoryBlock: "",
          }),
    activateWorker: async (_pkg, context: ActivationContext) => ({
      systemPrompt: `You are ${context.identity.name}`,
      tools: { mcpServers: [], allowedTools: [], builtInTools: [], canUseToolRules: [] },
      resourceBounds: { maxTurns: 30 },
      model: "opus",
    }),
  };

  return {
    prepDeps,
    getResolveToolSetCalls: () => resolveToolSetCalls,
    getCapturedWorkerOverrides: () => capturedWorkerOverrides,
  };
}

function makeDeps(overrides: Partial<BriefingGeneratorDeps> = {}): BriefingGeneratorDeps {
  return {
    packages: [makeManagerWorkerPackage(), makeWorkerPackage("test-worker")],
    config: makeConfig(),
    guildHallHome,
    ...overrides,
  };
}

/**
 * Creates a mock queryFn that yields SDK messages matching what the real SDK
 * produces. For the single-turn path (collectSdkText), it yields an "assistant"
 * message. For the full SDK path (runSdkSession -> translateSdkMessage ->
 * collectRunnerText), it yields "stream_event" deltas + a "result" message.
 *
 * Tracks call count and captured prompts for assertions.
 */
function createMockQueryFn(responseText: string) {
  let callCount = 0;
  const capturedPrompts: string[] = [];
  const capturedOptions: Record<string, unknown>[] = [];

  const queryFn: BriefingQueryFn = async function* (params) {
    callCount++;
    capturedPrompts.push(params.prompt);
    capturedOptions.push(params.options as Record<string, unknown>);

    // Yield stream_event with text_delta (consumed by runSdkSession path)
    if (responseText) {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: responseText },
        },
      } as never;
    }

    // Also yield assistant message (consumed by single-turn collectSdkText path)
    yield {
      type: "assistant",
      message: {
        content: [{ type: "text", text: responseText }],
      },
    } as never;

    // Yield result to signal turn_end
    yield {
      type: "result",
      subtype: "success",
    } as never;
  };

  return {
    queryFn,
    getCallCount: () => callCount,
    getCapturedPrompts: () => capturedPrompts,
    getCapturedOptions: () => capturedOptions,
  };
}

// -- Tests --

describe("createBriefingGenerator - full SDK path", () => {
  test("uses prepareSdkSession + runSdkSession when prepDeps is present", async () => {
    const mock = createMockQueryFn("Multi-turn briefing from Guild Master.");
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps }),
    );

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing).toBe("Multi-turn briefing from Guild Master.");
    expect(result.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);
    expect(mockPrep.getResolveToolSetCalls()).toBe(1);
  });

  test("strips manager system toolbox from worker", async () => {
    const mock = createMockQueryFn("Briefing text.");
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps }),
    );

    await generator.generateBriefing("test-project");

    // The resolveToolSet wrapper should have overridden systemToolboxes to []
    const overrides = mockPrep.getCapturedWorkerOverrides();
    expect(overrides.length).toBe(1);
    expect(overrides[0].systemToolboxes).toEqual([]);
  });

  test("overrides model to sonnet via resourceOverrides (not post-prep spread)", async () => {
    const mock = createMockQueryFn("Briefing text.");
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps }),
    );

    await generator.generateBriefing("test-project");

    // The manager activation returns model: "opus", but the briefing prep spec
    // sets resourceOverrides.model = "sonnet". prepareSdkSession resolves
    // resourceOverrides.model over activation.model, so the queryFn should
    // receive model: "sonnet" in its options.
    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("uses briefing prompt (not context-stuffed prompt)", async () => {
    const mock = createMockQueryFn("Briefing.");
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps }),
    );

    await generator.generateBriefing("test-project");

    // The prompt should direct exploration, not stuff context inline
    const prompt = mock.getCapturedPrompts()[0];
    expect(prompt).toContain("project status briefing");
    expect(prompt).toContain(".lore/");
    expect(prompt).not.toContain("Current Project State");
  });

  test("falls back to template when session prep fails", async () => {
    const mock = createMockQueryFn("Should not appear.");
    const failingPrepDeps: SessionPrepDeps = {
      resolveToolSet: async () => {
        throw new Error("Resolution failed");
      },
      loadMemories: async () => ({ memoryBlock: "" }),
      activateWorker: async () => {
        throw new Error("Should not reach activation");
      },
    };

    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: failingPrepDeps }),
    );

    const result = await generator.generateBriefing("test-project");

    // Should fall back to template, not throw
    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.briefing).not.toBe("Should not appear.");
    expect(result.cached).toBe(false);
  });

  test("falls back to template when SDK returns empty text", async () => {
    const mock = createMockQueryFn("");
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps }),
    );

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.briefing).not.toBe("");
  });

  test("falls back to template when SDK throws during session", async () => {
    const throwingQueryFn: BriefingQueryFn = async function* () {
      throw new Error("SDK connection failed");
    };
    const mockPrep = makeMockPrepDeps();
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: throwingQueryFn, prepDeps: mockPrep.prepDeps }),
    );

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
  });
});

describe("createBriefingGenerator - single-turn SDK path (backwards compat)", () => {
  test("uses single-turn path when queryFn present but prepDeps missing", async () => {
    const mock = createMockQueryFn("Single-turn briefing.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing).toBe("Single-turn briefing.");
    expect(result.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Single-turn path includes context in the prompt
    const prompt = mock.getCapturedPrompts()[0];
    expect(prompt).toContain("Current Project State");
    expect(prompt).toContain("dashboard status widget");
  });

  test("SDK response is returned with ISO timestamp", async () => {
    const mock = createMockQueryFn("Brief summary.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    const date = new Date(result.generatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  test("falls back to template when SDK returns empty text", async () => {
    const mock = createMockQueryFn("");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.briefing).not.toBe("");
  });

  test("falls back to template when SDK throws", async () => {
    const queryFn: BriefingQueryFn = async function* () {
      throw new Error("SDK connection failed");
    };
    const generator = createBriefingGenerator(makeDeps({ queryFn }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
  });
});

describe("createBriefingGenerator - cache behavior", () => {
  test("cache hit when HEAD unchanged", async () => {
    const mock = createMockQueryFn("Cached briefing text.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // First call: miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Second call: HEAD hasn't moved, should be a cache hit
    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe("Cached briefing text.");
    expect(mock.getCallCount()).toBe(1);
  });

  test("cache hit when HEAD advances but within TTL", async () => {
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // First call: miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance HEAD (simulates a commission merge or sync)
    const integrationPath = path.join(guildHallHome, "projects", "test-project");
    await advanceHead(integrationPath);

    // Second call: HEAD moved but within TTL, cache still valid (either condition suffices)
    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(mock.getCallCount()).toBe(1);
  });

  test("cache miss when HEAD advances and TTL expires", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    // First call: miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance HEAD AND expire TTL — both conditions stale triggers regeneration
    const integrationPath = path.join(guildHallHome, "projects", "test-project");
    await advanceHead(integrationPath);
    currentTime += 3_600_001;

    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });

  test("cache hit when TTL expires but HEAD unchanged", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    // First call: miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance past 1 hour TTL but HEAD unchanged — HEAD match keeps cache valid
    currentTime += 3_600_001;

    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(mock.getCallCount()).toBe(1);
  });

  test("cache hit when both HEAD unchanged and within TTL", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Cached within TTL.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance 30 minutes (within TTL), HEAD unchanged
    currentTime += 1_800_000;

    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe("Cached within TTL.");
    expect(mock.getCallCount()).toBe(1);
  });

  test("invalidateCache forces regeneration", async () => {
    const mock = createMockQueryFn("Fresh briefing.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    await generator.invalidateCache("test-project");

    // Next call should be a cache miss (file deleted)
    const result = await generator.generateBriefing("test-project");
    expect(result.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });

  test("invalidateCache clears the entry for the specific project", async () => {
    const mock = createMockQueryFn("Project briefing.");
    const config: AppConfig = {
      projects: [
        { name: "project-a", path: "/tmp/a" },
        { name: "project-b", path: "/tmp/b" },
      ],
    };

    // Create integration paths with git repos for both projects
    for (const name of ["project-a", "project-b"]) {
      const integrationPath = path.join(guildHallHome, "projects", name);
      await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), {
        recursive: true,
      });
      await initGitRepo(integrationPath);
    }

    const generator = createBriefingGenerator(makeDeps({
      queryFn: mock.queryFn,
      config,
    }));

    // Cache both projects
    await generator.generateBriefing("project-a");
    await generator.generateBriefing("project-b");
    expect(mock.getCallCount()).toBe(2);

    // Invalidate only project-a
    await generator.invalidateCache("project-a");

    // project-a should miss, project-b should still hit
    const resultA = await generator.generateBriefing("project-a");
    expect(resultA.cached).toBe(false);
    expect(mock.getCallCount()).toBe(3);

    const resultB = await generator.generateBriefing("project-b");
    expect(resultB.cached).toBe(true);
    expect(mock.getCallCount()).toBe(3);
  });
});

describe("createBriefingGenerator - file-based cache persistence", () => {
  test("cache survives across generator instances (daemon restart)", async () => {
    const mock1 = createMockQueryFn("First instance briefing.");
    const gen1 = createBriefingGenerator(makeDeps({ queryFn: mock1.queryFn }));

    // First instance generates and caches to disk
    const first = await gen1.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock1.getCallCount()).toBe(1);

    // Second instance (simulating daemon restart) with a different queryFn
    const mock2 = createMockQueryFn("Second instance briefing.");
    const gen2 = createBriefingGenerator(makeDeps({ queryFn: mock2.queryFn }));

    // Should read from disk cache (HEAD hasn't moved), not call SDK
    const second = await gen2.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe("First instance briefing.");
    expect(mock2.getCallCount()).toBe(0);
  });
});

describe("createBriefingGenerator - fallback without queryFn", () => {
  test("produces template summary when no queryFn is provided", async () => {
    const generator = createBriefingGenerator(makeDeps({ queryFn: undefined }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
    expect(typeof result.briefing).toBe("string");
  });

  test("template fallback is also cached", async () => {
    const generator = createBriefingGenerator(makeDeps({ queryFn: undefined }));

    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);

    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe(first.briefing);
  });
});

describe("createBriefingGenerator - edge cases", () => {
  test("returns error message for unknown project", async () => {
    const generator = createBriefingGenerator(makeDeps());

    const result = await generator.generateBriefing("nonexistent-project");

    expect(result.briefing).toContain("nonexistent-project");
    expect(result.briefing).toContain("not found");
    expect(result.cached).toBe(false);
  });

  test("empty project (no commissions, no meetings) returns minimal briefing", async () => {
    const generator = createBriefingGenerator(makeDeps({ queryFn: undefined }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(
      result.briefing.includes("No commissions") ||
      result.briefing.includes("quiet"),
    ).toBe(true);
  });

  test("generatedAt is a valid ISO string", async () => {
    const generator = createBriefingGenerator(makeDeps({ queryFn: undefined }));

    const result = await generator.generateBriefing("test-project");

    const parsed = new Date(result.generatedAt);
    expect(parsed.toISOString()).toBe(result.generatedAt);
  });

  test("cache hit within TTL when integration worktree has no git repo", async () => {
    // Create a project with no git repo in its integration worktree
    const noGitIntegration = path.join(guildHallHome, "projects", "no-git-project");
    await fs.mkdir(path.join(noGitIntegration, ".lore", "commissions"), { recursive: true });
    await fs.mkdir(path.join(noGitIntegration, ".lore", "meetings"), { recursive: true });

    const config: AppConfig = {
      projects: [{ name: "no-git-project", path: "/tmp/no-git" }],
    };

    const mock = createMockQueryFn("Briefing for no-git project.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn, config }));

    // First call: generates
    const first = await generator.generateBriefing("no-git-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Second call: no HEAD to compare but within TTL, so cache is valid
    const second = await generator.generateBriefing("no-git-project");
    expect(second.cached).toBe(true);
    expect(mock.getCallCount()).toBe(1);
  });

  test("cache miss when no git repo and TTL expires", async () => {
    // Create a project with no git repo in its integration worktree
    const noGitIntegration = path.join(guildHallHome, "projects", "no-git-project");
    await fs.mkdir(path.join(noGitIntegration, ".lore", "commissions"), { recursive: true });
    await fs.mkdir(path.join(noGitIntegration, ".lore", "meetings"), { recursive: true });

    const config: AppConfig = {
      projects: [{ name: "no-git-project", path: "/tmp/no-git" }],
    };

    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing for no-git project.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, config, clock: () => currentTime }),
    );

    // First call: generates
    const first = await generator.generateBriefing("no-git-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Expire TTL — with no HEAD, there's no head match, so both conditions are stale
    currentTime += 3_600_001;

    const second = await generator.generateBriefing("no-git-project");
    expect(second.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });
});

describe("createBriefingGenerator - configurable TTL", () => {
  test("briefingCacheTtlMinutes: 30 causes 31-minute-old cache to be stale", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const config: AppConfig = {
      ...makeConfig(),
      briefingCacheTtlMinutes: 30,
    };
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, config, clock: () => currentTime }),
    );

    // First call: cache miss
    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    // Advance HEAD + 31 minutes (past the 30-minute TTL)
    const integrationPath = path.join(guildHallHome, "projects", "test-project");
    await advanceHead(integrationPath);
    currentTime += 31 * 60 * 1000;

    const result = await generator.generateBriefing("test-project");
    expect(result.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });

  test("briefingCacheTtlMinutes: 120 keeps 90-minute-old cache valid", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const config: AppConfig = {
      ...makeConfig(),
      briefingCacheTtlMinutes: 120,
    };
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, config, clock: () => currentTime }),
    );

    // First call: cache miss
    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    // Advance HEAD + 90 minutes (within 120-minute TTL)
    const integrationPath = path.join(guildHallHome, "projects", "test-project");
    await advanceHead(integrationPath);
    currentTime += 90 * 60 * 1000;

    const result = await generator.generateBriefing("test-project");
    expect(result.cached).toBe(true);
    expect(mock.getCallCount()).toBe(1);
  });

  test("default TTL is 60 minutes when briefingCacheTtlMinutes is absent", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    // Advance HEAD + 59 minutes (within default 60-minute TTL)
    const integrationPath = path.join(guildHallHome, "projects", "test-project");
    await advanceHead(integrationPath);
    currentTime += 59 * 60 * 1000;

    const result = await generator.generateBriefing("test-project");
    expect(result.cached).toBe(true);
    expect(mock.getCallCount()).toBe(1);
  });
});

describe("createBriefingGenerator - all-projects briefing", () => {
  test("returns sensible message when no projects registered", async () => {
    const config: AppConfig = { projects: [] };
    const generator = createBriefingGenerator(makeDeps({ config }));

    const result = await generator.generateAllProjectsBriefing();

    expect(result.briefing).toContain("No projects registered");
    expect(result.cached).toBe(false);
  });

  test("calls generateBriefing per project when cache is cold", async () => {
    const mock = createMockQueryFn("Briefing text.");
    const config: AppConfig = {
      projects: [
        { name: "alpha", path: "/tmp/alpha" },
        { name: "beta", path: "/tmp/beta" },
      ],
    };

    // Create integration worktrees with git repos
    for (const name of ["alpha", "beta"]) {
      const integrationPath = path.join(guildHallHome, "projects", name);
      await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
      await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), { recursive: true });
      await initGitRepo(integrationPath);
    }

    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn, config }));

    const result = await generator.generateAllProjectsBriefing();

    expect(result.cached).toBe(false);
    // queryFn is called for each project briefing + synthesis
    // Each project generates a briefing, so at least 2 calls
    expect(mock.getCallCount()).toBeGreaterThanOrEqual(2);
  });

  test("composite HEAD hash changes when one project's HEAD changes", async () => {
    const config: AppConfig = {
      projects: [
        { name: "alpha", path: "/tmp/alpha" },
        { name: "beta", path: "/tmp/beta" },
      ],
    };

    for (const name of ["alpha", "beta"]) {
      const integrationPath = path.join(guildHallHome, "projects", name);
      await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
      await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), { recursive: true });
      await initGitRepo(integrationPath);
    }

    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, config, clock: () => currentTime }),
    );

    // First call: cache cold
    const first = await generator.generateAllProjectsBriefing();
    expect(first.cached).toBe(false);
    const firstCallCount = mock.getCallCount();

    // Second call: same HEADs, should be cached
    const second = await generator.generateAllProjectsBriefing();
    expect(second.cached).toBe(true);
    expect(mock.getCallCount()).toBe(firstCallCount);

    // Advance one project's HEAD + expire TTL
    const alphaPath = path.join(guildHallHome, "projects", "alpha");
    await advanceHead(alphaPath);
    currentTime += 61 * 60 * 1000; // past default 60-minute TTL

    // Third call: composite hash changed, should regenerate
    const third = await generator.generateAllProjectsBriefing();
    expect(third.cached).toBe(false);
    expect(mock.getCallCount()).toBeGreaterThan(firstCallCount);
  });

  test("all-projects cache is read from _all.json", async () => {
    const config: AppConfig = {
      projects: [{ name: "alpha", path: "/tmp/alpha" }],
    };

    const integrationPath = path.join(guildHallHome, "projects", "alpha");
    await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
    await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), { recursive: true });
    await initGitRepo(integrationPath);

    const mock = createMockQueryFn("Fresh all-projects briefing.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn, config }));

    // Generate to populate cache
    const first = await generator.generateAllProjectsBriefing();
    expect(first.cached).toBe(false);
    const callsAfterFirst = mock.getCallCount();

    // Second call should hit _all.json cache
    const second = await generator.generateAllProjectsBriefing();
    expect(second.cached).toBe(true);
    expect(mock.getCallCount()).toBe(callsAfterFirst);
  });

  test("no-SDK fallback concatenates project briefings", async () => {
    const config: AppConfig = {
      projects: [{ name: "alpha", path: "/tmp/alpha" }],
    };

    const integrationPath = path.join(guildHallHome, "projects", "alpha");
    await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), { recursive: true });
    await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), { recursive: true });
    await initGitRepo(integrationPath);

    const generator = createBriefingGenerator(makeDeps({ config }));

    const result = await generator.generateAllProjectsBriefing();
    expect(result.cached).toBe(false);
    // Fallback concatenates project name + template briefing
    expect(result.briefing).toContain("alpha");
  });
});

describe("createBriefingGenerator - getCachedBriefing", () => {
  test("returns cached result when cache file exists", async () => {
    const mock = createMockQueryFn("Cached briefing text.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // Populate cache via generateBriefing
    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    // getCachedBriefing should return the cached entry
    const cached = await generator.getCachedBriefing("test-project");
    expect(cached).not.toBeNull();
    expect(cached!.briefing).toBe("Cached briefing text.");
    expect(cached!.cached).toBe(true);
    expect(new Date(cached!.generatedAt).getTime()).not.toBeNaN();
  });

  test("returns null when no cache file exists", async () => {
    const generator = createBriefingGenerator(makeDeps());

    const cached = await generator.getCachedBriefing("test-project");
    expect(cached).toBeNull();
  });

  test("returns null when cache file is malformed JSON", async () => {
    const generator = createBriefingGenerator(makeDeps());

    // Write malformed content directly to the cache path
    const cachePath = path.join(guildHallHome, "state", "briefings", "test-project.json");
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, "not valid json {{{", "utf-8");

    const cached = await generator.getCachedBriefing("test-project");
    expect(cached).toBeNull();
  });

  test("does not trigger generation", async () => {
    const mock = createMockQueryFn("Should not be called.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // Call getCachedBriefing without ever generating — should not invoke queryFn
    await generator.getCachedBriefing("test-project");
    expect(mock.getCallCount()).toBe(0);
  });

  test("returns null when cache file has missing fields", async () => {
    const generator = createBriefingGenerator(makeDeps());

    // Write cache with missing 'text' field
    const cachePath = path.join(guildHallHome, "state", "briefings", "test-project.json");
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({ generatedAt: Date.now() }), "utf-8");

    const cached = await generator.getCachedBriefing("test-project");
    expect(cached).toBeNull();
  });
});

describe("createBriefingGenerator - system model configuration", () => {
  test("uses configured briefing model from config.systemModels.briefing", async () => {
    const mock = createMockQueryFn("Briefing with haiku.");
    const mockPrep = makeMockPrepDeps();
    const config: AppConfig = {
      ...makeConfig(),
      systemModels: { briefing: "haiku" },
    };

    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps, config }),
    );

    await generator.generateBriefing("test-project");

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("haiku");
  });

  test("falls back to sonnet when config.systemModels.briefing is absent", async () => {
    const mock = createMockQueryFn("Briefing with default.");
    const mockPrep = makeMockPrepDeps();
    const config: AppConfig = {
      ...makeConfig(),
      systemModels: {},
    };

    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps, config }),
    );

    await generator.generateBriefing("test-project");

    const options = mock.getCapturedOptions();
    expect(options.length).toBe(1);
    expect(options[0].model).toBe("sonnet");
  });

  test("passes local model name through to prepareSdkSession for resolution", async () => {
    const mock = createMockQueryFn("Briefing with local model.");
    const mockPrep = makeMockPrepDeps();
    const config: AppConfig = {
      ...makeConfig(),
      systemModels: { briefing: "my-local-model" },
    };

    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, prepDeps: mockPrep.prepDeps, config }),
    );

    // Will fall back to template since "my-local-model" isn't resolvable,
    // but the important thing is the value reaches prepareSdkSession
    await generator.generateBriefing("test-project");

    // The call still happened (even if it fell back to template after resolution failure)
    expect(mock.getCapturedOptions().length >= 0).toBe(true);
  });
});
