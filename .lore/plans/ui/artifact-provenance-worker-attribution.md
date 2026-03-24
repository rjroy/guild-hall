---
title: Worker attribution in artifact provenance
date: 2026-03-23
status: draft
tags: [ui, artifacts, provenance, workers, attribution, plan]
modules: [artifact-provenance, artifact-page, worker-portrait]
related:
  - .lore/specs/ui/artifact-provenance-worker-attribution.md
  - .lore/brainstorm/artifact-provenance-worker-attribution.md
  - .lore/specs/ui/detail-view-layout-pattern.md
---

# Plan: Worker Attribution in Artifact Provenance

## Spec Reference

**Spec**: `.lore/specs/ui/artifact-provenance-worker-attribution.md`

Requirements addressed:

- REQ-AWA-01: `ArtifactProvenance` accepts optional `attribution` prop &rarr; Step 1
- REQ-AWA-02: Existing props unchanged, attribution is additive &rarr; Step 1
- REQ-AWA-03: Three-source priority chain for attribution resolution &rarr; Step 2
- REQ-AWA-04: Image artifacts pass no attribution &rarr; Step 3
- REQ-AWA-05: Worker list fetch + name-keyed portrait map &rarr; Step 3
- REQ-AWA-06: Portrait URL lookup from roster &rarr; Step 2
- REQ-AWA-07: Guild Master hardcoded portrait fallback &rarr; Step 2
- REQ-AWA-08: Graceful handling when worker list fetch fails &rarr; Step 3
- REQ-AWA-09: First associated commission passed into attribution &rarr; Step 3
- REQ-AWA-10: Commission data from existing fetch, no new fetch &rarr; Step 3
- REQ-AWA-11: Attributed source row renders WorkerPortrait with resolved props &rarr; Step 4
- REQ-AWA-12: No attribution hides source row entirely &rarr; Step 4
- REQ-AWA-13: Commission link text framing &rarr; Step 4
- REQ-AWA-14: Text framing without commission &rarr; Step 4
- REQ-AWA-15: WorkerPortrait at size "sm" with name omitted &rarr; Step 4
- REQ-AWA-16: Existing `.sourceRow` styles apply &rarr; Step 5
- REQ-AWA-17: Text style changes for attributed content &rarr; Step 5
- REQ-AWA-18: Commission link styling &rarr; Step 5
- REQ-AWA-19: Condensed state unchanged &rarr; Step 4 (existing behavior preserved)

## Codebase Context

**Artifact page** (`web/app/projects/[name]/artifacts/[...path]/page.tsx`, 161 lines). Server component. Makes three daemon fetches today: project config (`/system/config/project/read`), artifact document (`/workspace/artifact/document/read`), and commission list (`/commission/request/commission/list`). The image path (line 52-91) fetches project config + image meta only. The document path (line 94-161) has access to `artifact.meta.extras` (an untyped `Record<string, unknown>`) and `associatedCommissions` (filtered by `linked_artifacts`). Adding a fourth fetch to `/system/packages/worker/list` follows the established pattern.

**Worker list route** (`daemon/routes/workers.ts:28-61`). Returns `{ workers: [...] }` where each worker has `displayName` (from `pkg.metadata.identity.name`), `displayTitle`, and `portraitUrl` (from `pkg.metadata.identity.portraitPath ?? null`). The key for portrait lookup is `displayName`, which matches the `extras.worker` value written to frontmatter.

**ArtifactProvenance** (`web/components/artifact/ArtifactProvenance.tsx`, 66 lines). Client component. Props: `projectName`, `artifactTitle`, `artifactPath`. Delegates to `DetailHeader` for expanded/condensed states. The expanded state (lines 51-63) renders a breadcrumb row and a source row. The source row at lines 58-61 is the Phase 1 stub: `<WorkerPortrait size="sm" />` + `"Source information unavailable."`.

