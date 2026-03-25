import * as fs from "node:fs";
import http from "node:http";
import * as path from "node:path";
import { getGuildHallHome } from "./paths";

/**
 * Daemon client for Next.js and CLI to communicate with the Guild Hall daemon.
 * Supports both Unix socket (POSIX) and TCP (Windows) transports.
 */

export type TransportDescriptor =
  | { type: "unix"; socketPath: string }
  | { type: "tcp"; hostname: string; port: number };

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
 * Discovers the active daemon transport by checking for discovery files.
 * Checks socket file first (POSIX), then port file (Windows).
 * Returns null if neither exists.
 *
 * Detection is file-based (not process.platform) so transport tests
 * are runnable on any OS.
 */
export function discoverTransport(homeOverride?: string): TransportDescriptor | null {
  const home = homeOverride ?? getGuildHallHome();
  const socketPath = path.join(home, "guild-hall.sock");
  const portFilePath = path.join(home, "guild-hall.port");

  if (fs.existsSync(socketPath)) {
    return { type: "unix", socketPath };
  }

  if (fs.existsSync(portFilePath)) {
    const raw = fs.readFileSync(portFilePath, "utf-8").trim();
    const port = parseInt(raw, 10);
    if (isNaN(port)) return null;
    return { type: "tcp", hostname: "127.0.0.1", port };
  }

  return null;
}

function noTransportError(): DaemonError {
  return {
    type: "socket_not_found",
    message: "No daemon discovery file found (neither socket nor port file exists)",
  };
}

/**
 * Converts a TransportDescriptor into the options needed by http.request().
 */
function transportOptions(transport: TransportDescriptor): { socketPath: string } | { hostname: string; port: number } {
  if (transport.type === "unix") {
    return { socketPath: transport.socketPath };
  }
  return { hostname: transport.hostname, port: transport.port };
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
 * Makes an HTTP request to the daemon over its transport (Unix socket or TCP).
 *
 * Returns a standard Response on success, or a DaemonError on failure.
 * The caller must check with isDaemonError() before using the result.
 */
export async function daemonFetch(
  requestPath: string,
  options?: { method?: string; body?: string },
  transportOverride?: TransportDescriptor,
): Promise<Response | DaemonError> {
  const transport = transportOverride ?? discoverTransport();
  if (!transport) return noTransportError();

  const method = options?.method ?? "GET";
  const body = options?.body;

  return new Promise((resolve) => {
    const req = http.request(
      {
        ...transportOptions(transport),
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

/**
 * Makes an HTTP GET request to the daemon and returns the raw binary response.
 * Unlike daemonFetch, this does not convert the response body to a string.
 * Used for proxying binary data (images) through Next.js API routes.
 */
export async function daemonFetchBinary(
  requestPath: string,
  transportOverride?: TransportDescriptor,
): Promise<
  | { status: number; headers: Record<string, string>; body: Buffer }
  | DaemonError
> {
  const transport = transportOverride ?? discoverTransport();
  if (!transport) return noTransportError();

  return new Promise((resolve) => {
    const req = http.request(
      { ...transportOptions(transport), path: requestPath, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers[key] = value;
          }
          resolve({ status: res.statusCode ?? 500, headers, body });
        });
        res.on("error", (err) => resolve(classifyError(err)));
      },
    );
    req.on("error", (err) => resolve(classifyError(err)));
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
  transportOverride?: TransportDescriptor,
): Promise<DaemonHealthData | null> {
  const result = await daemonFetch("/system/runtime/daemon/health", undefined, transportOverride);
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
  transportOverride?: TransportDescriptor,
): ReadableStream<Uint8Array> | DaemonError {
  const transport = transportOverride ?? discoverTransport();
  if (!transport) return noTransportError();

  let requestObj: http.ClientRequest;

  try {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        requestObj = http.request(
          {
            ...transportOptions(transport),
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
  transportOverride?: TransportDescriptor,
  options?: { method?: string },
): Promise<ReadableStream<Uint8Array> | DaemonError> {
  const transport = transportOverride ?? discoverTransport();
  if (!transport) return Promise.resolve(noTransportError());

  const method = options?.method ?? "POST";

  return new Promise((resolve) => {
    const req = http.request(
      {
        ...transportOptions(transport),
        path: requestPath,
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          Accept: "text/event-stream",
        },
      },
      (res) => {
        // Connection succeeded. Build a ReadableStream from the response.
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            // The controller can be closed externally when the consumer
            // cancels the stream (e.g., Next.js SSE proxy disconnect).
            // After cancel(), req.destroy() fires error/end events on the
            // response, but the controller is already closed. try/catch
            // is the only reliable guard since there's no "isClosed" check.
            res.on("data", (chunk: Buffer) => {
              try {
                controller.enqueue(new Uint8Array(chunk));
              } catch {
                // Controller already closed by consumer cancel
              }
            });
            res.on("end", () => {
              try { controller.close(); } catch { /* already closed */ }
            });
            res.on("error", () => {
              try { controller.close(); } catch { /* already closed */ }
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
