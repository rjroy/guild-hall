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
- 07:20 commission-Dalton-20260427-064858 result: Phase 2 of the lore directory restructure is complete. typecheck, lint, the full bun test suite (3679 pass / 4 skip / 0 fail across 169 files), and the production build all pass.

- 07:20 commission-Dalton-20260427-064858 completed
## Phase 1 fix recap...
