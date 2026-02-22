import type { ActivationContext, ActivationResult } from "@/lib/types";

/**
 * Assembles a system prompt from the activation context. Concatenates the
 * worker's posture, any injected memory, and the meeting/commission context.
 */
function buildSystemPrompt(context: ActivationContext): string {
  const parts: string[] = [context.posture];

  if (context.injectedMemory) {
    parts.push(context.injectedMemory);
  }

  if (context.meetingContext) {
    parts.push(`Meeting agenda: ${context.meetingContext.agenda}`);
  }

  if (context.commissionContext) {
    parts.push(
      `You are executing a commission (an async work item). Your task:\n\n${context.commissionContext.prompt}`,
    );

    if (context.commissionContext.dependencies.length > 0) {
      parts.push(
        `Dependencies (artifacts to reference):\n${context.commissionContext.dependencies.map((d) => `- ${d}`).join("\n")}`,
      );
    }

    parts.push(
      [
        "Commission protocol:",
        "- Use report_progress to log what you're doing as you work. This keeps the user informed and serves as a heartbeat.",
        "- When finished, you MUST call submit_result with a summary of what you accomplished and any artifact paths you created or modified.",
        "- If you have questions or encounter gaps in the requirements, use log_question to record them.",
        "- The commission is not considered complete unless you call submit_result. Just responding with text is not enough.",
      ].join("\n"),
    );
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
