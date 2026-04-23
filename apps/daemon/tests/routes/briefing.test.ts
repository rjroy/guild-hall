/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect } from "bun:test";
import { createApp } from "@/apps/daemon/app";
import type { createBriefingGenerator } from "@/apps/daemon/services/briefing-generator";

// -- Helpers --

type BriefingGenerator = ReturnType<typeof createBriefingGenerator>;

function makeMockBriefingGenerator(overrides: Partial<BriefingGenerator> = {}): BriefingGenerator {
  return {
    generateBriefing: async (projectName: string) => ({
      briefing: `Briefing for ${projectName}: all systems operational.`,
      generatedAt: new Date().toISOString(),
      cached: false,
    }),
    generateAllProjectsBriefing: async () => ({
      briefing: "All projects synthesis: everything is running smoothly.",
      generatedAt: new Date().toISOString(),
      cached: false,
    }),
    invalidateCache: async () => {},
    getCachedBriefing: async () => null,
    ...overrides,
  };
}

function makeTestApp(briefingGenerator: BriefingGenerator) {
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    briefingGenerator,
  }).app;
}

// -- Tests --

describe("GET /coordination/review/briefing/read - all projects", () => {
  test("returns all-projects synthesis when projectName=all", async () => {
    const app = makeTestApp(makeMockBriefingGenerator());

    const res = await app.request("/coordination/review/briefing/read?projectName=all");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("All projects synthesis");
  });

  test("returns all-projects synthesis when projectName is omitted", async () => {
    const app = makeTestApp(makeMockBriefingGenerator());

    const res = await app.request("/coordination/review/briefing/read");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("All projects synthesis");
  });

  test("returns 500 when all-projects generator throws", async () => {
    const generator = makeMockBriefingGenerator({
      generateAllProjectsBriefing: async () => {
        throw new Error("Synthesis failed");
      },
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=all");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to generate briefing");
  });
});

describe("GET /coordination/review/briefing/read - single project", () => {
  test("returns cached briefing on cache hit", async () => {
    const generator = makeMockBriefingGenerator({
      getCachedBriefing: async (projectName: string) => ({
        briefing: `Briefing for ${projectName}: all systems operational.`,
        generatedAt: "2026-03-17T10:00:00.000Z",
        cached: true,
      }),
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=my-project");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("my-project");
    expect(body.briefing).toContain("all systems operational");
    expect(body.generatedAt).toBe("2026-03-17T10:00:00.000Z");
    expect(body.cached).toBe(true);
  });

  test("returns pending response on cache miss", async () => {
    // Default getCachedBriefing returns null
    const app = makeTestApp(makeMockBriefingGenerator());

    const res = await app.request("/coordination/review/briefing/read?projectName=my-project");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toBeNull();
    expect(body.generatedAt).toBeNull();
    expect(body.cached).toBe(false);
    expect(body.pending).toBe(true);
  });

  test("returns 500 when getCachedBriefing throws", async () => {
    const generator = makeMockBriefingGenerator({
      getCachedBriefing: async () => {
        throw new Error("Cache read error");
      },
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=test-project");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to generate briefing");
  });

  test("handles URL-encoded project names", async () => {
    const generator = makeMockBriefingGenerator({
      getCachedBriefing: async (projectName: string) => ({
        briefing: `Briefing for ${projectName}`,
        generatedAt: new Date().toISOString(),
        cached: true,
      }),
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=my%20project");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("my project");
  });

  test("returns application/json content type", async () => {
    const app = makeTestApp(makeMockBriefingGenerator());

    const res = await app.request("/coordination/review/briefing/read?projectName=test-project");

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
