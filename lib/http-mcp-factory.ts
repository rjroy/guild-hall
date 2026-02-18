/**
 * HTTP MCP Server Factory
 *
 * Spawns HTTP MCP server processes with port collision retry logic.
 * Implements the MCPServerFactory interface for use with MCPManager.
 *
 * Dependencies injected for testability:
 * - portRegistry: Manages port allocation and tracking
 * - spawn: Process spawning function (child_process.spawn)
 * - createClient: Factory for JSON-RPC client instances
 */

import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";

import {
  createJsonRpcClient,
  JsonRpcClient,
  JsonRpcTimeoutError,
  JsonRpcHttpError,
  JsonRpcProtocolError,
} from "./json-rpc-client";
import type { IPortRegistry } from "./port-registry";
import type { MCPServerFactory, MCPServerHandle } from "./types";
import { MCP_EXIT_CODE } from "./types";

const MAX_RETRY_ATTEMPTS = 10;
const PORT_COLLISION_WAIT_MS = 100;
const READINESS_POLL_INTERVAL_MS = 200;
const READINESS_TIMEOUT_MS = 10000;
const STDERR_BUFFER_MAX = 10000;
const STDERR_BUFFER_KEEP = 5000;

export interface HttpMCPFactoryDeps {
  portRegistry: IPortRegistry;
  spawn?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string | undefined>;
      stdio: [string, string, string];
    },
  ) => ChildProcess;
  createClient?: (baseUrl: string) => JsonRpcClient;
}

