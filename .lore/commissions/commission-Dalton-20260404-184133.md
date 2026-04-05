---
title: "Commission: Fix: Add Skill to Guild Master builtInTools"
date: 2026-04-05
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug fix: The Guild Master declares `domainPlugins: [\"guild-compendium\"]` but its `builtInTools` array is missing `\"Skill\"`. Without it, the compendium plugin loads but the GM can't invoke any of its skills.\n\n**The fix:**\n\nIn `daemon/services/manager/worker.ts`, line 130:\n\n```ts\n// Current:\nbuiltInTools: [\"Read\", \"Glob\", \"Grep\"],\n\n// Fixed:\nbuiltInTools: [\"Skill\", \"Read\", \"Glob\", \"Grep\"],\n```\n\n**Tests:**\n\nUpdate any existing tests that assert on the GM's `builtInTools` list to include `\"Skill\"`. Search for tests referencing `builtInTools` in combination with `manager` or `Guild Master` to find them. The test file is likely in `tests/daemon/services/manager/`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-05T01:41:33.938Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T01:41:33.942Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-05T01:41:34.008Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-05T01:42:35.878Z
    event: result_submitted
    reason: "Fixed Guild Master missing Skill tool in builtInTools array.\n\n**Changes made:**\n1. `daemon/services/manager/worker.ts` line 130: Added `\"Skill\"` to builtInTools array\n   - Before: `[\"Read\", \"Glob\", \"Grep\"]`\n   - After: `[\"Skill\", \"Read\", \"Glob\", \"Grep\"]`\n\n2. Updated test assertion in `tests/daemon/services/manager-worker.test.ts` line 80 to match the new expected value\n\n**Verification:**\n- Manager-worker tests: 54 pass ✓\n- Full test suite: 3491 pass, 4 skip ✓\n- No regressions introduced\n\nThe Guild Master can now invoke compendium skills as documented."
  - timestamp: 2026-04-05T01:42:38.645Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: ""
projectName: guild-hall
---
Fixed Guild Master missing Skill tool in builtInTools array.

**Changes made:**
1. `daemon/services/manager/worker.ts` line 130: Added `"Skill"` to builtInTools array
   - Before: `["Read", "Glob", "Grep"]`
   - After: `["Skill", "Read", "Glob", "Grep"]`

2. Updated test assertion in `tests/daemon/services/manager-worker.test.ts` line 80 to match the new expected value

**Verification:**
- Manager-worker tests: 54 pass ✓
- Full test suite: 3491 pass, 4 skip ✓
- No regressions introduced

The Guild Master can now invoke compendium skills as documented.
