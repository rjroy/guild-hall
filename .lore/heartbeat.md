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
- 06:35 commission-Verity-20260427-062652 result: Discovery report written to `.lore/issues/lore-directory-restructure-discovery.md`. The report catalogues every site in the codebase that assumes the flat `.lore/<type>/` layout, organized by category...

- 06:35 commission-Verity-20260427-062652 completed
- 06:43 commission-Octavia-20260427-063950 result: Drafted spec at `.lore/specs/infrastructure/lore-directory-restructure.md` (status: draft). 40 requirements (REQ-LDR-1..40) across eight requirement groups: classification (peel `work/`, add `learned`...
- 06:43 commission-Octavia-20260427-063950 completed
- 06:51 commission-Dalton-20260427-064804 result: Phase 1 of the lore directory restructure (the classification choke point) is complete. All in-scope requirements implemented; verification clean.

- 06:51 commission-Dalton-20260427-064804 completed
- 06:56 commission-Thorne-20260427-064828 result: ## Verdict: PASS

Phase 1 of the lore directory restructure correctly establishes single-axis classification with `work/` peeling. All 10 in-scope requirements satisfied. Implementation is small (4 fi...
- 06:56 commission-Thorne-20260427-064828 completed
## Files changed

| File | Change |
| --- | --- |
| ...