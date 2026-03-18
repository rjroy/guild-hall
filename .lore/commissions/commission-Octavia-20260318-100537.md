---
title: "Commission: Memory redesign: Fix stale documentation (4 findings)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Thorne's final review of the memory single-file redesign found four stale documentation references. Fix all of them.\n\n**Finding 1 (Medium):** `CLAUDE.md` line ~121 describes `memory-compaction.ts` as current architecture (\"Long-running sessions get async memory summarization via `daemon/services/memory-compaction.ts`\"). That module was deleted. Replace with a brief description of the new single-file memory system, or remove the paragraph if the Key Patterns section doesn't need it.\n\n**Finding 2 (Low):** Two worker skill files reference `write_memory` without noting it's deprecated:\n- `packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md:104`\n- `packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md:110`\nUpdate these to reference `edit_memory`.\n\n**Finding 3 (Low):** `.lore/reference/workers-toolbox.md` describes the old multi-file memory system with `needsCompaction`, `memory-compaction.ts`, `triggerCompaction()`. Update to reflect the single-file redesign.\n\n**Finding 4 (Informational):** `.lore/specs/infrastructure/system-model-defaults.md` REQ-SYS-MODEL-5 references `memory-compaction.ts:291`. Note that the `memoryCompaction` config field is deprecated per REQ-MEM-21.\n\nRun typecheck, lint, and tests before submitting."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T17:05:37.546Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T17:05:37.548Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
