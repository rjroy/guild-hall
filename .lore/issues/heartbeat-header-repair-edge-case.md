---
title: "repairHeartbeatHeader Edge Case"
date: 2026-04-05
status: invalid
tags: [bug, heartbeat]
---

`repairHeartbeatHeader` in `daemon/services/heartbeat/session.ts` assumes heartbeat files start with a level-1 heading (`# ...`). Files that start with `##` (no preceding blank line before the first section) cause content loss during header repair.

Low likelihood in practice since the heartbeat system generates its own files, but manually created or edited heartbeat files could hit this. Flagged during Thorne's P2 review, deferred with "should be tracked."
