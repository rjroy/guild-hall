---
title: "Commission: Fix: Thorne review findings (outcomes-to-memory + decisions surface)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Cleanup Task: Review Findings\n\nThorne reviewed two features and found issues that need fixing. Address all of the following:\n\n### 1. Missing failure-propagation tests (decisions surface)\n\nThe plan called for tests 2.2.3 and 3.2.3 proving that the try/catch blocks in both orchestrators handle `readDecisions` failures gracefully. The code is correct (try/catch present), but no tests exist to guard against regression.\n\nAdd tests to `tests/daemon/services/decisions-persistence.test.ts` (or wherever the orchestrator hook tests live):\n- Commission hook: when `readDecisions` throws, the error is caught, logged at warn, and completion proceeds normally.\n- Meeting hook: same pattern.\n\n### 2. Missing meeting triage test with decisions in artifact body\n\nPlan test 4.2.3 was not implemented. When `meeting_ended` fires, the artifact body already contains the decisions section (appended before the event). No test proves decisions survive into the meeting triage input path.\n\nAdd a test to `tests/daemon/services/outcome-triage.test.ts` that creates a meeting artifact with notes AND a `## Decisions` section in the body, emits `meeting_ended`, and verifies the triage input's `resultText` contains the decisions.\n\n### 3. Dead `_contextType` parameter in `readDecisions`\n\nIn `daemon/services/decisions-persistence.ts`, `readDecisions` accepts a `_contextType` parameter that is never used. All callers pass the same value in both `_contextType` and `stateSubdir`. Remove the dead parameter, update all callers and tests.\n\n### 4. Log level mismatch (outcome-triage)\n\nIn `daemon/services/outcome-triage.ts` around line 375, non-closed meeting skip logs at `log.info`. The spec and plan say this should be `debug` (it's expected and harmless, not worth surfacing at info level). Change to `log.debug`. Update the corresponding test in `tests/daemon/services/outcome-triage.test.ts` (around line 579) to check for debug instead of info.\n\n### 5. Redundant data in prompts (outcome-triage)\n\nOutcome data appears in both the system message (via template placeholders) and the user message (via `formatUserMessage`). The data should appear in one place, not both. Investigate and remove the duplication. The system prompt template has placeholders for the outcome data. If `formatUserMessage` is also including the same data as the user message, consolidate so it only appears once.\n\n### Verification\n\nRun `bun test` after all changes. All tests must pass."
dependencies: []
linked_artifacts:
  - daemon/lib/log.ts

  - daemon/services/decisions-persistence.ts
  - daemon/services/outcome-triage.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/orchestrator.ts
  - tests/daemon/services/decisions-persistence.test.ts
  - tests/daemon/services/outcome-triage.test.ts
  - tests/daemon/services/sdk-logging.test.ts
  - daemon/services/decisions-persistence.ts
  - daemon/services/outcome-triage.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/orchestrator.ts
  - tests/daemon/services/decisions-persistence.test.ts
  - tests/daemon/services/outcome-triage.test.ts
  - tests/daemon/services/sdk-logging.test.ts
activity_timeline:
  - timestamp: 2026-03-21T01:31:08.742Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T01:31:08.744Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T01:31:08.792Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T01:31:22.066Z
    event: progress_report
    reason: "Starting cleanup task. Reading source files for all five findings."
  - timestamp: 2026-03-21T01:32:16.591Z
    event: progress_report
    reason: "Read all source files. Starting fixes: (1) failure-propagation tests, (2) meeting triage test with decisions, (3) dead parameter removal, (4) log level fix, (5) prompt duplication fix."
  - timestamp: 2026-03-21T01:37:54.143Z
    event: progress_report
    reason: "All five findings fixed. 3243 tests pass, 0 fail. Preparing submission."
  - timestamp: 2026-03-21T01:38:09.794Z
    event: result_submitted
    reason: "All five review findings addressed. 3243 tests pass, 0 fail.\n\n**Finding 1: Missing failure-propagation tests.** Added two tests in `tests/daemon/services/decisions-persistence.test.ts` under \"orchestrator hook failure propagation\" describe block. Tests simulate the try/catch pattern from both commission and meeting orchestrators, triggering EISDIR errors on readDecisions and verifying the error is caught, logged at warn, and the artifact remains unchanged.\n\n**Finding 2: Missing meeting triage test with decisions in artifact body.** Added test \"meeting triage includes decisions section from artifact body (4.2.3)\" in `tests/daemon/services/outcome-triage.test.ts`. Creates a meeting artifact with notes AND a `## Decisions` section in the body, emits `meeting_ended`, and verifies the triage system prompt's resultText contains both the notes and decisions.\n\n**Finding 3: Dead `_contextType` parameter.** Removed the unused second parameter from `readDecisions` in `daemon/services/decisions-persistence.ts`. Updated all callers: commission orchestrator (1 site), meeting orchestrator (1 site), outcome-triage (1 site), and all test calls (12 sites across 2 test files).\n\n**Finding 4: Log level mismatch.** Added `debug` method to `Log` interface in `daemon/lib/log.ts`, implemented in `consoleLog`, `nullLog`, and `collectingLog`. Changed `log.info` to `log.debug` for non-closed meeting skip in `daemon/services/outcome-triage.ts`. Updated test to check `messages.debug`. Also fixed the inline Log literal in `tests/daemon/services/sdk-logging.test.ts`.\n\n**Finding 5: Redundant data in prompts.** Replaced `formatUserMessage(input)` (which duplicated all outcome data already in the system prompt) with a static instruction string. Updated 6 tests in outcome-triage.test.ts to capture and verify the system prompt instead of the user message, since that's where the data now lives exclusively."
  - timestamp: 2026-03-21T01:38:15.652Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All five findings fixed. 3243 tests pass, 0 fail. Preparing submission."
projectName: guild-hall
---
All five review findings addressed. 3243 tests pass, 0 fail.

**Finding 1: Missing failure-propagation tests.** Added two tests in `tests/daemon/services/decisions-persistence.test.ts` under "orchestrator hook failure propagation" describe block. Tests simulate the try/catch pattern from both commission and meeting orchestrators, triggering EISDIR errors on readDecisions and verifying the error is caught, logged at warn, and the artifact remains unchanged.

**Finding 2: Missing meeting triage test with decisions in artifact body.** Added test "meeting triage includes decisions section from artifact body (4.2.3)" in `tests/daemon/services/outcome-triage.test.ts`. Creates a meeting artifact with notes AND a `## Decisions` section in the body, emits `meeting_ended`, and verifies the triage system prompt's resultText contains both the notes and decisions.

**Finding 3: Dead `_contextType` parameter.** Removed the unused second parameter from `readDecisions` in `daemon/services/decisions-persistence.ts`. Updated all callers: commission orchestrator (1 site), meeting orchestrator (1 site), outcome-triage (1 site), and all test calls (12 sites across 2 test files).

**Finding 4: Log level mismatch.** Added `debug` method to `Log` interface in `daemon/lib/log.ts`, implemented in `consoleLog`, `nullLog`, and `collectingLog`. Changed `log.info` to `log.debug` for non-closed meeting skip in `daemon/services/outcome-triage.ts`. Updated test to check `messages.debug`. Also fixed the inline Log literal in `tests/daemon/services/sdk-logging.test.ts`.

**Finding 5: Redundant data in prompts.** Replaced `formatUserMessage(input)` (which duplicated all outcome data already in the system prompt) with a static instruction string. Updated 6 tests in outcome-triage.test.ts to capture and verify the system prompt instead of the user message, since that's where the data now lives exclusively.
