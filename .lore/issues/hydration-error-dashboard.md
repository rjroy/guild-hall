---
title: Hydration mismatch error on every dashboard load
date: 2026-03-10
status: in_progress
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

## Fix Direction

1. Identify which component produces the mismatch (React's error message in dev mode usually points to the DOM node).
2. If it's a date/time: render dates in a client component, or use `suppressHydrationWarning` on the specific element with a comment explaining why.
3. If it's conditional rendering based on browser state: move the conditional to a `useEffect` so the server and client initial render match.
