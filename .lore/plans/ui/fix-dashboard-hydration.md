---
title: Fix Dashboard Hydration Mismatch
date: 2026-03-10
status: draft
tags: [ui, next-js, hydration, bug-fix]
modules: [web/app/page, web/components/dashboard]
related:
  - .lore/issues/hydration-error-dashboard.md
---

# Plan: Fix Dashboard Hydration Mismatch

## Goal

Eliminate the React hydration error that fires on every dashboard page load. The console error ("Hydration failed because the server rendered HTML didn't match the client") should no longer appear, and the dashboard should render without layout shifts from mismatched content.

## Investigation Summary

Every component in the dashboard render tree was examined for non-deterministic rendering between server and client. The dashboard page (`web/app/page.tsx`) is a server component that renders five child components:

| Component | Type | Date/Time Rendering | Hydration Risk |
|-----------|------|-------------------|----------------|
| `WorkspaceSidebar` | Server | None | None |
| `ManagerBriefing` | Client | `Date.now()` + `new Date()` in `formatRelativeTime`, but only after `useEffect` fetch | Low (see below) |
| `DependencyMap` | Server (wraps `CommissionGraph` client) | None | Low |
| `RecentArtifacts` | Server | `artifact.meta.date` (static string from frontmatter) | None |
| `PendingAudiences` | Server (wraps `MeetingRequestCard` client) | `deferred_until` (static string prop) | None |

The layout wraps everything in `DaemonStatus` (client), which starts with `useState(true)` and only updates via `useEffect`. Initial render is deterministic.

**Static analysis did not find a single definitive smoking gun.** All client components have deterministic initial renders with no date/time values, no locale-sensitive formatting, and no browser-dependent conditionals in their render path. This means the mismatch source is either:

1. Something subtle that static analysis can't catch (CSS Module hash inconsistency in Turbopack dev mode, React streaming timing edge case, browser-added DOM attributes)
2. An intermittent condition that depends on the specific data present (e.g., a `Date` object in serialized props when certain artifacts or commissions exist)
3. A component rendering that I missed (unlikely given exhaustive search)

**The fix must start with runtime diagnosis.** React's development mode hydration error points to the exact DOM element that mismatched, which will reveal the source immediately.

## Diagnosis Steps (Step 1)

**This step must execute before any code changes.** The fix depends on knowing exactly which element mismatches.

1. Run `bun run dev` and load the dashboard in Chrome
2. Open DevTools Console. Find the hydration error message. React 19 (used by Next.js 15) shows the specific text content or attribute that differs between server and client HTML
3. Click the component stack trace in the error to identify which component owns the mismatched element
4. Note the exact mismatch: is it text content (e.g., "Mar 10" vs "March 10"), an attribute (e.g., `class` or `style`), or a structural difference (element present on server but not client)?
5. Check whether the error appears with zero projects registered (empty dashboard) vs. with an active project selected. This narrows whether it's in the layout/sidebar or in the data-dependent panels

If the error is:
- **Text content mismatch in a date/time value**: proceed to Fix Strategy A
- **CSS class name mismatch**: proceed to Fix Strategy B
- **Structural mismatch (element present/absent)**: proceed to Fix Strategy C
- **Attribute mismatch (data-, style)**: proceed to Fix Strategy D

## Fix Strategies

### Strategy A: Date/Time Value Mismatch

**Most likely candidate: `ManagerBriefing.tsx`** (`web/components/dashboard/ManagerBriefing.tsx`)

The `formatRelativeTime` function at line 20 uses `Date.now()` and `new Date()`. While this only executes after the `useEffect` fetch completes (which is after hydration), there is a subtle risk: if the briefing API responds before React finishes hydrating (possible with fast local daemon responses), the state update could race with hydration.

**Fix**: Wrap the timestamp display in `suppressHydrationWarning`:

