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
- 06:14 commission-Dalton-20260422-060917 result: ## MIN-1 — ARTIFACT_DOCUMENT_WRITE_OP workaround removed

**Root cause identified.** The blocker was the `document_write_xss` rule in `security-guidance` plugin (`~/.claude/plugins/.../hooks/security_...

- 06:14 commission-Dalton-20260422-060917 completed
- 06:18 commission-Octavia-20260422-060944 result: Phase 6 back-propagation complete for `.lore/specs/infrastructure/cli-agent-surface.md`.

- 06:18 commission-Octavia-20260422-060944 completed
## Changes

**Frontmatter**
- `status: approved` → `status: implemented` (matches convention used across other...