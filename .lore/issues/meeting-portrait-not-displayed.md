---
title: Worker portrait not displayed during meetings
date: 2026-03-06
status: resolved
tags: [bug-fix, meetings, ui, worker-identity]
modules: [meeting-record, meeting-page, meeting-view]
---

# Worker Portrait Not Displayed During Meetings

## What Happens

During a meeting, the worker's portrait frame shows initials instead of their portrait image. The `WorkerPortrait` component renders correctly in the `WorkerPicker` (where users choose a worker), but once the meeting starts, the portrait disappears from both the `MeetingHeader` and individual `MessageBubble` components.

## Why

The portrait data path breaks at the meeting boundary. All the pieces exist but they aren't connected:

1. Worker packages declare `portraitPath` in their `package.json` identity block (e.g., `/images/portraits/octavia-chronicler.webp`). The images exist in `web/public/images/portraits/`.
2. `GET /workers` (daemon) maps `portraitPath` to `portraitUrl` in the API response.
3. `WorkerPicker` receives `portraitUrl` and renders portraits correctly.
4. `writeMeetingArtifact()` in `daemon/services/meeting/record.ts` writes `worker` and `workerDisplayTitle` to frontmatter, but not the portrait path.
5. The meeting page (`web/app/projects/[name]/meetings/[id]/page.tsx`) reads `worker` and `workerDisplayTitle` from frontmatter but never resolves the portrait URL, either from frontmatter or by looking up the worker.
6. `MeetingHeader` and `MeetingView` (and through it, `MessageBubble` and `StreamingMessage`) receive `undefined` for `workerPortraitUrl`.
7. `WorkerPortrait` falls back to initials.

The same gap exists in `propose_followup` (meeting toolbox, `daemon/services/meeting/toolbox.ts`), which also writes meeting artifacts without portrait data.

## Fix Direction

Two approaches were considered:

1. **Store in frontmatter at creation time.** Add `workerPortraitUrl` to the meeting artifact frontmatter when the daemon creates or requests a meeting.

2. **Look up at render time.** The meeting page resolves the portrait from worker identity metadata (discovered packages), using the `worker` field in frontmatter as the lookup key.

Option 1 was implemented first (adding `workerPortraitUrl` to `writeMeetingArtifact` and `propose_followup`). However, three separate code paths create meeting artifacts, each with its own template. The third path (`makeInitiateMeetingHandler` in the manager toolbox) was never updated, producing artifacts without portraits. This demonstrated the structural weakness of Option 1: every creation path must carry the portrait, and new paths will miss it.

**Decision reversed (2026-03-08).** Option 2 is the correct structural fix. Portrait is resolved at display time from worker identity, not stored on every artifact. The `worker` field in frontmatter provides the lookup key. This keeps worker identity metadata in a single source of truth (`package.json`) and eliminates the requirement for every artifact creation path to carry presentation data. See updated spec: `.lore/specs/worker-identity-and-personality.md`.
