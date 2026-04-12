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
- 07:26 commission-Octavia-20260412-072432 result: Validated all four items in the scheduler-removal-residue issue against the current codebase. All four are confirmed still present at their original locations:

1. **Dead type stubs** (`toolbox-utils....

- 07:26 commission-Octavia-20260412-072432 completed
- 07:31 commission-Dalton-20260412-072844 result: Scheduler removal residue cleaned. All five steps complete.

**Changes made:**
1. `daemon/lib/toolbox-utils.ts`: Removed `scheduleLifecycle?: unknown` and `triggerEvaluator?: unknown` from `GuildHallT...
- 07:32 commission-Dalton-20260412-072844 completed
- 07:41 commission-Dalton-20260412-073611 result: Removed the one-shot gate from `submit_result`. Multiple calls now each overwrite the previous result, append their own timeline entry, and fire the callback/event.

**Files modified:**

- `daemon/ser...
- 07:41 commission-Dalton-20260412-073611 completed