---
title: "Commission: Plan: Guild Capabilities Discovery tool"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the approved spec at `.lore/specs/workers/guild-capabilities-discovery.md`.\n\nThe plan should live at `.lore/plans/workers/guild-capabilities-discovery.md`.\n\nBefore writing, read these files for context on the patterns this plan must follow:\n- `.lore/plans/infrastructure/project-briefing-tool.md` — The most recent plan for an identical type of work (adding a read-only tool to the base toolbox with DI callback wiring). Use this as your structural template. The pattern established there (deps interface → toolbox resolver wiring → production wiring → tool implementation → tests → validation) is the pattern to follow.\n- `daemon/services/base-toolbox.ts` — Current base toolbox implementation (where the tool will be added)\n- `daemon/services/toolbox-types.ts` — Current deps interfaces\n- `daemon/services/toolbox-resolver.ts` — Where deps are assembled\n- `daemon/app.ts` — Production wiring\n\nThe spec defines 7 requirements (REQ-DISC-1 through REQ-DISC-7). The plan must cover all of them. Key points:\n- REQ-DISC-4 requires a `WorkerIdentity[]` callback, not just `string[]`. The existing `knownWorkerNames` is insufficient. Trace where `knownWorkerNames` is populated and determine how to get `WorkerIdentity[]` from the same source.\n- REQ-DISC-6 mandates DI callback pattern (no filesystem access from base toolbox).\n- REQ-DISC-7 requires graceful degradation when callback is absent.\n\nInclude a delegation guide: who should implement, who should review, and at which step.\n\nThe plan status should be `draft` (I'll review before approving)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T03:38:09.613Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:38:09.615Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
