---
title: "Commission: Review: Dashboard selection model implementation"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the dashboard selection model implementation across all three phases.\n\n## Context\n\nThe spec is at `.lore/specs/ui/dashboard-selection-model.md` (REQ-DASH-1 through REQ-DASH-23).\nThe plan is at `.lore/plans/ui/dashboard-selection-model.md` (14 steps across 3 phases).\n\nThree commissions implemented this:\n- Phase 1 (commission-Dalton-20260315-092326): Filter extraction, \"In Flight\" card, sidebar \"All Projects\"\n- Phase 2 (commission-Dalton-20260315-092336): Recent Scrolls all-projects fetch, Pending Audiences filter\n- Phase 3 (commission-Dalton-20260315-092349): Briefing config, all-projects synthesis, cleanup, validation\n\n## Review Scope\n\n1. **Spec compliance**: Walk through every REQ-DASH requirement and verify it's addressed in the implementation. Flag any that are missing or partially implemented.\n\n2. **Code correctness**: Read all changed files. Look for:\n   - Client/server component boundary violations (server-only imports in client components)\n   - State management issues in the new \"In Flight\" card\n   - `CommissionFilterPanel` receiving more than it needs\n   - Silent failure patterns in `generateAllProjectsBriefing`\n   - TTL computation consistency (`briefingCacheTtlMinutes` wiring end-to-end)\n   - Dead code left behind (especially `build-tree-list.ts` and old `commissionHref` re-exports)\n\n3. **Error handling**: What happens when the all-projects briefing synthesis fails? When a project's HEAD can't be read? When the artifact fetch fails for one project but not others?\n\n4. **Test coverage**: Are the tests specified in Step 12 of the plan actually written? Do they test the right things?\n\n5. **Integration gaps**: Does the \"All Projects\" sidebar entry actually deselect the current project? Does the Next.js static route `/api/briefing/all` take precedence over `[projectName]`?\n\n## How to review\n\nRead the spec first, then the plan, then the implementation. Use `git diff` against the base to see all changes. Present all findings with their actual impact. Do not triage findings into \"worth fixing\" vs \"pre-existing\" — that's the user's call.\n\nWrite your findings to `.lore/notes/review-dashboard-selection-model.md`.\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T16:58:16.151Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T16:58:16.152Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
