---
title: Meeting batch cleanup (2026-03-07 to 2026-03-11)
date: 2026-03-10
status: complete
validated: 2026-04-18
tags: [retro, meetings, cleanup]
---

## Validation Note (2026-04-18)

Each loose thread below is tagged with its current status:
- **[RESOLVED]** — confirmed in code as of 2026-04-18
- **[ABANDONED]** — work dropped or scope killed (e.g. scheduler removal)
- **[OPEN]** — still present; verified location given inline
- **[DIVERGED]** — outcome differs from how the retro framed it; explanation inline
- **[UNVERIFIED]** — outside this validation pass (typically external/upstream)
- **[REJECTED]** — the original retro item recorded a decision that was never actually made (hallucinated consensus); the actual project position is documented inline

Patterns and infrastructure sections at the bottom are kept as historical observation.

## Context

27 meetings across 4 workers (Guild Master: 15, Octavia: 7, Dalton: 2, Octavia meeting-requests: 3) spanning March 7-11, 2026. Guild Master meetings were the primary coordination layer for this sprint, used to plan features, dispatch commissions, review results, and triage bugs. Octavia meetings covered lore review, brainstorms, and design decisions. Dalton meetings were implementation-focused working sessions. One meeting (model selection open questions) was declined; two meeting requests became productive brainstorms.

## Untracked Decisions

### Bugs and Infrastructure Gaps

**Blocked commissions don't re-evaluate on daemon restart** **[OPEN]**
Filed 2026-04-18 as `.lore/issues/blocked-commissions-not-reevaluated-on-restart.md`. Verified locations and fix direction (add a per-project `checkDependencyTransitions` pass after `recoverCommissions()` in startup) are documented in the issue.

**Prompt double-escaping in spawnFromSchedule** **[ABANDONED]**
Issue archived at `.lore/_archive/issues/prompt-double-escaping-spawn.md`. `spawnFromSchedule` and `readArtifactField` are no longer in production code — removed with the scheduler in favor of the heartbeat implementation.

**`skipDangerousModePermissionPrompt` persisted by Claude Code without user action** **[UNVERIFIED]**
Upstream Claude Code defect; can't verify whether the bug report was filed against `github.com/anthropics/claude-code/issues` from inside this repo. The local mitigation (SDK tool availability enforcement) is implemented (`tool-availability-enforcement.md` status `implemented`), so workers no longer rely on permission-mode behavior for tool gating regardless.

### Pending Design Decisions

**initiate_meeting: display name vs. package identifier** **[OPEN — folded]**
Folded into `.lore/issues/worker-display-title-hardcoded-to-name.md` under "Related Ambiguity: `initiate_meeting` Argument Normalization." Both bugs share the same root cause (worker identity treated as a single string instead of a structured lookup) and should be fixed together.

### Implementation Direction (Brainstorms Complete)

**Meeting list preview: agenda as subtitle** **[RESOLVED]**
Implemented. `web/components/project/MeetingList.tsx` exports `previewText()` which extracts `meeting.meta.extras?.agenda` (priority: agenda > first non-empty/non-heading line of notes). Brainstorm artifact moved to `.lore/_archive/brainstorm/meetings-list-preview.md`.

**Commission list filtering: multi-select checkboxes per status** **[RESOLVED]**
Implemented. `web/components/commission/CommissionFilterPanel.tsx:38-40` renders per-status checkboxes. Brainstorm artifact moved to `.lore/_archive/brainstorm/commission-list-filtering.md`. The `blocked` default question was resolved in implementation (check the component for the current default if it matters).

### Process and Behavior

**Review prompt language: verify, don't assume** **[PARTIAL]**
Encoded in Thorne's posture at `packages/guild-hall-reviewer/posture.md:28`: "Include the evidence for every finding. Quote the code, reference the spec requirement, show the inconsistency. 'This looks wrong' is not a finding." The posture also requires `record_decision` per finding with explicit `reasoning`. The verification discipline is documented; whether it actually holds in practice is a separate question (my standing memory note says ~40% of Thorne's final-validation findings are still style opinions or already-resolved bugs).

**Spec inversion convention adopted** **[REJECTED — was hallucination]**
This item was wrong. The "spec inversion convention" (write or update specs only after a change lands, never prescriptively in advance) was an idea the AI fixated on across the 2026-03-07 session and recorded as a "decision" without it actually being a decision. The project's actual position, confirmed 2026-04-18: write the spec, run it through the rest of the process (plan, implement, review), and update the spec as the work surfaces gaps or changes in direction. That round-trip is the process working as intended, not evidence that prescriptive specs should be abandoned.

The inverted-workflow framing is dangerous because it implies "leap before you look" — skipping the spec phase and back-filling description. That undermines requirements verification, planning, and review. Do not propagate this idea into CLAUDE.md, postures, or compendium entries.

The premise is preserved in the archived brainstorm `.lore/_archive/brainstorm/lore-proliferation-maintenance.md` (Idea 1) for historical context only — not as project policy.

**Steward Worker MVP: ship and observe before patching** **[RESOLVED]**
Steward worker spec is `status: implemented`. Findings either folded in or rendered moot by subsequent work (heartbeat replaced scheduled-commission dependency). The "ship and observe" call was vindicated by reaching implemented status without the pre-emptive patches.

## Patterns

**Open items from meetings are tracked inconsistently.** Each session produces explicit "open items" sections, but these don't flow reliably into issues or commission backlogs. The blocked-commissions restart gap, the prompt double-escaping bug, and the review prompt improvement are all sitting in meeting notes with no downstream home. The only meetings where items landed reliably were ones where a commission was dispatched before close.

**Guild Master meetings are the single integration point.** 15 meetings in 3 days because the Guild Master is the only worker who can see the full project state, dispatch commissions, and coordinate handoffs. This is architectural, not a problem, but it means any context the Guild Master doesn't capture in meeting notes is lost when the meeting closes.

**Brainstorm-then-implement chains are missing the middle step.** Both the meetings list preview and commission list filtering went from issue → brainstorm meeting → decision, then stopped. The brainstorm is the artifact; no implementation plan was commissioned. Items sit in brainstorm files, which are less discoverable than plans or issues.

**Meeting worktrees have inherent lag.** Noted explicitly in audience-Octavia-20260310-184157: a meeting worktree is branched at session start, so commits to main after that point are not visible in the meeting. This caused confusion when the user believed a cleanup skill had been added but Octavia couldn't find it. Expected behavior, but worth having as a stated constraint for future reference.

## Infrastructure Issues

**Octavia lacks the Skill tool.** **[RESOLVED]**
Octavia now has the `Skill` tool directly (verified 2026-04-18 — currently using it in this session for `/lore-development:*` and other skill invocations). Subagent routing is no longer required for skill invocation.
