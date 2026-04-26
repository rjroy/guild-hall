---
title: HTML mockup sidebar — REQ-MKP spec/implementation mismatch (file size missing)
date: 2026-04-18
status: open
tags: [bug, ui, mockup, spec-drift, documentation]
modules: [apps/web/components/artifact/MockupMetadataSidebar]
related:
  - .lore/specs/ui/html-mockup-preview.md
  - .lore/retros/meeting-cleanup-2026-04-18.md
---

# HTML Mockup Sidebar — Spec/Implementation Mismatch

## What Happens

The HTML mockup preview spec requires the metadata sidebar to show "filename, file size, last modified date." The implementation ships filename, format, last modified date, and a project link — but no file size. The April 6 Guild Master meeting noted file size was deferred "to keep scope tight" and "documented as a known gap for future work," but the spec was never amended and no issue was filed. Spec and code disagree, and there is no tracking record reconciling the two.

This is the same pattern as `meeting-layout-spec-implementation-mismatch.md`: a defensible implementation decision that diverges from the spec, gets recorded only in a meeting note, and leaves the spec stale.

## Verified Locations (2026-04-18)

**Spec — REQ-MKP-?:** `.lore/specs/ui/html-mockup-preview.md:80`
> "A metadata sidebar showing: filename, file size, last modified date"

**Implementation — sidebar fields:** `apps/web/components/artifact/MockupMetadataSidebar.tsx:5-15`
```ts
interface MockupMetadataSidebarProps {
  filename: string;
  lastModified?: string;
  projectName: string;
}
```
The `MockupMetadataSidebar` ships four sections (Filename, Format, Last Modified, Project) — no file size, no `fileSize` prop, no stat call upstream.

## Why It Matters

Same reasoning as the meeting-layout drift: a future implementer reading the spec will think file size is required and may add it back; a future reader checking the spec against the code will think the spec is wrong. Either way, the spec stops being a usable reference. Two open spec/implementation drift issues form a pattern — the next implementer needs a rule, not a per-feature judgment call.

## Fix Direction

Two viable approaches. Pick one, do not mix.

**Option A — Amend the spec to drop file size from the sidebar (recommended).**
The April 6 meeting decided file size wasn't worth the cost of extending `collectArtifactFiles()` to include stat output. That was a real call. Update REQ at `.lore/specs/ui/html-mockup-preview.md:80` to read "A metadata sidebar showing: filename, last modified date" and note the omission of file size as a deliberate scope decision.

**Option B — Add file size to the sidebar.**
Extend `collectArtifactFiles()` (or its mockup-side equivalent) to include `stat` output. Plumb `fileSize` through to `MockupMetadataSidebar` props. Render with a humanized formatter (e.g., "12 KB"). Risk: the `collectArtifactFiles()` change touches a shared utility — measure performance impact on artifact-list rendering for projects with many files before locking in.

Option A is the lower-risk path because the implementation has been live without complaints. Option B is correct only if file size is genuinely useful for HTML mockup review (the April 6 meeting decided it wasn't).

## Verification After Fix

- Open an HTML mockup. Option A: confirm spec text matches the four sections rendered (Filename, Format, Last Modified, Project). Option B: confirm a fifth section appears with humanized file size and matches stat output.
- Re-read the REQ against the rendered sidebar. The reader should be able to point to a rendered section for every clause.

## Notes for the Fix

- Same pattern guidance as the meeting-layout issue: when implementation decisions diverge from the spec, write the deviation back into the spec or fix the code. Don't leave the gap silent.
- If a third spec-drift issue appears in the next cleanup batch, this stops being a per-feature problem and becomes a process gap — implementation commissions should include a spec-alignment step when they knowingly deviate.
