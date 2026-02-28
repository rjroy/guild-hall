---
title: Daemon Connectivity Graceful Degradation
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-7-hardening.md
related: [.lore/specs/guild-hall-views.md]
sequence: 10
modules: [guild-hall-ui]
---

# Task: Daemon Connectivity Graceful Degradation

## What

Create a `DaemonContext` React context that provides `{ isOnline: boolean }` to the component tree, then use it to disable action buttons when the daemon is offline.

**Context provider** (`components/ui/DaemonContext.tsx`, new file):
- `DaemonStatus.tsx` already polls `/api/daemon/health` every 5 seconds and shows an offline indicator. Make it the context provider by wrapping its children with `DaemonContextProvider`.
- Export `useDaemonStatus()` hook for consuming components.

**App layout wiring**: Wrap the app layout with `DaemonContextProvider` so all pages have access.

**Button disabling**: Each action button checks `isOnline` and disables when offline:
- Commission actions: Dispatch, Cancel, Re-dispatch
- Meeting actions: Send Message, Close Meeting, Accept/Decline/Defer meeting request, Quick Comment
- Disabled buttons show a tooltip: "Daemon offline"

File-backed reads (server components) are unaffected since they don't go through the daemon.

The offline indicator already exists and auto-clears on reconnect. The context state drives both the indicator and button disabling. No backend work needed.

## Validation

- Daemon online: all action buttons enabled, no offline indicator.
- Daemon offline: all action buttons disabled with "Daemon offline" tooltip, offline indicator shown.
- Daemon reconnects: indicator clears automatically, buttons re-enable without page reload.
- File-backed reads (commission list, artifact content, project page) still render when daemon is offline.
- `useDaemonStatus()` hook returns correct `isOnline` state.
- Component tests: render action buttons with online/offline context, verify enabled/disabled state and tooltip.

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-7: "Next.js reads files directly for initial page loads. Writes and actions go through the daemon API."
- REQ-VIEW-8: "When the daemon is offline, the UI shows a 'daemon offline' indicator. File-backed reads still render. Action buttons are disabled with clear messaging. The indicator clears automatically when the daemon becomes available."

## Files

- `components/ui/DaemonContext.tsx` (create)
- `components/ui/DaemonStatus.tsx` (modify: add context provider)
- `app/layout.tsx` (modify: wrap with DaemonContextProvider)
- `components/commission/CommissionActions.tsx` (modify: check isOnline)
- `components/meeting/MessageInput.tsx` (modify: check isOnline)
- `components/meeting/MeetingView.tsx` (modify: check isOnline for close)
- `components/dashboard/MeetingRequestCard.tsx` (modify: check isOnline)
- `tests/components/daemon-connectivity.test.tsx` (create)