**WorkerPortrait** (`web/components/ui/WorkerPortrait.tsx`, 57 lines). Accepts optional `name`, `title`, `portraitUrl`, and `size` props. When `portraitUrl` is present, renders `<img>`. When absent, renders initials from `name` or `"?"`. Renders `<p>` for `name` and `title` below the portrait when present. For this feature, `name` is omitted (REQ-AWA-15) so the portrait renders without a label beneath it.

**Guild Master constants** (`lib/packages.ts:21-22`). `MANAGER_WORKER_NAME = "Guild Master"` and `MANAGER_PORTRAIT_PATH = "/images/portraits/guild-master.webp"`. These are already exported. The artifact page imports from `@/lib/packages`.

**fetchDaemon** (`web/lib/daemon-api.ts`). Returns `DaemonResult<T>`: `{ ok: true, data: T } | { ok: false, error: string }`. All existing page fetches use this pattern with early-return on failure.

**CSS** (`web/components/artifact/ArtifactProvenance.module.css`, 45 lines). `.sourceRow` has `display: flex; align-items: center; gap: var(--space-sm)`. `.text` has `color: var(--color-text-muted); font-size: 0.85rem; font-style: italic`.

**Existing tests** (`tests/components/artifact-provenance.test.ts`, 44 lines). Import-only tests. No rendering, no prop verification. These are minimal and need expansion.

**Daemon changes**: Confirmed none needed. The worker list endpoint already returns `displayName` and `portraitUrl`. Frontmatter extras already carry `worker` and `workerDisplayTitle`. Commission list is already fetched. The spec's "no daemon changes" claim is verified.

## Implementation Steps

### Step 1: Add Attribution interface and update ArtifactProvenance props

**File**: `web/components/artifact/ArtifactProvenance.tsx`

**Addresses**: REQ-AWA-01, REQ-AWA-02

Add the `Attribution` interface and extend `ArtifactProvenanceProps`:

```ts
interface Attribution {
  workerName: string;
  workerTitle?: string;
  workerPortraitUrl?: string;
  commissionId?: string;
  commissionTitle?: string;
}

interface ArtifactProvenanceProps {
  projectName: string;
  artifactTitle: string;
  artifactPath: string;
  attribution?: Attribution;
}
```

Export `Attribution` as a named export so the artifact page can import the type. The existing three props are unchanged (REQ-AWA-02). Destructure `attribution` in the component function signature alongside the existing props.

No rendering changes in this step. The component accepts the new prop but doesn't use it yet.

### Step 2: Extract attribution resolution as a pure function

**New file**: `web/lib/resolve-attribution.ts`

**Addresses**: REQ-AWA-03, REQ-AWA-06, REQ-AWA-07

Extract the resolution logic into a testable pure function. This keeps the artifact page's server component clean and makes the priority chain directly testable.

```ts
import { MANAGER_WORKER_NAME, MANAGER_PORTRAIT_PATH } from "@/lib/packages";

interface ArtifactExtras {
  worker?: unknown;
  workerDisplayTitle?: unknown;
  author?: unknown;
}

interface ResolvedAttribution {
  workerName: string;
  workerTitle?: string;
  workerPortraitUrl?: string;
}

/**
 * Resolves worker attribution from artifact frontmatter extras.
 *
 * Priority chain:
 * 1. extras.worker + extras.workerDisplayTitle (commission/meeting artifacts)
 * 2. extras.author (brainstorm artifacts with ad-hoc attribution)
 * 3. No attribution (returns null)
 *
 * Portrait URL is looked up from the worker roster map. Guild Master
 * gets a hardcoded fallback since it's not a discoverable package.
 */
export function resolveAttribution(
  extras: ArtifactExtras | undefined,
  portraitMap: Map<string, string | null>,
): ResolvedAttribution | null {
  // ...
}
```

The function:

1. Checks `extras.worker` is a non-empty string. If so, uses it as `workerName`. Uses `extras.workerDisplayTitle` as `workerTitle` if it's a non-empty string. (REQ-AWA-03, source 1)
2. Falls back to `extras.author` as `workerName` if source 1 is absent. No title. (REQ-AWA-03, source 2)
3. Returns `null` if neither source yields a name. (REQ-AWA-03, source 3)
4. Looks up `workerPortraitUrl` from the portrait map by `workerName`. (REQ-AWA-06)
5. If `workerName === MANAGER_WORKER_NAME` and the map has no entry, falls back to `MANAGER_PORTRAIT_PATH`. (REQ-AWA-07)

