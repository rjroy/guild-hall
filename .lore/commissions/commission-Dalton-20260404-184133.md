---
title: "Commission: Fix: Add Skill to Guild Master builtInTools"
date: 2026-04-05
status: dispatched
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
current_progress: ""
projectName: guild-hall
---
