---
title: "Commission: Issue: maxTurns reached in commission loses all work"
date: 2026-03-15
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "File an issue for the following problem. Read the commission system implementation in `daemon/services/commission/` to understand the current behavior before writing.\n\n## Problem\n\nWhen a commission hits `maxTurns`, the session ends with an error. The worktree and branch associated with that commission are abandoned. Any partial work (uncommitted changes, partial commits) is lost with no recovery path.\n\n## Why This Matters\n\nCommissions doing substantial work can accumulate meaningful progress before hitting the turn limit. Losing that work entirely is wasteful and frustrating. The user has no way to recover, resume, or even inspect what was accomplished before the limit was hit.\n\n## What's Unclear\n\nThe correct outcome isn't obvious. Some questions to capture (not answer) in the issue:\n\n- Should partial commits be preserved on the branch even if the session failed?\n- Should the commission be retryable (pick up where it left off)?\n- Should the worktree be left intact for manual inspection?\n- Is the right answer different for \"ran out of turns on complex work\" vs \"stuck in a loop burning turns\"?\n- How does this interact with the commission lifecycle state machine (failed vs cancelled vs some new state)?\n\n## Artifact\n\nFile as `.lore/issues/commission-maxturns-no-recovery.md`.\n"
dependencies: []
linked_artifacts:
  - .lore/issues/commission-maxturns-no-recovery.md

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
  - timestamp: 2026-03-15T15:38:45.852Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-15T15:39:38.812Z
    event: progress_report
    reason: "Examined commission system implementation (daemon/services/commission/). Key findings:\n\n1. **Current behavior**: When a commission hits maxTurns, the SDK session ends with outcome.reason=\"maxTurns\", but this is never checked or used.\n\n2. **What actually happens**: The outcome.reason field is ignored. The completion logic only checks resultSubmitted. If no result was submitted before maxTurns, the commission fails and partial work is preserved via workspace.preserveAndCleanup().\n\n3. **Partial work preservation**: Uncomitted changes + any commits are preserved on the branch with a commit message like \"Partial work preserved (Session completed without submitting result): <id>\". The worktree is deleted.\n\n4. **Issues this creates**: \n   - outcome.reason is dead code\n   - User gets generic \"Session completed without submitting result\" even when maxTurns was hit\n   - Worktree is deleted, requiring manual branch checkout for inspection\n   - No retry mechanism or indication that work is recoverable\n   - Unclear if \"preserve branch but fail commission\" is the right UX for maxTurns\n\nReady to write the issue file now."
  - timestamp: 2026-03-15T15:39:58.083Z
    event: result_submitted
    reason: "Filed issue documenting maxTurns behavior and recovery gaps.\n\nThe issue captures:\n- Current behavior: partial work is preserved on the branch via `preserveAndCleanup()`, but maxTurns is indistinguishable from other failures\n- Why it matters: work is lost from the user's perspective despite being technically preserved\n- Unclear dimensions: whether to preserve/commit partial work, whether to support resumption, how to represent state, whether to distinguish \"looped and burned turns\" from \"made real progress\"\n\nThe issue avoids answering these questions, instead surfacing the decision space for the team to resolve based on user needs and architectural priorities.\n\nArtifact: `.lore/issues/commission-maxturns-no-recovery.md`"
  - timestamp: 2026-03-15T15:40:03.362Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Examined commission system implementation (daemon/services/commission/). Key findings:\n\n1. **Current behavior**: When a commission hits maxTurns, the SDK session ends with outcome.reason=\"maxTurns\", but this is never checked or used.\n\n2. **What actually happens**: The outcome.reason field is ignored. The completion logic only checks resultSubmitted. If no result was submitted before maxTurns, the commission fails and partial work is preserved via workspace.preserveAndCleanup().\n\n3. **Partial work preservation**: Uncomitted changes + any commits are preserved on the branch with a commit message like \"Partial work preserved (Session completed without submitting result): <id>\". The worktree is deleted.\n\n4. **Issues this creates**: \n   - outcome.reason is dead code\n   - User gets generic \"Session completed without submitting result\" even when maxTurns was hit\n   - Worktree is deleted, requiring manual branch checkout for inspection\n   - No retry mechanism or indication that work is recoverable\n   - Unclear if \"preserve branch but fail commission\" is the right UX for maxTurns\n\nReady to write the issue file now."
projectName: guild-hall
---
Filed issue documenting maxTurns behavior and recovery gaps.

The issue captures:
- Current behavior: partial work is preserved on the branch via `preserveAndCleanup()`, but maxTurns is indistinguishable from other failures
- Why it matters: work is lost from the user's perspective despite being technically preserved
- Unclear dimensions: whether to preserve/commit partial work, whether to support resumption, how to represent state, whether to distinguish "looped and burned turns" from "made real progress"

The issue avoids answering these questions, instead surfacing the decision space for the team to resolve based on user needs and architectural priorities.

Artifact: `.lore/issues/commission-maxturns-no-recovery.md`
