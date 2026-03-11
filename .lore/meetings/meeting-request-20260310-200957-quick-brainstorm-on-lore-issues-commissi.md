---
title: "Brainstorm: Commission List Filtering"
date: 2026-03-11
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Octavia"
agenda: "Quick brainstorm on `.lore/issues/commission-list-no-filtering.md`. The commission list is a flat chronological dump of 80+ items with no way to filter or group. What's the minimum that makes the common cases (\"what's active?\" and \"what failed?\") fast to answer? Worried about scope creep into search, pagination, and virtual scroll when maybe status filter tabs alone solve 90% of it."
deferred_until: ""
linked_artifacts:
  - .lore/issues/commission-list-no-filtering.md
  - brainstorm/commission-list-filtering.md
meeting_log:
  - timestamp: 2026-03-11T03:09:57.118Z
    event: requested
    reason: "Guild Master initiated meeting request"
  - timestamp: 2026-03-11T03:10:08.592Z
    event: opened
    reason: "User accepted meeting request"
  - timestamp: 2026-03-11T03:10:18.587Z
    event: renamed
    reason: "Renamed to: Brainstorm: Commission List Filtering"
  - timestamp: 2026-03-11T03:14:02.731Z
    event: progress_summary
    reason: "Completed brainstorm on commission list filtering. Read the issue file, examined the current CommissionList server component, the existing STATUS_GROUP sorting logic, and the CommissionTimeline filter tab pattern. Explored five approaches (status tabs, group headers, combined, search, pagination). Recommended V1: status filter tabs with client component conversion, matching existing codebase patterns. Wrote brainstorm artifact to .lore/brainstorm/commission-list-filtering.md."
  - timestamp: 2026-03-11T03:23:09.189Z
    event: progress_summary
    reason: "Rewrote the brainstorm artifact to reflect the actual requirement: multi-select status checkboxes (not exclusive tabs). Documented all 10 statuses from STATUS_GROUP, defined which default on (actionable: pending, dispatched, in_progress, sleeping, active, failed, cancelled) vs off (terminal/parked: blocked, paused, abandoned, completed). Open questions captured: blocked/paused gray zone, checkbox layout for 10 items, reset toggle, count display."
  - timestamp: 2026-03-11T03:23:51.455Z
    event: closed
    reason: "User closed audience"
---
MEETING NOTES — Guild Hall Audience with Octavia
Date: 2026-03-11

---

DISCUSSION SUMMARY

The meeting opened with a brief meta-question about whether Octavia had access to the lore-development brainstorm skill. The answer is no — Octavia does not have the Skill tool in her toolset. The prior brainstorm was produced by a subagent (lore-researcher) that should have the tool, but there is no way to verify from Octavia's side whether the skill was actually invoked versus the agent working independently. This is an acknowledged gap: commissioning Octavia for work that depends on skills she cannot access routes around the problem rather than solving it.

The main topic was commission list filtering. The existing brainstorm had proposed status filter tabs (mutually exclusive, single-select) modeled after CommissionTimeline. The user redirected this toward a multi-select checkbox approach operating at the individual status level — all 10 statuses drawn from the STATUS_GROUP map in lib/commissions.ts — rather than the four bucket groupings. The user specified that the default state should show actionable statuses only: pending, in_progress, dispatched, sleeping, and anything representing work that could be dispatched, cancelled, or abandoned (effectively all idle and active statuses plus failed ones).

The brainstorm document was updated in place to reflect the new approach. The revised recommendation covers the full status list (pending, blocked, paused, dispatched, in_progress, sleeping, active, failed, cancelled, abandoned, completed), proposes defaults of on for the seven actionable statuses and off for the three terminal/parked ones (completed, abandoned, paused), and raises the open question of whether blocked should default on or off given its ambiguous actionability.

---

KEY DECISIONS

No formal decisions were recorded during this meeting. The direction shifted from single-select tabs to multi-select checkboxes per individual status. This is a design direction, not yet a committed implementation decision.

---

ARTIFACTS PRODUCED OR REFERENCED

.lore/issues/commission-list-no-filtering.md — existing issue file, referenced as context
.lore/brainstorm/commission-list-filtering.md — updated during the meeting to reflect the multi-checkbox approach and revised default status selections

---

OPEN ITEMS

Whether "blocked" should default on (it may require user intervention) or off (it often means waiting on something external). The user did not specify.

Whether the checkbox UI uses compact gem-style indicators or labeled checkboxes — 10 items is a lot for a filter bar and layout approach was not resolved.

The brainstorm is ready to be commissioned as implementation work once the blocked-default question is settled.
