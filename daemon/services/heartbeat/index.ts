/**
 * Heartbeat service: daemon loop that evaluates standing orders per project.
 *
 * Follows the post-completion scheduling pattern from briefing-refresh.ts:
 * after all projects are evaluated, schedules the next tick after the
 * configured interval. Per-project errors are logged and skipped. Rate-limit
 * errors abort the loop and schedule the next tick at the backoff interval.
 *
 * Also owns the event condensation subscriber (REQ-HBT-50) that feeds
 * activity context to heartbeat files.
 *
 * Lifecycle: start() begins the loop, stop() halts it and unsubscribes
 * the condensation listener.
 */

import type { AppConfig } from "@/lib/types";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { integrationWorktreePath } from "@/lib/paths";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import {
  readHeartbeatFile,
  hasContentBelowHeader,
  clearRecentActivity,
} from "@/daemon/services/heartbeat/heartbeat-file";
import {
  runHeartbeatSession,
  type HeartbeatSessionDeps,
} from "@/daemon/services/heartbeat/session";
import { registerCondensationSubscriber } from "./condensation";

// -- Types --

export interface HeartbeatServiceDeps {
  /** SDK session deps forwarded to runHeartbeatSession. */
  sessionDeps: HeartbeatSessionDeps;
  config: AppConfig;
  eventBus: EventBus;
  guildHallHome: string;
  log?: Log;
}

/** Per-project last-tick state (in-memory, lost on restart). */
export interface LastTickState {
  timestamp: number;
  commissionsCreated: number;
}

export interface HeartbeatService {
  start(): void;
  stop(): void;
  /** Manual tick for a single project. Used by the /heartbeat/:project/tick route. */
  tickProject(projectName: string): Promise<{ success: boolean; error?: string }>;
  /** Returns last-tick state for a project, or undefined if never ticked. */
  getLastTick(projectName: string): LastTickState | undefined;
}

// -- Service --

export function createHeartbeatService(deps: HeartbeatServiceDeps): HeartbeatService {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const log = deps.log ?? nullLog("heartbeat");
  const lastTicks = new Map<string, LastTickState>();
  const intervalMs =
    (deps.config.heartbeatIntervalMinutes ?? 60) * 60_000;
  const backoffMs =
    (deps.config.heartbeatBackoffMinutes ?? 300) * 60_000;

  // REQ-HBT-50: service owns condensation subscriber
  const unsubscribeCondensation = registerCondensationSubscriber({
    eventBus: deps.eventBus,
    guildHallHome: deps.guildHallHome,
    log,
  });

  async function tickSingleProject(projectName: string): Promise<{
    success: boolean;
    error?: string;
    isRateLimit?: boolean;
  }> {
    const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);

    // Read heartbeat file
    const content = await readHeartbeatFile(integrationPath);
    if (!content || !hasContentBelowHeader(content)) {
      return { success: true };
    }

    // Run GM session
    const result = await runHeartbeatSession(
      deps.sessionDeps,
      projectName,
      content,
      Date.now(),
    );

    // Track last-tick state regardless of success (in-memory, lost on restart)
    lastTicks.set(projectName, {
      timestamp: Date.now(),
      commissionsCreated: result.commissionsCreated,
    });

    if (result.success) {
      try {
        await clearRecentActivity(integrationPath);
      } catch (err: unknown) {
        log.warn(`Failed to clear activity for "${projectName}": ${errorMessage(err)}`);
      }
    }

    return result;
  }

  async function runCycle(): Promise<void> {
    for (const project of deps.config.projects) {
      try {
        const result = await tickSingleProject(project.name);

        if (!result.success) {
          if (result.isRateLimit) {
            log.warn(
              `Rate limit hit on "${project.name}". Aborting heartbeat cycle. ` +
              `Next tick in ${deps.config.heartbeatBackoffMinutes ?? 300} minutes.`,
            );
            if (running) {
              pendingTimer = setTimeout(() => {
                pendingTimer = null;
                void scheduleNext();
              }, backoffMs);
            }
            return;
          }

          log.warn(
            `Heartbeat tick failed for "${project.name}": ${result.error ?? "unknown error"}`,
          );
        }
      } catch (err: unknown) {
        log.warn(
          `Heartbeat tick threw for "${project.name}": ${errorMessage(err)}`,
        );
      }
    }
  }

  async function scheduleNext(): Promise<void> {
    try {
      await runCycle();
    } catch (err: unknown) {
      log.error("Unhandled error in heartbeat cycle:", errorMessage(err));
    }
    // Only schedule if runCycle didn't already schedule (rate-limit path)
    if (running && pendingTimer === null) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void scheduleNext();
      }, intervalMs);
    }
  }

  function start(): void {
    running = true;
    // First tick after configured interval (no catch-up, REQ-HBT-7)
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void scheduleNext();
    }, intervalMs);
  }

  function stop(): void {
    running = false;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    unsubscribeCondensation();
  }

  async function tickProject(projectName: string): Promise<{ success: boolean; error?: string }> {
    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return { success: false, error: `Project "${projectName}" not found` };
    }
    return tickSingleProject(projectName);
  }

  function getLastTick(projectName: string): LastTickState | undefined {
    return lastTicks.get(projectName);
  }

  return { start, stop, tickProject, getLastTick };
}
