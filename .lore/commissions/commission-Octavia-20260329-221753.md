---
title: "Commission: Spec: System prompt optimization (memory and context to first turn)"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Generate a spec for optimizing the system prompt based on two decisions from the brainstorm at `.lore/brainstorm/large-system-prompt.md`:\n\n**Decision 1: Remove sub-agent memory injection entirely.**\nSub-agents are short, focused tasks. They don't need accumulated memory from past sessions. When building the `agents` map in `prepareSdkSession` (`daemon/lib/agent-sdk/sdk-runner.ts`, lines 354-417), skip memory loading for sub-agents. Sub-agents should get soul + identity + posture only. No injected memory.\n\n**Decision 2: Move worker memory injection and context prompt (commission prompt / meeting agenda) from the system prompt to the first turn user message.**\nThe system prompt should contain only stable, identity-level content: soul, identity, posture. Everything session-specific (memory, commission task + protocol, meeting agenda) becomes the first user message. This means the `ActivationResult` type needs to change. Currently it has a single `systemPrompt` field. The user suggests either adding a `firstPrompt` field alongside `systemPrompt`, or renaming `prompt` to `systemPrompt` to make the distinction explicit.\n\n**Key code to read:**\n- `packages/shared/worker-activation.ts` — current `buildSystemPrompt()` and `activateWorkerWithSharedPattern()`\n- `daemon/lib/agent-sdk/sdk-runner.ts` — `prepareSdkSession()`, sub-agent map building (lines 354-417), SDK query construction (line 484+)\n- `daemon/services/manager/worker.ts` — `activateManager()` (Guild Master's activation, same pattern)\n- `lib/types.ts` — `ActivationResult`, `ActivationContext` types\n- `daemon/services/meeting/orchestrator.ts` — how meetings use activation (resume scenario matters)\n- `daemon/services/commission/orchestrator.ts` — how commissions use activation\n\n**Things to consider:**\n- Meeting resume: when a meeting resumes via the `resume` parameter, is there a first user message? The agenda needs to survive resume. Check how this works.\n- The commission protocol instructions (\"use report_progress\", \"call submit_result\") should move with the task to the first message.\n- Memory guidance instructions (\"how to use memory tools\") are behavioral, so they may belong in posture or system prompt, not in the first message with the memory content.\n- Prompt caching benefit: stable system prompt = better cache hit rate.\n- The `buildSubAgentDescription` function only uses identity fields, so the description doesn't need memory. The sub-agent `prompt` field is where memory currently lands.\n\nWrite the spec to `.lore/specs/infrastructure/system-prompt-optimization.md`. Set status to `draft`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-30T05:17:53.633Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T05:17:53.635Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
