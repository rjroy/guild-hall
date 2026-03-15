---
title: "Review: Dashboard Hydration Fix Plan Validity"
date: 2026-03-14
tags: [review, ui, hydration, plan-assessment]
related:
  - .lore/plans/ui/fix-dashboard-hydration.md
  - .lore/issues/hydration-error-dashboard.md
---

# Review: Dashboard Hydration Fix Plan Validity

Reviewed 2026-03-14 against current codebase at commit `5f7a7f5`.

## 1. Root Cause Still Accurate?

**Yes, with qualifications.** The plan identifies `formatRelativeTime()` in `ManagerBriefing.tsx` as the primary suspect. The function still exists at line 22 with `Date.now()` at line 23, exactly as described.

However, the plan itself admits this is not a confirmed root cause. The investigation summary (lines 31-36 of the plan) explicitly states: "Static analysis did not find a single definitive smoking gun." The plan correctly identifies that `formatRelativeTime` only executes after a `useEffect` fetch completes, which should be post-hydration. The "race with fast daemon response" theory is plausible but unproven.

The plan's diagnosis-first approach (Step 1) is the right call. The root cause is a hypothesis, not a finding.

## 2. Plan Still Applicable?

**Yes.** Every file, component, and pattern described in the plan matches the current codebase:

| Plan Reference | Current State | Match? |
|---------------|---------------|--------|
| `web/app/page.tsx` as server component rendering five children | Unchanged. Same five children in same order. | Exact |
| `WorkspaceSidebar` (server, no date rendering) | Server component, no dates. | Exact |
| `ManagerBriefing` (client, `formatRelativeTime` with `Date.now()`) | `"use client"` at line 1, `formatRelativeTime` at line 22, `Date.now()` at line 23 | Exact |
| `DependencyMap` (server, wraps `CommissionGraph` client) | Server component wrapping `CommissionGraph` (which has `"use client"`). No dates. | Exact |
| `RecentArtifacts` (server, static `artifact.meta.date` strings) | Server component, renders `artifact.meta.date` as a plain string at line 97. No `Date` construction. | Exact |
| `PendingAudiences` (server, wraps `MeetingRequestCard` client) | Server component. `MeetingRequestCard` is `"use client"`, renders `request.deferred_until` as a static string at line 261. No `Date` construction in render path. | Exact |
| `DaemonStatus` wrapping layout, `useState(true)` | Not directly verified in layout, but `MeetingRequestCard` uses `useDaemonStatus()` which aligns with the described pattern. | Consistent |
| `ManagerBriefing.tsx:112-114` timestamp span | Timestamp span is at lines 122-124 (off by 10 lines). The element structure matches: `<span className={styles.timestamp}>Last updated: {formatRelativeTime(...)}</span>` | Content match, line numbers shifted |

The only discrepancy is line numbers in `ManagerBriefing.tsx`. The plan cites line 112-114 for the timestamp span; it's actually at 122-124. The plan cites `formatRelativeTime` at "line 20"; it's at line 22. These are minor drifts, likely from small edits since the plan was written. The code structure is identical.

## 3. Completeness

### Dashboard scope: Complete

The plan examined all five dashboard child components and the layout wrapper. No dashboard component was missed. The analysis of each component's date/time behavior is accurate.

### Related findings: Accurate but one correction needed

The plan's "Related Findings" table (non-dashboard components) needs one correction:

| Component | Plan Claim | Actual | Verdict |
|-----------|-----------|--------|---------|
| `CommissionList` (lines 34-47) | `toLocaleDateString("en-US")` in a server component; `new Date()` at line 29 for `sameYear` | `formatTimestamp` function at lines 23-55 with `new Date()` at line 29, `toLocaleDateString("en-US")` at line 34, `toLocaleTimeString("en-US")` at line 39. Rendered from a server page (`projects/[name]/page.tsx`). | **Accurate.** Server-only, locale pinned. Low risk. |
| `CommissionScheduleInfo` (lines 97-98) | `toLocaleString(undefined, ...)` in a client component | `formatTimestamp` at lines 95-108 uses `toLocaleString(undefined, ...)`. No `"use client"` directive, but imported by `CommissionView.tsx` which is `"use client"`, making it a client component in practice. | **Accurate.** This is a real hydration risk. Server uses Node's default locale, client uses browser locale. |
| `CommissionTimeline` (lines 235-236) | `toLocaleTimeString(undefined, ...)` in a client component | `formatTimestamp` at lines 232-243 uses `toLocaleTimeString(undefined, ...)`. Has `"use client"` at line 1. | **Accurate, but line numbers shifted.** Plan says 235-236; actual is 236. |

### Additional hydration risks not covered by the plan

**`MeetingRequestCard.tsx` is clean.** It's a `"use client"` component but renders `request.deferred_until` as a raw string prop (line 261), not through `Date` construction. No hydration risk.

**`CommissionGraph.tsx` is clean.** `"use client"` component, but no date/time rendering. Uses `useId()` correctly for SSR-safe SVG marker IDs.

**No additional dashboard hydration risks found.** The plan's coverage is thorough for the dashboard scope.

## 4. Recommendation

**The plan is ready to execute as-is, with minor line number corrections.**

Specific notes:

1. **Step 1 (diagnosis) is mandatory.** The plan correctly insists on runtime diagnosis before any code changes. This is the right approach because the root cause is still hypothetical. Do not skip to Strategy A.

2. **Line numbers need updating.** The `ManagerBriefing.tsx` references are off by about 10 lines. The plan cites `formatRelativeTime` at "line 20" (actual: 22) and the timestamp span at "112-114" (actual: 122-124). The `CommissionTimeline` reference of "235-236" should be 232-243 (the whole function). These are cosmetic; the code references are unambiguous without exact line numbers.

3. **The four fix strategies remain valid.** None of the strategies reference code that has changed.

4. **The proactive hardening (Step 2) remains applicable.** `suppressHydrationWarning` on the timestamp span and the defensive comment on `RecentArtifacts` are both still relevant.

5. **The related findings should be actioned.** `CommissionScheduleInfo` and `CommissionTimeline` both use `toLocaleString(undefined, ...)` inside client component trees. These will produce hydration mismatches when the server locale differs from the browser locale. The plan correctly flags these as separate issues worth tracking. They should get their own issue if they don't already have one.

**No rewrite needed.** Update the line numbers if you want precision, but the plan is executable without changes.
