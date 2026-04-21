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
- 18:29 commission-Octavia-20260420-181653 result: Implementation plan drafted for the CLI agent-first surface spec. The plan at `.lore/plans/infrastructure/cli-agent-surface.md` covers all 27 REQ-CLI-AGENT requirements across 6 phases with 3 Thorne r...

- 18:29 commission-Octavia-20260420-181653 completed