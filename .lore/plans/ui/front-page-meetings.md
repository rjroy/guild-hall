---
title: "Front-Page Active Meetings"
date: 2026-04-03
status: implemented 
tags: [ui, dashboard, meetings, web-ui, daemon]
modules: [web/app/page, web/app/page.module.css, web/components/dashboard/ActiveMeetings, web/components/dashboard/ActiveMeetingCard, daemon/routes/meetings, lib/meetings]
related:
  - .lore/specs/front-page-meetings.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/issues/front-page-meetings.md
---

# Plan: Front-Page Active Meetings

## Goal

Add an `ActiveMeetings` panel to the dashboard above `PendingAudiences`. The panel surfaces all open-status meetings across projects so the manager doesn't have to navigate per-project to find live conversations. Active meeting cards are navigation-only (no action buttons), visually distinct from pending request cards, and respect the project filter.

Seven files change: two in the daemon/lib layer, two new component files plus a CSS module, and two dashboard files for integration. No removals.

## Codebase Context

**The `view=artifacts` branch is the model for `view=open`.** Lines 308-326 of `daemon/routes/meetings.ts` already handle the `view=artifacts` case: it resolves the integration worktree path, calls `getActiveMeetingWorktrees`, scans both the integration `.lore/meetings/` directory and all active worktree `.lore/meetings/` directories, deduplicates by `relativePath`, and returns the merged result. The `view=open` branch follows this exact shape but returns `MeetingMeta[]` (via `readMeetingMeta`) instead of `Artifact[]`, and filters to `status === "open"`.

**`readMeetingMeta` is the right read function.** `lib/meetings.ts:84-115` reads a single file and returns `MeetingMeta`. The `parseMeetingData` function is private. Call `readMeetingMeta(filePath, projectName)` directly; it already handles malformed frontmatter with empty defaults.

**`scanMeetings` cannot be reused here.** It reads from a single directory (`projectLorePath/meetings/`) with no worktree merging. The `view=open` branch needs to scan multiple paths (integration + worktrees), so it mirrors the file enumeration from the `view=artifacts` branch rather than calling `scanMeetings`.

**`sortActiveMeetings` is a new export in `lib/meetings.ts`.** Two sort functions already exist: `sortMeetingArtifacts` (open first, then date desc) and `sortMeetingRequests` (deferred last, then date desc). The new function sorts `MeetingMeta[]` by `date` descending only — all results are already open-status, so the open-first logic is unnecessary. Shape: `function sortActiveMeetings(meetings: MeetingMeta[]): MeetingMeta[]`.

**Operation definition update.** The `meeting.request.meeting.list` operation at line 443 lists `projectName` as the only query parameter. After this change it gains an optional `view` parameter. Add `{ name: "view", required: false, in: "query" as const }` to the parameters array and update `description` to mention the `view=open` variant.

**`PendingAudiences.tsx` is the component model.** It receives `requests: MeetingMeta[]` and `workerPortraits: Record<string, string>`, wraps content in `<Panel title="..." variant="parchment">`, maps to per-item cards, and shows `<EmptyState>` when empty. `ActiveMeetings` follows this structure exactly.

**`ActiveMeetingCard` is a server component.** `MeetingRequestCard` is `"use client"` because it has actions (Open, Defer, Ignore). `ActiveMeetingCard` has no actions — it's a `<Link>` from `next/link`. Server component, no `"use client"` directive. Owns its own CSS module.

**Portrait lookup.** `page.tsx:86-93` builds `workerPortraits: Record<string, string>` keyed by `w.displayName`. The lookup in `MeetingRequestCard` uses `workerPortraits[request.worker]`. Same pattern applies: `workerPortraits[meeting.worker]`.

**page.tsx data fetch pattern.** The current `Promise.all` at `page.tsx:58-74` runs commission, meeting-request, and workers fetches in parallel. The `activeMeetingResults` fetch joins this array as a third parallel item. The assembly mirrors `allRequests`: filter `r.ok`, flatMap `.data.meetings`.

