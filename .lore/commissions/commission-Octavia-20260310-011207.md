---
title: "Commission: Plan: Show status text alongside gem indicators"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Plan a resolution for making artifact/commission/meeting status visible as text, not just gem color.\n\n**Problem:** The project page shows commissions, meetings, and artifacts with a GemIndicator that maps ~20 status strings down to 4 gem colors (active/pending/blocked/info). Users can't distinguish \"complete\" from \"approved\" from \"implemented\" (all green), or \"draft\" from \"blocked\" from \"queued\" (all amber). The status string needs to be visible.\n\n**Current state:**\n- `GemIndicator` at `web/components/ui/GemIndicator.tsx`: renders a colored gem image with 4 variants (active/pending/blocked/info), sizes sm/md\n- `statusToGem()` at `lib/types.ts:252`: maps ~20 statuses to 4 gem colors\n- `CommissionList` at `web/components/commission/CommissionList.tsx`: uses `<GemIndicator status={gem} size=\"sm\" />` per row\n- `MeetingList` at `web/components/project/MeetingList.tsx`: uses `<GemIndicator status={gem} size=\"sm\" />` per row, has its own `meetingStatusToGem()` mapping\n- `ArtifactList` at `web/components/project/ArtifactList.tsx`: uses `<GemIndicator status={gemStatus} size=\"sm\" />` per row in the tree view\n\n**Status values in the wild:**\n- Active gem: approved, active, current, complete, completed, done, implemented, shipped\n- Pending gem: draft, open, pending, requested, blocked, queued, paused\n- Blocked gem: superseded, outdated, wontfix, declined, failed, cancelled, abandoned\n- Info gem: everything else\n\n**What to plan:**\n1. How to display the status string alongside the gem. Options include: a text label next to the gem, a badge/chip component, incorporating it into the existing meta line, or replacing the gem entirely with a styled text badge that carries the color.\n2. Where this applies: all three list components (CommissionList, MeetingList, ArtifactList) and potentially the dashboard views.\n3. Whether GemIndicator itself should be enhanced to optionally show text, or whether a new composite component wraps gem + label.\n4. CSS approach: fits the existing fantasy/glassmorphic aesthetic. Check `web/app/globals.css` for design tokens.\n\n**Constraints:**\n- CSS Modules, not Tailwind\n- Fantasy chrome aesthetic (brass, parchment, glassmorphic panels)\n- Keep the gem as a visual accent if possible (it adds character), but the text must be readable and clearly associated\n- Mobile-friendly (status text shouldn't break layouts on small screens)\n\nOutput the plan to `.lore/plans/status-text-visibility.md`."
dependencies: []
linked_artifacts:
  - .lore/plans/status-text-visibility.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T08:12:07.439Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:12:07.440Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T08:12:07.474Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T08:12:16.583Z
    event: progress_report
    reason: "Reading source files before drafting the plan. Examining GemIndicator, list components, globals.css, and existing plan format."
  - timestamp: 2026-03-10T08:15:31.667Z
    event: progress_report
    reason: "Finished reading all relevant source files. Drafting the plan to .lore/plans/status-text-visibility.md."
  - timestamp: 2026-03-10T08:17:24.617Z
    event: result_submitted
    reason: "Plan written to `.lore/plans/status-text-visibility.md`. \n\n**Core decision**: Create a new `StatusBadge` composite component (`web/components/ui/StatusBadge.tsx`) that wraps a `GemIndicator` plus a text label. GemIndicator itself stays unchanged. StatusBadge accepts `gem: GemStatus` (pre-computed, to avoid re-centralizing the meeting/commission status mapping split) plus `label: string` (raw status string, auto-formatted via a new `formatStatus()` utility in `lib/types.ts`).\n\n**Why not extend GemIndicator**: The current component is a clean single-purpose img renderer. Layout + text is a new concern; a composite keeps it clean.\n\n**Why pre-computed `gem` prop**: `meetingStatusToGem(\"open\")` = active (green), but `statusToGem(\"open\")` = pending (amber). Centralizing computation inside StatusBadge would require it to know about this divergence. The mapping stays in the existing functions; StatusBadge only handles display.\n\n**Scope**: Five list components (CommissionList, MeetingList, ArtifactList, RecentArtifacts, DependencyMap). Single-item views (CommissionHeader, MetadataSidebar, etc.) explicitly excluded.\n\n**Implementation plan**: 11 steps in 3 phases — foundation (tokens + formatStatus + StatusBadge + tests), rollout (5 component swaps), validation (test updates + fresh-eyes review)."
  - timestamp: 2026-03-10T08:17:33.591Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all relevant source files. Drafting the plan to .lore/plans/status-text-visibility.md."
projectName: guild-hall
---
Plan written to `.lore/plans/status-text-visibility.md`. 

**Core decision**: Create a new `StatusBadge` composite component (`web/components/ui/StatusBadge.tsx`) that wraps a `GemIndicator` plus a text label. GemIndicator itself stays unchanged. StatusBadge accepts `gem: GemStatus` (pre-computed, to avoid re-centralizing the meeting/commission status mapping split) plus `label: string` (raw status string, auto-formatted via a new `formatStatus()` utility in `lib/types.ts`).

**Why not extend GemIndicator**: The current component is a clean single-purpose img renderer. Layout + text is a new concern; a composite keeps it clean.

**Why pre-computed `gem` prop**: `meetingStatusToGem("open")` = active (green), but `statusToGem("open")` = pending (amber). Centralizing computation inside StatusBadge would require it to know about this divergence. The mapping stays in the existing functions; StatusBadge only handles display.

**Scope**: Five list components (CommissionList, MeetingList, ArtifactList, RecentArtifacts, DependencyMap). Single-item views (CommissionHeader, MetadataSidebar, etc.) explicitly excluded.

**Implementation plan**: 11 steps in 3 phases — foundation (tokens + formatStatus + StatusBadge + tests), rollout (5 component swaps), validation (test updates + fresh-eyes review).
