import type { ActivationContext, ActivationResult } from "@/lib/types";

function buildSystemPrompt(context: ActivationContext): string {
  const parts: string[] = [];

  // 1. Soul (personality, voice, vibe) — if present
  if (context.soul) {
    parts.push(`# Soul\n\n${context.soul}`);
  }

  // 2. Identity metadata — always present
  if (context.identity) {
    parts.push(
      [
        '# Identity',
        '',
        `Your name is: ${context.identity.name}`,
        `Your title is: ${context.identity.displayTitle}`,
        `You are described as: ${context.identity.description}`,
      ].join("\n"),
    );
  }

  // 3. Posture (principles, workflow, quality standards) — always present
  parts.push(`# Posture\n\n${context.posture}`);

  // 4. Injected memory — if present
  if (context.injectedMemory) {
    parts.push(`# Injected Memory\n\n${context.injectedMemory}`);
  }

  if (context.meetingContext) {
    parts.push(`# Meeting Context\n\nAgenda: ${context.meetingContext.agenda}`);
  }

  if (context.commissionContext) {
    parts.push(
      '# Commission Context',
      '',
      'You are executing a commission (an async work item).',
      '',
      '## Task',
      '',
      context.commissionContext.prompt,
      '',
    );

    if (context.commissionContext.dependencies.length > 0) {
      parts.push(
        '## Dependencies (artifacts to reference):',
        context.commissionContext.dependencies.map((dependency) => `- ${dependency}`).join("\n"),
      );
    }

    parts.push(
      [
        "## Commission protocol",
        "",
        "- Use report_progress to log what you're doing as you work. This keeps the user informed.",
        "- When finished, you MUST call submit_result with a summary of what you accomplished and any artifact paths you created or modified.",
        "- If you encounter gaps in the requirements, state your interpretation and proceed. You are expected to be self-sufficient.",
        "- The commission is not considered complete unless you call submit_result. Just responding with text is not enough.",
      ].join("\n"),
    );
  }

  return parts.join("\n\n");
}

export function activateWorkerWithSharedPattern(
  context: ActivationContext,
): ActivationResult {
  return {
    systemPrompt: buildSystemPrompt(context),
    model: context.model ?? "opus",
    tools: context.resolvedTools,
    resourceBounds: {
      maxTurns: context.resourceDefaults.maxTurns,
      maxBudgetUsd: context.resourceDefaults.maxBudgetUsd,
    },
  };
}