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
- 06:43 commission-Dalton-20260421-063646 result: Done. All three Gate 1 findings (M-1, m-2, m-3) fixed. Tests pass, types check, lint clean, build green.

- 06:43 commission-Dalton-20260421-063646 completed
- 07:14 commission-Dalton-20260421-063833 result: Phases 3 and 4 of the CLI Agent-First Surface plan are complete. All four gates green: typecheck, lint, 3584 tests passing across 167 files, production build successful.

- 07:14 commission-Dalton-20260421-063833 completed
## Phase 3 — Help Tree + Daem...
## Files Changed

**daemon/routes/admin.ts**
- Added `zod` import.
- Exported `projectListRequ...
