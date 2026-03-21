/**
 * Event Router: subscribes to the EventBus and dispatches matching events
 * to configured channels (shell commands or webhooks).
 *
 * REQ-EVRT-10 through REQ-EVRT-25
 */

import type { EventBus, SystemEvent } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import type { ChannelConfig, NotificationRule } from "@/lib/types";

export interface EventRouterDeps {
  eventBus: EventBus;
  channels: Record<string, ChannelConfig>;
  notifications: NotificationRule[];
  log: Log;
  dispatchShell?: (command: string, env: Record<string, string>) => Promise<void>;
  dispatchWebhook?: (url: string, body: unknown) => Promise<void>;
}

/**
 * Converts a camelCase field name to SCREAMING_SNAKE_CASE.
 * "commissionId" -> "COMMISSION_ID", "projectName" -> "PROJECT_NAME"
 */
export function camelToScreamingSnake(name: string): string {
  return name.replace(/([A-Z])/g, "_$1").toUpperCase();
}

/**
 * Builds environment variables from a SystemEvent for shell channel dispatch.
 * Sets EVENT_TYPE, EVENT_JSON, and EVENT_<FIELD> for each top-level string field.
 */
function buildEventEnv(event: SystemEvent): Record<string, string> {
  const env: Record<string, string> = {
    EVENT_TYPE: event.type,
    EVENT_JSON: JSON.stringify(event),
  };
  for (const [key, value] of Object.entries(event)) {
    if (typeof value === "string") {
      env[`EVENT_${camelToScreamingSnake(key)}`] = value;
    }
  }
  return env;
}

/** Default shell dispatch: runs command via sh -c with a 10s timeout. */
async function defaultDispatchShell(command: string, env: Record<string, string>): Promise<void> {
  const proc = Bun.spawn(["sh", "-c", command], {
    env: { ...process.env, ...env },
    stdout: "ignore",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => {
    proc.kill();
  }, 10_000);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeout);
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Shell command exited with code ${exitCode}: ${stderr.slice(0, 200)}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/** Default webhook dispatch: POSTs JSON with a 10s timeout. */
async function defaultDispatchWebhook(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}`);
  }
}

/**
 * Creates an EventRouter that subscribes to the EventBus and dispatches
 * matching events to configured channels.
 *
 * Returns an unsubscribe cleanup function.
 * When channels or notifications are empty, returns a no-op without subscribing.
 */
export function createEventRouter(deps: EventRouterDeps): () => void {
  const { eventBus, channels, notifications, log } = deps;
  const dispatchShell = deps.dispatchShell ?? defaultDispatchShell;
  const dispatchWebhook = deps.dispatchWebhook ?? defaultDispatchWebhook;

  // REQ-EVRT-25: Inert when no channels or notifications configured
  if (Object.keys(channels).length === 0 || notifications.length === 0) {
    return () => {};
  }

  const unsubscribe = eventBus.subscribe((event: SystemEvent) => {
    for (const rule of notifications) {
      if (!matches(rule, event)) continue;

      const channel = channels[rule.channel];
      if (!channel) continue;

      log.info(`dispatching ${event.type} to channel "${rule.channel}" (${channel.type})`);

      // Fire-and-forget async dispatch (REQ-EVRT-11)
      void (async () => {
        try {
          if (channel.type === "shell") {
            const env = buildEventEnv(event);
            await dispatchShell(channel.command, env);
          } else {
            await dispatchWebhook(channel.url, event);
          }
        } catch (err) {
          log.warn(
            `channel "${rule.channel}" (${channel.type}) failed for ${event.type}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    }
  });

  return unsubscribe;
}

/** Evaluates whether a notification rule matches an event. */
function matches(rule: NotificationRule, event: SystemEvent): boolean {
  if (rule.match.type !== event.type) return false;

  if (rule.match.projectName !== undefined) {
    // REQ-EVRT-15: If the event doesn't carry projectName, skip
    if (!("projectName" in event) || (event as Record<string, unknown>).projectName !== rule.match.projectName) {
      return false;
    }
  }

  return true;
}
