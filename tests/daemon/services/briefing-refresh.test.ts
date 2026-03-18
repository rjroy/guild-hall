import { describe, test, expect } from "bun:test";
import { createBriefingRefreshService } from "@/daemon/services/briefing-refresh";
import type { BriefingRefreshDeps } from "@/daemon/services/briefing-refresh";
import type { AppConfig } from "@/lib/types";
import { collectingLog } from "@/daemon/lib/log";

// -- Helpers --

function makeConfig(
  projects: Array<{ name: string; path: string }> = [],
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return {
    projects: projects.map((p) => ({ name: p.name, path: p.path })),
    ...overrides,
  } as AppConfig;
}

interface MockGeneratorOptions {
  generateBriefing?: (name: string) => Promise<unknown>;
}

function makeMockGenerator(opts: MockGeneratorOptions = {}) {
  const calls: string[] = [];
  const generateBriefing =
    opts.generateBriefing ??
    ((_name: string) => Promise.resolve({
      briefing: "test",
      generatedAt: new Date().toISOString(),
      cached: false,
    }));

  return {
    generator: {
      generateBriefing: (name: string) => {
        calls.push(name);
        return generateBriefing(name);
      },
      getCachedBriefing: () => Promise.resolve(null),
      invalidateCache: () => Promise.resolve(),
      generateAllProjectsBriefing: () => Promise.resolve({
        briefing: "",
        generatedAt: "",
        cached: false,
      }),
    },
    calls,
  };
}

// Helper to wait for a condition with a timeout
async function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 5,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// -- Tests --

describe("BriefingRefreshService", () => {
  test("immediate first cycle on start()", async () => {
    const calls: string[] = [];
    const generator = makeMockGenerator({
      generateBriefing: (name: string) => {
        calls.push(name);
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const config = makeConfig([
      { name: "proj-a", path: "/a" },
      { name: "proj-b", path: "/b" },
    ]);

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();

    // Wait for both projects to be called
    await waitFor(() => calls.length >= 2);
    service.stop();

    expect(calls).toEqual(["proj-a", "proj-b"]);
  });

  test("post-completion scheduling runs subsequent cycles", async () => {
    let cycleCount = 0;
    const generator = makeMockGenerator({
      generateBriefing: () => {
        cycleCount++;
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const config = makeConfig(
      [{ name: "proj", path: "/proj" }],
      { briefingRefreshIntervalMinutes: 0.0001 }, // ~6ms interval
    );

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();

    // Wait for at least 2 cycles (first immediate + one scheduled)
    await waitFor(() => cycleCount >= 2, 3000);
    service.stop();

    expect(cycleCount).toBeGreaterThanOrEqual(2);
  });

  test("per-project error isolation", async () => {
    const calls: string[] = [];
    const generator = makeMockGenerator({
      generateBriefing: (name: string) => {
        calls.push(name);
        if (name === "failing") {
          return Promise.reject(new Error("generation failed"));
        }
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const { log } = collectingLog("test");
    const config = makeConfig([
      { name: "failing", path: "/fail" },
      { name: "passing", path: "/pass" },
    ]);

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
      log,
    });

    service.start();
    await waitFor(() => calls.length >= 2);
    service.stop();

    expect(calls).toContain("failing");
    expect(calls).toContain("passing");
  });

  test("stop cancels pending timer", async () => {
    let cycleCount = 0;
    const generator = makeMockGenerator({
      generateBriefing: () => {
        cycleCount++;
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const config = makeConfig(
      [{ name: "proj", path: "/proj" }],
      { briefingRefreshIntervalMinutes: 0.0001 }, // ~6ms
    );

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();

    // Wait for first cycle
    await waitFor(() => cycleCount >= 1);
    service.stop();

    const countAfterStop = cycleCount;

    // Wait a bit to confirm no more cycles run
    await new Promise((r) => setTimeout(r, 50));

    expect(cycleCount).toBe(countAfterStop);
  });

  test("stop during in-flight cycle allows completion but prevents next", async () => {
    const calls: string[] = [];
    let resolveBlock: (() => void) | null = null;
    const blockPromise = new Promise<void>((resolve) => {
      resolveBlock = resolve;
    });

    const generator = makeMockGenerator({
      generateBriefing: async (name) => {
        calls.push(name);
        if (name === "slow") {
          await blockPromise;
        }
        return { briefing: "ok", generatedAt: new Date().toISOString(), cached: false };
      },
    });

    const config = makeConfig(
      [
        { name: "slow", path: "/slow" },
        { name: "after-slow", path: "/after" },
      ],
      { briefingRefreshIntervalMinutes: 0.0001 },
    );

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();

    // Wait for the "slow" project to be called (cycle is in flight)
    await waitFor(() => calls.includes("slow"));

    // Stop while cycle is blocked
    service.stop();

    // Unblock the cycle
    resolveBlock!();

    // Wait for the in-flight cycle to complete (after-slow should still run)
    await waitFor(() => calls.includes("after-slow"));

    const callsAfterCycle = [...calls];

    // Wait to confirm no subsequent cycle starts
    await new Promise((r) => setTimeout(r, 50));

    // The in-flight cycle completed (both projects processed)
    expect(callsAfterCycle).toEqual(["slow", "after-slow"]);
    // No additional cycles ran
    expect(calls).toEqual(callsAfterCycle);
  });

  test("custom interval from config", async () => {
    // Verify the service uses the configured interval by testing with
    // a very short interval and confirming rapid cycling
    let cycleCount = 0;
    const generator = makeMockGenerator({
      generateBriefing: () => {
        cycleCount++;
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const config = makeConfig(
      [{ name: "proj", path: "/proj" }],
      { briefingRefreshIntervalMinutes: 5 },
    );

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();

    // Wait for first cycle only
    await waitFor(() => cycleCount >= 1);

    // With a 5-minute interval, only 1 cycle should run within 50ms
    await new Promise((r) => setTimeout(r, 50));
    service.stop();

    expect(cycleCount).toBe(1);
  });

  test("defaults to 60-minute interval when config omits field", async () => {
    let cycleCount = 0;
    const generator = makeMockGenerator({
      generateBriefing: () => {
        cycleCount++;
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    // No briefingRefreshIntervalMinutes set
    const config = makeConfig([{ name: "proj", path: "/proj" }]);

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    service.start();
    await waitFor(() => cycleCount >= 1);

    // With default 60-minute interval, only 1 cycle in 50ms
    await new Promise((r) => setTimeout(r, 50));
    service.stop();

    expect(cycleCount).toBe(1);
  });

  test("runCycle can be called directly for testing", async () => {
    const calls: string[] = [];
    const generator = makeMockGenerator({
      generateBriefing: (name: string) => {
        calls.push(name);
        return Promise.resolve({ briefing: "ok", generatedAt: new Date().toISOString(), cached: false });
      },
    });

    const config = makeConfig([
      { name: "one", path: "/one" },
      { name: "two", path: "/two" },
    ]);

    const service = createBriefingRefreshService({
      briefingGenerator: generator.generator as BriefingRefreshDeps["briefingGenerator"],
      config,
    });

    await service.runCycle();

    expect(calls).toEqual(["one", "two"]);
  });
});
