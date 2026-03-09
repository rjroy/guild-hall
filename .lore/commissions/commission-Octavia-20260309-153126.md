---
title: "Commission: Plan: local model support via Ollama"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for local model support via Ollama. The spec is complete at `.lore/specs/local-model-support.md`.\n\nRead:\n1. The spec: `.lore/specs/local-model-support.md`\n2. The issue: `.lore/issues/local-model-support.md`\n3. The brainstorm it builds on: `.lore/brainstorm/model-selection.md`\n4. The session spawning code: `daemon/lib/agent-sdk/sdk-runner.ts`\n5. The commission orchestrator: `daemon/services/commission/orchestrator.ts`\n6. The config schema: `lib/types.ts` (look for AppConfig, Zod schemas)\n7. The daemon production wiring: `daemon/app.ts`\n\nThen write a plan to `.lore/plans/local-model-support.md` that breaks the work into ordered implementation steps. Each step should identify the files to change, what changes, and any dependencies on prior steps. Follow the plan conventions used in other `.lore/plans/` files.\n\nConsider phasing: config schema first, then daemon wiring, then validation, then UI (if any). Keep the plan implementable by Dalton in focused commissions."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:31:26.266Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:31:26.267Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
