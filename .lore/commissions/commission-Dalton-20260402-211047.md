---
title: "Commission: Fix CLI register command dropping group argument"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Bug: The `guild-hall register` CLI command drops the `group` argument.\n\n## Root Cause\n\nIn `cli/index.ts` lines 138-144, the register-specific path resolution creates a new 2-element array, discarding any positional args beyond index 1:\n\n```typescript\nconst isRegister = cmdSegments[cmdSegments.length - 1] === \"register\";\nconst resolvedArgs =\n  isRegister && positionalArgs.length >= 2\n    ? [positionalArgs[0], path.resolve(positionalArgs[1])]\n    : positionalArgs;\n```\n\nThe register operation has three body parameters: `name`, `path`, `group`. When the user runs `guild-hall register myproject /path/to/project mygroup`, the third arg (group) is dropped because the path-resolution logic only copies the first two elements.\n\n## Fix\n\nPreserve all positional args beyond the first two. Something like:\n\n```typescript\nconst resolvedArgs =\n  isRegister && positionalArgs.length >= 2\n    ? [positionalArgs[0], path.resolve(positionalArgs[1]), ...positionalArgs.slice(2)]\n    : positionalArgs;\n```\n\n## Testing\n\n- Add a test that verifies positional args beyond the second are preserved when resolving register commands\n- Verify existing register tests still pass\n- Reference issue: `.lore/issues/cli-project-group-failed.md` — update its status to `resolved` when done"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-03T04:10:47.757Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T04:10:47.758Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
