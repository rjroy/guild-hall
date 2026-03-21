---
title: "Commission: Fix: Thorne review findings (outcomes-to-memory + decisions surface)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Cleanup Task: Review Findings\n\nThorne reviewed two features and found issues that need fixing. Address all of the following:\n\n### 1. Missing failure-propagation tests (decisions surface)\n\nThe plan called for tests 2.2.3 and 3.2.3 proving that the try/catch blocks in both orchestrators handle `readDecisions` failures gracefully. The code is correct (try/catch present), but no tests exist to guard against regression.\n\nAdd tests to `tests/daemon/services/decisions-persistence.test.ts` (or wherever the orchestrator hook tests live):\n- Commission hook: when `readDecisions` throws, the error is caught, logged at warn, and completion proceeds normally.\n- Meeting hook: same pattern.\n\n### 2. Missing meeting triage test with decisions in artifact body\n\nPlan test 4.2.3 was not implemented. When `meeting_ended` fires, the artifact body already contains the decisions section (appended before the event). No test proves decisions survive into the meeting triage input path.\n\nAdd a test to `tests/daemon/services/outcome-triage.test.ts` that creates a meeting artifact with notes AND a `## Decisions` section in the body, emits `meeting_ended`, and verifies the triage input's `resultText` contains the decisions.\n\n### 3. Dead `_contextType` parameter in `readDecisions`\n\nIn `daemon/services/decisions-persistence.ts`, `readDecisions` accepts a `_contextType` parameter that is never used. All callers pass the same value in both `_contextType` and `stateSubdir`. Remove the dead parameter, update all callers and tests.\n\n### 4. Log level mismatch (outcome-triage)\n\nIn `daemon/services/outcome-triage.ts` around line 375, non-closed meeting skip logs at `log.info`. The spec and plan say this should be `debug` (it's expected and harmless, not worth surfacing at info level). Change to `log.debug`. Update the corresponding test in `tests/daemon/services/outcome-triage.test.ts` (around line 579) to check for debug instead of info.\n\n### 5. Redundant data in prompts (outcome-triage)\n\nOutcome data appears in both the system message (via template placeholders) and the user message (via `formatUserMessage`). The data should appear in one place, not both. Investigate and remove the duplication. The system prompt template has placeholders for the outcome data. If `formatUserMessage` is also including the same data as the user message, consolidate so it only appears once.\n\n### Verification\n\nRun `bun test` after all changes. All tests must pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T01:31:08.742Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T01:31:08.744Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
