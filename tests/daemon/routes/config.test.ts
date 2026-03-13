import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { AppConfig } from "@/lib/types";

// -- Test fixtures --

let tmpDir: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-routes-"));
  guildHallHome = path.join(tmpDir, "guild-hall-home");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(): AppConfig {
  return {
    projects: [
      { name: "project-alpha", path: "/path/to/alpha", description: "Alpha project" },
      { name: "project-beta", path: "/path/to/beta", repoUrl: "https://github.com/test/beta" },
    ],
    maxConcurrentCommissions: 3,
    settings: { theme: "dark" },
  };
}

function makeTestApp(config?: AppConfig) {
  const cfg = config ?? makeConfig();
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    config: cfg,
    configRoutes: {
      config: cfg,
      guildHallHome,
    },
  });
}

// -- Tests: GET /config --

describe("GET /config", () => {
  test("returns the full application config", async () => {
    const app = makeTestApp();
    const res = await app.request("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(2);
    expect(body.projects[0].name).toBe("project-alpha");
    expect(body.projects[1].name).toBe("project-beta");
    expect(body.maxConcurrentCommissions).toBe(3);
    expect(body.settings).toEqual({ theme: "dark" });
  });

  test("content-type is application/json", async () => {
    const app = makeTestApp();
    const res = await app.request("/config");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("returns empty projects array for minimal config", async () => {
    const app = makeTestApp({ projects: [] });
    const res = await app.request("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toEqual([]);
  });

  test("includes model definitions when present", async () => {
    const config: AppConfig = {
      projects: [],
      models: [
        { name: "local-llama", modelId: "llama-3", baseUrl: "http://localhost:11434" },
      ],
    };
    const app = makeTestApp(config);
    const res = await app.request("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toHaveLength(1);
    expect(body.models[0].name).toBe("local-llama");
  });
});

// -- Tests: GET /config/projects/:name --

describe("GET /config/projects/:name", () => {
  test("returns project config for a known project", async () => {
    const app = makeTestApp();
    const res = await app.request("/config/projects/project-alpha");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("project-alpha");
    expect(body.path).toBe("/path/to/alpha");
    expect(body.description).toBe("Alpha project");
  });

  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/config/projects/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns project with optional fields", async () => {
    const app = makeTestApp();
    const res = await app.request("/config/projects/project-beta");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("project-beta");
    expect(body.repoUrl).toBe("https://github.com/test/beta");
  });
});

// -- Tests: GET /projects/:name/dependency-graph --

describe("GET /projects/:name/dependency-graph", () => {
  test("returns 404 for unknown project", async () => {
    const app = makeTestApp();
    const res = await app.request("/projects/nonexistent/dependency-graph");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent");
  });

  test("returns empty graph when no commissions exist", async () => {
    // Set up a project that resolves to an existing directory
    const projectDir = path.join(guildHallHome, "projects", "project-alpha");
    await fs.mkdir(path.join(projectDir, ".lore", "commissions"), { recursive: true });

    const app = makeTestApp();
    const res = await app.request("/projects/project-alpha/dependency-graph");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
  });

  test("returns graph with nodes and edges for commissions with dependencies", async () => {
    const projectDir = path.join(guildHallHome, "projects", "project-alpha");
    const commissionsDir = path.join(projectDir, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    await fs.writeFile(
      path.join(commissionsDir, "commission-A-20260313-100000.md"),
      `---
title: Commission A
status: completed
worker: Worker
prompt: First
date: 2026-03-13
dependencies: []
---
`,
      "utf-8",
    );

    await fs.writeFile(
      path.join(commissionsDir, "commission-B-20260313-110000.md"),
      `---
title: Commission B
status: pending
worker: Worker
prompt: Second
date: 2026-03-13
dependencies:
  - commissions/commission-A-20260313-100000.md
---
`,
      "utf-8",
    );

    const app = makeTestApp();
    const res = await app.request("/projects/project-alpha/dependency-graph");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.nodes).toHaveLength(2);
    const nodeIds = (body.nodes as Array<{ id: string }>).map((n) => n.id);
    expect(nodeIds).toContain("commission-A-20260313-100000");
    expect(nodeIds).toContain("commission-B-20260313-110000");

    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].from).toBe("commission-A-20260313-100000");
    expect(body.edges[0].to).toBe("commission-B-20260313-110000");
  });

  test("returns graph with no edges for independent commissions", async () => {
    const projectDir = path.join(guildHallHome, "projects", "project-alpha");
    const commissionsDir = path.join(projectDir, ".lore", "commissions");
    await fs.mkdir(commissionsDir, { recursive: true });

    await fs.writeFile(
      path.join(commissionsDir, "commission-X-20260313-100000.md"),
      `---
title: Independent X
status: pending
worker: Worker
prompt: Something
date: 2026-03-13
---
`,
      "utf-8",
    );

    const app = makeTestApp();
    const res = await app.request("/projects/project-alpha/dependency-graph");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toHaveLength(1);
    expect(body.edges).toEqual([]);
  });
});
