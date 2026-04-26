/**
 * Background briefing refresh service.
 *
 * Runs a refresh cycle that iterates all registered projects, calling
 * generateBriefing for each one sequentially. After each cycle completes,
 * schedules the next cycle after the configured interval (post-completion,
 * not clock-based). Per-project errors are logged and skipped.
 */

import type { AppConfig } from "@/lib/types";
import type { createBriefingGenerator } from "@/apps/daemon/services/briefing-generator";
import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";

// -- Dependency interface --

export interface BriefingRefreshDeps {
  briefingGenerator: ReturnType<typeof createBriefingGenerator>;
  config: AppConfig;
  log?: Log;
}

// -- Service --

export function createBriefingRefreshService(deps: BriefingRefreshDeps) {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const log = deps.log ?? nullLog("briefing-refresh");
  const intervalMs =
    (deps.config.briefingRefreshIntervalMinutes ?? 60) * 60_000;

  async function runCycle(): Promise<void> {
    for (const project of deps.config.projects) {
      try {
        await deps.briefingGenerator.generateBriefing(project.name);
      } catch (err: unknown) {
        log.error(
          `Briefing refresh failed for "${project.name}":`,
          err,
        );
      }
    }
  }

  async function scheduleNext(): Promise<void> {
    try {
      await runCycle();
    } catch (err: unknown) {
      log.error("Unhandled error in briefing refresh cycle:", err);
    }
    if (running) {
      pendingTimer = setTimeout(() => {
        void scheduleNext();
      }, intervalMs);
    }
  }

  function start(): void {
    running = true;
    void scheduleNext();
  }

  function stop(): void {
    running = false;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  return { start, stop, runCycle };
}
