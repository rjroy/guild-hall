---
title: "Commission: Spec: Commission and meeting outcomes to memory"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Spec Task: Commission and Meeting Outcomes to Memory\n\nWrite a spec at `.lore/specs/infrastructure/commission-outcomes-to-memory.md`.\n\n### Source Material\n\nRead both of these thoroughly before writing:\n\n1. **Brainstorm**: `.lore/brainstorm/commission-outcomes-to-memory.md` — defines the triage approach, the hook points, the input shape, and the open questions.\n2. **Research**: `.lore/research/memory-retention-prompt-design.md` — Verity's research on memory retention prompt design, including what other systems do and concrete prompt patterns.\n\nAlso read:\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — for how the daemon services are structured\n- `.lore/brainstorm/whats-next-2026-03-17.md` — for broader context on where this fits\n- The existing memory system: `daemon/services/memory-injector.ts`, `daemon/services/base-toolbox.ts` (the edit_memory tool)\n- The event router spec if it exists, since the brainstorm mentions the triage call hooks into it\n\n### What the Spec Should Cover\n\nThis is a first pass. The spec should define:\n\n1. **The triage prompt template** — this is the load-bearing design question from the brainstorm. Use Verity's research to ground the design. Should it be a single generic prompt or a base prompt with project-specific overlays? What categories of information should it extract? Include the actual prompt text or a close approximation.\n\n2. **The event subscription contract** — when does the triage fire, what event triggers it, what data does it receive.\n\n3. **The memory write format** — what does the output look like, how does it integrate with the existing section-based memory system.\n\n4. **The model and session shape** — Haiku, single-turn or minimal multi-turn, what tools (if any) does it get.\n\n5. **Failure modes** — what happens if the triage call fails, is slow, or produces garbage. The brainstorm says commission/meeting completion is unaffected.\n\n6. **Success criteria** — how do we know the prompt is working well? What does \"the right things get remembered\" look like in testable terms?\n\nFollow the existing spec format in `.lore/specs/`. Use REQ- prefixed requirement IDs."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md

activity_timeline:
  - timestamp: 2026-03-20T20:15:44.080Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T20:15:44.081Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T20:15:44.124Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T20:15:51.931Z
    event: progress_report
    reason: "Reading source material: brainstorm, research, DAB spec, memory system code, and event router spec."
  - timestamp: 2026-03-20T20:16:36.614Z
    event: progress_report
    reason: "All source material read. Writing the spec now."
  - timestamp: 2026-03-20T20:21:07.042Z
    event: progress_report
    reason: "Spec review complete. Fixing three issues: (1) projectName resolution gap, (2) REQ-OTMEM-3/4 contradiction, (3) meeting context resolution."
  - timestamp: 2026-03-20T20:25:01.056Z
    event: result_submitted
    reason: "Wrote the spec at `.lore/specs/infrastructure/commission-outcomes-to-memory.md` covering all six required areas:\n\n1. **Triage prompt template** (REQ-OTMEM-8 through REQ-OTMEM-11): Full prompt text included. Single generic template for both commissions and meetings. Seven extraction categories (decisions, discoveries, capabilities, failures, process lessons, status changes, user direction). Explicit skip criteria. Structured JSON output with empty-result path. Existing memory injection for deduplication. Grounded in research findings: conservative bias, concrete examples per category, standalone facts.\n\n2. **Event subscription contract** (REQ-OTMEM-1 through REQ-OTMEM-4): Fires on `commission_result` (completed), `commission_status` with halted/failed, and `meeting_ended`. Resolves `projectName` by reading activity artifacts from integration worktree via a `readArtifact` callback. Follows Event Router's EventBus subscription pattern.\n\n3. **Memory write format** (REQ-OTMEM-12 through REQ-OTMEM-16): JSON array output. Each entry has action/section/operation/content. Writes directly via `parseMemorySections`/`renderMemorySections` with `withMemoryLock`. Multiple entries written sequentially within a single lock.\n\n4. **Model and session shape** (REQ-OTMEM-17 through REQ-OTMEM-19): Haiku, single-turn direct API call (not the full SDK runner pipeline). No tools provided. Memory injected into prompt, writes handled by the service.\n\n5. **Failure modes** (REQ-OTMEM-20 through REQ-OTMEM-23): Fire-and-forget. Activity completion unaffected. Malformed output logged and discarded. Empty entries skipped individually. No retry.\n\n6. **Success criteria**: 13 testable criteria covering correct firing, project scope, skip behavior, extraction quality, deduplication, standalone entries, failure isolation, atomicity, concurrency, and testability.\n\n27 requirements total (REQ-OTMEM-1 through REQ-OTMEM-27). Reviewed by fresh-context spec reviewer, which caught three issues that were fixed: projectName resolution gap, REQ-OTMEM-3/4 subscription logic clarity, and meeting context resolution.\n\n**Note:** The commit is staged but could not be committed due to a pre-existing sandbox environment issue: the pre-commit hook runs the test suite, which fails because `/tmp/claude/` doesn't exist in the commission worktree sandbox. Typecheck and lint both pass. The spec file is staged and ready to commit once the worktree is merged."
  - timestamp: 2026-03-20T20:25:03.586Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec review complete. Fixing three issues: (1) projectName resolution gap, (2) REQ-OTMEM-3/4 contradiction, (3) meeting context resolution."
projectName: guild-hall
---
Wrote the spec at `.lore/specs/infrastructure/commission-outcomes-to-memory.md` covering all six required areas:

1. **Triage prompt template** (REQ-OTMEM-8 through REQ-OTMEM-11): Full prompt text included. Single generic template for both commissions and meetings. Seven extraction categories (decisions, discoveries, capabilities, failures, process lessons, status changes, user direction). Explicit skip criteria. Structured JSON output with empty-result path. Existing memory injection for deduplication. Grounded in research findings: conservative bias, concrete examples per category, standalone facts.

2. **Event subscription contract** (REQ-OTMEM-1 through REQ-OTMEM-4): Fires on `commission_result` (completed), `commission_status` with halted/failed, and `meeting_ended`. Resolves `projectName` by reading activity artifacts from integration worktree via a `readArtifact` callback. Follows Event Router's EventBus subscription pattern.

3. **Memory write format** (REQ-OTMEM-12 through REQ-OTMEM-16): JSON array output. Each entry has action/section/operation/content. Writes directly via `parseMemorySections`/`renderMemorySections` with `withMemoryLock`. Multiple entries written sequentially within a single lock.

4. **Model and session shape** (REQ-OTMEM-17 through REQ-OTMEM-19): Haiku, single-turn direct API call (not the full SDK runner pipeline). No tools provided. Memory injected into prompt, writes handled by the service.

5. **Failure modes** (REQ-OTMEM-20 through REQ-OTMEM-23): Fire-and-forget. Activity completion unaffected. Malformed output logged and discarded. Empty entries skipped individually. No retry.

6. **Success criteria**: 13 testable criteria covering correct firing, project scope, skip behavior, extraction quality, deduplication, standalone entries, failure isolation, atomicity, concurrency, and testability.

27 requirements total (REQ-OTMEM-1 through REQ-OTMEM-27). Reviewed by fresh-context spec reviewer, which caught three issues that were fixed: projectName resolution gap, REQ-OTMEM-3/4 subscription logic clarity, and meeting context resolution.

**Note:** The commit is staged but could not be committed due to a pre-existing sandbox environment issue: the pre-commit hook runs the test suite, which fails because `/tmp/claude/` doesn't exist in the commission worktree sandbox. Typecheck and lint both pass. The spec file is staged and ready to commit once the worktree is merged.
