---
title: "Commission: Brainstorm: Large system prompt optimization"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/large-system-prompt.md`.\n\n**Problem:** The \"additional system prompt\" sent to workers may be too large, risking token limits and performance. The user is asking whether some content currently in the system prompt should be moved to the first user message instead, specifically the \"injected memory\" and the \"action prompt\" (commission prompt or meeting agenda).\n\n**Context:** Workers receive a system prompt composed of multiple sections. The relevant code is in:\n- `daemon/lib/agent-sdk/sdk-runner.ts` (session preparation, system prompt assembly)\n- `daemon/services/memory-injector.ts` (memory loading)\n- `daemon/services/commission/` (commission prompt construction)\n- `daemon/services/meeting/` (meeting agenda construction)\n- Worker packages in `packages/` (identity, posture, guidance)\n\nAll LLM calls go through the Claude Agent SDK. The system prompt is passed as `systemPrompt` to the SDK session.\n\n**What to explore:**\n- What's actually in the system prompt today? Break down the components and their approximate sizes.\n- What's the token impact? How close are we to limits?\n- Which components are truly \"system\" (identity, behavior rules) vs. \"context\" (memory, task prompt)?\n- What are the tradeoffs of system prompt vs. first user message for each component?\n- Does the Claude Agent SDK or the Anthropic API treat system prompt tokens differently from user message tokens?\n- Are there other optimization strategies beyond relocation (compression, selective inclusion, lazy loading)?\n\nWrite the brainstorm artifact to `.lore/brainstorm/large-system-prompt.md`."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
