import type { ActivationContext, ActivationResult } from "@/lib/types";

/**
 * Builds the stable system prompt: soul, identity, posture, memory guidance.
 * This content is identical across sessions for the same worker, enabling
 * prompt caching (REQ-SPO-7, REQ-SPO-13).
 */
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

  // 4. Memory guidance — behavioral instructions for memory tools (REQ-SPO-9, REQ-SPO-10)
  if (context.memoryGuidance) {
    parts.push(`# Memory\n\n## Memories\n\n${context.memoryGuidance}`);
  }

  return parts.join("\n\n");
}

/**
 * Builds session-specific context: memory scope data, then activity context.
 * This content varies per session and is passed as the first user message
 * (REQ-SPO-8, REQ-SPO-14).
 */
function buildSessionContext(context: ActivationContext): string {
  const parts: string[] = [];

  // 1. Memory content (scope data from loadMemories)
  if (context.injectedMemory) {
    parts.push(`# Injected Memory\n\n${context.injectedMemory}`);
  }

  // 2. Meeting context
  if (context.meetingContext) {
    parts.push(`# Meeting Context\n\nAgenda: ${context.meetingContext.agenda}`);
  }

  // 3. Commission context with protocol
  if (context.commissionContext) {
    const commParts: string[] = [
      '# Commission Context',
      '',
      'You are executing a commission (an async work item).',
      '',
      '## Task',
      '',
      context.commissionContext.prompt,
      '',
    ];

    if (context.commissionContext.dependencies.length > 0) {
      commParts.push(
        '## Dependencies (artifacts to reference):',
        context.commissionContext.dependencies.map((dependency) => `- ${dependency}`).join("\n"),
        '',
      );
    }

    commParts.push(
      [
        "## Commission protocol",
        "",
        "- Use report_progress to log what you're doing as you work. This keeps the user informed.",
        "- Call submit_result when you have a result. You can call it again if you refine the result later; the last submission is the final one.",
        "- If you encounter gaps in the requirements, state your interpretation and proceed. You are expected to be self-sufficient.",
        "- The commission is not considered complete unless you call submit_result. Just responding with text is not enough.",
      ].join("\n"),
    );

    parts.push(commParts.join("\n"));
  }

  return parts.join("\n\n");
}

export function activateWorkerWithSharedPattern(
  context: ActivationContext,
): ActivationResult {
  return {
    systemPrompt: buildSystemPrompt(context),
    sessionContext: buildSessionContext(context),
    model: context.model ?? "opus",
    tools: context.resolvedTools,
  };
}
