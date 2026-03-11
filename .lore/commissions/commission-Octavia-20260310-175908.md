---
title: "Commission: Plan: SDK tool availability enforcement"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for the SDK tool availability enforcement spec.\n\nRead the spec that was just written at `.lore/specs/sdk-tool-availability.md` (or similar path in `.lore/specs/` - find it by looking for the most recently created spec about SDK tool availability or tool enforcement).\n\nConvert that spec into a step-by-step implementation plan following the project's plan format. The plan should go in `.lore/plans/`.\n\nKey context for planning:\n- The core fix is adding the `tools` parameter to `SdkQueryOptions` in `daemon/lib/agent-sdk/sdk-runner.ts`\n- The `tools` parameter controls what built-in tools the model can see (availability layer)\n- `allowedTools` controls which tools auto-approve without prompting (permission layer) \n- Both should use the same list from `worker.builtInTools` + MCP tool wildcards\n- The toolbox resolver already computes this list; it just needs to be passed as `tools` in addition to `allowedTools`\n- Tests need to verify that a worker without Bash in `builtInTools` does not have Bash in the `tools` output\n- Also consider whether `settingSources` should drop `\"user\"` to prevent user-level permission leaks\n\nRead existing plans in `.lore/plans/` to match the format conventions used in this project."
dependencies:
  - commission-Octavia-20260310-174455
linked_artifacts:
  - .lore/plans/tool-availability-enforcement.md

activity_timeline:
  - timestamp: 2026-03-11T00:59:08.005Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T00:59:08.006Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-11T00:59:08.041Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T00:59:21.022Z
    event: progress_report
    reason: "Starting plan creation. Reading the spec, existing plans for format conventions, and relevant source code."
  - timestamp: 2026-03-11T01:01:06.049Z
    event: progress_report
    reason: "All context gathered: spec, source code, existing plan format conventions, test fixtures. Drafting the implementation plan now."
  - timestamp: 2026-03-11T01:06:44.781Z
    event: progress_report
    reason: "Plan complete and reviewed. Addressed three findings from plan-reviewer: (1) added three missing fixture files to Step 4, (2) added REQ-TAE-10 test 3 (six-tool affirmative case), (3) restructured commission boundaries so Dalton handles production code + fixture updates in one commit to satisfy the pre-commit hook. Submitting result."
  - timestamp: 2026-03-11T01:06:55.303Z
    event: result_submitted
    reason: "Created implementation plan at `.lore/plans/tool-availability-enforcement.md`.\n\nThe plan converts the spec's 12 requirements (REQ-TAE-1 through REQ-TAE-12) into 5 steps:\n\n1. Add `builtInTools` to `ResolvedToolSet` type and toolbox resolver return value (one line each)\n2. Add `tools` to `SdkQueryOptions` and pass it in `prepareSdkSession` (one line each)\n3. Add toolbox resolver test assertions and new test cases (REQ-TAE-10 tests 6-7)\n4. Update all test fixtures across 5 files + add SDK runner test cases (REQ-TAE-10 tests 1-5)\n5. Full suite verification and fresh-context spec validation\n\nThe plan was reviewed by a plan-reviewer agent, which caught three gaps that were fixed:\n- Three additional test files (`manager-worker.test.ts`, `worker-role-smoke.test.ts`, `worker-activation.test.ts`) that construct `ResolvedToolSet` without `builtInTools`\n- Missing REQ-TAE-10 test 3 (affirmative six-tool case)\n- Pre-commit hook constraint requiring Dalton to bundle production code and fixture updates in a single commit\n\nCommission structure: Dalton (implementation + fixtures) -> Sable (new tests) -> Thorne (review). Three sequential commissions."
  - timestamp: 2026-03-11T01:07:03.799Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan complete and reviewed. Addressed three findings from plan-reviewer: (1) added three missing fixture files to Step 4, (2) added REQ-TAE-10 test 3 (six-tool affirmative case), (3) restructured commission boundaries so Dalton handles production code + fixture updates in one commit to satisfy the pre-commit hook. Submitting result."
projectName: guild-hall
---
Created implementation plan at `.lore/plans/tool-availability-enforcement.md`.

The plan converts the spec's 12 requirements (REQ-TAE-1 through REQ-TAE-12) into 5 steps:

1. Add `builtInTools` to `ResolvedToolSet` type and toolbox resolver return value (one line each)
2. Add `tools` to `SdkQueryOptions` and pass it in `prepareSdkSession` (one line each)
3. Add toolbox resolver test assertions and new test cases (REQ-TAE-10 tests 6-7)
4. Update all test fixtures across 5 files + add SDK runner test cases (REQ-TAE-10 tests 1-5)
5. Full suite verification and fresh-context spec validation

The plan was reviewed by a plan-reviewer agent, which caught three gaps that were fixed:
- Three additional test files (`manager-worker.test.ts`, `worker-role-smoke.test.ts`, `worker-activation.test.ts`) that construct `ResolvedToolSet` without `builtInTools`
- Missing REQ-TAE-10 test 3 (affirmative six-tool case)
- Pre-commit hook constraint requiring Dalton to bundle production code and fixture updates in a single commit

Commission structure: Dalton (implementation + fixtures) -> Sable (new tests) -> Thorne (review). Three sequential commissions.
