---
title: "Commission: Review Worker canUseToolRules Implementation"
date: 2026-03-13
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the worker canUseToolRules implementation against the spec at `.lore/specs/workers/worker-tool-rules.md` and the plan at `.lore/plans/workers/worker-tool-rules.md`.\n\n## Files to Review\n\nProduction changes:\n- `packages/guild-hall-writer/package.json` — Octavia's Bash + canUseToolRules\n- `daemon/services/manager/worker.ts` — Guild Master's Bash + canUseToolRules\n\nTest changes:\n- `tests/daemon/services/sdk-runner.test.ts` — canUseTool callback tests for Octavia and Guild Master rules\n- `tests/daemon/services/manager-worker.test.ts` — manager metadata assertions\n- `tests/daemon/services/manager/worker.test.ts` — manager metadata assertions\n- `tests/lib/packages.test.ts` — package validation test (if added)\n\n## Key Review Points\n\n1. **REQ-WTR-7**: Octavia's rules correctly deny `rm -rf .lore/` and `rm -r .lore/`. The recursive flags must not match the allowed patterns.\n2. **Guild Master glob limitation**: `git diff -- src/lib/foo.ts` must be denied because `*` does not match `/` in micromatch.\n3. **Sandbox auto-activation**: Confirm no manual sandbox configuration was added. Both workers get sandbox settings automatically because they now have Bash in builtInTools.\n4. **REQ-SBX-15 compliance**: The existing `workerMetadataSchema.safeParse()` test validates that canUseToolRules only references tools in builtInTools.\n5. **No scope creep**: Only two production files changed. No type changes, no resolver changes, no SDK runner changes.\n\n## Verification\n\nRun the full suite: `bun run typecheck && bun run lint && bun test`"
dependencies:
  - commission-Sable-20260312-220538
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T05:05:50.217Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T05:10:09.606Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
