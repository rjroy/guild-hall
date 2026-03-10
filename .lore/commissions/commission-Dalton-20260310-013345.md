---
title: "Commission: Fix commission dependency system not waiting for dependencies"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The commission dependency system has a bug: dependent commissions are dispatching immediately instead of waiting for their dependencies to complete. This is the opposite of the previous bug where dependent commissions never triggered at all.\n\nInvestigation steps:\n1. Find the dependency resolution code in the daemon commission services (likely in `daemon/services/commission/`)\n2. Trace the flow: when a commission is created with `dependencies`, what should block dispatch until those dependencies complete?\n3. Identify why the wait/block mechanism isn't working — the dependent commission is being dispatched immediately instead of staying in a blocked/pending state\n4. Fix the root cause\n5. Write or update tests that verify: (a) a commission with unresolved dependencies does NOT dispatch immediately, (b) it DOES dispatch once all dependencies complete\n6. Run the full test suite to confirm no regressions"
dependencies: []
linked_artifacts:
  - daemon/services/commission/orchestrator.ts

  - tests/daemon/services/commission/orchestrator.test.ts
  - tests/daemon/services/commission/orchestrator.test.ts
activity_timeline:
  - timestamp: 2026-03-10T08:33:45.041Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:33:45.042Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T08:33:45.074Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T08:33:52.548Z
    event: progress_report
    reason: "Starting investigation. Reading commission service layer to understand dependency resolution flow."
  - timestamp: 2026-03-10T08:37:44.948Z
    event: progress_report
    reason: "Root cause identified. Two bugs: (1) dispatchCommission has no dependency gate - dispatches regardless of dependency status. (2) checkDependencyTransitions uses fileExists instead of status check - since dependency artifacts exist from creation time, deps always appear \"satisfied.\" The spec says dispatch should verify dependencies are satisfied (REQ-COM-7). Implementing both fixes now."
  - timestamp: 2026-03-10T08:41:21.581Z
    event: result_submitted
    reason: "Fixed the commission dependency system. Two bugs caused dependent commissions to dispatch immediately instead of waiting:\n\n1. **Missing dependency gate in `dispatchCommission`** (orchestrator.ts:1614-1640): Added a check that reads each dependency's status before dispatching. If any dependency is not in a terminal-success state (completed/abandoned), the commission transitions to \"blocked\" and returns `{ status: \"queued\" }` instead of dispatching.\n\n2. **Wrong satisfaction check in `checkDependencyTransitions`** (orchestrator.ts:843-855): Changed from `fileExists` (always true since artifacts exist from creation) to reading the actual status of each dependency commission. A dependency is \"satisfied\" when its status is `completed` or `abandoned`.\n\nAdded 4 new tests covering: dispatch blocked by unsatisfied deps, dispatch proceeds with satisfied deps, dispatch blocked by missing dep artifact, blocked commission stays blocked when dep exists but isn't completed, and unblock on abandoned dep status. All 2402 tests pass."
  - timestamp: 2026-03-10T08:41:25.607Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Root cause identified. Two bugs: (1) dispatchCommission has no dependency gate - dispatches regardless of dependency status. (2) checkDependencyTransitions uses fileExists instead of status check - since dependency artifacts exist from creation time, deps always appear \"satisfied.\" The spec says dispatch should verify dependencies are satisfied (REQ-COM-7). Implementing both fixes now."
projectName: guild-hall
---
Fixed the commission dependency system. Two bugs caused dependent commissions to dispatch immediately instead of waiting:

1. **Missing dependency gate in `dispatchCommission`** (orchestrator.ts:1614-1640): Added a check that reads each dependency's status before dispatching. If any dependency is not in a terminal-success state (completed/abandoned), the commission transitions to "blocked" and returns `{ status: "queued" }` instead of dispatching.

2. **Wrong satisfaction check in `checkDependencyTransitions`** (orchestrator.ts:843-855): Changed from `fileExists` (always true since artifacts exist from creation) to reading the actual status of each dependency commission. A dependency is "satisfied" when its status is `completed` or `abandoned`.

Added 4 new tests covering: dispatch blocked by unsatisfied deps, dispatch proceeds with satisfied deps, dispatch blocked by missing dep artifact, blocked commission stays blocked when dep exists but isn't completed, and unblock on abandoned dep status. All 2402 tests pass.
