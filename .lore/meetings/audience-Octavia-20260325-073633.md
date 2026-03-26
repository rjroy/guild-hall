---
title: "Disposable Local Git as P4 Isolation Layer - Brainstorm Review"
date: 2026-03-25
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: "Discussing artifact: .lore/brainstorm/disposable-local-git-p4.md"
deferred_until: ""
linked_artifacts:
  - brainstorm/disposable-local-git-p4.md
meeting_log:
  - timestamp: 2026-03-25T14:36:35.522Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-25T14:37:22.334Z
    event: renamed
    reason: "Renamed to: Disposable Local Git as P4 Isolation Layer - Brainstorm Review"
  - timestamp: 2026-03-25T15:21:24.873Z
    event: progress_summary
    reason: "Walked through all five open questions from the disposable-local-git-p4 brainstorm. All resolved. Key decisions: workflow prevents drift (no mid-cycle sync), always reset, whitelist .gitignore as access boundary, P4 adapter lives in repo as sibling directory with no daemon/web coupling. Updated brainstorm status to resolved with positions documented."
  - timestamp: 2026-03-25T15:28:15.098Z
    event: progress_summary
    reason: "Brainstorm finalized. Added \"Why Pure Bookends Are Sufficient\" section documenting that mid-cycle P4 awareness is unnecessary (exclusive locks, critical submits, and filetypes all surface at the submit bookend). Updated next steps to reflect the tighter framing: the adapter is two commands (init and submit), not a full system. Status set to resolved. All open questions resolved with positions."
  - timestamp: 2026-03-25T15:30:37.420Z
    event: closed
    reason: "User closed audience"
---
Meeting: Disposable Local Git as P4 Isolation Layer - Brainstorm Review
Date: 2026-03-25
Participants: Ronald Roy, Octavia (Guild Chronicler)
Project: guild-hall

---

SUMMARY

This session reviewed the brainstorm at .lore/brainstorm/disposable-local-git-p4.md, which proposes using a disposable local git repo as an isolation layer for Guild Hall operating against Perforce workspaces. The core concept treats P4 as bookend operations around a standard git repo: sync at the start to establish a baseline, git init to create the workspace, Guild Hall works normally, then reconcile and shelve at the end to return work to P4. The session worked through all five open questions in the brainstorm to arrive at concrete positions on each.

The most clarifying insight came late in the session: from Guild Hall's perspective, it is simply working against a git repo. The entire P4 problem reduces to two operations — creating a git repo from a P4 workspace using a predefined .gitignore whitelist (init), and creating a P4 shelve based on changes made to that git repo (submit). Everything else is either Guild Hall's existing behavior or the user's existing P4 workflow. A check was done on whether pure bookends miss anything; three mid-cycle visibility gaps were identified (exclusive locks, critical submits, P4 filetypes), and all three surface at the submit boundary rather than silently. The bookend approach is sufficient.

The user also defined the authoritative eight-step workflow: user syncs P4, user notifies Guild Hall, adapter creates git repo with whitelisted .gitignore and makes tracked files writable, user works in Guild Hall, user requests submit, adapter copies changes and creates the P4 shelf, user creates Swarm review, user syncs and resets. The key constraint is that p4 sync must not happen mid-cycle. This constraint prevents drift by workflow rather than requiring automated conflict detection.

---

KEY DECISIONS

Conflict detection uses revision-level checking only. Comparing the baseline P4 changelist number against head revisions at shelve time is sufficient to flag files touched by both the commission and other developers. Content-level diffing adds complexity without proportional value. Flagged conflicts block auto-shelve; the human resolves them manually.

The reset step is always performed. The git repo is destroyed and re-initialized after every cycle. The cost of re-init on a scoped directory is low; the cost of detecting whether the existing repo is still valid is not. Simple cycle, no conditional branches.

The .gitignore uses a whitelist model: * (deny all) as the first line, then explicit allow exceptions for each directory. This is an access control boundary, not just a performance optimization. Guidance to studios: start narrow, expand only when a commission fails because it could not reach something it needed. Parent directories must each be explicitly un-ignored for git negation rules to work.

The adapter will live in the guild-hall repo as a sibling directory (p4-adapter/ or similar), following the same pattern as cli/. No imports from daemon/ or web/, and neither imports from it. Colocated, not coupled. Guild Hall remains "git is the world." The adapter is the only thing that knows P4 exists.

---

ARTIFACTS

.lore/brainstorm/disposable-local-git-p4.md was updated during the session. Changes include: status moved from open to resolved, the eight-step workflow added, scoping section updated to whitelist model with writable-files requirement, drift section replaced with a "prevented by workflow" framing, pure bookend validation section added, and all five open questions replaced with resolved positions. The artifact was linked to this meeting.

---

FOLLOW-UPS

Specify the P4 adapter as a concrete tool: commands (init, submit), configuration (the .gitignore whitelist, baseline changelist tracking), and error cases. The rename handling decision needs to be made explicit before implementation — current leaning is treat renames as delete + add (conservative, loses P4 rename history, avoids misattribution). Consider whether the whitelist .gitignore concept is a general Guild Hall feature beyond P4, as any large repo benefits from a defined scope boundary for AI work.
