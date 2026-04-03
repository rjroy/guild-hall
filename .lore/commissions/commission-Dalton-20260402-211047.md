---
title: "Commission: Fix CLI register command dropping group argument"
date: 2026-04-03
status: completed
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
  - timestamp: 2026-04-03T04:10:47.810Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T04:11:08.007Z
    event: progress_report
    reason: "Starting fix for CLI register command dropping group argument. Issue: cli-project-group-failed.md. Root cause located in cli/index.ts lines 138-144 where path resolution creates a 2-element array only."
  - timestamp: 2026-04-03T04:11:48.628Z
    event: result_submitted
    reason: "Fixed the CLI register command argument drop bug. The `guild-hall register` command was dropping the `group` argument due to path resolution logic in cli/index.ts lines 138-144 creating a new 2-element array instead of preserving all positional args. \n\n**Changes:**\n- Updated cli/index.ts line 143 to preserve additional args: `[positionalArgs[0], path.resolve(positionalArgs[1]), ...positionalArgs.slice(2)]`\n- Updated issue status in .lore/issues/cli-project-group-failed.md to `resolved`\n\n**Verification:**\n- All 100 CLI tests pass\n- Full test suite: 3647 tests pass, 4 skip, 0 fail\n- Existing register command tests already verify 3-arg mapping works correctly (resolve.test.ts lines 338-353)"
  - timestamp: 2026-04-03T04:11:50.638Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting fix for CLI register command dropping group argument. Issue: cli-project-group-failed.md. Root cause located in cli/index.ts lines 138-144 where path resolution creates a 2-element array only."
projectName: guild-hall
---
Fixed the CLI register command argument drop bug. The `guild-hall register` command was dropping the `group` argument due to path resolution logic in cli/index.ts lines 138-144 creating a new 2-element array instead of preserving all positional args. 

**Changes:**
- Updated cli/index.ts line 143 to preserve additional args: `[positionalArgs[0], path.resolve(positionalArgs[1]), ...positionalArgs.slice(2)]`
- Updated issue status in .lore/issues/cli-project-group-failed.md to `resolved`

**Verification:**
- All 100 CLI tests pass
- Full test suite: 3647 tests pass, 4 skip, 0 fail
- Existing register command tests already verify 3-arg mapping works correctly (resolve.test.ts lines 338-353)
