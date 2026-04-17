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
- 20:44 commission-Octavia-20260416-203955 result: Plan artifact created at .lore/plans/infrastructure/read-only-verification-tools.md.

**Structure**: 5 phases mapped to all 26 REQ-VFY-* requirements.

- **Phase 1 — Config Parser** (REQ-VFY-1..4, 20,...

- 20:44 commission-Octavia-20260416-203955 completed