All inputs are `unknown` from the untyped `extras` object, so the function validates types at runtime (string check, non-empty check).

### Step 3: Wire attribution resolution on the artifact page

**File**: `web/app/projects/[name]/artifacts/[...path]/page.tsx`

**Addresses**: REQ-AWA-04, REQ-AWA-05, REQ-AWA-08, REQ-AWA-09, REQ-AWA-10

Three changes to the document path (lines 94-161):

**3a. Add worker list fetch.** After the existing three fetches, add:

```ts
const workersResult = await fetchDaemon<{ workers: Array<{ displayName: string; portraitUrl: string | null }> }>(
  "/system/packages/worker/list",
);
```

Build the portrait map:

```ts
const portraitMap = new Map<string, string | null>();
if (workersResult.ok) {
  for (const w of workersResult.data.workers) {
    portraitMap.set(w.displayName, w.portraitUrl);
  }
}
```

If the fetch fails, `portraitMap` stays empty. Resolution still works; only `workerPortraitUrl` is absent. (REQ-AWA-08)

**3b. Call `resolveAttribution`.** Import the function from `@/web/lib/resolve-attribution` and the `Attribution` type from the component:

```ts
const extras = artifact.meta.extras as Record<string, unknown> | undefined;
const resolved = resolveAttribution(extras, portraitMap);
```

**3c. Add commission data.** If `resolved` is non-null and `associatedCommissions` is non-empty, add the first commission's ID and title:

```ts
const attribution: Attribution | undefined = resolved
  ? {
      ...resolved,
      commissionId: associatedCommissions[0]?.commissionId,
      commissionTitle: associatedCommissions[0]?.title || undefined,
    }
  : undefined;
```

`associatedCommissions` is already computed at line 113-115. No new fetch needed. (REQ-AWA-10)

Empty string `title` is treated as absent by using `|| undefined`. (REQ-AWA-13 fallback)

**3d. Pass to ArtifactProvenance:**

```tsx
<ArtifactProvenance
  projectName={projectName}
  artifactTitle={displayTitle}
  artifactPath={relativePath}
  attribution={attribution}
/>
```

**3e. Image path unchanged.** The image branch (lines 52-91) passes no `attribution` prop. Image artifacts don't carry the relevant frontmatter fields. (REQ-AWA-04)

### Step 4: Update ArtifactProvenance rendering

**File**: `web/components/artifact/ArtifactProvenance.tsx`

**Addresses**: REQ-AWA-11, REQ-AWA-12, REQ-AWA-13, REQ-AWA-14, REQ-AWA-15, REQ-AWA-19

Replace the source row stub (lines 58-61) with conditional rendering:

```tsx
expandedContent={(toggleButton) => (
  <>
    <div className={styles.breadcrumbRow}>
      <Breadcrumb segments={segments} />
      <CopyPathButton path={`.lore/${artifactPath}`} />
      {toggleButton}
    </div>
    {attribution && (
      <div className={styles.sourceRow}>
        <WorkerPortrait
          size="sm"
          portraitUrl={attribution.workerPortraitUrl}
        />
        <p className={styles.attributedText}>
          Written by {attribution.workerName}
          {attribution.commissionId && (
            <>
              {" for "}
              <Link
                href={`/projects/${encodedName}/commissions/${encodeURIComponent(attribution.commissionId)}`}
                className={styles.commissionLink}
              >
                {attribution.commissionTitle || attribution.commissionId}
              </Link>
            </>
          )}
        </p>
      </div>
    )}
  </>
)}
```

Key decisions:

