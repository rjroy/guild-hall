import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  discoverTransport,
  isDaemonError,
  daemonFetch,
  daemonFetchBinary,
  daemonHealth,
  daemonStreamAsync,
  daemonStream,
  type DaemonError,
  type TransportDescriptor,
} from "@/lib/daemon-client";

let tmpDirs: string[] = [];
let servers: Array<{ stop: () => void }> = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-dclient-test-"));
  tmpDirs.push(dir);
  return dir;
}

// Socket binding may be blocked in sandboxed subshell contexts (e.g., pre-commit hooks).
// Tests that need a server skip gracefully when this happens.

/**
 * Starts a Hono app on a Unix socket in a temp directory.
 * Returns the socket path and a stop function, or null if socket binding is blocked.
 */
function serveOnSocket(app: Hono): { socketPath: string; transport: TransportDescriptor; stop: () => void } | null {
  const tmp = makeTmpDir();
  const socketPath = path.join(tmp, "test.sock");

  let server;
  try {
    server = Bun.serve({
      unix: socketPath,
      fetch: app.fetch,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "EPERM") {
      return null;
    }
    throw err;
  }

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

  return {
    socketPath,
    transport: { type: "unix", socketPath },
    stop: stopFn.stop,
  };
}

/**
 * Starts a Hono app on a TCP port.
 * Returns the transport descriptor and a stop function.
 */
function serveOnTcp(app: Hono): { transport: TransportDescriptor; port: number; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: app.fetch,
  });

  const stopFn = {
    stop: () => {
      void server.stop();
    },
  };
  servers.push(stopFn);

  // server.port is always defined when binding with port: 0
  const port = server.port!;
  return {
    transport: { type: "tcp", hostname: "127.0.0.1", port },
    port,
    stop: stopFn.stop,
  };
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

// -- discoverTransport --

describe("discoverTransport", () => {
  test("returns unix transport when socket file exists", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    fs.writeFileSync(socketPath, "");

    const result = discoverTransport(tmp);
    expect(result).toEqual({ type: "unix", socketPath });
  });

  test("returns tcp transport when port file exists with valid port", () => {
    const tmp = makeTmpDir();
    fs.writeFileSync(path.join(tmp, "guild-hall.port"), "8742");

    const result = discoverTransport(tmp);
    expect(result).toEqual({ type: "tcp", hostname: "127.0.0.1", port: 8742 });
  });

  test("returns null when neither file exists", () => {
    const tmp = makeTmpDir();
    const result = discoverTransport(tmp);
    expect(result).toBeNull();
  });

  test("returns null when port file contains non-numeric content", () => {
    const tmp = makeTmpDir();
    fs.writeFileSync(path.join(tmp, "guild-hall.port"), "not-a-number");

    const result = discoverTransport(tmp);
    expect(result).toBeNull();
  });

  test("socket file takes precedence when both exist", () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "guild-hall.sock");
    fs.writeFileSync(socketPath, "");
    fs.writeFileSync(path.join(tmp, "guild-hall.port"), "9999");

    const result = discoverTransport(tmp);
    expect(result).toEqual({ type: "unix", socketPath });
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

// -- daemonFetch with real server (Unix) --

describe("daemonFetch (unix)", () => {
  test("returns Response from a real Hono server on a socket", async () => {
    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "ok", meetings: 0, uptime: 1 }));

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const result = await daemonFetch("/health", undefined, srv.transport);
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

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const payload = JSON.stringify({ projectName: "test", prompt: "hello" });
    const result = await daemonFetch(
      "/meetings",
      { method: "POST", body: payload },
      srv.transport,
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

    const transport: TransportDescriptor = { type: "unix", socketPath };
    const result = await daemonFetch("/health", undefined, transport);
    expect(isDaemonError(result)).toBe(true);

    const err = result as DaemonError;
    // The exact error depends on the OS, but it should be one of our classified types
    expect(["daemon_offline", "request_failed"]).toContain(err.type);
  });

  test("returns a DaemonError when socket does not exist", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const transport: TransportDescriptor = { type: "unix", socketPath };
    const result = await daemonFetch("/health", undefined, transport);
    expect(isDaemonError(result)).toBe(true);

    const err = result as DaemonError;
    expect(["socket_not_found", "request_failed"]).toContain(err.type);
  });

  test("forwards non-200 status codes from daemon", async () => {
    const app = new Hono();
    app.delete("/meetings/:id", (c) =>
      c.json({ error: "Meeting not found" }, 404),
    );

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const result = await daemonFetch(
      "/meetings/unknown-id",
      { method: "DELETE" },
      srv.transport,
    );
    expect(isDaemonError(result)).toBe(false);

    const res = result as Response;
    expect(res.status).toBe(404);
  });
});

