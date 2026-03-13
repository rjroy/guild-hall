---
title: Meeting sidebar "Linked Artifacts" is always empty in active meetings
date: 2026-03-10
status: requested
tags: [ux, ui, meetings]
modules: [web/components/meeting]
---

# Meeting Linked Artifacts Always Empty

## What Happens

The "Linked Artifacts" sidebar panel in the meeting view shows "No artifacts linked yet" even in conversations where the worker has created commissions, read files, and referenced artifact paths throughout the conversation. The panel takes up sidebar space without providing value.

## Why It Matters

The sidebar is prime screen real estate, especially on desktop where it sits next to the chat. An always-empty panel trains users to ignore that area. On mobile, it pushes the "Close Audience" button below the fold (see separate issue).

## Fix Direction

Two directions depending on what "linked" means:

1. **Auto-populate from tool usage.** If the worker reads files, creates commissions, or writes artifacts during the meeting, automatically add those to the linked artifacts list. The data is already in the tool use entries.
2. **Manual linking only, but hide when empty.** If linking is intentionally manual (worker or user must explicitly link), collapse or hide the panel when there are no links. Don't show an empty container.
3. **Hybrid.** Auto-link artifacts that the worker creates or modifies, allow manual unlinking. This gives the panel content without requiring explicit action.
