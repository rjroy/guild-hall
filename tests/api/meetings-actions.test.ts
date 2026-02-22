import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { POST as acceptPOST } from "@/app/api/meetings/[meetingId]/accept/route";
import { POST as declinePOST } from "@/app/api/meetings/[meetingId]/decline/route";
import { POST as deferPOST } from "@/app/api/meetings/[meetingId]/defer/route";

/**
 * These routes are thin proxies to the daemon. We test the error path
 * (daemon offline) by pointing GUILD_HALL_HOME at a temp directory that
 * has no socket file, causing daemonFetch/daemonStreamAsync to return a
 * DaemonError and the routes to respond with 503.
 *
 * The happy path (daemon online) is covered by the daemon route tests in
 * tests/daemon/routes/meetings.test.ts, which test the daemon endpoints
 * directly via app.request() with injected dependencies.
 */

let tmpDir: string;
let savedGuildHallHome: string | undefined;

/**
 * Makes a NextRequest with a JSON body for a POST endpoint.
 */
function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Simulates the Next.js dynamic params shape used by meetingId routes.
 */
function makeParams(meetingId: string): { params: Promise<{ meetingId: string }> } {
  return { params: Promise.resolve({ meetingId }) };
}

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-api-actions-test-"));
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

describe("POST /api/meetings/[meetingId]/accept", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/accept",
      { projectName: "test-project" },
    );

    const response = await acceptPOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(503);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/meetings/meeting-001/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await acceptPOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});

describe("POST /api/meetings/[meetingId]/decline", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/decline",
      { projectName: "test-project" },
    );

    const response = await declinePOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(503);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/meetings/meeting-001/decline",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await declinePOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});

describe("POST /api/meetings/[meetingId]/defer", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/meetings/meeting-001/defer",
      { projectName: "test-project", deferredUntil: "2026-03-15" },
    );

    const response = await deferPOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(503);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/meetings/meeting-001/defer",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await deferPOST(request, makeParams("meeting-001"));

    expect(response.status).toBe(400);
    const data = await response.json() as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});
