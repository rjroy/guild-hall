import * as path from "node:path";
import { daemonFetch, isDaemonError, daemonHealth } from "@/lib/daemon-client";

/**
 * Register a project via the daemon's POST /admin/register-project endpoint.
 *
 * The daemon owns the full registration sequence: validation, git setup,
 * config write, and in-memory reload.
 */
export async function register(
  name: string,
  projectPath: string,
): Promise<void> {
  const health = await daemonHealth();
  if (!health) {
    throw new Error(
      "Daemon is not running. Start the daemon first: bun run dev:daemon",
    );
  }

  const resolved = path.resolve(projectPath);

  const result = await daemonFetch("/admin/register-project", {
    method: "POST",
    body: JSON.stringify({ name, path: resolved }),
  });

  if (isDaemonError(result)) {
    throw new Error(`Failed to reach daemon: ${result.message}`);
  }

  const body = await result.json() as {
    registered?: boolean;
    name?: string;
    path?: string;
    defaultBranch?: string;
    error?: string;
  };

  if (!result.ok) {
    throw new Error(body.error ?? `Registration failed (HTTP ${result.status})`);
  }

  console.log(`Registered project '${body.name}' at ${body.path}`);
}