```tsx
<span className={styles.timestamp} suppressHydrationWarning>
  Last updated: {formatRelativeTime(state.data.generatedAt)}
</span>
```

This is safe because: (a) the relative time display is inherently approximate ("3 minutes ago"), (b) the value updates on every fetch cycle anyway, and (c) the mismatch window is small (only when fetch completes during hydration).

Add a comment explaining why `suppressHydrationWarning` is used:

```tsx
{/* Server and client may disagree on relative time due to fetch timing.
    suppressHydrationWarning is appropriate because the value is approximate
    and updates on every briefing refresh. */}
```

**If diagnosis reveals a different date-rendering component**: Apply the same pattern. Relative timestamps always need either `suppressHydrationWarning` or a `useEffect` guard that renders a placeholder on first paint and fills in the real value after mount.

### Strategy B: CSS Module Class Name Mismatch

If the mismatch is in a `class` attribute rather than text content, the issue is likely a Turbopack development mode artifact where CSS Module hashing differs between server and client renders.

**Fix**: Verify with production build (`bun run build && bun run start`). If the error disappears in production, this is a Turbopack dev-mode issue. Options:

1. **Accept the dev-mode warning** (add a comment in `.lore/issues/` documenting it's a known dev-only issue)
2. **Pin CSS Module hash strategy** in `next.config.ts` if Turbopack exposes such configuration
3. **Report upstream** to Next.js/Turbopack if no workaround exists

This is not a code bug, so no application code changes are needed.

### Strategy C: Structural Mismatch (Element Present/Absent)

If an element renders on the server but not the client (or vice versa), look for:

1. **Boolean coercion differences**: A `0` or `""` rendering as text on one side. Check all `{value && <element>}` patterns where `value` could be `0` (renders "0") rather than `undefined` (renders nothing).
2. **`DaemonStatus` provider timing**: If the health check fetch completes before hydration, `isOnline` could flip to `false`, removing the "Daemon offline" div from the expected tree. Fix by ensuring the initial state matches between server and client (it already does: `useState(true)`).

**Fix**: For boolean coercion, replace `{value && <element>}` with `{value != null && value !== "" && <element>}` or `{!!value && <element>}` as appropriate.

### Strategy D: Attribute Mismatch

If the mismatch is in a `style`, `data-`, or other attribute, check:

1. **Inline styles with computed values**: The layout's `<div style={{ minHeight: "100vh" }}>` should serialize identically. If not, extract to CSS.
2. **Next.js-injected attributes**: Some Next.js internal attributes can differ. These are generally framework bugs, not application bugs. Upgrade Next.js or report upstream.

## Proactive Hardening (Step 2)

Regardless of the specific mismatch found, apply these defensive changes to prevent future hydration issues on the dashboard:

### 2a. Add `suppressHydrationWarning` to the ManagerBriefing timestamp

Even if this isn't the current culprit, it's a latent risk. The `formatRelativeTime` call uses `Date.now()`, which produces a different value on server vs. client. Today it's protected by `useEffect` timing, but that's fragile.

**File**: `web/components/dashboard/ManagerBriefing.tsx:112-114`

```tsx
<span className={styles.timestamp} suppressHydrationWarning>
  Last updated: {formatRelativeTime(state.data.generatedAt)}
</span>
```

### 2b. Verify `Artifact.lastModified` is never serialized to client components

`Artifact.lastModified` is a `Date` object from `fs.stat()`. Currently, `RecentArtifacts` is a server component, so the `Date` never crosses the serialization boundary. This is correct. Add a defensive comment to `RecentArtifacts.tsx` to prevent future refactoring from accidentally adding `"use client"`:

```tsx
// Server component: receives Artifact[] with lastModified: Date.
// Do NOT add "use client" — Date objects don't serialize cleanly
// through the RSC protocol and would cause hydration mismatches.
```

## Related Findings (Not Dashboard, But Worth Noting)

During investigation, locale-sensitive date formatting was found in three components on other pages:

| Component | File | Issue |
|-----------|------|-------|
| `CommissionList` | `web/components/commission/CommissionList.tsx:34-47` | `toLocaleDateString("en-US")` and `toLocaleTimeString("en-US")` in a server component. Currently safe because locale is pinned to "en-US", but `new Date()` at line 29 for `sameYear` check is time-dependent |
| `CommissionScheduleInfo` | `web/components/commission/CommissionScheduleInfo.tsx:97-98` | `toLocaleString(undefined, ...)` in a client component. Uses browser default locale, which will differ from server |
| `CommissionTimeline` | `web/components/commission/CommissionTimeline.tsx:235-236` | `toLocaleTimeString(undefined, ...)` in a client component. Same locale issue |

These are separate issues (not on the dashboard) and should be tracked in their own issue if they produce hydration errors on their respective pages.

## Verification (Step 3)

After applying fixes:

1. **Dev mode console check**: Load the dashboard with `bun run dev`. Open Console. Confirm no hydration error appears. Test with:
   - No project selected (empty dashboard)
   - A project selected with active commissions and artifacts
   - A project selected with no artifacts
   - Daemon offline (stop daemon, reload dashboard)
2. **Production build**: Run `bun run build` and confirm clean build with no hydration warnings in the build output
3. **Multiple browsers**: Check Chrome and Firefox (their locale/timezone defaults differ)
4. **Mobile viewport**: Resize to mobile width and reload to confirm no viewport-dependent mismatch

## Test Requirements (Step 4)

### Existing test validation

Run `bun test` and confirm all existing tests pass. No test should break from hydration fixes since the fixes are additive (`suppressHydrationWarning`) or defensive (comments, guards).

### New tests

If the fix involves extracting date formatting to a client-only pattern (useEffect guard):

1. **Unit test for the date formatting function** (e.g., `formatRelativeTime`): Test with known timestamps. Mock `Date.now()` via dependency injection (pass `now` as a parameter with a default).
2. **Component test for the hydration-safe pattern**: Verify the component renders a placeholder (or nothing) on initial render, and the formatted date only appears after mount. Use a test that renders the component and checks the initial output, then simulates the effect running.

If the fix is `suppressHydrationWarning` only, no new tests are needed. The attribute is declarative and doesn't change component behavior.

### Regression prevention

Add a comment to `web/components/dashboard/README.md` (or inline in `page.tsx`) documenting the hydration constraint:

> Dashboard client components must have deterministic initial renders. No `Date.now()`, `new Date()`, `Math.random()`, `toLocaleString()`, or browser API calls in the render path. Time-dependent values belong in `useEffect` or behind `suppressHydrationWarning`.

## Delegation Guide

| Step | Action | Reviewer Focus |
|------|--------|---------------|
| Step 1 (Diagnosis) | Run dev server, capture exact mismatch from console | Identify which DOM element and component |
| Step 2 (Fix) | Apply the matching fix strategy | Minimal change, no over-engineering |
| Step 3 (Verify) | Full browser testing matrix | Console clean in all scenarios |
| Step 4 (Test) | Run suite, add tests if behavior changed | No regressions, new coverage for any new patterns |

After Step 2, use a code-reviewer sub-agent to verify: (a) the fix addresses the diagnosed mismatch specifically, (b) no unrelated components were modified, (c) `suppressHydrationWarning` is only used where justified with a comment.

## Open Questions

1. **Is this a Turbopack dev-mode artifact?** If the error only appears in dev mode with Turbopack and not in production builds, the fix priority drops. The issue is still worth tracking (it pollutes the console) but isn't a production concern. Check by running `bun run build && bun run start:next` and loading the dashboard.

2. **Does the error appear on the first load only or on subsequent navigations?** Client-side navigations (via `next/link`) don't trigger full hydration, so if the error only appears on hard refresh, it confirms a server-vs-client rendering difference rather than a state management issue.