- `WorkerPortrait` gets `portraitUrl` but not `name` or `title`. REQ-AWA-15 says "portrait only, no label beneath it." Passing `name` would render a `<p>` label under the portrait (WorkerPortrait line 53). Passing `title` would render a second label (line 54). Both are omitted. When `portraitUrl` is also absent, the portrait falls back to `"?"` since there's no `name` for initials. That's acceptable per the spec's explicit instruction.
- When `attribution` is absent, no source row renders at all. (REQ-AWA-12)
- Commission link text falls back from `commissionTitle` to `commissionId`. Empty string title handled by `||`. (REQ-AWA-13)
- Without `commissionId`, just "Written by [name]". (REQ-AWA-14)
- Condensed state is untouched. It already omits the source row. (REQ-AWA-19)

Add `Link` import from `next/link` at the top of the file.

### Step 5: CSS adjustments

**File**: `web/components/artifact/ArtifactProvenance.module.css`

**Addresses**: REQ-AWA-16, REQ-AWA-17, REQ-AWA-18

**5a. Add `.attributedText` class.** The existing `.text` class has `font-style: italic` for the stub. Rather than conditionally toggling italic, add a new class for attributed text that shares the base styles but drops italic:

```css
.attributedText {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0;
}
```

Since the stub is removed (REQ-AWA-12), `.text` becomes dead code. Remove it. It's a CSS Module, so the class is file-scoped with no external references.

**5b. Add `.commissionLink` class:**

```css
.commissionLink {
  color: var(--color-brass);
  text-decoration: none;
}

.commissionLink:hover {
  text-decoration: underline;
}
```

This matches other in-page links across the artifact views. (REQ-AWA-18)

**5c. `.sourceRow` is unchanged.** Its existing `display: flex; align-items: center; gap: var(--space-sm)` works for the attributed row. (REQ-AWA-16)

### Step 6: Tests

**Addresses**: All REQs (validation coverage)

Two test files:

**6a. Attribution resolution tests** (`tests/web/artifact-attribution-resolution.test.ts`, new file)

This tests the pure `resolveAttribution` function from Step 2. No component rendering, no daemon interaction.

Test cases:

1. **Source 1 (worker + workerDisplayTitle)**: `extras.worker = "Dalton"`, `extras.workerDisplayTitle = "Guild Artificer"` returns `{ workerName: "Dalton", workerTitle: "Guild Artificer" }`.
2. **Source 1 without title**: `extras.worker = "Dalton"`, no `workerDisplayTitle` returns `{ workerName: "Dalton" }`.
3. **Source 2 (author fallback)**: no `extras.worker`, `extras.author = "Celeste"` returns `{ workerName: "Celeste" }`.
4. **Source 3 (no attribution)**: no `extras.worker`, no `extras.author` returns `null`.
5. **Empty string worker**: `extras.worker = ""` is treated as absent, falls through to source 2 or 3.
6. **Empty string author**: both `worker` and `author` are empty strings, returns `null`.
7. **Non-string worker**: `extras.worker = 42` is treated as absent (type validation).
8. **Portrait lookup**: `extras.worker = "Dalton"`, portrait map has `Dalton: "/images/portraits/dalton.webp"`, result includes `workerPortraitUrl`.
9. **Portrait not found**: `extras.worker = "guild-hall-writer"` (old format), portrait map has no match, `workerPortraitUrl` is absent.
10. **Guild Master fallback**: `extras.worker = "Guild Master"`, portrait map is empty, result includes `workerPortraitUrl: "/images/portraits/guild-master.webp"`.
11. **Guild Master in roster**: if Guild Master is somehow in the map, use the map value, not the hardcoded fallback.
12. **Undefined extras**: `extras` is undefined, returns `null`.
13. **Empty portrait map (fetch failure path)**: `extras.worker = "Dalton"`, portrait map is empty (simulating REQ-AWA-08 fetch failure), result includes `workerName` and `workerTitle` but no `workerPortraitUrl`. Verifies graceful degradation.

**6b. Update existing provenance tests** (`tests/components/artifact-provenance.test.ts`)

Expand the import-only tests to cover the new prop shape:

1. **Attribution type shape**: verify the module exports the `Attribution` type (TypeScript compilation check).
2. **Component accepts attribution prop**: import test verifying the function signature accepts `attribution`.
3. **Commission link construction**: verify that `encodeURIComponent(commissionId)` produces the expected URL path segment. This is a logic test matching the component's link construction.

