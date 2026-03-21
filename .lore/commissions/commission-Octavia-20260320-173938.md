---
title: "Commission: Plan: Decisions surface (artifact persistence + triage promotion)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Plan Task\n\nRead the spec at `.lore/specs/infrastructure/decisions-surface.md` and prepare an implementation plan at `.lore/plans/infrastructure/decisions-surface.md`.\n\nFollow the plan format established by existing plans in `.lore/plans/`. Reference the spec's REQ IDs. Include:\n\n- Codebase context: which files are touched, what exists today\n- Phased implementation steps with clear boundaries\n- Test strategy for each phase\n- A delegation guide (which worker for which phase, review checkpoints)\n- Risk assessment\n- REQ coverage matrix\n\n### Context to Read\n\n- `.lore/specs/infrastructure/decisions-surface.md` — the spec you're planning for\n- `.lore/brainstorm/decisions-surface.md` — the brainstorm that led to the spec (Option 2 was chosen)\n- `.lore/plans/infrastructure/commission-outcomes-to-memory.md` — the outcomes-to-memory plan, since the triage promotion aspect depends on it\n- `daemon/services/base-toolbox.ts` — where `record_decision` and `makeRecordDecisionHandler` live, where decision JSONL is written\n- `daemon/services/commission/orchestrator.ts` — commission completion/cleanup lifecycle\n- `daemon/services/meeting/orchestrator.ts` — meeting completion/cleanup lifecycle\n- `daemon/services/outcome-triage.ts` — the triage service (may already exist if Dalton's commission completed)\n\n### Key Considerations\n\nThis feature has two parts:\n1. **Artifact persistence** — lifecycle hook reads decisions.jsonl, appends to artifact body before state cleanup. This is standalone code.\n2. **Triage prompt guidance** — the outcomes-to-memory triage prompt should recognize decisions in artifact bodies and promote cross-cutting ones to memory. This may be a prompt tweak to the existing triage service rather than new code.\n\nThe plan should address whether part 2 is a code change or a prompt-only change, and sequence accordingly."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T00:39:38.396Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T00:39:38.397Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
