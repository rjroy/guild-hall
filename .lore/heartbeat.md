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
- 22:21 commission-Dalton-20260420-215633 result: Phases 1 and 2 of the CLI Agent-First Surface plan are complete. Committed as `f8058a1c`.

**Phase 1 — four new daemon leaves (REQ-CLI-AGENT-22, 22a, 23):**
- `system.config.project.list` in `daemon/r...

- 22:21 commission-Dalton-20260420-215633 completed
- 22:27 commission-Thorne-20260420-215649 result: 
# Review Gate 1: Phases 1 + 2 of CLI Agent-First Surface

Reviewed against `.lore/plans/infrastructure/cli-agent-surface.md` (Phases 1–2) and `.lore/specs/infrastructure/cli-agent-surface.md` (REQ-CL...
- 22:27 commission-Thorne-20260420-215649 completed