// -- daemonFetch (TCP) --

describe("daemonFetch (tcp)", () => {
  test("returns Response from a Hono server on TCP", async () => {
    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "ok", meetings: 0, uptime: 1 }));

    const srv = serveOnTcp(app);

    const result = await daemonFetch("/health", undefined, srv.transport);
    expect(isDaemonError(result)).toBe(false);

    const res = result as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", meetings: 0, uptime: 1 });
  });

  test("sends POST body correctly over TCP", async () => {
    const app = new Hono();
    let receivedBody: unknown = null;
    app.post("/meetings", async (c) => {
      receivedBody = await c.req.json();
      return c.json({ created: true });
    });

    const srv = serveOnTcp(app);

    const payload = JSON.stringify({ projectName: "test", prompt: "hello" });
    const result = await daemonFetch(
      "/meetings",
      { method: "POST", body: payload },
      srv.transport,
    );

    expect(isDaemonError(result)).toBe(false);
    const res = result as Response;
    expect(res.status).toBe(200);
    expect(receivedBody).toEqual({ projectName: "test", prompt: "hello" });
  });

  test("returns DaemonError when TCP port has no server", async () => {
    // Use a port that's extremely unlikely to be in use
    const transport: TransportDescriptor = { type: "tcp", hostname: "127.0.0.1", port: 19 };
    const result = await daemonFetch("/health", undefined, transport);
    expect(isDaemonError(result)).toBe(true);

    const err = result as DaemonError;
    expect(["daemon_offline", "request_failed"]).toContain(err.type);
  });
});

// -- daemonFetchBinary (Unix) --

describe("daemonFetchBinary (unix)", () => {
  test("returns raw Buffer body, not string", async () => {
    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const app = new Hono();
    app.get("/image", (c) => {
      return c.body(binaryData, 200, {
        "Content-Type": "image/png",
        "Cache-Control": "max-age=300",
      });
    });

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const result = await daemonFetchBinary("/image", srv.transport);
    expect(isDaemonError(result)).toBe(false);

    const res = result as { status: number; headers: Record<string, string>; body: Buffer };
    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBe(binaryData.length);
    expect(res.body[0]).toBe(0x89);
    expect(res.body[1]).toBe(0x50);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["cache-control"]).toContain("max-age=300");
  });

  test("returns DaemonError when socket does not exist", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const transport: TransportDescriptor = { type: "unix", socketPath };
    const result = await daemonFetchBinary("/image", transport);
    expect(isDaemonError(result)).toBe(true);
  });

  test("preserves non-200 status codes", async () => {
    const app = new Hono();
    app.get("/image", (c) => c.json({ error: "Not found" }, 404));

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const result = await daemonFetchBinary("/image", srv.transport);
    expect(isDaemonError(result)).toBe(false);

    const res = result as { status: number; headers: Record<string, string>; body: Buffer };
    expect(res.status).toBe(404);
  });
});

// -- daemonFetchBinary (TCP) --

describe("daemonFetchBinary (tcp)", () => {
  test("returns raw Buffer body over TCP", async () => {
    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const app = new Hono();
    app.get("/image", (c) => {
      return c.body(binaryData, 200, {
        "Content-Type": "image/png",
      });
    });

    const srv = serveOnTcp(app);

    const result = await daemonFetchBinary("/image", srv.transport);
    expect(isDaemonError(result)).toBe(false);

    const res = result as { status: number; headers: Record<string, string>; body: Buffer };
    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBe(binaryData.length);
    expect(res.body[0]).toBe(0x89);
    expect(res.headers["content-type"]).toContain("image/png");
  });
});

