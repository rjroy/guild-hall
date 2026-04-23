import { describe, test, expect } from "bun:test";
import { createApp } from "@/apps/daemon/app";
import type { AppConfig } from "@/lib/types";

function makeTestApp(config: AppConfig) {
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    config,
  }).app;
}

describe("GET /system/models/catalog/list", () => {
  test("returns built-in models", async () => {
    const app = makeTestApp({ projects: [] });

    const res = await app.request("/system/models/catalog/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.builtin).toEqual([
      { name: "opus" },
      { name: "sonnet" },
      { name: "haiku" },
    ]);
  });

  test("returns empty local array when no local models configured", async () => {
    const app = makeTestApp({ projects: [] });

    const res = await app.request("/system/models/catalog/list");

    const body = await res.json();
    expect(body.local).toEqual([]);
  });

  test("returns local models with reachability info", async () => {
    const config: AppConfig = {
      projects: [],
      models: [
        {
          name: "llama3",
          modelId: "llama3",
          baseUrl: "http://127.0.0.1:19999",
        },
      ],
    };
    const app = makeTestApp(config);

    const res = await app.request("/system/models/catalog/list");

    const body = await res.json();
    expect(body.local).toHaveLength(1);
    expect(body.local[0].name).toBe("llama3");
    expect(body.local[0].modelId).toBe("llama3");
    expect(body.local[0].baseUrl).toBe("http://127.0.0.1:19999");
    // Unreachable server shows reachable=false
    expect(body.local[0].reachable).toBe(false);
  });

  test("returns application/json content type", async () => {
    const app = makeTestApp({ projects: [] });

    const res = await app.request("/system/models/catalog/list");

    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("route not mounted when config not provided", async () => {
    const { app } = createApp({
      health: {
        getMeetingCount: () => 0,
        getUptimeSeconds: () => 42,
      },
    });

    const res = await app.request("/system/models/catalog/list");
    expect(res.status).toBe(404);
  });
});
