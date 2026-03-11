---
title: "Brainstorm: meetings list preview text"
date: 2026-03-11
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Octavia"
agenda: "Quick brainstorm on `.lore/issues/meetings-list-no-preview.md`. The meetings list entries are indistinguishable without preview text. I want to explore the simplest viable fix without over-engineering it. Concern: what's the minimum that actually solves the \"every entry looks the same\" problem? Maybe just surfacing renamed titles and agenda is enough, and the first-message preview is unnecessary complexity."
deferred_until: ""
linked_artifacts:
  - .lore/issues/meetings-list-no-preview.md
meeting_log:
  - timestamp: 2026-03-11T03:04:37.987Z
    event: requested
    reason: "Guild Master initiated meeting request"
  - timestamp: 2026-03-11T03:24:07.273Z
    event: opened
    reason: "User accepted meeting request"
  - timestamp: 2026-03-11T03:24:16.425Z
    event: renamed
    reason: "Renamed to: Brainstorm: meetings list preview text"
  - timestamp: 2026-03-11T03:31:14.307Z
    event: progress_summary
    reason: "Brainstorm complete. Decision: add agenda as a truncated subtitle line in MeetingList. The data is already available in `meeting.meta.extras?.agenda`. No new file reads needed. First-message preview rejected (transcripts deleted on close). Renamed title visual distinction is a nice complement but not the primary fix."
  - timestamp: 2026-03-11T03:33:16.899Z
    event: closed
    reason: "User closed audience"
---
MEETING NOTES — Guild Hall Audience with Octavia
March 11, 2026

SUMMARY

The session addressed a UX problem in the Guild Hall meetings list: entries default to "Audience with [Worker]" titles that repeat without distinction, making it impossible to identify past meetings without clicking into each one. The brainstorm examined what data is already available in meeting artifacts and how much of it could be surfaced cheaply. Four main options were analyzed: renamed title as the primary signal, agenda text as a subtitle, first-message preview from transcripts, and a unified two-tier approach combining renamed titles with agenda fallback.

First-message preview was ruled out early. Transcripts are ephemeral and are deleted when a meeting closes, meaning the approach would produce nothing for the majority of list entries. Agenda text emerged as the strongest candidate because it is always present (set at creation for both user-initiated and worker-requested meetings), already parsed into meeting.meta.extras by the existing scanArtifacts call, and requires no additional file reads. The MeetingRequestCard component already renders agenda text in this way using MeetingMeta — the meetings list simply does not surface the same field because it operates on Artifact[] and the field sits in extras rather than typed meta.

The data flow gap between Artifact[] (used by MeetingList) and MeetingMeta (used by MeetingRequestCard) was documented as a contributing factor. Three paths to bridge it were noted: accessing extras directly with a defensive cast, promoting agenda into the typed ArtifactMeta, or switching MeetingList to MeetingMeta wholesale. The session did not pursue any architectural change; the targeted extras access was identified as sufficient for this fix.

KEY DECISIONS

Agenda as truncated subtitle. Extract meeting.meta.extras?.agenda, truncate at approximately 120 characters with ellipsis, and render as a muted secondary line in MeetingList. This is the sole approved change. The decision was made on the basis that agenda is reliably present, costs nothing to access, and mirrors behavior already working in MeetingRequestCard. First-message preview and wholesale MeetingMeta migration were explicitly rejected.

ARTIFACTS PRODUCED OR REFERENCED

.lore/brainstorm/meetings-list-preview.md — created during the session; updated at close to reflect final decision status.
.lore/issues/meetings-list-no-preview.md — the originating issue; linked but not modified.
web/components/project/MeetingList.module.css — read for context on current component structure; not modified.

OPEN ITEMS

None. The brainstorm is complete and the decision is recorded. Implementation can proceed directly from the brainstorm document without further discussion. No follow-up was deferred.
