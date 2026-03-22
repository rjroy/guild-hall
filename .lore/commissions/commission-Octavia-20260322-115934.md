---
title: "Commission: Spec hygiene: Mark superseded specs for worker tool boundaries"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Phase 5 of the worker tool boundaries plan (`.lore/plans/workers/worker-tool-boundaries.md`):\n\n**Step 5.1:** Mark `.lore/specs/workers/worker-tool-rules.md` as superseded. Change frontmatter status to `superseded`. Add note at top of body: \"Superseded by Worker Tool Boundaries spec. The canUseToolRules mechanism has been removed.\"\n\n**Step 5.2:** Update `.lore/specs/infrastructure/sandboxed-execution.md`. Add a note to the Phase 2 / Gate 3 / canUseTool callback section indicating it has been superseded by the worker-tool-boundaries spec. Phase 1 (SDK sandbox) remains in effect."
dependencies:
  - commission-Dalton-20260322-115736
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T18:59:34.491Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:04:04.082Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-22T19:23:30.743Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-22T19:23:30.746Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
