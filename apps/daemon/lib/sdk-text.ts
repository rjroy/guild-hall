/**
 * Shared SDK text extraction utilities.
 *
 * collectSdkText: For single-turn, no-tool invocations where the SDK emits
 * raw SDKMessage objects. Used by notes-generator.
 *
 * collectRunnerText: For multi-turn invocations that go through runSdkSession,
 * which yields SdkRunnerEvent. Used by briefing-generator.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SdkRunnerEvent } from "@/apps/daemon/lib/agent-sdk/sdk-runner";

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

/**
 * Collects text from a runSdkSession generator (SdkRunnerEvent stream).
 * Extracts text_delta events and concatenates them.
 */
export async function collectRunnerText(
  generator: AsyncGenerator<SdkRunnerEvent>,
): Promise<string> {
  const parts: string[] = [];
  for await (const event of generator) {
    if (event.type === "text_delta") {
      parts.push(event.text);
    }
  }
  return parts.join("");
}
