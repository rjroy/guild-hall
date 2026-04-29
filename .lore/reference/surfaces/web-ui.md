---
title: Web UI
date: 2026-04-27
status: current
tags: [web, ui, ssr, theme, daemon-status, conventions]
modules: [web-app, web-components]
---

# Web UI

Most of the web app is convention-driven Next.js App Router. This doc covers the conventions that aren't obvious from a single file read.

## Server-component-by-default; opt-in `"use client"`

Pages (`app/page.tsx`, `app/projects/[name]/page.tsx`, etc.) are server components. They run on the server, talk to the daemon via `fetchDaemon`, and render HTML. Interactive components (`AppBar`, `DaemonStatus`, `WorkerPicker`, `ChatInterface`, action buttons) opt in with `"use client"`. The split is standard Next.js, but Guild Hall pages do real-work fetch fan-out *before* rendering — they're not just shells.

## Pages parallel-fan-out via `Promise.all`

Dashboard fans out across all projects: per-project artifact/commission/meeting fetches plus a workers fetch, all in parallel. Project page fans out artifact-list + meeting-list + commission-list + lore-status. Failed sub-fetches degrade silently — `r.ok ? r.data... : []`. The page renders with whatever data made it back.

The exception is the top-level config fetch. If `/system/config/application/read` fails, the page short-circuits to `<DaemonError>`. The reasoning: if we can't read config, the daemon is broken at the root; if we can't read one project, that's just data missing.

## All-projects merging happens in the page, not the API

The dashboard reads per-project results and flat-maps + sorts them in the server component. The daemon has no "list everything across all projects" endpoint — that surface lives in the page layer. The single all-projects briefing endpoint exists only because the briefing is *synthesis*, not concatenation; for raw lists, the page does the merge.

## `DaemonStatus` wraps the entire app

`layout.tsx` mounts `<DaemonStatus>` around `{children}`. It polls `/api/daemon/health` every 5 seconds and provides `DaemonContext.isOnline` to descendants. When offline, renders a fixed-position indicator.

**Children always render regardless of daemon state.** Server components read from the filesystem and don't need the daemon; client action buttons consume `useDaemonStatus()` and disable themselves when offline. The offline indicator is a fixed overlay; the rest of the page stays usable.

## Theme: `data-theme` attribute on `<html>`, `localStorage["guild:theme"]` for persistence

Two themes: `dark` (default) and `light` ("parchment"). The layout sets `data-theme="dark"` directly so the SSR render is always dark. After hydration, `AppBar` reads localStorage via `useSyncExternalStore` and re-applies the theme via `useEffect`. There's a brief flash of dark on first load with `light` selected — accepted as the cost of avoiding cookie-based server-side theme detection.

`useSyncExternalStore` subscribes to both the `storage` event (cross-tab sync) and a custom `guild:theme-change` event (same-tab toggle). Toggle dispatches the custom event after writing localStorage. The server snapshot is hardcoded `"dark"` — never throws on SSR.

## CSS conventions are pinned in CLAUDE.md

Repeating them here because they're load-bearing for any UI change:

- **Tokens live in `apps/web/app/globals.css`.** Utility classes (paper, card, btn, gem, ribbon-tabs, tree-row, side-row, bubble-them/you) live in `apps/web/app/guild.css`. Components import scoped `.module.css`.
- **No Tailwind.** Styling is CSS Modules + global tokens.
- **No raw color values in CSS Modules.** Hex / rgb / hsl literals are forbidden. Add a token to `globals.css` first, then reference it. Linting enforces.
- **No `composes` in CSS Modules.** Turbopack silently ignores it. Use TSX-side class composition: `className={`${styles.x} btn btn-primary`}`.
- **Theme-aware overrides need `:global([data-theme="dark"])`.** CSS Modules scope class names; the theme attribute is global. Without `:global()`, the override never matches.
- **Vendor prefix order matters.** `-webkit-backdrop-filter` MUST come before `backdrop-filter` or the standard property gets dropped during Next.js compilation.

## Local fonts via `localFont`

