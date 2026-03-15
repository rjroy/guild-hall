---
title: "Commission: Implement: Dashboard selection model - Phase 3 (briefing synthesis)"
date: 2026-03-15
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 8-14 from `.lore/plans/ui/dashboard-selection-model.md`.\n\nThis phase covers:\n- Step 8: Add `briefingCacheTtlMinutes` config\n- Step 9: Add all-projects briefing to daemon (composite HEAD hash, sequential per-project generation, synthesis prompt, `_all.json` cache)\n- Step 10: Web layer for all-projects briefing (`web/app/api/briefing/all/route.ts`, update `ManagerBriefing.tsx`)\n- Step 11: Remove silent briefing fallback in `page.tsx`\n- Step 12: Unit tests for all new logic\n- Step 13: Clean up dead code, close the recent-scrolls-empty-state issue\n- Step 14: Validate against spec (launch review sub-agents)\n\nRead the full plan for detailed file lists, synthesis prompt template, cache logic, and test specifications. The spec is at `.lore/specs/ui/dashboard-selection-model.md`.\n\nKey constraints:\n- `generateAllProjectsBriefing()` calls per-project briefings sequentially, not in parallel.\n- Composite HEAD hash: concatenate HEAD commits sorted by project name, SHA-256 hash.\n- Synthesis prompt uses Guild Master voice. See plan Step 9 for the template.\n- `briefingCacheTtlMinutes` defaults to 60 when not set in config.\n- Next.js static route `web/app/api/briefing/all/route.ts` must take precedence over `[projectName]`.\n- Remove the \"Select a project\" early return from `ManagerBriefing.tsx`.\n- Write all tests specified in Step 12. Run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run build`. All must pass.\n- Run the spec review and code review described in Step 14.\n"
dependencies:
  - commission-Dalton-20260315-092336
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T16:23:49.740Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
