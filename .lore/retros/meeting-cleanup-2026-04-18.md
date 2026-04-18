---
title: "Meeting batch cleanup (Apr 5-17)"
date: 2026-04-18
status: complete
tags: [retro, meetings, cleanup]
---

## Context

Five closed meetings across two workers (Guild Master 3, Octavia 2), spanning April 5-17. Topics: HTML mockup preview handoff, scheduler residue validation + submit_result change + verification tools design kickoff, verification tools plan dispatch, prior docs cleanup, verification tools bootstrap gap resolution. All decisions from these meetings flowed into commissions, specs, or spec revisions that were tracked separately.

## Untracked Decisions

**Mockup metadata sidebar ships without file size.** The April 6 Guild Master meeting notes record this as "deferred to keep scope tight... documented as a known gap for future work." But the spec (`.lore/specs/ui/html-mockup-preview.md:80`) still requires "filename, file size, last modified date" in the sidebar, and the implementation (`web/components/artifact/MockupMetadataSidebar.tsx`) omits size. No issue was filed. Spec and code are out of sync with no tracking record. Either file an issue to add size (requires extending `collectArtifactFiles()` to include stat output) or amend the spec to reflect what actually shipped.

## Patterns

Meeting-to-commission handoff worked cleanly across the batch. Each Guild Master meeting that dispatched work produced a commission that carried the meeting's decisions forward without loss. The one exception is the deferred metadata item above, which had no dispatch target.

The verification tools feature moved across three meetings (Apr 12 design kickoff, Apr 16 plan dispatch, Apr 16 bootstrap gap closure) and stayed coherent across them. The bootstrap gap caught in the Apr 16 Octavia meeting is a reminder that feasibility review surfaces spec gaps planning would otherwise inherit: when the motivating worker can't create the artifact the spec depends on, that path must be specified in the same spec.

## Infrastructure Issues

None observed in this batch. Meeting logs are clean, no session renewal failures, no merge conflicts on close, all notes landed.