**`.audiences` CSS layout.** The current `.audiences` class in `page.module.css:43-46` has only `grid-area: audiences; min-width: 0`. It needs `display: flex; flex-direction: column; gap: var(--space-md)` added so the two panels stack vertically. No grid structure changes.

## Spec Gaps and Decisions

**REQ-SORT-12 numbering.** The sort function is referenced as `REQ-SORT-12` within the spec text but lives under `REQ-FPM-06`. Treat it as part of REQ-FPM-06. Tests should cover both in Phase 1.

**Deduplication for `view=open`.** The `view=artifacts` branch deduplicates by `relativePath` (file name within `.lore/meetings/`). Use the same strategy: `new Set(integrationMeetings.map(id => ...))`. Meeting IDs are filenames without the `.md` extension, but `relativePath` from `scanArtifacts` is the right dedup key in the artifacts view. For the `view=open` branch we scan manually using `fs.readdir`, so deduplicate by filename instead.

**Panel title.** The spec says `Panel title="Active Audiences"` (REQ-FPM-08). Use that string exactly.

**Visual distinction implementation.** REQ-FPM-03 requires a green "live" indicator using `--status-green` or equivalent. Check `globals.css` for the right token name. The indicator is a small filled `<span>` or a `::before` pseudo-element on the card. No design system component exists for this — implement inline.

## Implementation Phases

### Phase 1: Backend (`lib/meetings.ts` + `daemon/routes/meetings.ts`)

**REQs covered:** REQ-FPM-06, REQ-SORT-12

**Dependencies:** none

**Files modified:**
- `lib/meetings.ts`
- `daemon/routes/meetings.ts`

**Step 1a — Add `sortActiveMeetings` to `lib/meetings.ts`.**

Add after `sortMeetingRequests` (around line 247):

```ts
/**
 * Sorts active (open-status) meetings for the dashboard ActiveMeetings panel.
 * By date descending — most recently started first.
 * REQ-SORT-12
 */
export function sortActiveMeetings(meetings: MeetingMeta[]): MeetingMeta[] {
  return [...meetings].sort((a, b) => b.date.localeCompare(a.date));
}
```

Export it from `lib/meetings.ts`. No other changes to the file.

**Step 1b — Add `view=open` branch to `daemon/routes/meetings.ts`.**

In the `GET /meeting/request/meeting/list` handler, after the `view === "artifacts"` block (line 327), add a new branch before the default return:

```ts
// Open view: return MeetingMeta[] for active (open) meetings,
// merging integration worktree and active meeting worktrees.
if (view === "open") {
  const meetingsPath = path.join(lorePath, "meetings");

  // Enumerate integration worktree meetings
  let integrationFiles: string[] = [];
  try {
    integrationFiles = (await fs.readdir(meetingsPath))
      .filter((f) => f.endsWith(".md"));
  } catch {
    // Directory may not exist yet
  }

  // Enumerate active worktree meetings
  const activeWorktrees = await getActiveMeetingWorktrees(deps.guildHallHome, projectName);
  const worktreeFiles: Array<{ dir: string; file: string }> = [];
  for (const wt of activeWorktrees) {
    const wtMeetingsPath = path.join(wt, ".lore", "meetings");
    try {
      const files = (await fs.readdir(wtMeetingsPath)).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        worktreeFiles.push({ dir: wtMeetingsPath, file: f });
      }
    } catch {
      // Skip missing directories
    }
  }

  // Merge, deduplicating by filename (integration wins)
  const seenFiles = new Set(integrationFiles);
  const allFileEntries: Array<{ dir: string; file: string }> = [
    ...integrationFiles.map((f) => ({ dir: meetingsPath, file: f })),
    ...worktreeFiles.filter((e) => !seenFiles.has(e.file)),
  ];

  // Read metadata and filter to open status
  const metas: MeetingMeta[] = [];
  for (const entry of allFileEntries) {
    try {
      const meta = await readMeetingMeta(path.join(entry.dir, entry.file), projectName);
      if (meta.status === "open") {
        metas.push(meta);
      }
    } catch {
      // Skip unreadable files
    }
  }

  const sorted = sortActiveMeetings(metas);
  return c.json({ meetings: sorted });
}
```

