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
- 20:40 commission-Octavia-20260420-203333 result: Reworked `.lore/plans/infrastructure/cli-agent-surface.md` against the revised spec.

**What changed from v1:**
- Added coverage for **REQ-CLI-AGENT-26** (daemon `/help` surface removal). All 27 spec ...

- 20:40 commission-Octavia-20260420-203333 completed