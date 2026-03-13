import { daemonFetch, isDaemonError, daemonHealth } from "@/lib/daemon-client";

/**
 * CLI entry point: rebases claude onto the default branch for one or all projects.
 * Delegates to the daemon's POST /admin/rebase endpoint.
 */
export async function rebase(projectName?: string): Promise<void> {
  const health = await daemonHealth();
  if (!health) {
    throw new Error(
      "Daemon is not running. Start the daemon first: bun run dev:daemon",
    );
  }

  const result = await daemonFetch("/admin/rebase", {
    method: "POST",
    body: JSON.stringify(projectName ? { projectName } : {}),
  });

  if (isDaemonError(result)) {
    throw new Error(`Failed to reach daemon: ${result.message}`);
  }

  const body = await result.json() as {
    results?: Array<{ project: string; rebased: boolean; error?: string }>;
    error?: string;
  };

  if (!result.ok) {
    throw new Error(body.error ?? `Rebase failed (HTTP ${result.status})`);
  }

  if (body.results) {
    for (const r of body.results) {
      if (r.error) {
        console.warn(`[rebase] Failed to rebase "${r.project}": ${r.error}`);
      } else if (r.rebased) {
        console.log(`[rebase] Rebased "${r.project}"`);
      } else {
        console.log(`[rebase] Skipped "${r.project}" (active activities)`);
      }
    }
  }
}

/**
 * CLI entry point: smart sync (fetch + detect merged PR + reset or rebase)
 * for one or all projects. Delegates to the daemon's POST /admin/sync endpoint.
 */
export async function sync(projectName?: string): Promise<void> {
  const health = await daemonHealth();
  if (!health) {
    throw new Error(
      "Daemon is not running. Start the daemon first: bun run dev:daemon",
    );
  }

  const result = await daemonFetch("/admin/sync", {
    method: "POST",
    body: JSON.stringify(projectName ? { projectName } : {}),
  });

  if (isDaemonError(result)) {
    throw new Error(`Failed to reach daemon: ${result.message}`);
  }

  const body = await result.json() as {
    results?: Array<{ project: string; action: string; reason: string; error?: string }>;
    error?: string;
  };

  if (!result.ok) {
    throw new Error(body.error ?? `Sync failed (HTTP ${result.status})`);
  }

  if (body.results) {
    for (const r of body.results) {
      if (r.error) {
        console.warn(`[sync] Failed to sync "${r.project}": ${r.error}`);
      } else {
        console.log(`[sync] ${r.project}: ${r.action} (${r.reason})`);
      }
    }
  }
}
