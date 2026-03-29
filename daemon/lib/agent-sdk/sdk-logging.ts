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

/**
 * Extracts content blocks from an SDK message's nested `message` property
 * and logs text, tool_use (with inputs), and tool_result blocks.
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

  // The SDK wraps messages: { type: "assistant"|"user"|"result", message: { content: [...] } }
  const inner = (m.message ?? m) as Record<string, unknown>;
  const content = inner.content as Array<Record<string, unknown>> | undefined;

  if (type === "result") {
    const stop = sdkStr(m, "stop_reason") || sdkStr(inner, "stop_reason") || "?";
    const costVal = sdkStr(m, "total_cost_usd");
    const cost = costVal ? ` cost=$${costVal}` : "";
    log.info(`${prefix} result (stop=${stop}${cost})`);
  }

  if (!Array.isArray(content)) {
    // Result events rarely have content blocks; the result line above is sufficient.
    // For other types, missing content is unusual enough to note at debug level.
    if (type !== "result") {
      log.info(`${prefix} ${type} (no content blocks)`);
    }
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
