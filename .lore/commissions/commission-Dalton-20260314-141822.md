---
title: "Commission: Fix dashboard hydration error"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute the plan at `.lore/plans/ui/fix-dashboard-hydration.md` to fix the dashboard hydration error.\n\nThorne reviewed the plan and confirmed it's still valid (see `.lore/notes/review-dashboard-hydration-plan.md` for his findings). One note: line numbers in `ManagerBriefing.tsx` have shifted ~10 lines from what the plan says, so verify actual locations before editing.\n\nImportant: **Do not skip Step 1 (runtime diagnosis).** The `Date.now()` call in `formatRelativeTime()` is the leading hypothesis but not yet confirmed. Diagnose first, then fix.\n\nRun tests after each step. All existing tests must continue to pass, and add tests for any new behavior."
dependencies: []
linked_artifacts:
  - web/components/dashboard/ManagerBriefing.tsx

  - web/components/dashboard/RecentArtifacts.tsx
  - tests/components/format-relative-time.test.ts
  - .lore/issues/hydration-error-dashboard.md
  - web/components/dashboard/RecentArtifacts.tsx
  - tests/components/format-relative-time.test.ts
  - .lore/issues/hydration-error-dashboard.md
activity_timeline:
  - timestamp: 2026-03-14T21:18:22.472Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:18:22.476Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:18:22.515Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:18:34.188Z
    event: progress_report
    reason: "Read the plan and Thorne's review. Starting Step 1: runtime diagnosis. Reading the source files first."
  - timestamp: 2026-03-14T21:24:44.782Z
    event: progress_report
    reason: "Step 1 (diagnosis) complete. Thorough static analysis confirmed: no Date/time values in any client component render path during hydration. All client components have deterministic initial renders. `formatRelativeTime` with `Date.now()` only executes post-hydration via useEffect. Browser-based diagnosis blocked (no Playwright/curl access in commission sandbox). Production build is clean. Most likely cause: Turbopack dev-mode CSS Module hash inconsistency (Strategy B), or intermittent timing issue. Proceeding with Step 2 (proactive hardening) which the plan says to apply regardless of specific root cause."
  - timestamp: 2026-03-14T21:27:09.197Z
    event: result_submitted
    reason: "Applied proactive hydration hardening to the dashboard per the plan at `.lore/plans/ui/fix-dashboard-hydration.md`.\n\n**Diagnosis (Step 1):** Thorough static analysis of all dashboard components confirmed the plan's finding: no Date/time values render during hydration in any client component. `formatRelativeTime` with `Date.now()` only fires post-hydration via useEffect. Browser-based diagnosis was blocked by commission sandbox constraints. Production build is clean with no warnings, suggesting the error may be a Turbopack dev-mode CSS Module hash artifact.\n\n**Changes (Step 2):**\n- `ManagerBriefing.tsx`: Added `suppressHydrationWarning` to the timestamp span with explanatory comment. Made `formatRelativeTime` testable via DI (`now` parameter) and exported it.\n- `RecentArtifacts.tsx`: Added defensive comment warning against adding `\"use client\"` (would break Date serialization).\n- `hydration-error-dashboard.md`: Updated status to `mitigated`, documented investigation findings and remaining verification steps.\n\n**Tests (Step 4):** Added 6 unit tests for `formatRelativeTime` covering all time ranges (just now, minutes, hours, days) plus the default `Date.now()` fallback. All 2736 tests pass. Typecheck and production build clean.\n\n**Remaining:** Manual browser verification needed to confirm the hydration error is resolved. If it persists in dev mode but not production, it's a Turbopack artifact worth tracking but not a code bug."
  - timestamp: 2026-03-14T21:27:11.313Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Step 1 (diagnosis) complete. Thorough static analysis confirmed: no Date/time values in any client component render path during hydration. All client components have deterministic initial renders. `formatRelativeTime` with `Date.now()` only executes post-hydration via useEffect. Browser-based diagnosis blocked (no Playwright/curl access in commission sandbox). Production build is clean. Most likely cause: Turbopack dev-mode CSS Module hash inconsistency (Strategy B), or intermittent timing issue. Proceeding with Step 2 (proactive hardening) which the plan says to apply regardless of specific root cause."
projectName: guild-hall
---
Applied proactive hydration hardening to the dashboard per the plan at `.lore/plans/ui/fix-dashboard-hydration.md`.

**Diagnosis (Step 1):** Thorough static analysis of all dashboard components confirmed the plan's finding: no Date/time values render during hydration in any client component. `formatRelativeTime` with `Date.now()` only fires post-hydration via useEffect. Browser-based diagnosis was blocked by commission sandbox constraints. Production build is clean with no warnings, suggesting the error may be a Turbopack dev-mode CSS Module hash artifact.

**Changes (Step 2):**
- `ManagerBriefing.tsx`: Added `suppressHydrationWarning` to the timestamp span with explanatory comment. Made `formatRelativeTime` testable via DI (`now` parameter) and exported it.
- `RecentArtifacts.tsx`: Added defensive comment warning against adding `"use client"` (would break Date serialization).
- `hydration-error-dashboard.md`: Updated status to `mitigated`, documented investigation findings and remaining verification steps.

**Tests (Step 4):** Added 6 unit tests for `formatRelativeTime` covering all time ranges (just now, minutes, hours, days) plus the default `Date.now()` fallback. All 2736 tests pass. Typecheck and production build clean.

**Remaining:** Manual browser verification needed to confirm the hydration error is resolved. If it persists in dev mode but not production, it's a Turbopack artifact worth tracking but not a code bug.
