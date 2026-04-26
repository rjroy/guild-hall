/**
 * Event condensation: subscribes to the EventBus and appends condensed
 * activity summaries to each project's heartbeat file.
 *
 * Only terminal events produce activity lines (REQ-HBT-15): completed/
 * failed/cancelled/abandoned commission_status, commission_result,
 * and meeting_ended. Operational noise is excluded.
 *
 * Writes are serialized per project via a promise chain to prevent
 * concurrent append corruption (REQ-HBT-17).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { EventBus, SystemEvent } from "@/apps/daemon/lib/event-bus";
import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";
import { isNodeError } from "@/lib/types";
import { integrationWorktreePath } from "@/lib/paths";
import { appendToSection } from "./heartbeat-file";

// Terminal commission statuses that produce activity lines
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "abandoned"]);

const SUMMARY_MAX_LENGTH = 200;

export interface CondensationDeps {
  eventBus: EventBus;
  guildHallHome: string;
  log?: Log;
  /** Override for testing: resolves projectName from a commission or meeting ID. */
  resolveProjectName?: (
    activityType: "commission" | "meeting",
    activityId: string,
  ) => Promise<string | null>;
}

/**
 * Registers the condensation subscriber on the EventBus.
 * Returns an unsubscribe function.
 */
export function registerCondensationSubscriber(deps: CondensationDeps): () => void {
  const { eventBus, guildHallHome, log = nullLog("condensation") } = deps;
  const resolveProject = deps.resolveProjectName ?? defaultResolveProjectName(guildHallHome);

  // Per-project write serialization: each project has a promise chain
  // that queues writes sequentially.
  const writeQueues = new Map<string, Promise<void>>();

  function enqueueWrite(projectName: string, entry: string): void {
    const previous = writeQueues.get(projectName) ?? Promise.resolve();
    const next = previous.then(async () => {
      const projectPath = integrationWorktreePath(guildHallHome, projectName);
      try {
        await appendToSection(projectPath, "Recent Activity", entry);
      } catch (err: unknown) {
        log.warn(
          `condensation: failed to append to ${projectName}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    });
    writeQueues.set(projectName, next);
  }

  const unsubscribe = eventBus.subscribe((event: SystemEvent) => {
    void handleEvent(event);
  });

  async function handleEvent(event: SystemEvent): Promise<void> {
    const line = formatEventLine(event);
    if (!line) return;

    const projectName = await resolveProjectNameForEvent(event, resolveProject, log);
    if (!projectName) return;

    const timestamp = formatTimestamp(new Date());
    const entry = `- ${timestamp} ${line}`;

    enqueueWrite(projectName, entry);
  }

  return unsubscribe;
}

// -- Event formatting (REQ-HBT-15, REQ-HBT-16) --

function formatEventLine(event: SystemEvent): string | null {
  if (event.type === "commission_status") {
    if (!TERMINAL_STATUSES.has(event.status)) return null;
    return `${event.commissionId} ${event.status}`;
  }

  if (event.type === "commission_result") {
    const truncated = event.summary.length > SUMMARY_MAX_LENGTH
      ? event.summary.slice(0, SUMMARY_MAX_LENGTH) + "..."
      : event.summary;
    return `${event.commissionId} result: ${truncated}`;
  }

  if (event.type === "meeting_ended") {
    return `Meeting ${event.meetingId} ended`;
  }

  return null;
}

// -- Project resolution (REQ-HBT-18, REQ-HBT-19) --

async function resolveProjectNameForEvent(
  event: SystemEvent,
  resolve: (type: "commission" | "meeting", id: string) => Promise<string | null>,
  log: Log,
): Promise<string | null> {
  // commission_status has projectName directly on the event (optional)
  if (event.type === "commission_status") {
    if (event.projectName) return event.projectName;
    // Fall back to state file lookup
    try {
      return await resolve("commission", event.commissionId);
    } catch (err: unknown) {
      log.warn(
        `condensation: failed to resolve project for commission ${event.commissionId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  if (event.type === "commission_result") {
    try {
      return await resolve("commission", event.commissionId);
    } catch (err: unknown) {
      log.warn(
        `condensation: failed to resolve project for commission ${event.commissionId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  if (event.type === "meeting_ended") {
    try {
      return await resolve("meeting", event.meetingId);
    } catch (err: unknown) {
      log.warn(
        `condensation: failed to resolve project for meeting ${event.meetingId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  return null;
}

// -- Default project name resolver via state files --

function defaultResolveProjectName(
  guildHallHome: string,
): (activityType: "commission" | "meeting", activityId: string) => Promise<string | null> {
  return async (activityType, activityId) => {
    const stateDir = activityType === "commission" ? "commissions" : "meetings";
    const statePath = path.join(guildHallHome, "state", stateDir, `${activityId}.json`);

    try {
      const raw = await fs.readFile(statePath, "utf-8");
      const state = JSON.parse(raw) as { projectName?: string };
      return state.projectName ?? null;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return null;
      throw err;
    }
  };
}

// -- Timestamp formatting (REQ-HBT-16) --

function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Exported for testing
export { formatTimestamp, formatEventLine, TERMINAL_STATUSES, SUMMARY_MAX_LENGTH };
