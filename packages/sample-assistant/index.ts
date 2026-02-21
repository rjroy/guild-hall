import type { ActivationContext, ActivationResult } from "@/lib/types";

/**
 * Assembles a system prompt from the activation context. Concatenates the
 * worker's posture, any injected memory, and the meeting agenda (if present).
 */
function buildSystemPrompt(context: ActivationContext): string {
  const parts: string[] = [context.posture];

  if (context.injectedMemory) {
    parts.push(context.injectedMemory);
  }

  if (context.meetingContext) {
    parts.push(`Meeting agenda: ${context.meetingContext.agenda}`);
  }

  return parts.join("\n\n");
}

/**
 * Activates the sample assistant worker. Builds a system prompt from the
 * provided context and passes through the resolved tools and resource bounds.
 */
export function activate(context: ActivationContext): ActivationResult {
  return {
    systemPrompt: buildSystemPrompt(context),
    tools: context.resolvedTools,
    resourceBounds: {
      maxTurns: context.resourceDefaults.maxTurns,
      maxBudgetUsd: context.resourceDefaults.maxBudgetUsd,
    },
  };
}
