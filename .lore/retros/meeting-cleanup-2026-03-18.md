---
title: "Meeting batch cleanup (2026-03-14 to 2026-03-18)"
date: 2026-03-18
status: complete
tags: [retro, meetings, cleanup]
---

## Context

20 closed meetings across four days (2026-03-14 to 2026-03-18), involving four workers: Guild Master (13), Octavia (5), Dalton (1), and Celeste (1). One requested meeting was skipped. The batch covers a high-activity period spanning PRs #112 through #120, the introduction of the Celeste visionary worker, vision v2 approval, and two infrastructure projects (email operation factory refactor, memory single-file redesign).

## Untracked Decisions

**Read-path route tests should mock the record layer.** During the test duplication audit (GM 20260314-150108-1), the team agreed that read-path route tests should follow the write-path pattern: mock the record layer rather than exercising actual filesystem parsing. This eliminates duplication between route tests and service tests without removing coverage. Not tracked in any spec or issue.

**CHANGELOG updates are release-time, not continuous.** Feedback recorded in GM 20260316-074532 progress notes. CHANGELOG should be updated at release boundaries, not as work happens. This prevents the CHANGELOG from becoming a noisy commit-by-commit log.

**Use commission dependencies for automatic chaining instead of manual dispatch sequencing.** Feedback from GM 20260317-222526 progress notes. When dispatching multi-step commission chains, the Guild Master should use the dependency field rather than manually sequencing dispatches. The system supports this natively.

**Don't downgrade review findings from "incorrect" to "not blocking."** From the email refactor review discussion (GM 20260317-222526). Thorne's job is to flag accurately. Leadership's job is to decide what merits action. "Correct matters. But also don't over-engineer fixes beyond what's warranted." Partially overlaps with the existing lessons-learned rule about "pre-existing" findings, but adds the leadership/worker responsibility split.

**Worker memory is for operational notes; project status lives in project scope only.** From the documentation cleanup session (GM 20260315-103434-3). Memory organization decision to prevent drift between project and worker scopes. Project status consolidated to project memory; worker memory reserved for things specific to that worker's operation. The memory redesign implemented this structurally, but the principle itself isn't stated in any spec.

**Auto-deploy mechanism for worker packages.** From the vision discussion (GM 20260317-140506-2). When rejecting the idea of self-modifying worker packages, the team identified auto-deploy on PR merge as the correct alternative. systemd timer was suggested. Related to the package-distribution-model issue but the specific deployment mechanism isn't tracked there.

## Patterns

**Guild Master meetings are primarily dispatch sessions.** 10 of 13 GM meetings followed the same shape: survey current state, make decisions, dispatch commissions, record progress. The meetings serve as a coordination mechanism rather than deep technical discussions. This is working well; the pattern produces clear commission chains with documented rationale.

**"What's next" is a recurring agenda.** Multiple meetings share this generic agenda, getting renamed to specific topics once the discussion shapes up. The rename-on-content pattern works fine, but the initial agenda is effectively meaningless for distinguishing meetings in a list. This relates to the open issue "meetings-list-no-preview."

**Near-empty meetings exist.** "Celeste's first vision commission" (GM 20260317-133336) has "No content generated." The brainstorm reference meeting (GM 20260317-140028-1) has minimal notes. These are artifacts of brief sessions where the primary action was dispatching a commission. The meeting system doesn't distinguish between substantive conversations and quick dispatch sessions.
