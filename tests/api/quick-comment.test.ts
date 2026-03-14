import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { POST } from "@/web/app/api/meetings/[meetingId]/quick-comment/route";

/**
 * Tests for the quick-comment compound API route.
 *
 * This route reads meeting metadata from the daemon, creates a commission
 * via the daemon, then declines the meeting. We test:
 *
 * - Input validation (invalid JSON, missing fields) — handled before daemon calls
 * - Daemon offline (503) — when all required fields are present, the first
 *   daemon call (meeting read) fails
 *
 * Tests that verify meeting metadata parsing, worker extraction, commission
 * creation, and decline behavior are covered by the daemon route tests
 * (tests/daemon/routes/meetings.test.ts and tests/daemon/routes/commissions.test.ts)
 * since this route is now a pure compound orchestration of daemon endpoints.
 */

let tmpDir: string;
let savedGuildHallHome: string | undefined;

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;
  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gh-api-quick-comment-test-"),
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

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(meetingId: string): {
  params: Promise<{ meetingId: string }>;
} {
  return { params: Promise.resolve({ meetingId }) };
}

describe("POST /api/meetings/[meetingId]/quick-comment", () => {
  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });

  test("returns 400 when projectName is missing", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { prompt: "Do the thing" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe(
      "Missing required fields: projectName, prompt",
    );
  });

  test("returns 400 when prompt is missing", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { projectName: "test-project" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe(
      "Missing required fields: projectName, prompt",
    );
  });

  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/quick-comment",
      { projectName: "test-project", prompt: "Write the implementation" },
    );

    const response = await POST(request, makeParams("meeting-001"));

    // The first daemon call (meeting read) fails, so we get 503
    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });
});