Add `sortActiveMeetings` to the import from `@/lib/meetings`.

**Step 1c — Update the operation definition.**

In the `operations` array, update the `meeting.request.meeting.list` entry:

```ts
{
  operationId: "meeting.request.meeting.list",
  version: "1",
  name: "list",
  description: "List meeting requests for a project. view=open returns active (open-status) meetings.",
  invocation: { method: "GET", path: "/meeting/request/meeting/list" },
  sideEffects: "",
  context: { project: true },
  idempotent: true,
  hierarchy: { root: "meeting", feature: "request", object: "meeting" },
  parameters: [
    { name: "projectName", required: true, in: "query" as const },
    { name: "view", required: false, in: "query" as const },
  ],
},
```

**Testing:**

New file: `tests/daemon/routes/meetings-view-open.test.ts` (or extend `meetings-read.test.ts`).

Use the same fixture setup as `meetings-read.test.ts`: `fs.mkdtemp`, write `.md` files with varying `status` values.

Required tests:
1. `GET .../list?projectName=X&view=open` with no meetings → returns `{ meetings: [] }`
2. Mix of `status: open`, `status: requested`, `status: closed` → returns only the `open` one
3. Multiple open meetings → sorted by `date` descending
4. Missing meetings directory → returns `{ meetings: [] }` (no 500)
5. `sortActiveMeetings` unit tests in `tests/lib/meetings.test.ts`:
   - Empty array → empty
   - Single item → returned unchanged
   - Multiple items → sorted by `date` descending

**Risk notes:** The worktree scanning path is exercised by the `view=artifacts` branch already; the pattern is proven. Main risk is the dedup logic — test with a file that appears in both integration and worktree to confirm the integration copy wins and the worktree copy is skipped.

**Verify:** `bun run typecheck && bun test tests/lib/meetings.test.ts tests/daemon/routes/meetings-read.test.ts` (and the new test file).

**Worker:** Dalton | **Model:** Sonnet

---

### Phase 2: Components (`ActiveMeetings.tsx`, `ActiveMeetingCard.tsx`, `ActiveMeetingCard.module.css`)

**REQs covered:** REQ-FPM-02, REQ-FPM-03, REQ-FPM-05, REQ-FPM-08, REQ-FPM-09

**Dependencies:** none (uses `MeetingMeta` type, which already exists; no Phase 1 required)

**Files created:**
- `web/components/dashboard/ActiveMeetings.tsx`
- `web/components/dashboard/ActiveMeetingCard.tsx`
- `web/components/dashboard/ActiveMeetingCard.module.css`

**`ActiveMeetings.tsx`** — mirrors `PendingAudiences.tsx` in structure:

```tsx
import Panel from "@/web/components/ui/Panel";
import EmptyState from "@/web/components/ui/EmptyState";
import ActiveMeetingCard from "@/web/components/dashboard/ActiveMeetingCard";
import type { MeetingMeta } from "@/lib/meetings";

interface ActiveMeetingsProps {
  meetings: MeetingMeta[];
  workerPortraits: Record<string, string>;
}

export default function ActiveMeetings({ meetings, workerPortraits }: ActiveMeetingsProps) {
  return (
    <Panel title="Active Audiences" variant="parchment">
      {meetings.length === 0 ? (
        <EmptyState message="No active meetings." />
      ) : (
        meetings.map((meeting) => (
          <ActiveMeetingCard
            key={`${meeting.projectName}-${meeting.meetingId}`}
            meeting={meeting}
            portraitUrl={workerPortraits[meeting.worker]}
          />
        ))
      )}
    </Panel>
  );
}
```

No `"use client"`.

**`ActiveMeetingCard.tsx`** — server component, card is a `<Link>`:

