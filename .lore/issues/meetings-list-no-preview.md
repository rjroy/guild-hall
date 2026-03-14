---
title: Meetings list entries are indistinguishable without preview text
date: 2026-03-10
status: open
tags: [ux, ui, meetings]
modules: [web/app/projects, web/components/meetings]
---

# Meetings List Lacks Preview Text

## What Happens

The Meetings tab shows entries like "Audience with Guild Master" repeated 10+ times with the same date and worker name. There's no agenda, topic, or first-message preview to distinguish them. The one meeting with a descriptive topic ("Commission dependency graph unreadable on project page") immediately stands out because it has context. Meeting requests also show their full description, which is helpful.

## Why It Matters

When you're looking for a specific past conversation, the list gives you nothing to work with except the date and worker name. For a project where most meetings are with the Guild Master, every entry looks identical. This forces click-through-and-back navigation to find the right meeting.

## Fix Direction

1. **Show agenda or topic.** Meetings have an agenda field in their metadata. Display it as a subtitle or secondary line in the list entry.
2. **Show first message preview.** If no agenda exists, show the first user message or first few words of the worker's opening response as a preview line.
3. **Renamed meetings.** The meeting rename tool exists. If a meeting has been renamed, show that name prominently instead of the generic "Audience with X" title.
