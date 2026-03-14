---
title: Meeting batch cleanup (2026-03-10 to 2026-03-14)
date: 2026-03-14
status: complete
tags: [retro, meetings, cleanup]
---

## Context

Seven closed meetings across three workers (Guild Master x4, Octavia x2, Sable x1) spanning 2026-03-10 to 2026-03-14. Topics were tightly focused on three threads: the sandboxed execution / canUseToolRules feature, the Daemon Application Boundary migration, and test output noise investigation.

## Untracked Decisions

### canUseToolRules as universal access control layer

Decided during the Guild Master architecture review (2026-03-13): `canUseToolRules` is not just a specialized security feature for Octavia and Guild Master. As the DAB migration introduces CLI-shaped skills, every new skill requires corresponding `canUseToolRules` entries in the affected worker package. This is now an architectural contract, not an optional addition. Any commission that introduces a new CLI skill must include the rules update as part of its scope.

This principle was meant to be incorporated into the DAB plan before Phase 0. The plan is now executed (PR #108), but the rule should carry forward to all future worker package updates.

### Web layer boundary violations to clean up

Identified during the Octavia DAB spec review (2026-03-12): two web API routes bypass the daemon and will need replacement during future API migration:
- `PUT /api/artifacts` — direct filesystem write
- `POST /api/meetings/[meetingId]/quick-comment` — direct write bypassing daemon session

These are intentional transitional adapters, not bugs, but they need issues to track replacement.

### Micromatch `/` path separator semantics in canUseToolRules patterns

From the sandboxed execution implementation (Thorne F3 finding, 2026-03-13): micromatch treats `/` as a path separator in command string matching, so wildcards won't cross directory boundaries. Package authors writing `canUseToolRules` patterns for CLI commands should prefer exact-match literals over wildcards involving paths. No code fix needed; documentation concern for future package authors.

### Memory audit protocol

Established during the Guild Master check-in (2026-03-10): when Guild Master's cached memory contradicts issue file status fields, the user requests validation against source files rather than assuming process failure. Guild Master will consult `.lore/issues/` status fields before reporting bugs as active.

## Patterns

The DAB and canUseToolRules work generated the most meeting volume — four Guild Master audiences and two Octavia reviews on the same feature cluster. This is appropriate for a foundational architecture change, but it surfaces a planning note: large architectural migrations benefit from a single spec-review meeting before the plan is written, rather than spec review and plan review as separate sessions.

## Infrastructure Issues

None observed.
