---
title: Meeting view layout — REQ-MTG-LAYOUT-13 spec/implementation mismatch
date: 2026-04-18
status: open
tags: [bug, ui, meetings, spec-drift, documentation]
modules: [apps/web/components/meeting/MeetingHeader]
related:
  - .lore/specs/ui/meeting-view-layout.md
  - .lore/retros/commission-cleanup-2026-03-21.md
---

# Meeting View Layout — Spec/Implementation Mismatch

## What Happens

The meeting view layout spec at `.lore/specs/ui/meeting-view-layout.md` requires the condensed header to preserve all data shown in the expanded header. The implementation drops the "Agenda" heading in condensed state, and the condensed layout uses a two-row stack rather than the single-row form the spec illustrates. A reader checking the spec against the code will think the implementation is wrong; an implementer working from the spec to extend the header will reproduce the original (now-missing) form.

Originally flagged during the Phase 2 and Phase 3 Thorne reviews of the meeting view layout commission chain (March 2026) as WARN-level findings. No fix commission was dispatched. Re-surfaced during the 2026-03-21 commission retro validation pass on 2026-04-18.

## Verified Locations (2026-04-18)

**Spec — REQ-MTG-LAYOUT-13:** `.lore/specs/ui/meeting-view-layout.md:106`
> "All information visible in expanded state remains accessible in condensed state. Condensed state truncates and collapses presentation, it does not remove data."

**Spec — condensed layout shape:** `.lore/specs/ui/meeting-view-layout.md:134` (ASCII diagram)
> Single horizontal row: `Agenda text truncated to one li...  Model: opus  [v]`

**Implementation — condensed layout:** `apps/web/components/meeting/MeetingHeader.tsx:49-84`
- Condensed state renders no `Agenda` heading. The agenda text appears as `<p className={styles.agendaTextCondensed}>{agenda}</p>` at line 61, but no `<h3>Agenda</h3>` precedes it.
- Layout is two stacked rows (`workerInfo` row + `agendaSectionCondensed` row), not a single horizontal row.

**Implementation — expanded layout (for contrast):** `apps/web/components/meeting/MeetingHeader.tsx:99`
- Renders `<h3 className={styles.agendaTitle}>Agenda</h3>` before the agenda text.

## Why It Matters

Spec drift compounds. Right now it's a single requirement and a single ASCII diagram, both off by a small amount. The next person to touch the meeting header will hit one of two failures: read the spec, implement against it, and break the current behavior; or read the code, treat the spec as wrong, and the spec stays stale forever. Either way, the spec stops being a usable reference.

The retro lessons-learned section already calls this out:
> "Spec updates don't follow implementation deviations. The meeting layout made defensible decisions that diverged from the spec, recorded those decisions in the commission, but didn't update the spec."

This issue is the concrete instance.

## Fix Direction

Two viable approaches. Pick one, do not mix.

**Option A — Update the spec to document the accepted deviations (recommended).**
The implementation decisions were defensible at the time; the heading and the layout shape are visual choices that work in practice. Amend the spec:
- REQ-MTG-LAYOUT-13: clarify that the "Agenda" heading is presentation, not data, and is allowed to drop in condensed state. Reword to "All semantic content visible in expanded state remains accessible in condensed state" (heading is a label for the agenda text, not separate content).
- Update the ASCII diagram at line 134 to show the two-row stack the implementation actually renders, or note that the single-row form was the original target and the two-row stack was accepted during implementation.

**Option B — Re-add the "Agenda" heading and collapse to a single horizontal row.**
Bring the implementation back to the spec. Adds the heading via `<h3>` in the condensed path and restructures `headerContentCondensed` to a single flex row. Risk: the 48-56px height target (REQ-MTG-LAYOUT-12) may not fit a heading + truncated text + portrait + model label in one row at narrow viewports. If this option is taken, REQ-MTG-LAYOUT-12 height numbers may need to relax.

Option A is the lower-risk path because the implementation has been live for ~four weeks without complaints about the missing heading. Option B is correct only if the heading is genuinely load-bearing for usability.

## Verification After Fix

- Open a meeting in expanded state, confirm "Agenda" heading is present (no behavior change).
- Toggle to condensed state. Option A: confirm spec text matches what is rendered. Option B: confirm "Agenda" heading appears in condensed state and full row fits within 48-56px height at the spec's tested breakpoints.
- Re-read REQ-MTG-LAYOUT-13 against the code. The reader should be able to point to the rendered output for every clause.

## Notes for the Fix

- Whichever option is chosen, this is the model for handling future "WARN-level finding declined" outcomes: write the deviation back into the spec, or fix the code. Don't leave the gap silent.
- If Option A is chosen, also revisit REQ-MTG-LAYOUT-12's height numbers — the two-row stack may use different vertical space than the single-row form the spec sized.
