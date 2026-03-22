/**
 * Notification Service: dispatches matched events to external channels.
 *
 * Consumes the Event Router for rule-based matching. Handles shell command
 * execution and webhook POSTs. Configured via `channels` and `notifications`
 * in config.yaml.
 *
 * REQ-EVRT-10 through REQ-EVRT-26, REQ-EVRT-27, REQ-EVRT-30
 */

import type { SystemEvent } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import type { ChannelConfig, NotificationRule } from "@/lib/types";
import type { EventRouter } from "@/daemon/services/event-router";

export interface NotificationServiceDeps {
  router: EventRouter;
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
export async function defaultDispatchShell(command: string, env: Record<string, string>): Promise<void> {
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
export async function defaultDispatchWebhook(url: string, body: unknown): Promise<void> {
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
 * Creates a NotificationService that registers subscriptions on the Event Router
 * for each configured notification rule.
 *
 * Returns a cleanup function that unsubscribes all handlers.
 * When channels or notifications are empty, returns a no-op without registering.
 */
export function createNotificationService(deps: NotificationServiceDeps): () => void {
  const { router, channels, notifications, log } = deps;
  const dispatchShell = deps.dispatchShell ?? defaultDispatchShell;
  const dispatchWebhook = deps.dispatchWebhook ?? defaultDispatchWebhook;

  // REQ-EVRT-21: Inert when no channels or notifications configured
  if (Object.keys(channels).length === 0 || notifications.length === 0) {
    return () => {};
  }

  const unsubscribers: (() => void)[] = [];

  for (const rule of notifications) {
    const channel = channels[rule.channel];
    if (!channel) continue;

    const unsub = router.subscribe(rule.match, (event: SystemEvent) => {
      log.info(`dispatching ${event.type} to channel "${rule.channel}" (${channel.type})`);

      // Fire-and-forget async dispatch
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
    });

    unsubscribers.push(unsub);
  }

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
