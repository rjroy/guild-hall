import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PUT } from "@/web/app/api/artifacts/route";
import { NextRequest } from "next/server";

/**
 * Tests for the PUT /api/artifacts web API route.
 *
 * This route is a pure proxy to the daemon's POST /artifacts endpoint.
 * We test:
 * - Input validation (invalid JSON, missing fields) — handled before daemon call
 * - Daemon offline (503) — when all required fields are present
 *
 * The actual write, git commit, and dependency check behavior is tested
 * in apps/daemon/tests/routes/artifacts.test.ts.
 */

let tmpDir: string;
let savedGuildHallHome: string | undefined;

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;
  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gh-api-artifacts-test-"),
  );
  // Point at a directory with no socket file so daemon calls fail with ENOENT
  process.env.GUILD_HALL_HOME = tmpDir;
});

afterEach(async () => {
  if (savedGuildHallHome === undefined) {
    delete process.env.GUILD_HALL_HOME;
  } else {
    process.env.GUILD_HALL_HOME = savedGuildHallHome;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/artifacts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/artifacts", () => {
  test("returns 400 for invalid JSON", async () => {
    const request = new NextRequest("http://localhost:3000/api/artifacts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });

  test("returns 400 for missing projectName", async () => {
    const request = makePutRequest({
      artifactPath: "specs/test.md",
      content: "body",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("returns 400 for missing artifactPath", async () => {
    const request = makePutRequest({
      projectName: "test-project",
      content: "body",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  test("returns 400 for missing content", async () => {
    const request = makePutRequest({
      projectName: "test-project",
      artifactPath: "specs/test.md",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  test("returns 503 when daemon is offline", async () => {
    const request = makePutRequest({
      projectName: "test-project",
      artifactPath: "specs/test.md",
      content: "---\ntitle: Test\n---\nBody.",
    });

    const response = await PUT(request);
    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data.error).toBe("Daemon is not running");
  });
});
