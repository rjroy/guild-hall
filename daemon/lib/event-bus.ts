/**
 * System-wide event bus for lifecycle events.
 *
 * Simple synchronous pub/sub pattern. Subscribers are stored in a Set
 * to avoid Node's EventEmitter max listener warnings and keep the
 * implementation minimal.
 */

import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";

// When adding a new variant here, also update SYSTEM_EVENT_TYPES in lib/types.ts.
// A sync test in tests/lib/config.test.ts will fail if the two lists diverge.
export type SystemEvent =
  | { type: "commission_status"; commissionId: string; status: string; oldStatus?: string; projectName?: string; reason?: string }
  | { type: "commission_progress"; commissionId: string; summary: string }
  | { type: "commission_result"; commissionId: string; summary: string; artifacts?: string[] }
  | { type: "commission_artifact"; commissionId: string; artifactPath: string }
  | { type: "commission_manager_note"; commissionId: string; content: string }
  | { type: "commission_queued"; commissionId: string; reason: string }
  | { type: "commission_dequeued"; commissionId: string; reason: string }
  | { type: "commission_mail_sent"; commissionId: string; targetWorker: string; mailSequence: number; mailPath: string }
  | { type: "mail_reply_received"; contextId: string; commissionId: string; summary: string }
  | { type: "meeting_started"; meetingId: string; worker: string }
  | { type: "meeting_ended"; meetingId: string }
  | { type: "schedule_spawned"; scheduleId: string; spawnedId: string; projectName: string; runNumber: number }
  | { type: "toolbox_replicate"; action: string; tool: string; model: string; files: string[]; cost: string; projectName: string; contextId: string };

export interface EventBus {
  emit(event: SystemEvent): void;
  subscribe(callback: (event: SystemEvent) => void): () => void;
}

/** No-op event bus for contexts that don't need event emission. */
export const noopEventBus: EventBus = {
  emit() {},
  subscribe() { return () => {}; },
};

/**
 * Creates a new event bus instance.
 *
 * Returns an EventBus with emit/subscribe methods. subscribe() returns
 * an unsubscribe callback. Multiple subscribers are supported.
 */
export function createEventBus(log: Log = nullLog("event-bus")): EventBus {
  const subscribers = new Set<(event: SystemEvent) => void>();

  return {
    emit(event: SystemEvent): void {
      log.info(`${event.type} -> ${subscribers.size} subscriber(s)`);
      for (const callback of subscribers) {
        callback(event);
      }
    },

    subscribe(callback: (event: SystemEvent) => void): () => void {
      subscribers.add(callback);
      log.info(`subscriber added (total: ${subscribers.size})`);
      return () => {
        subscribers.delete(callback);
        log.info(`subscriber removed (total: ${subscribers.size})`);
      };
    },
  };
}
