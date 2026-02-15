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
    async spawn(config: {
      command: string;
      args: string[];
      env?: Record<string, string>;
      pluginDir: string;
    }): Promise<{ process: ChildProcess; handle: MCPServerHandle; port: number }> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        const port = deps.portRegistry.allocate();
        console.log(`[MCP] Spawning server (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}, port ${port}): ${config.command} ${config.args.join(" ")}`);

        // Substitute ${PORT} in args
        const substitutedArgs = config.args.map((arg) =>
          arg.replace(/\$\{PORT\}/g, String(port)),
        );

        // Spawn process with cwd=pluginDir
        const proc = spawnFn(config.command, substitutedArgs, {
          cwd: config.pluginDir,
          env: { ...process.env, ...config.env },
          stdio: ["ignore", "ignore", "pipe"],
        });

        // Capture stderr for debugging
        let stderrBuffer = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stderrBuffer += text;
          if (stderrBuffer.length > STDERR_BUFFER_MAX) {
            stderrBuffer = stderrBuffer.slice(-STDERR_BUFFER_KEEP);
          }
          console.error(`[MCP stderr] ${text.trimEnd()}`);
        });

        // Set up exit code tracking
        const exitPromise = new Promise<number>((resolve) => {
          proc.once("exit", (code) => resolve(code ?? MCP_EXIT_CODE.ERROR));
        });

        // Wait briefly for quick port collision detection
        await new Promise((resolve) =>
          setTimeout(resolve, PORT_COLLISION_WAIT_MS),
        );

        // Check if already exited with EADDRINUSE
        if (proc.exitCode === MCP_EXIT_CODE.PORT_COLLISION) {
          deps.portRegistry.markDead(port);
          console.log(`[MCP] Port ${port} collision (quick exit), retrying...`);
          lastError = new Error(
            `Port ${port} collision detected (EADDRINUSE), retrying`,
          );
          continue;
        }

        // Create JSON-RPC client
        const client = createClientFn(`http://localhost:${port}/mcp`);

        // Wait for server to be ready (initialize handshake)
        try {
          await client.initialize({
            name: "GuildHall",
            version: "0.1.0",
          });
        } catch (err) {
          proc.kill();

          // Wait for exit code
          const exitCode = await exitPromise;

          // If process exited with code 2, mark port dead and retry
          if (exitCode === MCP_EXIT_CODE.PORT_COLLISION) {
            deps.portRegistry.markDead(port);
            console.log(`[MCP] Port ${port} collision (during initialize), retrying...`);
            lastError = new Error(
              `Port ${port} collision detected during initialize, retrying`,
            );
            continue;
          }

          // Other errors: release port and fail
          deps.portRegistry.release(port);
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
        console.log(`[MCP] Server spawned successfully on port ${port}`);
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
