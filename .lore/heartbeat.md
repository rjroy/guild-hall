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
- 07:12 commission-Octavia-20260405-071039 result: Wrote spec at `.lore/specs/ui/artifact-tag-view.md` covering the Tag View feature for the artifact browser.

**What I investigated:**
- `ArtifactList.tsx`: view switcher uses ephemeral `viewMode` stat...

- 07:12 commission-Octavia-20260405-071039 completed
- 07:13 commission-Octavia-20260405-070943 result: Wrote spec for meeting error persistence at `.lore/specs/meetings/meeting-error-persistence.md`.

Investigation confirmed the gap: errors flow through SSE to the browser via `iterateSession` but are n...
- 07:13 commission-Octavia-20260405-070943 completed