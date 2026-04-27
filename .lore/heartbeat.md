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
- 13:29 commission-Dalton-20260427-064925 result: Phase 3 of 4 complete: lore directory restructure write-side migration (REQ-LDR-18..24, 38, 40).

Production changes:
- apps/daemon/services/meeting/orchestrator.ts: 3 sites switched from meetingArtif...

- 13:29 commission-Dalton-20260427-064925 completed