---
title: "Commission: Issue: maxTurns reached in commission loses all work"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "File an issue for the following problem. Read the commission system implementation in `daemon/services/commission/` to understand the current behavior before writing.\n\n## Problem\n\nWhen a commission hits `maxTurns`, the session ends with an error. The worktree and branch associated with that commission are abandoned. Any partial work (uncommitted changes, partial commits) is lost with no recovery path.\n\n## Why This Matters\n\nCommissions doing substantial work can accumulate meaningful progress before hitting the turn limit. Losing that work entirely is wasteful and frustrating. The user has no way to recover, resume, or even inspect what was accomplished before the limit was hit.\n\n## What's Unclear\n\nThe correct outcome isn't obvious. Some questions to capture (not answer) in the issue:\n\n- Should partial commits be preserved on the branch even if the session failed?\n- Should the commission be retryable (pick up where it left off)?\n- Should the worktree be left intact for manual inspection?\n- Is the right answer different for \"ran out of turns on complex work\" vs \"stuck in a loop burning turns\"?\n- How does this interact with the commission lifecycle state machine (failed vs cancelled vs some new state)?\n\n## Artifact\n\nFile as `.lore/issues/commission-maxturns-no-recovery.md`.\n"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-15T15:38:45.807Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T15:38:45.809Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
