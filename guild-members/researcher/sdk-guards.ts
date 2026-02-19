/**
 * SDK type guards for the researcher plugin.
 *
 * These are local copies that operate on `unknown` rather than importing
 * from lib/agent.ts. The researcher plugin has a separate tsconfig, so
 * importing SDK types across compilation contexts can cause type identity
 * mismatches. The guards here are intentionally self-contained.
 */

/** Type guard for SDK success result messages. */
export function isSuccessResult(
  msg: unknown,
): msg is { type: "result"; subtype: "success"; result: string } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as Record<string, unknown>).type === "result" &&
    "subtype" in msg &&
    (msg as Record<string, unknown>).subtype === "success" &&
    "result" in msg &&
    typeof (msg as Record<string, unknown>).result === "string"
  );
}

/** Type guard for SDK assistant messages (used for turn counting). */
export function isAssistantMessage(
  msg: unknown,
): msg is { type: "assistant" } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as Record<string, unknown>).type === "assistant"
  );
}
