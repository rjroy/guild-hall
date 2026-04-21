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
- 08:48 commission-Thorne-20260421-084120 result: 
# Gate 2 Review — commission-Dalton-20260421-063833 (CLI Agent-First Surface, Phases 3+4)

Overall posture: Gate 2 is substantively met. The architectural work — formatter registry rekeyed by operati...

- 08:48 commission-Thorne-20260421-084120 completed
- 09:12 commission-Dalton-20260421-085202 result: All Major and Minor findings from Thorne's Gate 2 review are fixed. Verification: typecheck, lint, bun test (3607 pass, 0 fail, 12 snapshots), and build all green.

- 09:12 commission-Dalton-20260421-085202 completed
## M-1: Project-list fan-out for `m...