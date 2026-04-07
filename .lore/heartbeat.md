---
status: active
---
# Heartbeat

This file controls what the guild does autonomously. Every hour (configurable),
a Guild Master session reads this file and decides which standing orders warrant
action: creating commissions, dispatching work, or starting meetings.

**Standing Orders** are lines starting with `- `. Write them in plain language.
If you want the guild to check with you before acting on an order, say so in the
order itself.

**Watch Items** are things to monitor. The guild reads these for context but won't
create commissions from them directly.

**Context Notes** are operational context the guild should know (merge freezes, priorities).

**Recent Activity** is managed by the daemon. Don't edit this section manually.
Workers can also add entries to this file during their sessions.

## Standing Orders

## Watch Items

## Context Notes

## Recent Activity
- 16:41 commission-Octavia-20260406-163631 result: Implementation plan written to `.lore/plans/ui/html-mockup-preview.md`.

The plan breaks the work into 5 phases with 16 steps:

- **Phase 1** (Steps 1-4): Type foundation and scanner. Extends the `art...

- 16:41 commission-Octavia-20260406-163631 completed
- 17:11 commission-Dalton-20260406-170501 result: Phases 1-3 of the HTML mockup preview plan implemented. All 3538 tests pass, typecheck and lint clean.

**Phase 1: Type Foundation and Scanner**
- Extended `artifactType` union in `lib/types.ts:77` to...
- 17:11 commission-Dalton-20260406-170501 completed