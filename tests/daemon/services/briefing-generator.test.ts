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
import type { AppConfig, DiscoveredPackage, WorkerMetadata } from "@/lib/types";

let tmpDir: string;
let guildHallHome: string;

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
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

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

function makeDeps(overrides: Partial<BriefingGeneratorDeps> = {}): BriefingGeneratorDeps {
  return {
    packages: [makeWorkerPackage("test-worker")],
    config: makeConfig(),
    guildHallHome,
    ...overrides,
  };
}

/**
 * Creates a mock queryFn that yields a single assistant message with the
 * given text. Tracks call count and captured prompts for assertions.
 */
function createMockQueryFn(responseText: string) {
  let callCount = 0;
  const capturedPrompts: string[] = [];

  const queryFn: BriefingQueryFn = async function* (params) {
    callCount++;
    capturedPrompts.push(params.prompt);

    yield {
      type: "assistant",
      message: {
        content: [{ type: "text", text: responseText }],
      },
    } as never; // Cast to satisfy SDKMessage type without importing internals
  };

  return {
    queryFn,
    getCallCount: () => callCount,
    getCapturedPrompts: () => capturedPrompts,
  };
}

// -- Tests --

describe("createBriefingGenerator - SDK path", () => {
  test("generates briefing using SDK queryFn with correct prompt", async () => {
    const mock = createMockQueryFn("The project has 2 active commissions and 1 pending request.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing).toBe("The project has 2 active commissions and 1 pending request.");
    expect(result.cached).toBe(false);
    expect(result.generatedAt).toBeTruthy();
    expect(mock.getCallCount()).toBe(1);

    // Verify the prompt contains project state context
    const prompt = mock.getCapturedPrompts()[0];
    expect(prompt).toContain("Current Project State");
    expect(prompt).toContain("concise briefing");
  });

  test("SDK response is returned with ISO timestamp", async () => {
    const mock = createMockQueryFn("Brief summary.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    // generatedAt should be a valid ISO date
    const date = new Date(result.generatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  test("falls back to template when SDK returns empty text", async () => {
    const mock = createMockQueryFn("");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    const result = await generator.generateBriefing("test-project");

    // Template fallback should produce something non-empty
    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.briefing).not.toBe("");
  });

  test("falls back to template when SDK throws", async () => {
    const queryFn: BriefingQueryFn = async function* () {
      throw new Error("SDK connection failed");
    };
    const generator = createBriefingGenerator(makeDeps({ queryFn }));

    const result = await generator.generateBriefing("test-project");

    // Should not throw, should return a template briefing
    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
  });
});

describe("createBriefingGenerator - cache behavior", () => {
  test("cache hit returns cached text without triggering SDK call", async () => {
    const mock = createMockQueryFn("Cached briefing text.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // First call: miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Second call: hit
    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe("Cached briefing text.");
    expect(mock.getCallCount()).toBe(1); // No additional SDK call
  });

  test("cache expires after TTL, triggering new generation", async () => {
    const mock = createMockQueryFn("Fresh briefing.");
    const generator = createBriefingGenerator(makeDeps({ queryFn: mock.queryFn }));

    // First call
    await generator.generateBriefing("test-project");
    expect(mock.getCallCount()).toBe(1);

    // Manually expire the cache by manipulating the internal state.
    // The cache is a Map inside the closure. We can't access it directly,
    // but we can test the invalidation path instead. For TTL testing,
    // we verify that invalidateCache forces a new generation.
    generator.invalidateCache("test-project");

    // Next call should be a cache miss
    const result = await generator.generateBriefing("test-project");
    expect(result.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });

  test("cache expires after 1 hour TTL", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Briefing text.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    // First call: cache miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance past 1 hour TTL (3_600_001 ms)
    currentTime += 3_600_001;

    // Second call: cache should be expired, triggering a new SDK call
    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(false);
    expect(mock.getCallCount()).toBe(2);
  });

  test("cache hit within TTL returns cached result", async () => {
    let currentTime = 1_000_000;
    const mock = createMockQueryFn("Cached within TTL.");
    const generator = createBriefingGenerator(
      makeDeps({ queryFn: mock.queryFn, clock: () => currentTime }),
    );

    // First call: cache miss
    const first = await generator.generateBriefing("test-project");
    expect(first.cached).toBe(false);
    expect(mock.getCallCount()).toBe(1);

    // Advance by 30 minutes (1_800_000 ms), still within 1 hour TTL
    currentTime += 1_800_000;

    // Second call: cache should still be valid
    const second = await generator.generateBriefing("test-project");
    expect(second.cached).toBe(true);
    expect(second.briefing).toBe("Cached within TTL.");
    expect(mock.getCallCount()).toBe(1); // No additional SDK call
  });

  test("invalidateCache clears the entry for the specific project", async () => {
    const mock = createMockQueryFn("Project briefing.");
    const config: AppConfig = {
      projects: [
        { name: "project-a", path: "/tmp/a" },
        { name: "project-b", path: "/tmp/b" },
      ],
    };

    // Create integration paths for both projects
    for (const name of ["project-a", "project-b"]) {
      const integrationPath = path.join(guildHallHome, "projects", name);
      await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), {
        recursive: true,
      });
      await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), {
        recursive: true,
      });
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
    generator.invalidateCache("project-a");

    // project-a should miss, project-b should still hit
    const resultA = await generator.generateBriefing("project-a");
    expect(resultA.cached).toBe(false);
    expect(mock.getCallCount()).toBe(3);

    const resultB = await generator.generateBriefing("project-b");
    expect(resultB.cached).toBe(true);
    expect(mock.getCallCount()).toBe(3); // No additional call
  });
});

describe("createBriefingGenerator - fallback without queryFn", () => {
  test("produces template summary when no queryFn is provided", async () => {
    const generator = createBriefingGenerator(makeDeps({ queryFn: undefined }));

    const result = await generator.generateBriefing("test-project");

    expect(result.briefing.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
    // Template should mention something about the project state
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
    // Should indicate the project is quiet
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
});
