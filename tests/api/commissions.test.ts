import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { NextRequest } from "next/server";
import { POST as createPOST } from "@/app/api/commissions/route";
import {
  PUT as updatePUT,
  DELETE as cancelDELETE,
} from "@/app/api/commissions/[commissionId]/route";
import { POST as dispatchPOST } from "@/app/api/commissions/[commissionId]/dispatch/route";
import { POST as redispatchPOST } from "@/app/api/commissions/[commissionId]/redispatch/route";
import { POST as notePOST } from "@/app/api/commissions/[commissionId]/note/route";
import { GET as eventsGET } from "@/app/api/events/route";

/**
 * These routes are thin proxies to the daemon. We test the error path
 * (daemon offline) by pointing GUILD_HALL_HOME at a temp directory that
 * has no socket file, causing daemonFetch/daemonStreamAsync to return a
 * DaemonError and the routes to respond with 503.
 *
 * The happy path (daemon online) is covered by the daemon route tests in
 * tests/daemon/routes/commissions.test.ts, which test the daemon endpoints
 * directly via app.request() with injected dependencies.
 */

let tmpDir: string;
let savedGuildHallHome: string | undefined;

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePutRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "DELETE" });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function makeCommissionParams(
  commissionId: string,
): { params: Promise<{ commissionId: string }> } {
  return { params: Promise.resolve({ commissionId }) };
}

beforeEach(async () => {
  savedGuildHallHome = process.env.GUILD_HALL_HOME;
  tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gh-api-commissions-test-"),
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

describe("POST /api/commissions", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/commissions",
      {
        projectName: "test-project",
        title: "Test Commission",
        workerName: "scribe",
        prompt: "Do the thing",
      },
    );

    const response = await createPOST(request);

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/commissions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await createPOST(request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});

describe("PUT /api/commissions/[commissionId]", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePutRequest(
      "http://localhost:3000/api/commissions/commission-001",
      { prompt: "Updated prompt" },
    );

    const response = await updatePUT(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/commissions/commission-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await updatePUT(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});

describe("DELETE /api/commissions/[commissionId]", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makeDeleteRequest(
      "http://localhost:3000/api/commissions/commission-001",
    );

    const response = await cancelDELETE(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });
});

describe("POST /api/commissions/[commissionId]/dispatch", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/commissions/commission-001/dispatch",
      {},
    );

    const response = await dispatchPOST(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });
});

describe("POST /api/commissions/[commissionId]/redispatch", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/commissions/commission-001/redispatch",
      {},
    );

    const response = await redispatchPOST(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });
});

describe("POST /api/commissions/[commissionId]/note", () => {
  test("returns 503 when daemon is offline", async () => {
    const request = makePostRequest(
      "http://localhost:3000/api/commissions/commission-001/note",
      { content: "User note content" },
    );

    const response = await notePOST(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });

  test("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/commissions/commission-001/note",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    );

    const response = await notePOST(
      request,
      makeCommissionParams("commission-001"),
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Invalid JSON");
  });
});

describe("GET /api/events", () => {
  test("returns 503 when daemon is offline", async () => {
    // eventsGET doesn't take a request argument, but we need to suppress
    // the unused variable. The route handler signature is just GET().
    void makeGetRequest("http://localhost:3000/api/events");

    const response = await eventsGET();

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toBe("Daemon is not running");
  });
});