Three families: IM Fell English SC (display), Vollkorn (body/serif), JetBrains Mono. Each binds a CSS variable (`--font-display-local`, `--font-vollkorn-local`, `--font-mono-local`) that globals.css references from the token declarations. The local fonts ensure cache stability — no Google Fonts CDN dependency on first load.

## URL conventions

- `/?project=<name>` — dashboard filtered by project. No selector pulldown; the `WorkspaceSidebar` renders project links that update the URL.
- `/projects/[name]?tab=artifacts|commissions|meetings` — project page tab. Default `artifacts`.
- `/projects/[name]?newCommission=true&dep=<id>` — opens commission form inline, optionally pre-filled with a dependency.
- `/projects/[name]?newMeeting=true&artifact=<path>` — opens meeting starter inline, optionally pre-filled with a linked artifact.
- `/projects/[name]/commissions/[id]` — commission detail.
- `/projects/[name]/meetings/[id]` — meeting view (live or ended state).
- `/projects/[name]/artifacts/[...path]` — catch-all artifact viewer for any depth of `.lore/` path.

The catch-all artifacts route consumes any depth of segments and treats them as the artifact's logical relative path inside `.lore/`.

## Meeting list `view` parameter changes shape

`/meeting/request/meeting/list?projectName=X` returns the request list (default).
`view=open` returns active sessions.
`view=artifacts` returns full `Artifact[]` for the project page's meeting tab — the daemon merges active-worktree state and pre-sorts.

The page calls the right `view` for what it's rendering. Same endpoint, three response shapes — the alternative would be three endpoints with overlapping logic.

## Worker portraits are a name→URL map fetched per page

Workers route returns `{name, displayName, displayTitle, portraitUrl}` per discovered worker. The page builds `workerPortraits: Record<displayName, url>` and passes it down to children as props. Not context — explicit prop drilling so each consumer's portrait dependency is visible.

The `portraitUrl` is served by the daemon as a base64 data URI (worker package's `portraitPath` resolves to filesystem, encoded into the URL). No image-server roundtrip per portrait.

## Daemon-state-aware action buttons

Action buttons (`CommitLoreButton`, `NewIssueButton`, `CreateCommissionButton`, `CreateMeetingButton`, etc.) consume `useDaemonStatus()` and disable themselves when `isOnline` is false. The daemon offline indicator + button-disable is the consistent pattern — write actions can't reach the daemon, so they're gated; reads still work because server components render at request time.

## SSE streaming UIs

Two streaming surfaces:

- **`MeetingRequestCard`** and **`WorkerPicker`** consume the first-turn SSE via shared `consumeFirstTurnSSE` (in `lib/sse-helpers.ts`). They build a `ChatMessage[]` and store it in `sessionStorage` for the meeting view to pick up on navigation.
- **`ChatInterface`** consumes the per-turn SSE for active meetings. Each event updates state: `text_delta` accumulates into the current assistant message, `tool_use` shows a `ToolUseIndicator`, `turn_end` finalizes the message and re-enables input.

The first-turn flow uses sessionStorage so the meeting view doesn't have to re-fetch the conversation on navigation — the data is already there in the same browsing session.

## Status visuals: gems and badges

`statusToGem` (in `lib/types`) maps status → gem class (`pending | active | blocked | info | inactive`). `GemIndicator` and `StatusBadge` consume the gem class to render colored indicators. The mapping is intentionally different from the smart-view status groups — gems express "current state of this artifact"; smart-view groups express "which surface should this appear on."

For example, `implemented` maps to the green (active) gem but sorts in the Terminal smart-view group — done and needs no action.

## Per-page data-shape ownership

The daemon's response shapes (e.g., `MeetingMeta`, `CommissionMeta`, `Artifact`) flow into pages typed end-to-end. Pages don't transform shapes for components — they pass-through. When a component needs a derived shape (e.g., `ArtifactWithProject = Artifact & {projectName}` for the dashboard's recent feed), the page constructs it inline. The pattern keeps the daemon contract close to the consumer.
