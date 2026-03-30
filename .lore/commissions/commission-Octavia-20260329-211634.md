---
title: "Commission: Brainstorm: Large system prompt optimization"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/large-system-prompt.md`.\n\n**Problem:** The \"additional system prompt\" sent to workers may be too large, risking token limits and performance. The user is asking whether some content currently in the system prompt should be moved to the first user message instead, specifically the \"injected memory\" and the \"action prompt\" (commission prompt or meeting agenda).\n\n**Context:** Workers receive a system prompt composed of multiple sections. The relevant code is in:\n- `daemon/lib/agent-sdk/sdk-runner.ts` (session preparation, system prompt assembly)\n- `daemon/services/memory-injector.ts` (memory loading)\n- `daemon/services/commission/` (commission prompt construction)\n- `daemon/services/meeting/` (meeting agenda construction)\n- Worker packages in `packages/` (identity, posture, guidance)\n\nAll LLM calls go through the Claude Agent SDK. The system prompt is passed as `systemPrompt` to the SDK session.\n\n**What to explore:**\n- What's actually in the system prompt today? Break down the components and their approximate sizes.\n- What's the token impact? How close are we to limits?\n- Which components are truly \"system\" (identity, behavior rules) vs. \"context\" (memory, task prompt)?\n- What are the tradeoffs of system prompt vs. first user message for each component?\n- Does the Claude Agent SDK or the Anthropic API treat system prompt tokens differently from user message tokens?\n- Are there other optimization strategies beyond relocation (compression, selective inclusion, lazy loading)?\n\nWrite the brainstorm artifact to `.lore/brainstorm/large-system-prompt.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/large-system-prompt.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T04:16:34.851Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T04:16:34.852Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T04:16:34.901Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T04:16:42.844Z
    event: progress_report
    reason: "Starting brainstorm on large system prompt issue. Reading the issue file and exploring relevant code."
  - timestamp: 2026-03-30T04:21:22.737Z
    event: progress_report
    reason: "Code exploration complete. Writing the brainstorm artifact covering system prompt composition, size analysis, sub-agent memory loading, and optimization strategies."
  - timestamp: 2026-03-30T04:22:50.030Z
    event: result_submitted
    reason: "Brainstorm written to `.lore/brainstorm/large-system-prompt.md`.\n\nKey findings from the code exploration:\n\n**System prompt composition** (the `append` content guild hall controls): soul (~3K) + identity (~300) + posture (~2K) + injected memory (up to 16K, currently ~10K for Octavia) + commission context (~1-3K). Total append: ~18-20K chars. Total system prompt seen by model (including CLAUDE.md layer): ~70-75K chars / ~18-20K tokens.\n\n**The sub-agent loading problem is larger than the issue describes.** Every session at start builds full activation prompts (soul + identity + posture + memory) for all 8 other workers, even when none are ever invoked. That's potentially 40-80K chars loaded per session regardless of whether Task is used. Sub-agent lazy loading is likely the highest-impact optimization.\n\n**Semantic classification:** soul/identity/posture are genuinely system-level. Injected memory and the commission task prompt are context-level — they fit more naturally in a first user message.\n\n**System prompt vs first user message tradeoffs:** Moving task + memory to the first user message makes the per-worker system prompt static (cache-eligible), reduces system prompt size, and improves semantic clarity. The main gotcha is meeting session resumption — agenda in the system prompt survives resume; in a user message it would need re-injection.\n\n**Prioritized optimization approaches:**\n1. Sub-agent lazy loading (biggest impact, not in the issue)\n2. Commission/meeting context to first user message (clean semantic win, maximum caching benefit)\n3. Memory to first user message (secondary benefit, reduces system prompt variability)\n\nOpen questions documented in the artifact: token counting visibility, resume behavior, whether sub-agent prompts count at invocation vs session start, CLAUDE.md loading scope in worktrees."
  - timestamp: 2026-03-30T04:22:59.724Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Code exploration complete. Writing the brainstorm artifact covering system prompt composition, size analysis, sub-agent memory loading, and optimization strategies."
projectName: guild-hall
---
Brainstorm written to `.lore/brainstorm/large-system-prompt.md`.

Key findings from the code exploration:

**System prompt composition** (the `append` content guild hall controls): soul (~3K) + identity (~300) + posture (~2K) + injected memory (up to 16K, currently ~10K for Octavia) + commission context (~1-3K). Total append: ~18-20K chars. Total system prompt seen by model (including CLAUDE.md layer): ~70-75K chars / ~18-20K tokens.

**The sub-agent loading problem is larger than the issue describes.** Every session at start builds full activation prompts (soul + identity + posture + memory) for all 8 other workers, even when none are ever invoked. That's potentially 40-80K chars loaded per session regardless of whether Task is used. Sub-agent lazy loading is likely the highest-impact optimization.

**Semantic classification:** soul/identity/posture are genuinely system-level. Injected memory and the commission task prompt are context-level — they fit more naturally in a first user message.

**System prompt vs first user message tradeoffs:** Moving task + memory to the first user message makes the per-worker system prompt static (cache-eligible), reduces system prompt size, and improves semantic clarity. The main gotcha is meeting session resumption — agenda in the system prompt survives resume; in a user message it would need re-injection.

**Prioritized optimization approaches:**
1. Sub-agent lazy loading (biggest impact, not in the issue)
2. Commission/meeting context to first user message (clean semantic win, maximum caching benefit)
3. Memory to first user message (secondary benefit, reduces system prompt variability)

Open questions documented in the artifact: token counting visibility, resume behavior, whether sub-agent prompts count at invocation vs session start, CLAUDE.md loading scope in worktrees.
