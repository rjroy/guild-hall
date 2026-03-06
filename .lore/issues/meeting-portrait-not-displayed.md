---
title: Worker portrait not displayed during meetings
date: 2026-03-06
status: open
tags: [bug, meetings, ui, worker-identity]
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

Two approaches:

1. **Store in frontmatter at creation time.** Add `workerPortraitUrl` to the meeting artifact frontmatter when the daemon creates or requests a meeting. The page already reads other worker identity fields from frontmatter, so adding one more field is consistent. This means the portrait URL is baked in at creation time and won't update if the worker package changes its portrait later, but that's an unlikely scenario and acceptable.

2. **Look up at render time.** The meeting page fetches the worker list from the daemon (or reads packages directly, since it's a server component with filesystem access) and matches by worker name. More dynamic but adds a dependency: the page now needs the daemon running or package discovery working to render correctly.

Option 1 is simpler and consistent with how `worker` and `workerDisplayTitle` already work. The frontmatter is the source of truth for meeting identity.
