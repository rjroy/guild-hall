---
title: "Commission: Review: System prompt optimization Phase 2"
date: 2026-03-30
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review Phase 2 of the system prompt optimization.\n\n**Spec:** `.lore/specs/infrastructure/system-prompt-optimization.md` (REQ-SPO-6 through REQ-SPO-25)\n**Plan:** `.lore/plans/infrastructure/system-prompt-optimization.md` (Phase 2 section)\n\n**Verify:**\n- `ActivationResult` has `systemPrompt` (stable) and `sessionContext` (session-specific)\n- `systemPrompt` contains ONLY: soul, identity, posture, memory guidance (+ model guidance for GM)\n- `systemPrompt` does NOT contain: memory content, commission context, meeting context, manager context\n- `sessionContext` contains: memory scope data, commission/meeting/manager context\n- `MEMORY_GUIDANCE` exported from memory-injector, passed through `ActivationContext.memoryGuidance` (no boundary crossing from packages/ to daemon/)\n- `loadMemories` returns scope content without guidance prefix\n- Commission orchestrator passes `sessionContext` to `runSdkSession` (no task duplication)\n- Meeting new session: sessionContext + greeting prompt\n- Meeting resume: user message only, no sessionContext re-injection\n- Meeting renewal: sessionContext alone (no transcript doubling)\n- Sub-agent map uses `systemPrompt` only, `sessionContext` ignored\n- All existing tests updated with correct split assertions\n- New tests for meeting paths, commission prompt composition\n- Full test suite passes, typecheck clean, lint clean, build clean"
dependencies:
  - commission-Dalton-20260330-030656
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T10:07:08.394Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T10:09:57.963Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
