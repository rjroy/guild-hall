/**
 * System-wide event bus for lifecycle events.
 *
 * Simple synchronous pub/sub pattern. Subscribers are stored in a Set
 * to avoid Node's EventEmitter max listener warnings and keep the
 * implementation minimal.
 */

export type SystemEvent =
  | { type: "commission_status"; commissionId: string; status: string; reason?: string }
  | { type: "commission_progress"; commissionId: string; summary: string }
  | { type: "commission_question"; commissionId: string; question: string }
  | { type: "commission_result"; commissionId: string; summary: string; artifacts?: string[] }
  | { type: "commission_artifact"; commissionId: string; artifactPath: string }
  | { type: "meeting_started"; meetingId: string; worker: string }
  | { type: "meeting_ended"; meetingId: string };

export interface EventBus {
  emit(event: SystemEvent): void;
  subscribe(callback: (event: SystemEvent) => void): () => void;
}

/**
 * Creates a new event bus instance.
 *
 * Returns an EventBus with emit/subscribe methods. subscribe() returns
 * an unsubscribe callback. Multiple subscribers are supported.
 */
export function createEventBus(): EventBus {
  const subscribers = new Set<(event: SystemEvent) => void>();

  return {
    emit(event: SystemEvent): void {
      console.log(`[event-bus] ${event.type} -> ${subscribers.size} subscriber(s)`);
      for (const callback of subscribers) {
        callback(event);
      }
    },

    subscribe(callback: (event: SystemEvent) => void): () => void {
      subscribers.add(callback);
      console.log(`[event-bus] subscriber added (total: ${subscribers.size})`);
      return () => {
        subscribers.delete(callback);
        console.log(`[event-bus] subscriber removed (total: ${subscribers.size})`);
      };
    },
  };
}