```tsx
import Link from "next/link";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
import type { MeetingMeta } from "@/lib/meetings";
import styles from "./ActiveMeetingCard.module.css";

interface ActiveMeetingCardProps {
  meeting: MeetingMeta;
  portraitUrl?: string;
}

export default function ActiveMeetingCard({ meeting, portraitUrl }: ActiveMeetingCardProps) {
  const workerLabel = meeting.workerDisplayTitle || meeting.worker || "Unknown Worker";
  const href = `/projects/${encodeURIComponent(meeting.projectName)}/meetings/${encodeURIComponent(meeting.meetingId)}`;

  return (
    <Link href={href} className={styles.card}>
      <div className={styles.liveIndicator} aria-label="Live" />
      <WorkerPortrait name={workerLabel} portraitUrl={portraitUrl} size="sm" />
      <div className={styles.content}>
        <p className={styles.workerTitle}>{workerLabel}</p>
        <p className={styles.meetingTitle}>{meeting.title}</p>
        <p className={styles.meta}>{meeting.projectName} · {meeting.date}</p>
      </div>
    </Link>
  );
}
```

No `"use client"`. The `<Link>` makes the entire card surface clickable (REQ-FPM-02, REQ-FPM-09).

**`ActiveMeetingCard.module.css`** — key rules:

- `.card`: flex row, gap, padding, border-radius, cursor pointer. Slightly muted background (less visual weight than `MeetingRequestCard`). On hover, subtle lift. No action button row.
- `.liveIndicator`: small filled circle (`width: 8px; height: 8px; border-radius: 50%; background-color: var(--status-green)`). Positioned at top-right or leading edge of card. Check `globals.css` for the exact `--status-green` token name.
- `.content`: flex column, gap.
- `.workerTitle`, `.meetingTitle`, `.meta`: typography hierarchy. `meta` is smaller/muted.

Use `var(--color-*)` tokens from `globals.css` only. No hex or rgb literals.

**Testing:**

New file: `tests/components/active-meeting-card.test.ts`

`ActiveMeetings` and `ActiveMeetingCard` are server components. Test them with Bun's rendering utilities if available, or use the same approach as `tests/components/meeting-list.test.ts`.

Required tests:
1. `ActiveMeetings` with empty array renders `EmptyState` with "No active meetings."
2. `ActiveMeetings` with one meeting renders one `ActiveMeetingCard`
3. `ActiveMeetingCard` renders a link with `href` pointing to `/projects/<projectName>/meetings/<meetingId>`
4. `ActiveMeetingCard` displays `workerDisplayTitle` when present, falls back to `worker`

**Risk notes:** The live indicator uses a CSS token (`--status-green`). Verify the token exists in `globals.css` before writing the CSS; if the token name differs, use the correct one.

**Verify:** `bun run typecheck && bun test tests/components/active-meeting-card.test.ts`

**Worker:** Dalton | **Model:** Sonnet

---

### Phase 3: Dashboard integration (`page.tsx`, `page.module.css`)

**REQs covered:** REQ-FPM-01, REQ-FPM-04, REQ-FPM-07

**Dependencies:** Phase 1 (endpoint must exist), Phase 2 (components must exist)

**Files modified:**
- `web/app/page.tsx`
- `web/app/page.module.css`

**Step 3a — Add `activeMeetingResults` fetch to `page.tsx`.**

The current `Promise.all` at line 58 fetches commissions, meeting-requests, and workers. Extend it to four items:

```ts
const [commissionResults, meetingResults, activeMeetingResults, workersResult] = await Promise.all([
  Promise.all(
    config.projects.map((p) =>
      fetchDaemon<{ commissions: CommissionMeta[] }>(
        `/commission/request/commission/list?projectName=${encodeURIComponent(p.name)}`,
      ),
    ),
  ),
  Promise.all(
    config.projects.map((p) =>
      fetchDaemon<{ meetings: MeetingMeta[] }>(
        `/meeting/request/meeting/list?projectName=${encodeURIComponent(p.name)}`,
      ),
    ),
  ),
  Promise.all(
    config.projects.map((p) =>
      fetchDaemon<{ meetings: MeetingMeta[] }>(
        `/meeting/request/meeting/list?projectName=${encodeURIComponent(p.name)}&view=open`,
      ),
    ),
  ),
  fetchDaemon<{ workers: WorkerInfo[] }>("/system/packages/worker/list"),
]);
```

