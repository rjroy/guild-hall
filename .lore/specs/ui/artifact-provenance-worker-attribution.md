---
title: Worker attribution in artifact provenance
date: 2026-03-23
status: draft
tags: [ui, artifacts, provenance, workers, attribution]
modules: [artifact-provenance, artifact-page, worker-portrait]
related:
  - .lore/specs/ui/detail-view-layout-pattern.md
  - .lore/specs/ui/guild-hall-views.md
  - .lore/brainstorm/artifact-provenance-worker-attribution.md
req-prefix: AWA
---

# Spec: Worker Attribution in Artifact Provenance

## Overview

The `ArtifactProvenance` component renders a source row with an empty `WorkerPortrait` and the text "Source information unavailable." This was a deliberate Phase 1 stub (`web/components/artifact/ArtifactProvenance.tsx:59-61`). The data needed to resolve worker attribution has been available since commission and meeting artifacts started writing `worker` and `workerDisplayTitle` into frontmatter extras. This spec defines how to connect that data to the UI.

## Current State

### Data in frontmatter

Commission artifacts consistently carry two fields in `ArtifactMeta.extras`:

```yaml
worker: Dalton
workerDisplayTitle: "Guild Artificer"
```

Meeting artifacts carry the same fields, always attributed to Guild Master:

```yaml
worker: Guild Master
workerDisplayTitle: "Guild Master"
```

Brainstorm artifacts written by workers sometimes carry `extras.author` (display name only, no title). This is written ad-hoc by the worker, not by a service.

Specs, plans, designs, retros, and other human-authored artifacts carry neither field.

A small number of older artifacts use the package name format (`worker: guild-hall-writer`) instead of the display name. These are unresolvable against the current roster without a migration step.

### Portrait resolution gap

Frontmatter carries the worker's display name and title but not their portrait URL. Portrait URLs live in worker package metadata, accessible via `GET /system/packages/worker/list` (`daemon/routes/workers.ts:28`). The response includes `displayName` and `portraitUrl` per worker.

Guild Master is a built-in coordinator, not a discoverable package. It does not appear in the worker list response. Its portrait exists at `/images/portraits/guild-master.webp`.

### Component state

`ArtifactProvenance` (`web/components/artifact/ArtifactProvenance.tsx`) is a client component that receives `projectName`, `artifactTitle`, and `artifactPath` as props. It delegates container chrome to `DetailHeader`, which manages expanded/condensed states. The expanded state shows a breadcrumb row and a source row; the condensed state collapses to the breadcrumb only.

`WorkerPortrait` (`web/components/ui/WorkerPortrait.tsx`) already accepts optional `name`, `title`, and `portraitUrl` props. When `portraitUrl` is absent, it renders initials derived from `name`. When `name` is also absent, it renders "?".

### Artifact page

The artifact page (`web/app/projects/[name]/artifacts/[...path]/page.tsx`) is a server component that already makes three daemon fetches: project config, artifact document, and commission list. It has access to `artifact.meta.extras` and to `associatedCommissions` (filtered by `linked_artifacts`). Adding a fourth fetch to the worker list is consistent with the page's existing pattern.

## Entry Points

- Artifact detail view, expanded provenance header (all artifact types)
- Artifact detail view, condensed provenance header (source row hidden by existing behavior)

## Requirements

### Attribution prop interface

**REQ-AWA-01**: `ArtifactProvenance` accepts an optional `attribution` prop with the following shape:

```typescript
interface Attribution {
  workerName: string;
  workerTitle?: string;
  workerPortraitUrl?: string;
  commissionId?: string;
  commissionTitle?: string;
}
```

All fields except `workerName` are optional. The prop itself is optional; omitting it means no attribution data is available.

**REQ-AWA-02**: The existing props (`projectName`, `artifactTitle`, `artifactPath`) are unchanged. Attribution is additive.

### Attribution resolution on the artifact page

**REQ-AWA-03**: The artifact page resolves attribution using a three-source priority chain:

