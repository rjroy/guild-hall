/* eslint-disable @typescript-eslint/require-await */

import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";

// -- Helpers --

type BriefingGenerator = ReturnType<typeof createBriefingGenerator>;

function makeMockBriefingGenerator(overrides: Partial<BriefingGenerator> = {}): BriefingGenerator {
  return {
    generateBriefing: async (projectName: string) => ({
      briefing: `Briefing for ${projectName}: all systems operational.`,
      generatedAt: new Date().toISOString(),
      cached: false,
    }),
    invalidateCache: async () => {},
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
  });
}

// -- Tests --

describe("GET /coordination/review/briefing/read", () => {
  test("returns briefing with metadata", async () => {
    const app = makeTestApp(makeMockBriefingGenerator());

    const res = await app.request("/coordination/review/briefing/read?projectName=my-project");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("my-project");
    expect(body.briefing).toContain("all systems operational");
    expect(body.generatedAt).toBeTruthy();
    expect(typeof body.cached).toBe("boolean");
  });

  test("returns cached briefing when generator cache hits", async () => {
    const generator = makeMockBriefingGenerator({
      generateBriefing: async () => ({
        briefing: "Cached briefing text.",
        generatedAt: "2026-02-23T12:00:00.000Z",
        cached: true,
      }),
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=test-project");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toBe("Cached briefing text.");
    expect(body.cached).toBe(true);
  });

  test("returns 200 with error message for unknown project", async () => {
    // The briefing generator returns a not-found message (not an HTTP error),
    // because the project might have been removed after the page loaded.
    const generator = makeMockBriefingGenerator({
      generateBriefing: async (projectName: string) => ({
        briefing: `Project "${projectName}" not found.`,
        generatedAt: new Date().toISOString(),
        cached: false,
      }),
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=nonexistent");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.briefing).toContain("not found");
  });

  test("returns 500 when generator throws", async () => {
    const generator = makeMockBriefingGenerator({
      generateBriefing: async () => {
        throw new Error("Unexpected failure");
      },
    });
    const app = makeTestApp(generator);

    const res = await app.request("/coordination/review/briefing/read?projectName=test-project");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to generate briefing");
  });

  test("handles URL-encoded project names", async () => {
    const generator = makeMockBriefingGenerator();
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