**Step 3b — Assemble `allActiveMeetings`.**

After the `allRequests` assembly (around line 83):

```ts
const allActiveMeetings: MeetingMeta[] = activeMeetingResults
  .filter((r) => r.ok)
  .flatMap((r) => (r as { ok: true; data: { meetings: MeetingMeta[] } }).data.meetings);
```

**Step 3c — Add import and render `ActiveMeetings`.**

Add import:

```ts
import ActiveMeetings from "@/web/components/dashboard/ActiveMeetings";
```

In the JSX, replace the `<div className={styles.audiences}>` block:

```tsx
<div className={styles.audiences}>
  <ActiveMeetings
    meetings={selectedProject
      ? allActiveMeetings.filter((m) => m.projectName === selectedProject)
      : allActiveMeetings}
    workerPortraits={workerPortraits}
  />
  <PendingAudiences
    requests={selectedProject ? allRequests.filter((r) => r.projectName === selectedProject) : allRequests}
    workerPortraits={workerPortraits}
  />
</div>
```

**Step 3d — Add flex layout to `.audiences` in `page.module.css`.**

Update the `.audiences` rule:

```css
.audiences {
  grid-area: audiences;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
```

No other CSS changes needed.

**Testing:**

Extend `tests/components/meeting-list.test.ts` or create `tests/components/dashboard-page.test.ts`.

Required tests:
1. With `allActiveMeetings` non-empty and no `selectedProject`, `ActiveMeetings` receives the full list
2. With `selectedProject` set, only meetings matching that project are passed to `ActiveMeetings`
3. With an empty `allActiveMeetings`, `ActiveMeetings` receives `[]` and renders `EmptyState`
4. Existing `PendingAudiences` behavior unchanged — still receives `allRequests` filtered the same way

**Risk notes:**

- The `Promise.all` now fires three per-project fetch batches plus the workers fetch, all in parallel. This is one more per-project batch than before (N additional requests where N = project count). For typical guild-hall configurations (2-10 projects) this is negligible.
- Type narrowing for `activeMeetingResults` follows the same pattern as `meetingResults`: filter `.ok`, cast, flatMap. The implementer should follow the existing pattern exactly rather than inventing a new type guard.
- If the daemon is running an old version without the `view=open` branch, the endpoint returns meeting requests (pending/deferred), not open meetings — this would show the wrong data silently. This is an acceptable deployment ordering constraint: Phase 1 must be deployed before Phase 3 goes live.

**Verify:** `bun run typecheck && bun run lint && bun test && bun run build`

**Worker:** Dalton | **Model:** Sonnet

---

## Delegation Guide

| Phase | Depends on | Worker | Notes |
|-------|-----------|--------|-------|
| Phase 1 | — | Dalton | Backend only. Read `meetings-read.test.ts` for fixture setup pattern. Export `sortActiveMeetings`. |
| Phase 2 | — | Dalton | Components only. Mirror `PendingAudiences.tsx`. Server components — no `"use client"`. Check `globals.css` for `--status-green` token. |
| Phase 3 | Phase 1, Phase 2 | Dalton | Wire everything. Follow type narrowing pattern from `allRequests` exactly. |

Phases 1 and 2 have no dependency on each other and can be dispatched in parallel. Phase 3 must wait for both.

## Thorne Review

Not warranted as a dedicated commission. The scope is small (9 reqs, 7 files, no removals), the patterns are established, and there are no novel architectural decisions. Each phase commission should include a self-review step (typecheck + lint + tests + build) before declaring completion.

If a review is desired after all three phases complete, dispatch a single Thorne commission scoped to the 7 changed files rather than a full-suite review.

## Commission Count

3 commissions (2 in parallel, 1 following).
