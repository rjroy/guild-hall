/**
 * Shared SDK text extraction for single-turn, no-tool invocations.
 *
 * Both notes-generator and briefing-generator call the SDK with maxTurns: 1
 * and no streaming (no includePartialMessages). The SDK emits a single
 * assistant message with text content blocks. This function iterates the
 * generator and collects those text blocks.
 *
 * Extracted here to avoid duplication between the two generators.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Collects text from an SDK async generator for a single-turn invocation.
 * Iterates all messages and extracts text content from assistant messages only.
 */
export async function collectSdkText(
  generator: AsyncGenerator<SDKMessage>,
): Promise<string> {
  const textParts: string[] = [];

  for await (const message of generator) {
    const msg = message as unknown as { type: string };

    if (msg.type === "assistant") {
      const assistantMsg = message as unknown as {
        type: "assistant";
        message?: { content?: unknown[] };
      };
      const content = assistantMsg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const typed = block as Record<string, unknown>;
          if (typed.type === "text" && typeof typed.text === "string") {
            textParts.push(typed.text);
          }
        }
      }
    }
  }

  return textParts.join("");
}
