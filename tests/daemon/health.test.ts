import { describe, test, expect } from "bun:test";
import { createApp } from "@/daemon/app";

function makeTestApp(overrides?: {
  meetingCount?: number;
  uptimeSeconds?: number;
}) {
  return createApp({
    health: {
      getMeetingCount: () => overrides?.meetingCount ?? 0,
      getUptimeSeconds: () => overrides?.uptimeSeconds ?? 42,
    },
  });
}

describe("GET /health", () => {
  test("returns status ok with meetings and uptime", async () => {
    const app = makeTestApp({ meetingCount: 0, uptimeSeconds: 42 });
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "ok",
      meetings: 0,
      uptime: 42,
    });
  });

  test("reflects injected meeting count", async () => {
    const app = makeTestApp({ meetingCount: 3, uptimeSeconds: 100 });
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meetings).toBe(3);
    expect(body.uptime).toBe(100);
  });

  test("returns application/json content type", async () => {
    const app = makeTestApp();
    const res = await app.request("/health");

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("unknown routes", () => {
  test("returns 404 for unregistered paths", async () => {
    const app = makeTestApp();
    const res = await app.request("/nonexistent");

    expect(res.status).toBe(404);
  });
});
