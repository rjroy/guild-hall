/**
 * SDK message logging helpers.
 *
 * Pure functions that extract and format content blocks from Claude Agent SDK
 * messages for debug logging. No closure dependencies; logSdkMessage takes a
 * Log instance as its first parameter.
 */

import type { Log } from "@/daemon/lib/log";

/** Truncates a string to a maximum length, appending "..." if truncated. */
function truncateSdkStr(s: string, max = 300): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Safely extract a string property from an unknown record. */
function sdkStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const val = obj[key];
  return typeof val === "string" ? val : (typeof val === "number" ? String(val) : fallback);
}

// Message types that carry { message: { content: [...] } } and are worth
// logging at the content-block level. Everything else either has its own
// log line (system, result) or doesn't carry content blocks at all
// (stream_event, rate_limit_event, and any future SDK internal types).
const CONTENT_BLOCK_TYPES = new Set(["assistant", "user"]);

/**
 * Logs SDK messages at appropriate detail levels.
 *
 * Only assistant and user messages have content blocks worth inspecting.
 * Other types get a single summary line or are silently skipped when they
 * carry no actionable information.
 */
export function logSdkMessage(
  log: Log,
  index: number,
  msg: unknown,
): void {
  const m = msg as Record<string, unknown>;
  const prefix = `[msg ${index}]`;
  const type = sdkStr(m, "type", "unknown");

  if (type === "system" || type === "rate_limit_event") {
    log.info(`${prefix} ${type}`);
    return;
  }

  if (type === "result") {
    const inner = (m.message ?? m) as Record<string, unknown>;
    const stop = sdkStr(m, "stop_reason") || sdkStr(inner, "stop_reason") || "?";
    const costVal = sdkStr(m, "total_cost_usd");
    const cost = costVal ? ` cost=$${costVal}` : "";
    log.info(`${prefix} result (stop=${stop}${cost})`);
    return;
  }

  // stream_event, and any other SDK-internal types: nothing to log.
  // The event translator already extracts their useful data.
  if (!CONTENT_BLOCK_TYPES.has(type)) {
    return;
  }

  // assistant and user messages carry { message: { content: [...] } }
  const inner = (m.message ?? m) as Record<string, unknown>;
  const content = inner.content as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(content) || content.length === 0) {
    log.info(`${prefix} ${type} (no content blocks)`);
    return;
  }

  for (const block of content) {
    const bType = sdkStr(block, "type", "unknown");
    if (bType === "text") {
      log.info(`${prefix} ${type}/text: ${truncateSdkStr(sdkStr(block, "text"))}`);
    } else if (bType === "tool_use") {
      const input = JSON.stringify(block.input ?? {});
      log.info(`${prefix} ${type}/tool_use: ${sdkStr(block, "name", "?")}(${truncateSdkStr(input, 200)})`);
    } else if (bType === "tool_result") {
      const resultContent = Array.isArray(block.content)
        ? (block.content as Array<Record<string, unknown>>).map((c) => truncateSdkStr(sdkStr(c, "text"), 150)).join("; ")
        : truncateSdkStr(sdkStr(block, "content"), 150);
      log.info(`${prefix} tool_result [${block.is_error === true ? "ERROR" : "ok"}]: ${resultContent}`);
    } else {
      log.info(`${prefix} ${type}/${bType}`);
    }
  }
}