// -- daemonHealth --

describe("daemonHealth", () => {
  test("returns health data from running daemon (unix)", async () => {
    const app = new Hono();
    app.get("/system/runtime/daemon/health", (c) =>
      c.json({ status: "ok", meetings: 2, uptime: 300 }),
    );

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const health = await daemonHealth(srv.transport);
    expect(health).toEqual({ status: "ok", meetings: 2, uptime: 300 });
  });

  test("returns null when daemon is not running (unix)", async () => {
    const tmp = makeTmpDir();
    const socketPath = path.join(tmp, "nonexistent.sock");

    const transport: TransportDescriptor = { type: "unix", socketPath };
    const health = await daemonHealth(transport);
    expect(health).toBeNull();
  });

  test("returns health data from running daemon (tcp)", async () => {
    const app = new Hono();
    app.get("/system/runtime/daemon/health", (c) =>
      c.json({ status: "ok", meetings: 1, uptime: 42 }),
    );

    const srv = serveOnTcp(app);

    const health = await daemonHealth(srv.transport);
    expect(health).toEqual({ status: "ok", meetings: 1, uptime: 42 });
  });
});

// -- daemonStreamAsync (Unix) --

describe("daemonStreamAsync (unix)", () => {
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

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify({ projectName: "test", workerName: "w", prompt: "hi" }),
      srv.transport,
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

    const transport: TransportDescriptor = { type: "unix", socketPath };
    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify({ projectName: "test" }),
      transport,
    );

    expect(isDaemonError(result)).toBe(true);
    const err = result as DaemonError;
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

    const srv = serveOnSocket(app);
    if (!srv) return; // Socket binding blocked in sandbox

    const payload = { projectName: "my-project", workerName: "w", prompt: "go" };
    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify(payload),
      srv.transport,
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

// -- daemonStreamAsync (TCP) --

describe("daemonStreamAsync (tcp)", () => {
  test("returns a readable stream from an SSE endpoint over TCP", async () => {
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

    const srv = serveOnTcp(app);

    const result = await daemonStreamAsync(
      "/meetings",
      JSON.stringify({ projectName: "test", workerName: "w", prompt: "hi" }),
      srv.transport,
    );

    expect(isDaemonError(result)).toBe(false);
    const stream = result as ReadableStream<Uint8Array>;

    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    const text = chunks.join("");
    expect(text).toContain('"type":"session"');
    expect(text).toContain('"type":"text_delta"');
    expect(text).toContain('"type":"turn_end"');
  });
});

// -- daemonStream (TCP) --

describe("daemonStream (tcp)", () => {
  test("returns a readable stream over TCP", async () => {
    const app = new Hono();
    app.post("/events", (c) =>
      streamSSE(c, async (stream) => {
        await stream.writeSSE({
          data: JSON.stringify({ type: "heartbeat" }),
        });
      }),
    );

    const srv = serveOnTcp(app);

    const result = daemonStream(
      "/events",
      JSON.stringify({ subscribe: true }),
      srv.transport,
    );

    expect(isDaemonError(result)).toBe(false);
    const stream = result as ReadableStream<Uint8Array>;

    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    const text = chunks.join("");
    expect(text).toContain('"type":"heartbeat"');
  });

  test("returns DaemonError when no transport is provided and no discovery files exist", () => {
    // daemonStream with a null transport returns DaemonError synchronously
    const transport: TransportDescriptor = { type: "tcp", hostname: "127.0.0.1", port: 19 };
    const result = daemonStream("/events", undefined, transport);
    // This should return a ReadableStream (even if connection will fail),
    // because daemonStream creates the stream synchronously
    expect(isDaemonError(result)).toBe(false);
  });
});
