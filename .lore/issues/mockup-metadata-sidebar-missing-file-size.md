---
title: "Mockup metadata sidebar missing file size"
date: 2026-04-18
status: open
tags: [bug, spec-divergence, ui, mockup]
---

## Problem

REQ-MKP-14 (`.lore/specs/ui/html-mockup-preview.md:80`) requires the mockup detail view's metadata sidebar to show **filename, file size, and last modified date**. The implementation at `apps/web/components/artifact/MockupMetadataSidebar.tsx` omits file size and substitutes a "Format: HTML Mockup" field instead.

This is a spec-to-code divergence that has gone unrecorded since Phase 4 shipped. The April 6 Guild Master meeting notes acknowledged the deferral ("artifact scan result does not include file size... documented as a known gap for future work") but the spec was never amended and no issue was filed.

## Root Cause

The `Artifact` type (`lib/types.ts:74-84`) does not carry a `size` field. The scanner calls `fs.stat()` for every artifact (see `lib/artifacts.ts:137, 161, 184, 234`) but only propagates `stat.mtime` as `lastModified`, discarding `stat.size`.

Contrary to what the meeting notes suggested, a dedicated metadata endpoint is not required. The stat call already happens.

## Fix

Two small options, roughly equal cost:

**Option A (preferred): extend `Artifact` with size.**
1. Add `size: number` (bytes) to the `Artifact` interface in `lib/types.ts`.
2. In each of the four `fs.stat()` call sites in `lib/artifacts.ts`, include `size: stat.size` in the returned object.
3. Update `scanArtifacts` tests in `lib/tests/artifacts.test.ts` to assert the field.
4. Pass `size` through to `MockupMetadataSidebar` from the catch-all route at `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx`.
5. Render with a small human-readable formatter (`1.2 KB`, `340 B`). Keep the existing "Format" field; the spec doesn't forbid it, but drop the size substitution.

**Option B: dedicated size lookup in the mockup page only.**
Call `fs.stat()` inline when rendering the detail page. Faster to ship, but leaves the generic `Artifact` type incomplete for any future consumer that wants size (image detail views, for example). Not recommended.

## Scope

Small. Estimated 15-30 minutes of work plus a review gate. The change touches the core `Artifact` shape, which has broad consumers, so a Thorne pass is warranted to confirm no call site assumes the old shape.

## References

- Spec: `.lore/specs/ui/html-mockup-preview.md:80` (REQ-MKP-14)
- Scanner: `lib/artifacts.ts:137,161,184,234` (four stat call sites)
- Type: `lib/types.ts:74-84`
- Sidebar: `apps/web/components/artifact/MockupMetadataSidebar.tsx`
- Origin: April 6 Guild Master meeting notes (deferred during Phase 4 implementation)
