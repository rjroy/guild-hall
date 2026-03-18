---
title: Hydration mismatch error on every dashboard load
date: 2026-03-10
status: mitigated
tags: [bug, ui, next-js]
modules: [web/app/page]
---

# Hydration Mismatch on Dashboard

## What Happens

Every dashboard page load produces a React hydration error in the console: "Hydration failed because the server rendered HTML didn't match the client." This fires consistently on both desktop and mobile viewports.

## Why It Matters

Hydration mismatches can cause layout shifts and briefly flash wrong content. In a fantasy-themed UI with decorative elements, a layout shift is more noticeable than in a plain app. It also pollutes the console, making real errors harder to spot during development.

## Likely Cause

Probably a date/time value rendered on the server (Node.js timezone/locale) that differs from the client (browser timezone/locale). The briefing panel, "Recent Scrolls" timestamps, or commission dates are likely candidates. Could also be a `Date.now()` or `new Date()` call in a server component that produces a different value on hydration.

## Investigation (2026-03-14)

Thorough static analysis of all five dashboard child components (`WorkspaceSidebar`, `ManagerBriefing`, `DependencyMap`, `RecentArtifacts`, `PendingAudiences`) and the layout wrapper (`DaemonStatus`) found no deterministic hydration mismatch source:

- All client components have deterministic initial renders with no date/time values
- `formatRelativeTime` in `ManagerBriefing` uses `Date.now()` but only executes post-hydration via `useEffect` fetch
- No `Date` objects cross the RSC serialization boundary (only string fields in `CommissionMeta` and `MeetingMeta`)
- Production build compiles cleanly with no warnings

Browser-based runtime diagnosis was not possible from the commission sandbox. The root cause may be a Turbopack dev-mode CSS Module hash inconsistency (the production build shows no issues).

## Mitigation Applied

1. Added `suppressHydrationWarning` to the `ManagerBriefing` timestamp span (latent risk from `Date.now()` in `formatRelativeTime`, even though it currently only fires post-hydration)
2. Made `formatRelativeTime` testable via DI (`now` parameter) and exported it
3. Added defensive comment to `RecentArtifacts` warning against adding `"use client"` (would break `Date` serialization)
4. Added unit tests for `formatRelativeTime` with full coverage of all time ranges

## Remaining Work

- Verify the hydration error is gone in the browser (requires manual check with `bun run dev`)
- If the error persists, it's likely a Turbopack dev-mode artifact (verify by comparing `bun run dev` vs `bun run build && bun run start:next`)
