---
title: W2W mail system has untested paths and a hardcoded recovery value
date: 2026-03-07
status: open
tags: [testing, w2w, mail]
modules: [mail-orchestrator]
---

# W2W Mail Test Gaps

Three gaps in the worker-to-worker mail system were confirmed by code inspection. These were surfaced during Thorne's checkpoint reviews and verified against the current codebase.

## 1. No test for multiple sleep/wake cycles

All existing tests use `mailSequence: 1`. The code paths for subsequent cycles exist but no dedicated test proves a second cycle works correctly. REQ-MAIL-4 covers this behavior.

## 2. No test for cancel during active mail reader

The cancel path when mail status is `open` (reader actively processing) is the most complex cancel flow. Only the queued-path cancel is tested.

## 3. Recovery hardcodes mailSequence: 1

Three locations in `mail/orchestrator.ts` (lines 811, 840, 853) hardcode `mailSequence: 1` during crash recovery. A commission that crashed during its second or later sleep/wake cycle will recover with the wrong sequence number, potentially re-reading already-processed mail or skipping unread mail.

## Fix Direction

Items 1 and 2 are test coverage gaps. Item 3 is a latent bug that only manifests if a commission crashes during a multi-cycle sleep/wake, which is unlikely in practice but incorrect in principle. The sequence number should be read from the commission's state file or artifact during recovery.