export function createHttpMCPFactory(
  deps: HttpMCPFactoryDeps,
): MCPServerFactory {
  const spawnFn = deps.spawn ?? nodeSpawn;
  const createClientFn = deps.createClient ?? createJsonRpcClient;

  return {
    async connect(config: { port: number }): Promise<{ handle: MCPServerHandle }> {
      console.log(`[MCP] Connecting to existing server on port ${config.port}...`);
      const client = createClientFn(`http://localhost:${config.port}/mcp`);
      await client.initialize(
        { name: "GuildHall", version: "0.1.0" },
        { timeoutMs: 2000 },
      );
      console.log(`[MCP] Connected to port ${config.port}`);

      const handle: MCPServerHandle = {
        stop() {
          // Reconnected handles don't own the process, so stop() is a no-op
          return Promise.resolve();
        },
        async listTools() {
          return client.listTools();
        },
        async invokeTool(name, input) {
          return client.invokeTool(name, input);
        },
      };

      return { handle };
    },

    async spawn(config: {
      name?: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
      pluginDir: string;
    }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }> {
      let lastError: Error | null = null;
      const spawnStart = Date.now();

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        const port = deps.portRegistry.allocate();
        console.log(`[MCP] Spawn attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS} on port ${port}: ${config.command} ${config.args.join(" ")} (cwd=${config.pluginDir})`);

        // Substitute ${PORT} in args
        const substitutedArgs = config.args.map((arg) =>
          arg.replace(/\$\{PORT\}/g, String(port)),
        );

        const pluginTag = config.name ?? "unknown";

        // Spawn process with cwd=pluginDir
        const proc = spawnFn(config.command, substitutedArgs, {
          cwd: config.pluginDir,
          env: { ...process.env, ...config.env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Capture stdout, tagged by plugin name
        proc.stdout?.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trimEnd();
          if (text) {
            console.log(`[plugin:${pluginTag}] ${text}`);
          }
        });

        // Capture stderr for debugging
        let stderrBuffer = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stderrBuffer += text;
          if (stderrBuffer.length > STDERR_BUFFER_MAX) {
            stderrBuffer = stderrBuffer.slice(-STDERR_BUFFER_KEEP);
          }
          console.error(`[plugin:${pluginTag}:stderr] ${text.trimEnd()}`);
        });

        // Track process exit. Uses a listener rather than proc.exitCode
        // because exitCode isn't guaranteed to be set synchronously on all
        // runtimes/mocks when the exit event fires.
        let exitCode: number | null = null;
        const exitPromise = new Promise<number>((resolve) => {
          proc.once("exit", (code) => {
            exitCode = code ?? MCP_EXIT_CODE.ERROR;
            resolve(exitCode);
          });
        });

        // Wait briefly for quick port collision detection
        await new Promise((resolve) =>
          setTimeout(resolve, PORT_COLLISION_WAIT_MS),
        );

        // Check if already exited with EADDRINUSE. Check both the
        // event-tracked exitCode and proc.exitCode for the quick-exit
        // path, since the process may exit before the listener fires.
        if (exitCode === MCP_EXIT_CODE.PORT_COLLISION || proc.exitCode === MCP_EXIT_CODE.PORT_COLLISION) {
          deps.portRegistry.markDead(port);
          console.log(`[MCP] Port ${port} collision (EADDRINUSE, quick exit), will retry on next port`);
          lastError = new Error(
            `Port ${port} collision detected (EADDRINUSE), retrying`,
          );
          continue;
        }

        // Poll for server readiness. Servers with async bootstrap (network
        // calls, session init) may not be listening immediately after spawn.
        // Retry connection-refused errors until the server is up or the
        // timeout expires. Non-transient errors (HTTP errors, protocol
        // errors, timeouts) fail immediately.
        const client = createClientFn(`http://localhost:${port}/mcp`);
        const deadline = Date.now() + READINESS_TIMEOUT_MS;
        let initError: unknown = null;
        let initialized = false;
        let pollAttempt = 0;

        while (Date.now() < deadline) {
          // If the process exited, stop polling
          if (exitCode !== null) {
            // exitCode is mutated by the proc.once("exit") callback above;
            // TypeScript's control flow doesn't track callback mutations so
            // it incorrectly narrows the type to never here.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            console.log(`[MCP] Process exited (code ${exitCode}) during readiness poll`);
            break;
          }

          pollAttempt++;
          try {
            await client.initialize({
              name: "GuildHall",
              version: "0.1.0",
            });
            initialized = true;
            const readyElapsed = Date.now() - spawnStart;
            console.log(`[MCP] Server ready on port ${port} (${pollAttempt} poll attempt(s), ${readyElapsed}ms elapsed)`);
            break;
          } catch (err) {
            initError = err;

            // Non-transient errors: stop polling immediately.
            // Connection-refused / fetch-failed are the only transient ones
            // (server not yet listening). Everything else means the server
            // responded but something is wrong.
            if (!isTransientConnectionError(err)) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.log(`[MCP] Non-transient error during readiness poll: ${errMsg}`);
              break;
            }

            if (pollAttempt === 1) {
              console.log(`[MCP] Server on port ${port} not ready yet, polling for readiness (timeout=${READINESS_TIMEOUT_MS}ms)...`);
            }

            // Transient error (fetch failed / connection refused): wait and retry
            await new Promise((resolve) =>
              setTimeout(resolve, READINESS_POLL_INTERVAL_MS),
            );
          }
        }

        if (!initialized && initError && Date.now() >= deadline) {
          console.log(`[MCP] Readiness poll timed out after ${READINESS_TIMEOUT_MS}ms (${pollAttempt} attempts)`);
        }

        if (!initialized) {
          proc.kill();

          // If process hasn't exited yet, wait for it
          if (exitCode === null) {
            exitCode = await exitPromise;
          }

          // If process exited with code 2, mark port dead and retry
          if (exitCode === MCP_EXIT_CODE.PORT_COLLISION) {
            deps.portRegistry.markDead(port);
            console.log(`[MCP] Port ${port} collision (EADDRINUSE, during initialize), will retry on next port`);
            lastError = new Error(
              `Port ${port} collision detected during initialize, retrying`,
            );
            continue;
          }

          // Other errors: release port and fail
          deps.portRegistry.release(port);
          const err = initError;
          console.error(`[MCP] Spawn failed on port ${port}: ${err instanceof Error ? err.message : String(err)}`);

          const errorMessage =
            err instanceof Error ? err.message : String(err);
          const errorType = getErrorType(err);

          throw new Error(
            `Server failed to initialize on port ${port}: ${errorMessage} (${errorType})\nstderr: ${stderrBuffer}`,
            { cause: err },
          );
        }

        // Create handle
        const handle: MCPServerHandle = {
          stop() {
            proc.kill();
            deps.portRegistry.release(port);
            return Promise.resolve();
          },
          async listTools() {
            return client.listTools();
          },
          async invokeTool(name, input) {
            const result = await client.invokeTool(name, input);
            return result;
          },
        };

        // Success - return process, handle, and port
        const totalElapsed = Date.now() - spawnStart;
        console.log(`[MCP] Server spawned on port ${port}, pid=${proc.pid} (${totalElapsed}ms total)`);
        return { process: proc, handle, port };
      }

      // Exhausted retry attempts
      const retryMessage = lastError
        ? ` Last error: ${lastError.message}`
        : "";
      throw new Error(
        `Failed to spawn MCP server: port collision retry limit (${MAX_RETRY_ATTEMPTS}) exceeded.${retryMessage}`,
      );
    },
  };
}

function getErrorType(err: unknown): string {
  if (err instanceof JsonRpcTimeoutError) return "timeout";
  if (err instanceof JsonRpcHttpError) return "http-error";
  if (err instanceof JsonRpcProtocolError) return "protocol-error";
  if (err instanceof Error && err.name === "AbortError") return "aborted";
  return "unknown";
}

/**
 * Returns true if the error indicates the server isn't listening yet
 * (connection refused, fetch failed). These are the only errors worth
 * retrying during readiness polling. Everything else (timeouts, HTTP
 * errors, protocol errors, aborts) means the server responded or the
 * request was intentionally cancelled.
 */
function isTransientConnectionError(err: unknown): boolean {
  // Known non-transient error types from our JSON-RPC client
  if (
    err instanceof JsonRpcTimeoutError ||
    err instanceof JsonRpcHttpError ||
    err instanceof JsonRpcProtocolError
  ) {
    return false;
  }

  if (err instanceof Error) {
    // AbortError from fetch signal cancellation
    if (err.name === "AbortError") return false;

    // Connection refused / fetch failed: server not listening yet
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("connection refused")) {
      return true;
    }
  }

  // Unknown errors: treat as non-transient to avoid infinite retries
  return false;
}
