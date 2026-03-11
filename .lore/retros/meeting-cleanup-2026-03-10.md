---
title: Meeting batch cleanup (2026-03-07 to 2026-03-11)
date: 2026-03-10
status: complete
tags: [retro, meetings, cleanup]
---

## Context

27 meetings across 4 workers (Guild Master: 15, Octavia: 7, Dalton: 2, Octavia meeting-requests: 3) spanning March 7-11, 2026. Guild Master meetings were the primary coordination layer for this sprint, used to plan features, dispatch commissions, review results, and triage bugs. Octavia meetings covered lore review, brainstorms, and design decisions. Dalton meetings were implementation-focused working sessions. One meeting (model selection open questions) was declined; two meeting requests became productive brainstorms.

## Untracked Decisions

### Bugs and Infrastructure Gaps

**Blocked commissions don't re-evaluate on daemon restart**
Identified during the Local Model Support session (Mar 9). `recoverCommissions()` calls `enqueueAutoDispatch()` on restart but does not call `checkDependencyTransitions()`. Result: commissions with blocked status and satisfied dependencies will remain stuck until something else triggers re-evaluation. The dependency path resolution bug was fixed in the same session, but this recovery gap was explicitly flagged and not assigned. Warrants a follow-up commission.

**Prompt double-escaping in spawnFromSchedule**
Identified during the scheduled commission testing session (Mar 10). The `readArtifactField` method double-escapes inner quotes when copying the prompt from a schedule artifact to the spawned one-shot commission artifact. The catch-up bug was assigned to Dalton in the same session; this issue was noted but not formally assigned. Currently untracked.

**`skipDangerousModePermissionPrompt` persisted by Claude Code without user action**
Identified during the SDK tool availability enforcement session (Mar 10, audience-Guild-Master-20260310-144831). The `dontAsk` permission mode silently persists `skipDangerousModePermissionPrompt` to the user's settings file, causing the permission mode to behave like `bypassPermissions`. This is an upstream Claude Code defect. The open item was to file a bug report at github.com/anthropics/claude-code/issues. Not yet filed.

### Pending Design Decisions

**initiate_meeting: display name vs. package identifier**
Identified Mar 8 (audience-Guild-Master-20260308-085545). The Guild Master was passing worker display names instead of package names to `initiate_meeting`. Two options were discussed: (1) behavioral discipline only — Guild Master uses package names going forward, or (2) harden `initiate_meeting` and downstream artifact lookup to accept either form. No decision was made in session. Not tracked in any issue.

### Implementation Direction (Brainstorms Complete)

**Meeting list preview: agenda as subtitle**
Decided in the "Brainstorm: meetings list preview text" meeting (Mar 11). Extract `meeting.meta.extras?.agenda`, truncate at ~120 characters with ellipsis, and render as a muted secondary line in `MeetingList`. Decision is captured in `.lore/brainstorm/meetings-list-preview.md`. First-message preview was explicitly rejected (transcripts deleted on close). No plan or implementation commission has been created yet.

**Commission list filtering: multi-select checkboxes per status**
Decided in the "Brainstorm: Commission List Filtering" meeting (Mar 11). Direction shifted from single-select tabs to multi-select checkboxes at the individual status level (all 10 statuses from STATUS_GROUP). Default on: pending, dispatched, in_progress, sleeping, active, failed, cancelled. Default off: completed, abandoned, paused. Decision captured in `.lore/brainstorm/commission-list-filtering.md`. **Open question remains**: should `blocked` default on or off? User did not specify. No plan or implementation commission created.

### Process and Behavior

**Review prompt language: verify, don't assume**
Decided Mar 9 (audience-Guild-Master-20260308-194148). Thorne's F5 finding on scheduled commissions was "likely"-hedged and wrong. The session established that reviewers must verify claims against code before asserting them. Open item: update review commission prompts to require verification, not assumption. Not encoded in any spec or toolbox instruction.

**Spec inversion convention adopted**
Decided Mar 7 (audience-Octavia-20260307-190853). Specs are written or updated when changes land, not written prescriptively in advance. Rationale: prescriptive specs drift and actively misdirect AI agents. This is a process change, no infrastructure required. Captured in `.lore/brainstorm/lore-proliferation-maintenance.md` but not in CLAUDE.md or any enforced convention.

**Steward Worker MVP: ship and observe before patching**
Decided Mar 10 (audience-Guild-Master-20260310-013159). 9 review findings, all non-blocking. Deliberate choice to validate behavioral gaps (task-type detection, empty-results handling) through live commissions rather than pre-emptively patching. Finding 8 (escalation test threshold, one-line fix) identified as the only candidate for immediate action but not acted on. PR #95 shipped.

## Patterns

**Open items from meetings are tracked inconsistently.** Each session produces explicit "open items" sections, but these don't flow reliably into issues or commission backlogs. The blocked-commissions restart gap, the prompt double-escaping bug, and the review prompt improvement are all sitting in meeting notes with no downstream home. The only meetings where items landed reliably were ones where a commission was dispatched before close.

**Guild Master meetings are the single integration point.** 15 meetings in 3 days because the Guild Master is the only worker who can see the full project state, dispatch commissions, and coordinate handoffs. This is architectural, not a problem, but it means any context the Guild Master doesn't capture in meeting notes is lost when the meeting closes.

**Brainstorm-then-implement chains are missing the middle step.** Both the meetings list preview and commission list filtering went from issue → brainstorm meeting → decision, then stopped. The brainstorm is the artifact; no implementation plan was commissioned. Items sit in brainstorm files, which are less discoverable than plans or issues.

**Meeting worktrees have inherent lag.** Noted explicitly in audience-Octavia-20260310-184157: a meeting worktree is branched at session start, so commits to main after that point are not visible in the meeting. This caused confusion when the user believed a cleanup skill had been added but Octavia couldn't find it. Expected behavior, but worth having as a stated constraint for future reference.

## Infrastructure Issues

**Octavia lacks the Skill tool.** Identified in the commission list filtering brainstorm. Octavia cannot invoke lore-development skills directly. When she was commissioned for brainstorm work, the actual skill invocation happened in a subagent (lore-researcher). This routing works but is implicit — it's not clear from the commission prompt whether skill invocation will happen. No fix proposed yet.