### Step 7: Validate against spec

Launch a review sub-agent that reads the spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md`, reviews all modified files, and flags any requirements not met. The agent checks:

- All 19 REQs are addressed
- No daemon files were modified (exclusion)
- Image artifacts pass no attribution (REQ-AWA-04)
- Guild Master portrait fallback works (REQ-AWA-07)
- Commission link text fallback from title to ID (REQ-AWA-13)
- Source row hidden when no attribution (REQ-AWA-12)
- Condensed state unchanged (REQ-AWA-19)
- CSS uses `var(--color-brass)` for commission links (REQ-AWA-18)

## File Change Summary

| File | Change | Steps |
|------|--------|-------|
| `web/components/artifact/ArtifactProvenance.tsx` | Add `Attribution` interface, conditional rendering, Link import | 1, 4 |
| `web/lib/resolve-attribution.ts` | **New file**. Pure resolution function | 2 |
| `web/app/projects/[name]/artifacts/[...path]/page.tsx` | Add worker list fetch, call resolution, pass attribution prop | 3 |
| `web/components/artifact/ArtifactProvenance.module.css` | Replace `.text` with `.attributedText`, add `.commissionLink` | 5 |
| `tests/web/artifact-attribution-resolution.test.ts` | **New file**. Resolution logic tests | 6 |
| `tests/components/artifact-provenance.test.ts` | Expand with attribution prop tests | 6 |

Six files total. Two new (pure function + its tests), four modified. No daemon files. No new dependencies.

## Delegation Guide

**Dalton implements Steps 1 through 6.** This is a frontend feature with a pure-function extraction. All changes are in the web layer. The resolution function is the only piece with meaningful logic; the rest is prop threading and conditional JSX.

**Thorne reviews after Step 6.** Single post-completion review. Review scope:

- Spec compliance: all 19 REQs addressed, no drift
- Resolution priority chain: three sources in correct order, type validation on untyped extras
- Guild Master fallback: only fires when roster lookup misses, not unconditionally
- Commission link: title fallback to ID, `encodeURIComponent` on commission ID in URL
- CSS: `.text` removed (dead code), `.attributedText` doesn't reintroduce italic, `.commissionLink` uses `var(--color-brass)`
- Tests: 13 resolution test cases cover all branches (including fetch-failure path), existing provenance tests expanded
- No daemon file modifications

Single review is sufficient. The feature is self-contained (one pure function, one component update, one page update, one CSS file) and the resolution function carries the only non-trivial logic.

## Scope Estimate

Small feature. The resolution function is ~30 lines. The page changes are ~20 lines of fetch + wiring. The component changes are ~15 lines of conditional JSX. The CSS is ~15 lines. Tests are the largest part at ~100 lines across two files.

Total implementation: ~180 lines of new/modified code. Single commission for implementation, single commission for review.

## Risks

**Portrait map staleness**: The worker list is fetched per page render. If a worker package is installed or removed between renders, the map reflects the new state. No cache, no stale data. Not a risk.

**Old-format artifacts**: Artifacts with `worker: guild-hall-writer` will resolve `workerName` as `"guild-hall-writer"` (source 1 fires since the field is non-empty) but the portrait lookup will miss. The source row shows "Written by guild-hall-writer" with a `"?"` portrait. The spec explicitly accepts this (Exclusions section). Not a blocker.

**Commission association accuracy**: `associatedCommissions[0]` takes the first match. If an artifact is linked by multiple commissions, only the first is shown. This matches the spec's intent (REQ-AWA-09 says "the first associated commission"). If ordering matters, it depends on the daemon's commission list sort order, which is creation time descending. The most recent commission gets attributed. Acceptable.

**`Link` in client component**: `ArtifactProvenance` is a `"use client"` component. `next/link` works in client components. No issue.

## Open Questions

None. The spec is detailed enough to implement directly. The one judgment call (new `.attributedText` class vs. conditional `.text` styling) is called out in Step 5a with a rationale.
