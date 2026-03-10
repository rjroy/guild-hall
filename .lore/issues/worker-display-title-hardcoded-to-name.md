---
title: Worker display title hardcoded to worker name in meeting artifact creation
date: 2026-03-08
status: resolved
tags: [bug, meetings, worker-identity, artifact-creation]
modules: [meeting-toolbox, manager-toolbox]
related:
  - .lore/specs/worker-identity-and-personality.md
  - .lore/issues/meeting-portrait-not-displayed.md
---

# Worker Display Title Hardcoded to Worker Name in Meeting Artifact Creation

## What Happened

Two of three meeting artifact creation paths write the worker's identity name as `workerDisplayTitle` instead of the actual display title from the worker's package metadata.

- `propose_followup` in `daemon/services/meeting/toolbox.ts` line 140: writes `workerDisplayTitle: "${deps.workerName}"` instead of the worker's actual display title.
- `initiate_meeting` in `daemon/services/manager/toolbox.ts` line 340: writes `workerDisplayTitle: "${args.workerName}"` instead of looking up the worker package and reading `identity.displayTitle`.

The third path (`writeMeetingArtifact` in `daemon/services/meeting/record.ts`) correctly receives `workerDisplayTitle` as a parameter from callers who resolve it from worker metadata.

This causes meeting request artifacts to display "Octavia" where they should display "Guild Chronicler" (or whatever the worker's actual display title is).

## Why It Matters

The display title exists to give workers a distinct identity in the UI. Falling back to the identity name defeats the purpose and makes meeting requests look generic. The same structural problem (multiple creation paths, inconsistent data) caused the portrait display bug documented in `.lore/issues/meeting-portrait-not-displayed.md`.

## Fix Direction

Same structural fix as portrait: resolve `workerDisplayTitle` at display time from worker identity metadata, using the `worker` field as the lookup key. Alternatively, fix both creation paths to look up the worker package and use `identity.displayTitle` instead of the name string. The display-time resolution approach is more robust since it keeps identity metadata in a single source of truth.
