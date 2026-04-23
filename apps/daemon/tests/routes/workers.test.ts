import { describe, test, expect } from "bun:test";
import { createApp } from "@/apps/daemon/app";
import type { AppConfig, DiscoveredPackage, WorkerMetadata, ToolboxMetadata } from "@/lib/types";

// -- Test fixtures --

function makeWorkerPackage(overrides: Partial<{
  name: string;
  path: string;
  workerName: string;
  displayTitle: string;
  description: string;
  portraitPath: string;
  model: string;
}> = {}): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: overrides.workerName ?? "Assistant",
      description: overrides.description ?? "A test assistant",
      displayTitle: overrides.displayTitle ?? "Guild Assistant",
      portraitPath: overrides.portraitPath,
    },
    posture: "You are helpful.",
    model: overrides.model,
    domainToolboxes: [],
    builtInTools: ["Read"],
    checkoutScope: "sparse",
  };

  return {
    name: overrides.name ?? "guild-hall-test-assistant",
    path: overrides.path ?? "/packages/test-assistant",
    metadata,
  };
}

function makeToolboxPackage(): DiscoveredPackage {
  const metadata: ToolboxMetadata = {
    type: "toolbox",
    name: "research-tools",
    description: "Research toolbox",
  };
  return {
    name: "guild-hall-research-tools",
    path: "/packages/research-tools",
    metadata,
  };
}

function makeTestApp(packages: DiscoveredPackage[] = [], config?: AppConfig) {
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    packages,
    config,
  }).app;
}

// -- Tests --

describe("GET /system/packages/worker/list", () => {
  test("returns discovered workers with metadata", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        workerName: "Researcher",
        displayTitle: "Research Scholar",
        description: "Explores codebases",
      }),
    ]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0]).toEqual({
      name: "guild-hall-test-assistant",
      displayName: "Researcher",
      displayTitle: "Research Scholar",
      description: "Explores codebases",
      portraitUrl: null,
      model: null,
    });
  });

  test("returns empty array when no workers exist", async () => {
    const app = makeTestApp([]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toEqual([]);
  });

  test("returns multiple workers", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        name: "pkg-a",
        workerName: "Alpha",
        displayTitle: "Alpha Worker",
        description: "First worker",
      }),
      makeWorkerPackage({
        name: "pkg-b",
        workerName: "Beta",
        displayTitle: "Beta Worker",
        description: "Second worker",
      }),
    ]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(2);
    expect(body.workers[0].name).toBe("pkg-a");
    expect(body.workers[0].displayName).toBe("Alpha");
    expect(body.workers[1].name).toBe("pkg-b");
    expect(body.workers[1].displayName).toBe("Beta");
  });

  test("filters out toolbox-only packages", async () => {
    const app = makeTestApp([
      makeWorkerPackage({ workerName: "Assistant" }),
      makeToolboxPackage(),
    ]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0].name).toBe("guild-hall-test-assistant");
  });

  test("includes portrait as base64 data URI when file exists", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        portraitPath: "/images/portraits/test-worker.webp",
      }),
    ]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers[0].portraitUrl).toBe("/images/portraits/test-worker.webp");
  });

  test("returns null portrait when portraitPath is not set", async () => {
    const app = makeTestApp([
      makeWorkerPackage({}),
    ]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers[0].portraitUrl).toBeNull();
  });

  test("returns application/json content type", async () => {
    const app = makeTestApp([]);

    const res = await app.request("/system/packages/worker/list");

    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("worker metadata includes name, displayTitle, and description", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        workerName: "CodeReviewer",
        displayTitle: "The Code Reviewer",
        description: "Reviews pull requests with care",
      }),
    ]);

    const res = await app.request("/system/packages/worker/list");

    const body = await res.json();
    const worker = body.workers[0];
    expect(worker).toHaveProperty("name", "guild-hall-test-assistant");
    expect(worker).toHaveProperty("displayName", "CodeReviewer");
    expect(worker).toHaveProperty("displayTitle", "The Code Reviewer");
    expect(worker).toHaveProperty("description", "Reviews pull requests with care");
    expect(worker).toHaveProperty("portraitUrl");
  });

  test("worker with built-in model shows model info with isLocal=false", async () => {
    const app = makeTestApp([
      makeWorkerPackage({ model: "sonnet" }),
    ]);

    const res = await app.request("/system/packages/worker/list");
    const body = await res.json();
    expect(body.workers[0].model).toEqual({
      name: "sonnet",
      isLocal: false,
    });
  });

  test("worker with local model shows model info with isLocal=true and baseUrl", async () => {
    const config: AppConfig = {
      projects: [],
      models: [
        { name: "llama3", modelId: "llama3", baseUrl: "http://localhost:11434" },
      ],
    };
    const app = makeTestApp([
      makeWorkerPackage({ model: "llama3" }),
    ], config);

    const res = await app.request("/system/packages/worker/list");
    const body = await res.json();
    expect(body.workers[0].model).toEqual({
      name: "llama3",
      isLocal: true,
      baseUrl: "http://localhost:11434",
    });
  });

  test("worker with no model shows null model", async () => {
    const app = makeTestApp([
      makeWorkerPackage({}),
    ]);

    const res = await app.request("/system/packages/worker/list");
    const body = await res.json();
    expect(body.workers[0].model).toBeNull();
  });
});
