---
title: "Commission batch cleanup (March 30 - April 3, 2026)"
date: 2026-04-03
status: complete
tags: [retro, commissions, cleanup]
---

## Context

36 commissions spanning March 30 through April 3 across four workers (Dalton 19, Octavia 10, Thorne 4, Verity 3). Five completed feature chains: token-efficient git tools (spec, plan, 4-phase implement, 3 reviews, self-review), collapsible metadata sidebar (plan, implement, review, self-review), front-page active meetings (spec, plan, 3-phase implement), Thorne review output fix (standalone), and dashboard cleanup (standalone). Three planning-only chains: heartbeat commission dispatch (spec, plan, plan amendment), dangerous allow modes (spec only), and front-page meetings (spec, plan). Three research commissions: dangerous mode environment config, JTBD/disruptive innovation applied to Guild Hall, and campaign planning theory. Two commissions abandoned due to API rate limits and retried successfully.

## What Worked

The token-efficient git tools chain ran the full pipeline cleanly: Octavia spec, Octavia plan, Dalton phases 1-4, Thorne reviews after each phase, Dalton self-review to close remaining gaps. All 17 REQ-TEG requirements verified satisfied. Thorne's per-phase reviews caught real defects (positional assertion ordering, dead code, description/implementation mismatch on "bytes" vs code units) and each was consumed by the next commission in the chain.

Commission dependencies handled the front-page active meetings cleanly. Phase 3 depended on phases 1 and 2 completing first. When phases 1 and 2 were abandoned due to rate limits, the retries picked up without confusion.

Dalton's self-review on the collapsible sidebar caught and fixed a focus-stealing bug on mount before Thorne's independent review even flagged it. Both review paths converged on the same issue, which validates the self-review approach for correctness even when independent review also runs.

Haiku-model commissions (`resource_overrides.model: haiku`) handled small, well-scoped tasks effectively: CSS styling, CLAUDE.md edits, CLI bug fixes, UI refresh fixes, `.lore/` requirement removal. Good pattern for bounded work.

## Loose Threads

### Raw color values in CSS (systemic)

Thorne flagged a hardcoded `rgba(184, 134, 11, 0.3)` in the collapsible sidebar review (commission-Thorne-20260330-220817). This is not sidebar-specific; it's a project-wide pattern where raw color values appear instead of `var(--color-*)` design tokens. CLAUDE.md already prohibits this ("No raw color values in CSS Modules"), but enforcement is manual. A sweep across all `.module.css` files would catch existing violations.

### Token-efficient git tools: quoted-path handling (LOW)

Thorne flagged across phases 3 and 4 that `splitDiffByFile` does not handle git's quoted-path format (paths with spaces or special chars are wrapped in quotes by git). Unlikely to surface in practice since repo file paths rarely contain special characters, but would produce incorrect per-file splitting if they did.

## Infrastructure Issues

### Rate limit abandonment and retry

Two commissions (Dalton 101534, 101544) were abandoned immediately due to API rate limits ("hit your limit"). The retry commissions (120935, 120947) succeeded. The commission system handled this gracefully since the abandoned commissions did no work, but the artifact trail is messy: four commissions for two phases of work. The heartbeat spec (REQ-HBT-6a) addresses this with rate-limit-specific backoff and loop abort, which would prevent future waste.

### Duplicate linked_artifacts persists

Previous retro noted 18/21 commissions had duplicate `linked_artifacts` entries. This batch continues the pattern. The artifact writer still doubles entries. Tracked in project memory under "Untracked Gaps" but no fix has been dispatched.

## Lessons

**Spec-plan sequencing validated again.** The heartbeat spec caught 6 test files in its removal checklist that don't actually exist. The plan caught this during cross-referencing. Specs that reference files should be verified during planning, not assumed correct.

**Research commissions produce durable value when properly scoped.** Verity's three research commissions each produced standalone artifacts that can be consumed months later. The campaign planning theory research explicitly targets spec work that hasn't started yet, and the JTBD analysis surfaces strategic questions worth revisiting.

**Raw color values are a systemic problem, not per-feature.** Flagging hardcoded RGBA in one component's review misses the scope. A project-wide CSS token sweep would be more effective than fixing them one commission at a time.
