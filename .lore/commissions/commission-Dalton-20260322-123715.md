---
title: "Commission: Fix: Add meetingContext and commissionContext to activateManager system prompt"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the meeting agenda injection bug in `daemon/services/manager/worker.ts`.\n\n**Bug:** `activateManager()` (lines 196-239) does not render `meetingContext` or `commissionContext` into the system prompt. The shared activation path at `packages/shared/worker-activation.ts:32-65` does. This means the Guild Master never sees the meeting agenda or commission context.\n\n**Fix:** Add the `meetingContext` and `commissionContext` conditional rendering blocks to `activateManager()`, matching the pattern from `packages/shared/worker-activation.ts:32-65`. Insert after the memory block and before the manager context block.\n\n**Diagnosis:** `.lore/commissions/commission-Sable-20260322-113518.md`\n**Review:** `.lore/commissions/commission-Thorne-20260322-114052.md`\n\nAdd a test verifying that `activateManager` includes meeting agenda and commission context when provided in the activation context."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T19:37:15.709Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T19:37:15.711Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
