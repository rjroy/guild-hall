import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getSocketPath,
  isDaemonError,
  daemonFetch,
  daemonHealth,
  daemonStreamAsync,
  type DaemonError,
} from "@/lib/daemon-client";

let tmpDirs: string[] = [];
let servers: Array<{ stop: () => void }> = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-dclient-test-"));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Starts a Hono app on a Unix socket in a temp directory.
 * Returns the socket path and a stop function.
 */
function serveOnSocket(app: Hono): { socketPath: string; stop: () => void } {
  const tmp = makeTmpDir();
  const socketPath = path.join(tmp, "test.sock");

  const server = Bun.serve({
    unix: socketPath,
    fetch: app.fetch,
  });

  const stopFn = {
    stop: () => {
      void server.stop();
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Already cleaned up
      }
    },
  };
  servers.push(stopFn);

  return { socketPath, stop: stopFn.stop };
}

afterEach(() => {
  for (const s of servers) {
    try {
      s.stop();
    } catch {
      // Already stopped
    }
  }
  servers = [];

  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// -- getSocketPath --

describe("getSocketPath", () => {
  test("returns socket path under given home", () => {
    const result = getSocketPath("/tmp/test-home");
    expect(result).toBe("/tmp/test-home/guild-hall.sock");
  });

  test("uses default guild-hall home when no override", () => {
    const result = getSocketPath();
    expect(result).toEndWith(".guild-hall/guild-hall.sock");
  });
});

// -- isDaemonError --

describe("isDaemonError", () => {
  test("returns true for valid DaemonError objects", () => {
    const err: DaemonError = {
      type: "daemon_offline",
      message: "Daemon is not running",
    };
    expect(isDaemonError(err)).toBe(true);
  });

  test("returns true for socket_not_found", () => {
    expect(
      isDaemonError({ type: "socket_not_found", message: "not found" }),
    ).toBe(true);
  });

  test("returns true for request_failed", () => {
    expect(
      isDaemonError({ type: "request_failed", message: "something broke" }),
    ).toBe(true);
  });

  test("returns false for Response objects", () => {
    expect(isDaemonError(new Response("ok"))).toBe(false);
  });

  test("returns false for null", () => {
    expect(isDaemonError(null)).toBe(false);
  });

  test("returns false for arbitrary objects", () => {
    expect(isDaemonError({ type: "unknown", message: "nope" })).toBe(false);
  });
});

// -- daemonFetch with real server --

describe("daemonFetch", () => {
  test("returns Response from a real Hono server on a socket", async () => {
    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "ok", meetings: 0, uptime: 1 }));

    const { socketPath } = serveOnSocket(app);

    const result = await daemonFetch("/health", undefined, socketPath);
    expect(isDaemonError(result)).toBe(false);

    const res = result as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", meetings: 0, uptime: 1 });
  });

  test("sends POST body correctly", async () => {
    const app = new Hono();
    let receivedBody: unknown = null;
    app.post("/meetings", async (c) => {
      receivedBody = await c.req.json();
      return c.json({ created: true });
    });

    const { socketPath } = serveOnSocket(app);

    const payload = JSON.stringify({ projectName: "test", prompt: "hello" });
    const result = await daemonFetch(
      "/meetings",
      { method: "POST", body: payload },
      socketPath,
    );

    expect(isDaemonError(result)).toBe(false);
    const res = result as Response;
    expect(res.status).toBe(200);
    expect(receivedBody).toEqual({ projectName: "test", prompt: "hello" });
  });

  test("returns daemon_offline when socket exists but no server", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "dead.sock");
    // Create a regular file, not a real socket. node:http will try to connect
    // and get ECONNREFUSED or similar.
    fs.writeFileSync(socketPath, "");

    const result = await daemonFetch("/health", undefined, socketPath);
    expect(isDaemonError(result)).toBe(true);

    const err = result as DaemonError;
    // The exact error depends on the OS, but it should be one of our classified types
    expect(["daemon_offline", "request_failed"]).toContain(err.type);
  });

  test("returns a DaemonError when socket does not exist", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const result = await daemonFetch("/health", undefined, socketPath);
    expect(isDaemonError(result)).toBe(true);

    const err = result as DaemonError;
    // The exact error type depends on the runtime. Node gives ENOENT
    // (socket_not_found), but Bun may classify it differently.
    expect(["socket_not_found", "request_failed"]).toContain(err.type);
  });

  test("forwards non-200 status codes from daemon", async () => {
    const app = new Hono();
    app.delete("/meetings/:id", (c) =>
      c.json({ error: "Meeting not found" }, 404),
    );

    const { socketPath } = serveOnSocket(app);

    const result = await daemonFetch(
      "/meetings/unknown-id",
      { method: "DELETE" },
      socketPath,
    );
    expect(isDaemonError(result)).toBe(false);

    const res = result as Response;
    expect(res.status).toBe(404);
  });
});

// -- daemonHealth --

describe("daemonHealth", () => {
  test("returns health data from running daemon", async () => {
    const app = new Hono();
    app.get("/health", (c) =>
      c.json({ status: "ok", meetings: 2, uptime: 300 }),
    );

    const { socketPath } = serveOnSocket(app);

    const health = await daemonHealth(socketPath);
    expect(health).toEqual({ status: "ok", meetings: 2, uptime: 300 });
  });

  test("returns null when daemon is not running", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const health = await daemonHealth(socketPath);
    expect(health).toBeNull();
  });
});

// -- daemonStreamAsync --

describe("daemonStreamAsync", () => {
  test("returns a readable stream from an SSE endpoint", async () => {
    const app = new Hono();
    app.post("/meetings", (c) =>
      streamSSE(c, async (stream) => {
        await stream.writeSSE({
          data: JSON.stringify({ type: "session", meetingId: "m-1" }),
        });
        await stream.writeSSE({
          data: JSON.stringify({ type: "text_delta", text: "Hello" }),
        });
        await stream.writeSSE({
          data: JSON.stringify({ type: "turn_end" }),
        });
      }),
    );

    const { socketPath } = serveOnSocket(app);

    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify({ projectName: "test", workerName: "w", prompt: "hi" }),
      socketPath,
    );

    expect(isDaemonError(result)).toBe(false);
    const stream = result as ReadableStream<Uint8Array>;

    // Read all chunks from the stream
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    const text = chunks.join("");
    // Should contain our three SSE events
    expect(text).toContain('"type":"session"');
    expect(text).toContain('"type":"text_delta"');
    expect(text).toContain('"type":"turn_end"');
  });

  test("returns DaemonError when socket does not exist", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify({ projectName: "test" }),
      socketPath,
    );

    expect(isDaemonError(result)).toBe(true);
    const err = result as DaemonError;
    // The exact error type depends on the runtime (see daemonFetch test)
    expect(["socket_not_found", "request_failed"]).toContain(err.type);
  });

  test("forwards request body to daemon SSE endpoint", async () => {
    const app = new Hono();
    let receivedBody: unknown = null;
    app.post("/meetings", async (c) => {
      receivedBody = await c.req.json();
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "turn_end" }) });
      });
    });

    const { socketPath } = serveOnSocket(app);

    const payload = { projectName: "my-project", workerName: "w", prompt: "go" };
    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify(payload),
      socketPath,
    );

    expect(isDaemonError(result)).toBe(false);

    // Drain the stream so the request completes
    const reader = (result as ReadableStream<Uint8Array>).getReader();
    while (!(await reader.read()).done) {
      // drain
    }

    expect(receivedBody).toEqual(payload);
  });
});
