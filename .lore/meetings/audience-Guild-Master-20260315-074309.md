---
title: "What's Next - Project Priorities"
date: 2026-03-15
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "What's next"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-15T14:43:09.205Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-15T14:43:24.952Z
    event: renamed
    reason: "Renamed to: What's Next - Project Priorities"
  - timestamp: 2026-03-15T14:45:37.099Z
    event: progress_summary
    reason: "Updated Guild Master worker memory against current `.lore/issues/` directory. Removed stale entries (commission list filtering shipped in #112, scheduled commissions test gaps and ask-user-question async no longer tracked). Added recent PRs #112-#115. Three open issues remain: meetings list no preview, recent scrolls empty state, package distribution model."
  - timestamp: 2026-03-15T17:34:05.708Z
    event: closed
    reason: "User closed audience"
---
# Meeting Notes: Dashboard Selection Model Implementation

## Summary

The Guild Master and team completed implementation of the dashboard selection model specification, a multi-phase feature enabling users to view either all projects or a single selected project on the main dashboard. Dalton executed a 14-step implementation plan organized into three phases: filter extraction and sidebar updates (Phase 1), recent artifacts and pending audiences filtering (Phase 2), and briefing configuration and synthesis (Phase 3). The work modified 68 files, added comprehensive test coverage across config, briefing generation, artifact merging, and filter logic, and introduced configurable briefing cache TTL (`briefingCacheTtlMinutes`). Thorne conducted a complete specification audit after implementation and identified three issues requiring fixes: REQ-DASH-7 violation where InFlight was receiving unfiltered commissions in single-project mode, inconsistent worker display fallback behavior between InFlight and CommissionList views, and error-message inputs being fed to the all-projects briefing synthesis when per-project generation fails.

All 23 REQ-DASH requirements were verified as addressed. The implementation includes proper client/server boundary separation, consistent TTL wiring end-to-end, a shared CommissionFilterPanel component with minimal props, complete dead code cleanup (removal of build-tree-list.ts), and correct Next.js static route precedence for the all-projects briefing endpoint. Test coverage encompasses filter function regression tests, config TTL parsing, briefing generator all-projects behavior, composite HEAD hash changes, artifact merge logic, and configurable TTL behavior. Dalton applied all three fixes post-review.

## Key Decisions and Reasoning

Single unified briefing component for both modes instead of separate code paths: ManagerBriefing now fetches either project-specific or all-projects synthesis based on selectedProject parameter, reducing duplication and simplifying the UI contract.

Sequential per-project briefing generation within all-projects synthesis (not parallel): This avoids overwhelming the LLM session management while allowing individual project caches to serve valid results; the spec requirement REQ-DASH-16 explicitly mandates sequential generation.

Shared ArtifactWithProject type in lib/types.ts rather than duplicating across page.tsx and RecentArtifacts.tsx: Avoids circular imports and maintains a single source of truth for the enriched artifact structure.

CommissionFilterPanel as a pure stateless component receiving only commissions, selected set, onToggle, and onReset: This follows the Level 1 extraction pattern and ensures the filter panel has no internal state, making it reusable across InFlight and CommissionList.

Default briefingCacheTtlMinutes of 60 minutes applied at consumption site rather than in config validation: Keeps the config schema simple (optional field) and reserves the default logic for the component using it.

## Artifacts Produced and Referenced

.lore/plans/ui/dashboard-selection-model.md — 537-line implementation plan detailing all 14 steps, file-by-file modifications, requirement mapping, and risk mitigation strategies.

.lore/specs/ui/dashboard-selection-model.md — 153-line specification defining 23 REQ-DASH requirements covering two-mode UI, filter behavior, briefing synthesis, and configuration.

.lore/notes/review-dashboard-selection-model.md — 190-line code review documenting spec compliance verification, three findings (one defect, two cosmetic concerns), test coverage assessment, and implementation quality observations.

GitHub PR #116 — 68-file changeset containing all dashboard selection model implementation across daemon services, web components, configuration, tests, and type definitions. Includes 31 commits organized by feature phase.

## Open Items and Follow-ups

None. The feature is complete, reviewed, corrected, and merged to the integration branch. All 23 requirements are satisfied. The PR is ready for merge to main.
