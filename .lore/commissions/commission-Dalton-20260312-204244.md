---
title: "Commission: Fix: micromatch dotfile matching in canUseTool"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "One-line fix in `daemon/lib/agent-sdk/sdk-runner.ts`. The two `micromatch.isMatch()` calls in `buildCanUseTool` need `{ dot: true }` so glob patterns match dotfiles and dot-prefixed directories (like `.lore/`, `.ssh/`).\n\nLine 290: `micromatch.isMatch(toolInput.command, rule.commands)` → `micromatch.isMatch(toolInput.command, rule.commands, { dot: true })`\n\nLine 297: `micromatch.isMatch(toolInput[pathField] as string, rule.paths)` → `micromatch.isMatch(toolInput[pathField] as string, rule.paths, { dot: true })`\n\nWithout this, a pattern like `*.lore/**` won't match `.lore/specs/example.md` because micromatch's `*` skips leading dots by default.\n\nAdd a test in `tests/daemon/services/sdk-runner.test.ts` inside the `canUseTool callback` describe block:\n\n```typescript\ntest(\"path patterns match dotfile directories\", async () => {\n  // micromatch requires { dot: true } to match leading dots\n  const deps = makeDeps({\n    resolveToolSet: async () => ({\n      mcpServers: [],\n      allowedTools: [\"Edit\"],\n      builtInTools: [\"Edit\"],\n      canUseToolRules: [],  // will be overridden\n      canUseToolRules: [\n        { tool: \"Edit\", paths: [\"**/.lore/**\"], allow: false, reason: \"Cannot edit lore\" },\n      ],\n    }),\n    // ... activateWorker as in other canUseTool tests ...\n  });\n  const result = await prepareSdkSession(makeSpec(), deps);\n  assert(result.ok);\n  const decision = await result.result.options.canUseTool!(\n    \"Edit\",\n    { file_path: \"/home/user/project/.lore/specs/example.md\" },\n    { signal: new AbortController().signal },\n  );\n  expect(decision.behavior).toBe(\"deny\");\n});\n```\n\nRun `bun test tests/daemon/services/sdk-runner.test.ts` to verify."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-13T03:42:44.680Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T03:42:44.681Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T03:42:44.719Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T03:42:56.450Z
    event: progress_report
    reason: "Starting one-line fix: adding `{ dot: true }` to micromatch.isMatch() calls to enable dotfile pattern matching"
  - timestamp: 2026-03-13T03:43:36.808Z
    event: result_submitted
    reason: "✓ Fixed glob pattern matching for dotfile directories by adding `{ dot: true }` to both micromatch.isMatch() calls in buildCanUseTool():\n\n**Changes:**\n1. Line 290: `micromatch.isMatch(toolInput.command, rule.commands)` → `micromatch.isMatch(toolInput.command, rule.commands, { dot: true })`\n2. Line 297: `micromatch.isMatch(toolInput[pathField] as string, rule.paths)` → `micromatch.isMatch(toolInput[pathField] as string, rule.paths, { dot: true })`\n\n**Test Added:**\n- Added `\"path patterns match dotfile directories\"` test in `tests/daemon/services/sdk-runner.test.ts` that verifies a pattern like `**/.lore/**` correctly matches `.lore/specs/example.md`\n\n**Verification:**\n- All 83 sdk-runner tests pass (including new test)\n- Full test suite: 2519 tests pass, 0 failures\n- TypeScript typecheck: clean\n\nWithout this fix, glob patterns with `*` would fail to match dotfiles and dot-prefixed directories because micromatch's default behavior skips leading dots."
  - timestamp: 2026-03-13T03:43:40.791Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Starting one-line fix: adding `{ dot: true }` to micromatch.isMatch() calls to enable dotfile pattern matching"
projectName: guild-hall
---
✓ Fixed glob pattern matching for dotfile directories by adding `{ dot: true }` to both micromatch.isMatch() calls in buildCanUseTool():

**Changes:**
1. Line 290: `micromatch.isMatch(toolInput.command, rule.commands)` → `micromatch.isMatch(toolInput.command, rule.commands, { dot: true })`
2. Line 297: `micromatch.isMatch(toolInput[pathField] as string, rule.paths)` → `micromatch.isMatch(toolInput[pathField] as string, rule.paths, { dot: true })`

**Test Added:**
- Added `"path patterns match dotfile directories"` test in `tests/daemon/services/sdk-runner.test.ts` that verifies a pattern like `**/.lore/**` correctly matches `.lore/specs/example.md`

**Verification:**
- All 83 sdk-runner tests pass (including new test)
- Full test suite: 2519 tests pass, 0 failures
- TypeScript typecheck: clean

Without this fix, glob patterns with `*` would fail to match dotfiles and dot-prefixed directories because micromatch's default behavior skips leading dots.