1. **`extras.worker` + `extras.workerDisplayTitle`**: If `extras.worker` is a non-empty string, use it as `workerName`. Use `extras.workerDisplayTitle` as `workerTitle` if present. This covers commission and meeting artifacts.
2. **`extras.author`**: If source 1 is absent and `extras.author` is a non-empty string, use it as `workerName`. No `workerTitle` (brainstorm artifacts don't carry one).
3. **No attribution**: If neither source yields a name, omit the `attribution` prop entirely.

**REQ-AWA-04**: The resolution logic applies to document artifacts only. Image artifacts (`isImage` path in the artifact page) do not carry frontmatter extras with worker fields, so they pass no `attribution` prop.

### Portrait lookup

**REQ-AWA-05**: The artifact page fetches `GET /system/packages/worker/list` and builds a name-keyed portrait lookup: `Map<string, string | null>`, keyed by `displayName`, valued by `portraitUrl`. Only the portrait URL is needed from the roster; `workerTitle` comes from frontmatter (REQ-AWA-03), not from the worker list.

**REQ-AWA-06**: After resolving `workerName` from REQ-AWA-03, the page looks up the portrait URL from the map. If the worker is found, `workerPortraitUrl` is set to the worker's `portraitUrl`. If not found, `workerPortraitUrl` is omitted (WorkerPortrait falls back to initials).

**REQ-AWA-07**: Guild Master gets a hardcoded fallback. If `workerName` is `"Guild Master"` and the roster lookup returns no match, set `workerPortraitUrl` using the `MANAGER_PORTRAIT_PATH` constant from `lib/packages.ts` (currently `"/images/portraits/guild-master.webp"`). This is the only hardcoded case; all other workers are discoverable packages. Note: `resolveWorkerPortraits()` in `lib/packages.ts` does the same thing for daemon-side code, but the artifact page runs in Next.js and must go through the HTTP API, so the fallback is applied after the fetch.

**REQ-AWA-08**: If the worker list fetch fails, the page continues without portrait resolution. `workerName` and `workerTitle` from frontmatter are still passed; only `workerPortraitUrl` is absent. No error is shown to the user.

### Commission linking

**REQ-AWA-09**: For document artifacts where `associatedCommissions` is non-empty, the artifact page passes the first associated commission's `commissionId` and `title` into the `attribution` prop as `commissionId` and `commissionTitle`.

**REQ-AWA-10**: `associatedCommissions` is already computed by the artifact page (filtering `allCommissions` by `linked_artifacts`). No new fetch is needed. The commission data comes from the existing `GET /commission/request/commission/list` call.

### Conditional rendering

**REQ-AWA-11**: When `attribution` is present, the expanded source row renders `WorkerPortrait` with the resolved `name`, `title`, and `portraitUrl`, followed by descriptive text (see REQ-AWA-13 through REQ-AWA-15).

**REQ-AWA-12**: When `attribution` is absent, the source row is not rendered. No "Source information unavailable" text, no empty portrait, no placeholder. The expanded state shows only the breadcrumb row.

### Text framing

**REQ-AWA-13**: When `attribution.commissionId` is present, the source row text reads: `"Written by [workerName] for "` followed by a link to the commission detail page (`/projects/[projectName]/commissions/[commissionId]`). The link text is `attribution.commissionTitle` or `attribution.commissionId` if the title is absent. An empty string title is treated as absent; fall back to `commissionId`.

**REQ-AWA-14**: When `attribution` is present but `commissionId` is absent (meeting artifacts, brainstorms, or commission artifacts with no linked commission), the source row text reads: `"Written by [workerName]"`.

**REQ-AWA-15**: `WorkerPortrait` is rendered at size `"sm"` with `name` omitted (the portrait only, no label beneath it). The worker name appears in the text beside the portrait, not duplicated under it.

### CSS

**REQ-AWA-16**: The existing `.sourceRow` styles in `ArtifactProvenance.module.css` apply to the attributed source row without changes. The row already uses `display: flex; align-items: center; gap: var(--space-sm)`.

**REQ-AWA-17**: The text styling (`.text` class) changes from italic placeholder style to regular weight for attributed content. The muted color (`var(--color-text-muted)`) is appropriate and stays. The `font-style: italic` is removed or overridden when attribution is present.

**REQ-AWA-18**: Commission links within the source row text use `var(--color-brass)` for color and underline on hover, consistent with other in-page links in the artifact views.

### Condensed state

**REQ-AWA-19**: The condensed state is unchanged. It shows the breadcrumb row and copy-path button. Attribution is only visible in the expanded state. This is existing behavior (the source row only appears in `expandedContent`).

## Exclusions

- **No daemon changes.** All data needed for attribution is already served by existing endpoints. No new routes, no modifications to existing responses.
- **No migration of old-format artifacts.** Artifacts with `worker: guild-hall-writer` (package name instead of display name) will fail the roster lookup and fall back to no portrait. They still show as "Written by guild-hall-writer" since the frontmatter value is used as-is. This is acceptable: the old format is a small minority and reads coherently enough.
- **No automatic attribution for human-written artifacts.** Specs, plans, retros, and designs written directly by the user will continue to show no source row unless the user manually adds an `author` field to frontmatter.
- **No attribution in image artifact views.** Image artifacts don't carry the relevant frontmatter fields. The provenance header renders without a source row, same as today.
- **No condensed-state attribution.** The condensed header prioritizes navigation density. Attribution is expanded-state only.

## Test Considerations

- **Attribution resolution**: Unit tests for the resolution logic (three-source priority, missing fields, empty strings, old-format fallback). These test the page-level resolution function, not the component. Place in a dedicated test file (e.g., `tests/web/artifact-attribution-resolution.test.ts`) since the logic lives in the server component.
- **Portrait lookup**: Map construction from mock worker list, Guild Master fallback, missing worker graceful handling, fetch failure graceful handling.
- **Conditional rendering**: Component renders source row when `attribution` is present, hides it when absent. Commission link renders when `commissionId` is present. Empty commission title falls back to ID.
- **Existing tests**: `tests/components/artifact-provenance.test.ts` covers the current stub. Update to cover the new `attribution` prop and rendering branches (with/without attribution, with/without commission link).
