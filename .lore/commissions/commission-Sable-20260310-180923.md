---
title: "Commission: Add tool enforcement tests (Steps 3-4 new tests)"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Add new tests for SDK tool availability enforcement per the plan at `.lore/plans/tool-availability-enforcement.md`.\n\nYou own Step 3 (toolbox resolver tests) and the new test cases from Step 4 (SDK runner tests). The plan has exact test code. Read the plan carefully.\n\n**Step 3**: In `tests/daemon/toolbox-resolver.test.ts`:\n- Add `builtInTools` assertions to existing tests\n- Add two new test cases: \"builtInTools matches worker declaration exactly\" and \"builtInTools excludes MCP server tools even when MCP servers are added\"\n\n**Step 4 (new tests only)**: In `tests/daemon/services/sdk-runner.test.ts`:\n- Add five new test cases that verify `tools` is passed correctly in `prepareSdkSession` output\n- Follow existing test patterns for how `makeDeps` overrides `resolveToolSet` and `activateWorker`\n\nThe fixture updates are already done by a prior commission. You're adding new test assertions and test cases only.\n\nRun `bun test tests/daemon/toolbox-resolver.test.ts` and `bun test tests/daemon/services/sdk-runner.test.ts` to verify your tests pass."
dependencies:
  - commission-Dalton-20260310-180914
linked_artifacts:
  - tests/daemon/toolbox-resolver.test.ts

  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/sdk-runner.test.ts
activity_timeline:
  - timestamp: 2026-03-11T01:09:23.104Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:23.106Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-11T01:15:26.632Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-11T01:15:26.634Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-11T01:15:26.671Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T01:15:33.640Z
    event: progress_report
    reason: "Reading the plan and existing test files to understand the exact test code needed."
  - timestamp: 2026-03-11T01:17:42.196Z
    event: result_submitted
    reason: "Added 7 new test assertions/cases for tool availability enforcement (REQ-TAE-10).\n\n**Step 3 (toolbox-resolver.test.ts):**\n- Added `builtInTools` assertion to \"built-in tools and MCP wildcards assembled from worker metadata\" test (line ~112)\n- Added `builtInTools` assertions to \"empty builtInTools still includes MCP wildcards\" test (lines ~121-123)\n- Added new test: \"builtInTools matches worker declaration exactly\"\n- Added new test: \"builtInTools excludes MCP server tools even when MCP servers are added\"\n\n**Step 4 (sdk-runner.test.ts):**\n- \"prepareSdkSession includes tools matching worker builtInTools\" - verifies tools field matches builtInTools from resolver\n- \"tools field excludes undeclared built-in tools\" - verifies Bash/Write/Edit absent when not declared\n- \"tools is independent of allowedTools\" - verifies MCP wildcards in allowedTools but not in tools\n- \"full builtInTools set is passed through to tools\" - verifies all 6 tools pass through\n- \"tools does not include MCP server entries\" - verifies MCP wildcards excluded from tools\n\nAll tests pass: 31 in toolbox-resolver, 71 in sdk-runner."
  - timestamp: 2026-03-11T01:17:48.866Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reading the plan and existing test files to understand the exact test code needed."
projectName: guild-hall
---
Added 7 new test assertions/cases for tool availability enforcement (REQ-TAE-10).

**Step 3 (toolbox-resolver.test.ts):**
- Added `builtInTools` assertion to "built-in tools and MCP wildcards assembled from worker metadata" test (line ~112)
- Added `builtInTools` assertions to "empty builtInTools still includes MCP wildcards" test (lines ~121-123)
- Added new test: "builtInTools matches worker declaration exactly"
- Added new test: "builtInTools excludes MCP server tools even when MCP servers are added"

**Step 4 (sdk-runner.test.ts):**
- "prepareSdkSession includes tools matching worker builtInTools" - verifies tools field matches builtInTools from resolver
- "tools field excludes undeclared built-in tools" - verifies Bash/Write/Edit absent when not declared
- "tools is independent of allowedTools" - verifies MCP wildcards in allowedTools but not in tools
- "full builtInTools set is passed through to tools" - verifies all 6 tools pass through
- "tools does not include MCP server entries" - verifies MCP wildcards excluded from tools

All tests pass: 31 in toolbox-resolver, 71 in sdk-runner.
