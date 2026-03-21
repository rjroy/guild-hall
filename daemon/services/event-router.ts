/**
 * Event Router: generic filtered subscription layer over the EventBus.
 *
 * Evaluates events against match rules and invokes registered handlers.
 * The router does not know what its handlers do. It provides the matching;
 * consumers provide the behavior.
 *
 * REQ-EVRT-1 through REQ-EVRT-9, REQ-EVRT-27, REQ-EVRT-29
 */

import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import type { SystemEventType } from "@/lib/types";

export interface EventMatchRule {
  type: SystemEventType;
  projectName?: string;
}

export interface EventRouter {
  subscribe(rule: EventMatchRule, handler: (event: SystemEvent) => void | Promise<void>): () => void;
}

interface Subscription {
  rule: EventMatchRule;
  handler: (event: SystemEvent) => void | Promise<void>;
}

/**
 * Creates an EventRouter that subscribes to the EventBus once and
 * dispatches matching events to registered handlers.
 *
 * Returns { router, cleanup } where cleanup detaches from the EventBus.
 */
export function createEventRouter(deps: { eventBus: EventBus; log: Log }): { router: EventRouter; cleanup: () => void } {
  const { eventBus, log } = deps;
  const subscriptions: Subscription[] = [];

  const unsubscribeBus = eventBus.subscribe((event: SystemEvent) => {
    for (const sub of subscriptions) {
      if (!matches(sub.rule, event)) continue;

      log.info(`matched ${event.type} for subscription rule {type: "${sub.rule.type}"${sub.rule.projectName ? `, projectName: "${sub.rule.projectName}"` : ""}}`);

      // Fire-and-forget (REQ-EVRT-5)
      try {
        const result = sub.handler(event);
        if (result && typeof result.then === "function") {
          result.then(undefined, (err: unknown) => {
            log.warn(
              `handler failed for ${event.type}:`,
              err instanceof Error ? err.message : String(err),
            );
          });
        }
      } catch (err) {
        log.warn(
          `handler failed for ${event.type}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  });

  const router: EventRouter = {
    subscribe(rule: EventMatchRule, handler: (event: SystemEvent) => void | Promise<void>): () => void {
      const entry: Subscription = { rule, handler };
      subscriptions.push(entry);
      return () => {
        const idx = subscriptions.indexOf(entry);
        if (idx !== -1) subscriptions.splice(idx, 1);
      };
    },
  };

  return { router, cleanup: unsubscribeBus };
}

/** Evaluates whether a match rule matches an event. */
function matches(rule: EventMatchRule, event: SystemEvent): boolean {
  if (rule.type !== event.type) return false;

  if (rule.projectName !== undefined) {
    if (!("projectName" in event) || (event as Record<string, unknown>).projectName !== rule.projectName) {
      return false;
    }
  }

  return true;
}
