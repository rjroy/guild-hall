---
title: "Commission: Fine-tune briefing generator prompts for conciseness"
date: 2026-03-16
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nThe briefing generator in `daemon/services/briefing-generator.ts` produces verbose output. Fine-tune the prompts to produce tighter, more concise briefings.\n\n## Context\n\nThe file has three prompt locations that need attention:\n\n1. **`BRIEFING_PROMPT` (line 75)** — The primary per-project briefing prompt. This is the main target. It currently says \"Scale your response to the activity level\" but doesn't enforce brevity strongly enough. The model gets 200 turns with read-only tools, explores `.lore/`, and tends to over-report.\n\n2. **Single-turn system prompt (line 572)** — \"Produce clear, concise summaries in 3-5 sentences.\" This one is already reasonably scoped.\n\n3. **Synthesis prompt (line 444)** — Cross-project synthesis. Also tends verbose.\n\n## What to change\n\n- Tighten the `BRIEFING_PROMPT` to enforce brevity. The briefing appears on the dashboard as a status widget, not a report. Think \"status line\" not \"status report.\" A quiet project should be one sentence. An active project should be 2-4 sentences max. Give the model a hard ceiling (e.g., \"Never exceed 4 sentences\") and emphasize that this is a dashboard widget, not a detailed report.\n- Review and tighten the synthesis prompt similarly. It synthesizes multiple project briefings into one, but the result should still be compact (one short paragraph).\n- Don't change the template fallback logic, cache behavior, or SDK session wiring. This is prompt-only work.\n- Make sure the single-turn prompt (line 558-565) stays consistent with whatever direction you take the main prompt.\n\n## Verification\n\n- Run the existing tests: `bun test tests/daemon/services/briefing-generator.test.ts`\n- If any tests assert on specific prompt text, update them to match.\n- Typecheck: `bun run typecheck`\n- Lint: `bun run lint`\n"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-16T15:31:59.547Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-16T15:31:59.551Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
