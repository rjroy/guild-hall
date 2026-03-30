---
title: "Commission: Spec: System prompt optimization (memory and context to first turn)"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Generate a spec for optimizing the system prompt based on two decisions from the brainstorm at `.lore/brainstorm/large-system-prompt.md`:\n\n**Decision 1: Remove sub-agent memory injection entirely.**\nSub-agents are short, focused tasks. They don't need accumulated memory from past sessions. When building the `agents` map in `prepareSdkSession` (`daemon/lib/agent-sdk/sdk-runner.ts`, lines 354-417), skip memory loading for sub-agents. Sub-agents should get soul + identity + posture only. No injected memory.\n\n**Decision 2: Move worker memory injection and context prompt (commission prompt / meeting agenda) from the system prompt to the first turn user message.**\nThe system prompt should contain only stable, identity-level content: soul, identity, posture. Everything session-specific (memory, commission task + protocol, meeting agenda) becomes the first user message. This means the `ActivationResult` type needs to change. Currently it has a single `systemPrompt` field. The user suggests either adding a `firstPrompt` field alongside `systemPrompt`, or renaming `prompt` to `systemPrompt` to make the distinction explicit.\n\n**Key code to read:**\n- `packages/shared/worker-activation.ts` — current `buildSystemPrompt()` and `activateWorkerWithSharedPattern()`\n- `daemon/lib/agent-sdk/sdk-runner.ts` — `prepareSdkSession()`, sub-agent map building (lines 354-417), SDK query construction (line 484+)\n- `daemon/services/manager/worker.ts` — `activateManager()` (Guild Master's activation, same pattern)\n- `lib/types.ts` — `ActivationResult`, `ActivationContext` types\n- `daemon/services/meeting/orchestrator.ts` — how meetings use activation (resume scenario matters)\n- `daemon/services/commission/orchestrator.ts` — how commissions use activation\n\n**Things to consider:**\n- Meeting resume: when a meeting resumes via the `resume` parameter, is there a first user message? The agenda needs to survive resume. Check how this works.\n- The commission protocol instructions (\"use report_progress\", \"call submit_result\") should move with the task to the first message.\n- Memory guidance instructions (\"how to use memory tools\") are behavioral, so they may belong in posture or system prompt, not in the first message with the memory content.\n- Prompt caching benefit: stable system prompt = better cache hit rate.\n- The `buildSubAgentDescription` function only uses identity fields, so the description doesn't need memory. The sub-agent `prompt` field is where memory currently lands.\n\nWrite the spec to `.lore/specs/infrastructure/system-prompt-optimization.md`. Set status to `draft`."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/system-prompt-optimization.md

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
  - timestamp: 2026-03-30T05:17:53.681Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T05:18:14.963Z
    event: progress_report
    reason: "Reading key code files: meeting orchestrator (resume flow), commission orchestrator (initial prompt), memory injector, and sdk-runner query construction."
  - timestamp: 2026-03-30T05:19:30.987Z
    event: progress_report
    reason: "Finished reading all key code files and understanding the current architecture. Now writing the spec."
  - timestamp: 2026-03-30T05:23:00.553Z
    event: result_submitted
    reason: "Wrote the system prompt optimization spec to `.lore/specs/infrastructure/system-prompt-optimization.md` (status: draft, req-prefix: SPO).\n\nThe spec covers 25 requirements across two decisions:\n\n**Decision 1 (REQ-SPO-1 through REQ-SPO-5):** Remove memory injection from sub-agent activation. Sub-agents get soul + identity + posture only. Eliminates 24 file reads per session start and reduces sub-agent prompt size by 600-11K chars each.\n\n**Decision 2 (REQ-SPO-6 through REQ-SPO-25):** Split `ActivationResult` into stable `systemPrompt` (soul, identity, posture, memory guidance) and session-specific `sessionContext` (memory content, commission task + protocol, meeting agenda, manager context). Key details:\n- Memory guidance stays in system prompt (behavioral instruction). Memory content moves to session context.\n- `SessionPrepResult` gains a `sessionContext` field for orchestrator composition.\n- Commission prompt duplication is eliminated (currently in both system prompt and first user message).\n- Meeting resume correctly preserves session context from the original first message; renewal re-injects it.\n- Guild Master's `activateManager()` follows the same split pattern.\n- `ActivationContext` fields are unchanged; the activation function still owns all prompt formatting."
  - timestamp: 2026-03-30T05:23:09.219Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all key code files and understanding the current architecture. Now writing the spec."
projectName: guild-hall
---
Wrote the system prompt optimization spec to `.lore/specs/infrastructure/system-prompt-optimization.md` (status: draft, req-prefix: SPO).

The spec covers 25 requirements across two decisions:

**Decision 1 (REQ-SPO-1 through REQ-SPO-5):** Remove memory injection from sub-agent activation. Sub-agents get soul + identity + posture only. Eliminates 24 file reads per session start and reduces sub-agent prompt size by 600-11K chars each.

**Decision 2 (REQ-SPO-6 through REQ-SPO-25):** Split `ActivationResult` into stable `systemPrompt` (soul, identity, posture, memory guidance) and session-specific `sessionContext` (memory content, commission task + protocol, meeting agenda, manager context). Key details:
- Memory guidance stays in system prompt (behavioral instruction). Memory content moves to session context.
- `SessionPrepResult` gains a `sessionContext` field for orchestrator composition.
- Commission prompt duplication is eliminated (currently in both system prompt and first user message).
- Meeting resume correctly preserves session context from the original first message; renewal re-injects it.
- Guild Master's `activateManager()` follows the same split pattern.
- `ActivationContext` fields are unchanged; the activation function still owns all prompt formatting.
