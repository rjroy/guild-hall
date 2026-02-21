import http from "node:http";
import * as path from "node:path";
import { getGuildHallHome } from "./paths";

/**
 * Daemon client for Next.js to communicate with the Guild Hall daemon
 * over its Unix socket. Uses node:http with socketPath option.
 */

export type DaemonError = {
  type: "daemon_offline" | "socket_not_found" | "request_failed";
  message: string;
};

export function isDaemonError(value: unknown): value is DaemonError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "message" in value &&
    typeof (value as DaemonError).type === "string" &&
    ["daemon_offline", "socket_not_found", "request_failed"].includes(
      (value as DaemonError).type,
    )
  );
}

/**
 * Returns the path to the daemon's Unix socket.
 * Mirrors daemon/lib/socket.ts getSocketPath() but lives in lib/
 * so Next.js code doesn't import from daemon/.
 */
export function getSocketPath(homeOverride?: string): string {
  const home = homeOverride ?? getGuildHallHome();
  return path.join(home, "guild-hall.sock");
}

/**
 * Classifies a Node.js error into a DaemonError type.
 * ECONNREFUSED means the socket exists but nothing is listening.
 * ENOENT means the socket file doesn't exist at all.
 */
function classifyError(err: unknown): DaemonError {
  if (err instanceof Error && "code" in err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ECONNREFUSED") {
      return { type: "daemon_offline", message: "Daemon is not running" };
    }
    if (code === "ENOENT") {
      return {
        type: "socket_not_found",
        message: "Daemon socket not found",
      };
    }
  }

  const message =
    err instanceof Error ? err.message : "Unknown daemon request failure";
  return { type: "request_failed", message };
}

/**
 * Makes an HTTP request to the daemon over its Unix socket.
 *
 * Returns a standard Response on success, or a DaemonError on failure.
 * The caller must check with isDaemonError() before using the result.
 */
export async function daemonFetch(
  requestPath: string,
  options?: { method?: string; body?: string },
  socketPathOverride?: string,
): Promise<Response | DaemonError> {
  const socketPath = socketPathOverride ?? getSocketPath();
  const method = options?.method ?? "GET";
  const body = options?.body;

  return new Promise((resolve) => {
    const req = http.request(
      {
        socketPath,
        path: requestPath,
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          resolve(
            new Response(responseBody, {
              status: res.statusCode ?? 500,
              headers: Object.fromEntries(
                Object.entries(res.headers).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              ),
            }),
          );
        });
        res.on("error", (err) => resolve(classifyError(err)));
      },
    );

    req.on("error", (err) => resolve(classifyError(err)));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export interface DaemonHealthData {
  status: string;
  meetings: number;
  uptime: number;
}

/**
 * Checks daemon health. Returns health data if the daemon is running,
 * or null if it's unreachable.
 */
export async function daemonHealth(
  socketPathOverride?: string,
): Promise<DaemonHealthData | null> {
  const result = await daemonFetch("/health", undefined, socketPathOverride);
  if (isDaemonError(result)) return null;

  try {
    const data = (await result.json()) as DaemonHealthData;
    return data;
  } catch {
    return null;
  }
}

/**
 * Makes a streaming request to the daemon and returns a ReadableStream.
 *
 * Used for SSE endpoints (meetings, messages) where the daemon streams
 * events back. The returned ReadableStream can be piped directly into
 * a Next.js streaming Response.
 *
 * Returns a DaemonError if the connection fails before streaming starts.
 */
export function daemonStream(
  requestPath: string,
  body?: string,
  socketPathOverride?: string,
): ReadableStream<Uint8Array> | DaemonError {
  const socketPath = socketPathOverride ?? getSocketPath();

  // We need to detect connection errors synchronously-ish before
  // returning the stream. Use a deferred pattern: the stream's start()
  // callback initiates the request. If connection fails, the stream
  // errors. If it succeeds, chunks flow through.
  //
  // However, callers need to distinguish "daemon offline" (return 503)
  // from "stream started" (return SSE). Since we can't know until the
  // TCP connection completes, we return a ReadableStream that will error
  // on the consumer side if the daemon is down. The API route catches
  // this by first doing a daemonFetch to /health, or by trying daemonFetch
  // for non-streaming endpoints.
  //
  // For SSE routes: try daemonFetch first as a connectivity check is
  // wasteful. Instead, return the stream and let the route handle errors
  // by wrapping in a try pattern. But since ReadableStream errors are
  // hard to catch before piping, we use a different approach:
  // return a Promise-based function that resolves to either a stream
  // or an error.

  // Actually, the cleanest approach: return a ReadableStream. If the
  // daemon is down, the stream will produce an SSE error event and close.
  // This way the client always gets a valid SSE stream.

  let requestObj: http.ClientRequest;

  try {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        requestObj = http.request(
          {
            socketPath,
            path: requestPath,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
          },
          (res) => {
            res.on("data", (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on("end", () => {
              controller.close();
            });
            res.on("error", () => {
              controller.close();
            });
          },
        );

        requestObj.on("error", (err) => {
          // Connection failed. Emit an SSE error event so the client
          // gets a structured notification instead of a broken stream.
          const daemonErr = classifyError(err);
          const errorEvent = `data: ${JSON.stringify({ type: "error", reason: daemonErr.message })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
          controller.close();
        });

        if (body) {
          requestObj.write(body);
        }
        requestObj.end();
      },
      cancel() {
        // Consumer cancelled the stream (e.g., client disconnected).
        // Abort the underlying HTTP request to stop the daemon from
        // doing further work.
        if (requestObj) {
          requestObj.destroy();
        }
      },
    });

    return stream;
  } catch (err) {
    return classifyError(err);
  }
}

/**
 * Async version of daemonStream that resolves after the HTTP connection
 * is established, allowing the caller to detect connection failures
 * before committing to an SSE response.
 *
 * Returns the response stream on success, or a DaemonError if the
 * daemon is unreachable.
 */
export function daemonStreamAsync(
  requestPath: string,
  body?: string,
  socketPathOverride?: string,
): Promise<ReadableStream<Uint8Array> | DaemonError> {
  const socketPath = socketPathOverride ?? getSocketPath();

  return new Promise((resolve) => {
    const req = http.request(
      {
        socketPath,
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
      },
      (res) => {
        // Connection succeeded. Build a ReadableStream from the response.
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on("data", (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on("end", () => {
              controller.close();
            });
            res.on("error", () => {
              controller.close();
            });
          },
          cancel() {
            req.destroy();
          },
        });
        resolve(stream);
      },
    );

    req.on("error", (err) => {
      resolve(classifyError(err));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
