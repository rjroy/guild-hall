---
title: "Commission: W2W mail system test gaps and hardcoded recovery bug"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The issue `.lore/issues/w2w-mail-test-gaps.md` documents three gaps in the worker-to-worker mail system, confirmed by code inspection:\n\n1. **No test for multiple sleep/wake cycles.** All existing tests use `mailSequence: 1`. The code paths for subsequent cycles exist but no test proves a second cycle works. REQ-MAIL-4 covers this.\n\n2. **No test for cancel during active mail reader.** The cancel path when mail status is `open` (reader actively processing) is the most complex cancel flow. Only the queued-path cancel is tested.\n\n3. **Recovery hardcodes mailSequence: 1.** Three locations in `mail/orchestrator.ts` (lines 811, 840, 853) hardcode `mailSequence: 1` during crash recovery. A commission that crashed during its second or later sleep/wake cycle will recover with the wrong sequence number.\n\nItem 3 is a latent bug, not just a test gap. The sequence number should be read from the commission's state file or artifact during recovery.\n\nAssess each gap, write tests for items 1 and 2, and fix + test item 3. The existing mail tests in `tests/daemon/services/mail/` show the patterns and test infrastructure to follow."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T17:26:42.272Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:26:42.273Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
