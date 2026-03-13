import { daemonFetch, isDaemonError, daemonHealth } from "@/lib/daemon-client";

/**
 * Validate config and projects via the daemon's GET /admin/validate endpoint.
 *
 * Returns 0 if valid, 1 if issues found.
 */
export async function validate(): Promise<number> {
  const health = await daemonHealth();
  if (!health) {
    console.error(
      "Daemon is not running. Start the daemon first: bun run dev:daemon",
    );
    return 1;
  }

  const result = await daemonFetch("/admin/validate");

  if (isDaemonError(result)) {
    console.error(`Failed to reach daemon: ${result.message}`);
    return 1;
  }

  const body = await result.json() as {
    valid?: boolean;
    issues?: string[];
    projectCount?: number;
    error?: string;
  };

  if (body.error) {
    console.error(`Validation error: ${body.error}`);
    return 1;
  }

  if (!body.valid && body.issues && body.issues.length > 0) {
    console.error("Validation issues found:");
    for (const issue of body.issues) {
      console.error(`  - ${issue}`);
    }
    return 1;
  }

  console.log(
    `Config is valid (${body.projectCount ?? 0} project${(body.projectCount ?? 0) === 1 ? "" : "s"} registered)`,
  );
  return 0;
}
