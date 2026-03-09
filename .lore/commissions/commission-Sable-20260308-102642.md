---
title: "Commission: W2W mail system test gaps and hardcoded recovery bug"
date: 2026-03-08
status: completed
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "The issue `.lore/issues/w2w-mail-test-gaps.md` documents three gaps in the worker-to-worker mail system, confirmed by code inspection:\n\n1. **No test for multiple sleep/wake cycles.** All existing tests use `mailSequence: 1`. The code paths for subsequent cycles exist but no test proves a second cycle works. REQ-MAIL-4 covers this.\n\n2. **No test for cancel during active mail reader.** The cancel path when mail status is `open` (reader actively processing) is the most complex cancel flow. Only the queued-path cancel is tested.\n\n3. **Recovery hardcodes mailSequence: 1.** Three locations in `mail/orchestrator.ts` (lines 811, 840, 853) hardcode `mailSequence: 1` during crash recovery. A commission that crashed during its second or later sleep/wake cycle will recover with the wrong sequence number.\n\nItem 3 is a latent bug, not just a test gap. The sequence number should be read from the commission's state file or artifact during recovery.\n\nAssess each gap, write tests for items 1 and 2, and fix + test item 3. The existing mail tests in `tests/daemon/services/mail/` show the patterns and test infrastructure to follow."
dependencies: []
linked_artifacts:
  - daemon/services/mail/types.ts

  - daemon/services/mail/orchestrator.ts
  - tests/daemon/services/mail/orchestrator.test.ts
  - daemon/services/mail/orchestrator.ts
  - tests/daemon/services/mail/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-08T17:26:42.272Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:26:42.273Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T17:26:42.309Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T17:26:51.075Z
    event: progress_report
    reason: "Starting assessment. Reading the issue file, mail orchestrator code, and existing test patterns."
  - timestamp: 2026-03-08T17:28:25.514Z
    event: progress_report
    reason: "Assessment complete. All three gaps confirmed:\n\n1. **Multiple sleep/wake cycles**: Confirmed. Every test uses `mailSequence: 1`. The `resumeCommissionSession` function (line 635) handles re-sleep via `handleSleep` when `flags.mailSent` is true, but no test exercises this path. The `commission_mail_sent` event carries the new `mailSequence` from the toolbox, but this end-to-end path is untested.\n\n2. **Cancel during active reader**: Confirmed. The cancel test at line 2119 only tests the queued path (capacity 0, reader never starts). The `cancelReaderForCommission` function (line 752) has a second branch that aborts an active reader and waits for its completion promise, but no test exercises it.\n\n3. **Recovery hardcodes mailSequence: 1**: Confirmed at lines 811, 840, 853. The `SleepingCommissionState` type doesn't include `mailSequence`, and `PendingMail` doesn't either. The sequence needs to be persisted in the state file during sleep and read back during recovery. `getMailSequence()` from `MailRecordOps` can derive it from the mail directory contents as a fallback.\n\nNow writing the fix for item 3, then tests for all three."
  - timestamp: 2026-03-08T17:38:40.929Z
    event: result_submitted
    reason: "All three gaps from `.lore/issues/w2w-mail-test-gaps.md` addressed. 7 new tests, 1 bug fix, 1992/1992 tests pass.\n\n**Item 1 — Multiple sleep/wake cycles:** 2 tests added. One proves `commission_mail_sent` with `mailSequence: 2` flows through to `handleSleep`. The other proves `handleSleep` persists `mailSequence` in the state file for recovery.\n\n**Item 2 — Cancel active mail reader:** 1 test added. Starts a reader that blocks on SDK drain, waits for it to become active (`readerActive: true`), cancels via `cancelReaderForCommission`, verifies the abort signal fires and the reader drains without error.\n\n**Item 3 — Recovery hardcodes mailSequence: 1 (bug fix + 4 tests):**\n- **Bug fix:** `PendingMail` type now carries `mailSequence?: number`. `handleSleep` persists the value to state. `recoverSleepingCommission` reads `pendingMail.mailSequence ?? 1` instead of hardcoding 1. All three recovery branches (replied, open, sent) use the recovered value.\n- **Tests:** Recovery with sent mail (sequence 3 → contextId contains \"003\"), recovery with open mail (sequence 2 → contextId contains \"002\"), backwards-compat fallback (missing field → contextId contains \"001\"), direct verification that handleSleep writes mailSequence to state.\n\nFiles modified:\n- `daemon/services/mail/types.ts` — added `mailSequence?: number` to `PendingMail`\n- `daemon/services/mail/orchestrator.ts` — persist mailSequence in handleSleep, read it back in recoverSleepingCommission\n- `tests/daemon/services/mail/orchestrator.test.ts` — updated 1 existing assertion, added 7 new tests across 3 describe blocks"
  - timestamp: 2026-03-08T17:38:45.097Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Assessment complete. All three gaps confirmed:\n\n1. **Multiple sleep/wake cycles**: Confirmed. Every test uses `mailSequence: 1`. The `resumeCommissionSession` function (line 635) handles re-sleep via `handleSleep` when `flags.mailSent` is true, but no test exercises this path. The `commission_mail_sent` event carries the new `mailSequence` from the toolbox, but this end-to-end path is untested.\n\n2. **Cancel during active reader**: Confirmed. The cancel test at line 2119 only tests the queued path (capacity 0, reader never starts). The `cancelReaderForCommission` function (line 752) has a second branch that aborts an active reader and waits for its completion promise, but no test exercises it.\n\n3. **Recovery hardcodes mailSequence: 1**: Confirmed at lines 811, 840, 853. The `SleepingCommissionState` type doesn't include `mailSequence`, and `PendingMail` doesn't either. The sequence needs to be persisted in the state file during sleep and read back during recovery. `getMailSequence()` from `MailRecordOps` can derive it from the mail directory contents as a fallback.\n\nNow writing the fix for item 3, then tests for all three."
projectName: guild-hall
---
All three gaps from `.lore/issues/w2w-mail-test-gaps.md` addressed. 7 new tests, 1 bug fix, 1992/1992 tests pass.

**Item 1 — Multiple sleep/wake cycles:** 2 tests added. One proves `commission_mail_sent` with `mailSequence: 2` flows through to `handleSleep`. The other proves `handleSleep` persists `mailSequence` in the state file for recovery.

**Item 2 — Cancel active mail reader:** 1 test added. Starts a reader that blocks on SDK drain, waits for it to become active (`readerActive: true`), cancels via `cancelReaderForCommission`, verifies the abort signal fires and the reader drains without error.

**Item 3 — Recovery hardcodes mailSequence: 1 (bug fix + 4 tests):**
- **Bug fix:** `PendingMail` type now carries `mailSequence?: number`. `handleSleep` persists the value to state. `recoverSleepingCommission` reads `pendingMail.mailSequence ?? 1` instead of hardcoding 1. All three recovery branches (replied, open, sent) use the recovered value.
- **Tests:** Recovery with sent mail (sequence 3 → contextId contains "003"), recovery with open mail (sequence 2 → contextId contains "002"), backwards-compat fallback (missing field → contextId contains "001"), direct verification that handleSleep writes mailSequence to state.

Files modified:
- `daemon/services/mail/types.ts` — added `mailSequence?: number` to `PendingMail`
- `daemon/services/mail/orchestrator.ts` — persist mailSequence in handleSleep, read it back in recoverSleepingCommission
- `tests/daemon/services/mail/orchestrator.test.ts` — updated 1 existing assertion, added 7 new tests across 3 describe blocks
