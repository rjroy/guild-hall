import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

/**
 * Integration tests for the mockup proxy route at web/app/api/artifacts/mockup/route.ts.
 *
 * These tests spin up a lightweight HTTP server that mimics daemon responses,
 * set GUILD_HALL_HOME so daemonFetchBinary discovers it via a port file,
 * then call the route handler's GET function directly.
 */

let tmpDir: string;
let mockServer: http.Server;
let mockServerPort: number;
let originalGuildHallHome: string | undefined;

// Track what the mock server should respond with per-test
let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mockup-proxy-test-"));
  originalGuildHallHome = process.env.GUILD_HALL_HOME;

  // Start mock server
  mockServer = http.createServer((req, res) => {
    mockHandler(req, res);
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = mockServer.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to get server address");
  mockServerPort = addr.port;

  // Write port file so discoverTransport finds it
  await fs.writeFile(path.join(tmpDir, "guild-hall.port"), String(mockServerPort), "utf-8");

  // Point GUILD_HALL_HOME to our temp dir
  process.env.GUILD_HALL_HOME = tmpDir;
});

afterAll(async () => {
  if (originalGuildHallHome !== undefined) {
    process.env.GUILD_HALL_HOME = originalGuildHallHome;
  } else {
    delete process.env.GUILD_HALL_HOME;
  }
  mockServer?.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  // Reset handler to avoid leaking between tests
  mockHandler = (_req, res) => {
    res.writeHead(500);
    res.end("No handler set");
  };
});

// Import the route handler. This must come after env setup, but ES imports are
// hoisted. Since the daemon client reads GUILD_HALL_HOME at call time (not import
// time), this is safe.
import { GET } from "@/web/app/api/artifacts/mockup/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/artifacts/mockup");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GET /api/artifacts/mockup", () => {
  test("returns 400 for missing project param", async () => {
    const res = await GET(makeRequest({ path: "test.html" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  test("returns 400 for missing path param", async () => {
    const res = await GET(makeRequest({ project: "test-project" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  test("forwards 200 response with body and security headers", async () => {
    const htmlContent = "<html><body>Hello</body></html>";
    mockHandler = (_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; connect-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cache-Control": "no-cache",
      });
      res.end(htmlContent);
    };

    const res = await GET(makeRequest({ project: "test-project", path: "generated/page.html" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    const body = await res.text();
    expect(body).toBe(htmlContent);
  });

  test("forwards 404 status from daemon", async () => {
    mockHandler = (_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Mockup not found" }));
    };

    const res = await GET(makeRequest({ project: "test-project", path: "missing.html" }));
    expect(res.status).toBe(404);
  });

  test("forwards 415 status from daemon", async () => {
    mockHandler = (_req, res) => {
      res.writeHead(415, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported mockup type" }));
    };

    const res = await GET(makeRequest({ project: "test-project", path: "file.htm" }));
    expect(res.status).toBe(415);
  });

  test("returns 503 when daemon is offline", async () => {
    // Close the server temporarily to simulate daemon offline
    const savedPort = mockServerPort;
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));

    // Write a port file pointing to a port nothing is listening on
    await fs.writeFile(path.join(tmpDir, "guild-hall.port"), String(savedPort + 10000), "utf-8");

    const res = await GET(makeRequest({ project: "test-project", path: "page.html" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Daemon");

    // Restart server for remaining tests
    mockServer = http.createServer((req, res) => {
      mockHandler(req, res);
    });
    await new Promise<void>((resolve) => {
      mockServer.listen(savedPort, "127.0.0.1", () => resolve());
    });
    await fs.writeFile(path.join(tmpDir, "guild-hall.port"), String(savedPort), "utf-8");
  });
});
