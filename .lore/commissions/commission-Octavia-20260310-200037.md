---
title: "Commission: Plan: Fix dashboard hydration mismatch error"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a plan to fix the hydration mismatch error described in `.lore/issues/hydration-error-dashboard.md`.\n\n**Your task is planning only, not implementation.** Produce a plan artifact in `.lore/plans/ui/`.\n\nSteps:\n1. Read the issue file at `.lore/issues/hydration-error-dashboard.md` for full context.\n2. Investigate the dashboard page (`web/app/page.tsx`) and its child components to identify which elements render differently between server and client. Focus on date/time rendering, browser-dependent conditionals, and any `Date.now()` or `new Date()` calls in server components.\n3. Check the briefing panel, \"Recent Scrolls\" timestamps, and commission date displays as the likely candidates called out in the issue.\n4. Write a plan that:\n   - Identifies the specific component(s) causing the mismatch\n   - Proposes the minimal fix for each (client component, suppressHydrationWarning, useEffect guard, etc.)\n   - Includes verification steps (how to confirm the fix works)\n   - Includes test requirements\n\nSave the plan to `.lore/plans/ui/fix-dashboard-hydration.md`."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/fix-dashboard-hydration.md

activity_timeline:
  - timestamp: 2026-03-11T03:00:37.658Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T03:00:37.663Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-11T03:00:37.707Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T03:00:43.594Z
    event: progress_report
    reason: "Reading the issue file and dashboard page to understand the hydration mismatch."
  - timestamp: 2026-03-11T03:02:28.775Z
    event: progress_report
    reason: "Investigated all dashboard child components. No obvious Date.now()/new Date() in server components. Checking deeper: DependencyGraph serialization, recentArtifacts function, and any implicit serialization paths."
  - timestamp: 2026-03-11T03:06:52.375Z
    event: progress_report
    reason: "Completed thorough investigation of all dashboard components. No single smoking gun found in static analysis. Writing the plan with diagnostic steps and fix proposals for all likely candidates."
  - timestamp: 2026-03-11T03:11:26.975Z
    event: result_submitted
    reason: "Created plan at `.lore/plans/ui/fix-dashboard-hydration.md` for fixing the dashboard hydration mismatch error.\n\n**Key findings from investigation:**\n- Examined all five dashboard child components plus the layout wrapper. No definitive smoking gun found through static analysis alone.\n- All three client components in the dashboard tree (`ManagerBriefing`, `MeetingRequestCard`, `CommissionGraph`) have deterministic initial renders with no date/time values in the render path.\n- `ManagerBriefing.formatRelativeTime` uses `Date.now()` but only after `useEffect` fetch, making it the most likely latent risk.\n\n**Plan structure:**\n1. **Diagnosis first** (Step 1): Run dev server, capture the exact mismatch from React's console error, which identifies the specific DOM element.\n2. **Four fix strategies** keyed to mismatch type: date/time values (Strategy A), CSS Module hashes (Strategy B), structural differences (Strategy C), attribute mismatches (Strategy D).\n3. **Proactive hardening** (Step 2): Add `suppressHydrationWarning` to the ManagerBriefing timestamp, add defensive comments to prevent `RecentArtifacts` from becoming a client component.\n4. **Verification matrix** (Step 3): Dev console check across multiple scenarios, production build, cross-browser, mobile viewport.\n5. **Test requirements** (Step 4): Existing suite validation, new unit/component tests if behavior changes, regression prevention documentation.\n\nAlso documented locale-sensitive date formatting found in `CommissionList`, `CommissionScheduleInfo`, and `CommissionTimeline` as related findings for other pages (not dashboard)."
  - timestamp: 2026-03-11T03:11:40.908Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Completed thorough investigation of all dashboard components. No single smoking gun found in static analysis. Writing the plan with diagnostic steps and fix proposals for all likely candidates."
projectName: guild-hall
---
Created plan at `.lore/plans/ui/fix-dashboard-hydration.md` for fixing the dashboard hydration mismatch error.

**Key findings from investigation:**
- Examined all five dashboard child components plus the layout wrapper. No definitive smoking gun found through static analysis alone.
- All three client components in the dashboard tree (`ManagerBriefing`, `MeetingRequestCard`, `CommissionGraph`) have deterministic initial renders with no date/time values in the render path.
- `ManagerBriefing.formatRelativeTime` uses `Date.now()` but only after `useEffect` fetch, making it the most likely latent risk.

**Plan structure:**
1. **Diagnosis first** (Step 1): Run dev server, capture the exact mismatch from React's console error, which identifies the specific DOM element.
2. **Four fix strategies** keyed to mismatch type: date/time values (Strategy A), CSS Module hashes (Strategy B), structural differences (Strategy C), attribute mismatches (Strategy D).
3. **Proactive hardening** (Step 2): Add `suppressHydrationWarning` to the ManagerBriefing timestamp, add defensive comments to prevent `RecentArtifacts` from becoming a client component.
4. **Verification matrix** (Step 3): Dev console check across multiple scenarios, production build, cross-browser, mobile viewport.
5. **Test requirements** (Step 4): Existing suite validation, new unit/component tests if behavior changes, regression prevention documentation.

Also documented locale-sensitive date formatting found in `CommissionList`, `CommissionScheduleInfo`, and `CommissionTimeline` as related findings for other pages (not dashboard).
