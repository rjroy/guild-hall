import { describe, test, expect } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "@/daemon/app";
import type { DiscoveredPackage, WorkerMetadata, ToolboxMetadata } from "@/lib/types";

// -- Test fixtures --

function makeWorkerPackage(overrides: Partial<{
  name: string;
  path: string;
  workerName: string;
  displayTitle: string;
  description: string;
  portraitPath: string;
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

function makeTestApp(packages: DiscoveredPackage[] = []) {
  return createApp({
    health: {
      getMeetingCount: () => 0,
      getUptimeSeconds: () => 42,
    },
    packages,
  });
}

// -- Tests --

describe("GET /workers", () => {
  test("returns discovered workers with metadata", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        workerName: "Researcher",
        displayTitle: "Research Scholar",
        description: "Explores codebases",
      }),
    ]);

    const res = await app.request("/workers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0]).toEqual({
      name: "guild-hall-test-assistant",
      displayName: "Researcher",
      displayTitle: "Research Scholar",
      description: "Explores codebases",
      portraitUrl: null,
    });
  });

  test("returns empty array when no workers exist", async () => {
    const app = makeTestApp([]);

    const res = await app.request("/workers");

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

    const res = await app.request("/workers");

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

    const res = await app.request("/workers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0].name).toBe("guild-hall-test-assistant");
  });

  test("includes portrait as base64 data URI when file exists", async () => {
    // Create a temp directory with a portrait file
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "worker-portrait-test-"),
    );

    try {
      // Create a minimal 1x1 PNG (smallest valid PNG: 67 bytes)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // RGB, etc
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed
        0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // data
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      await fs.writeFile(path.join(tmpDir, "portrait.png"), pngHeader);

      const app = makeTestApp([
        makeWorkerPackage({
          path: tmpDir,
          portraitPath: "portrait.png",
        }),
      ]);

      const res = await app.request("/workers");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.workers[0].portraitUrl).toMatch(
        /^data:image\/png;base64,.+$/,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns null portrait when file does not exist", async () => {
    const app = makeTestApp([
      makeWorkerPackage({
        path: "/nonexistent/path",
        portraitPath: "missing-portrait.png",
      }),
    ]);

    const res = await app.request("/workers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers[0].portraitUrl).toBeNull();
  });

  test("returns null portrait for unsupported file formats", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "worker-portrait-unsupported-"),
    );

    try {
      await fs.writeFile(path.join(tmpDir, "portrait.bmp"), "fake bmp data");

      const app = makeTestApp([
        makeWorkerPackage({
          path: tmpDir,
          portraitPath: "portrait.bmp",
        }),
      ]);

      const res = await app.request("/workers");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.workers[0].portraitUrl).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns application/json content type", async () => {
    const app = makeTestApp([]);

    const res = await app.request("/workers");

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

    const res = await app.request("/workers");

    const body = await res.json();
    const worker = body.workers[0];
    expect(worker).toHaveProperty("name", "guild-hall-test-assistant");
    expect(worker).toHaveProperty("displayName", "CodeReviewer");
    expect(worker).toHaveProperty("displayTitle", "The Code Reviewer");
    expect(worker).toHaveProperty("description", "Reviews pull requests with care");
    expect(worker).toHaveProperty("portraitUrl");
  });
});
