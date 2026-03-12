---
title: "Commission: Sandboxed Execution: Phase 2 Tests (Step 8)"
date: 2026-03-12
status: blocked
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Write Phase 2 tests for sandboxed execution per `.lore/plans/infrastructure/sandboxed-execution.md`, Step 8.\n\n**Read the full plan first.** Step 8 has specific test cases with code examples.\n\n**Toolbox resolver tests** (`tests/daemon/toolbox-resolver.test.ts`):\n- Worker with no rules returns `canUseToolRules: []`\n- Worker with rules returns matching `canUseToolRules`\n\n**SDK runner tests** (`tests/daemon/services/sdk-runner.test.ts`):\nAdd a `describe(\"canUseTool callback\")` block with:\n1. No canUseTool when rules are empty\n2. canUseTool present when rules are non-empty\n3. Allows call when no rule matches (different tool than rules target)\n4. Denies Bash call matching catch-all deny rule\n5. Allowlist pattern: allows `git status`, denies `rm -rf`\n6. Path-based deny: blocks `Edit` to `**/.ssh/**`, allows `.lore/` paths\n7. Denial sets `interrupt: false`\n\nAll fixtures must include `canUseToolRules` on `ResolvedToolSet`. Use absolute paths in path-based tests (the SDK delivers absolute paths).\n\nRun `bun test tests/daemon/services/sdk-runner.test.ts` and `bun test tests/daemon/toolbox-resolver.test.ts` to verify. Then run `bun test` for the full suite."
dependencies:
  - commission-Dalton-20260312-065521
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:55:31.238Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:55:31.239Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
