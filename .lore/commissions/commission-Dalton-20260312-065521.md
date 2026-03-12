---
title: "Commission: Sandboxed Execution: Phase 2 canUseTool Callback (Step 7)"
date: 2026-03-12
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the `canUseTool` callback and add micromatch dependency per `.lore/plans/infrastructure/sandboxed-execution.md`, Step 7.\n\n**Read the full plan first.** Step 7 has the complete implementation.\n\n1. **Add dependency**: `bun add micromatch && bun add -D @types/micromatch`. Verify the import style works (`import micromatch from \"micromatch\"` vs `import * as micromatch`).\n\n2. **Add `canUseTool` to `SdkQueryOptions`** in `daemon/lib/agent-sdk/sdk-runner.ts` (after `sandbox`).\n\n3. **Add `TOOL_PATH_FIELD` mapping** and **`buildCanUseTool` function** at module level in `sdk-runner.ts`. Key semantics:\n   - Rules evaluated in declaration order, first match wins\n   - No match = allow (REQ-SBX-14)\n   - Denial returns `interrupt: false` (REQ-SBX-16)\n   - Tool path fields: Edit/Read → `file_path`, Grep/Glob → `path`, Write → `file_path`\n   - When both `commands` and `paths` are specified, both must match (AND)\n   - Glob matching via `micromatch.isMatch()`\n\n4. **Inject in `prepareSdkSession`** after sandbox injection: build callback from `activation.tools.canUseToolRules` only when non-empty.\n\nRun `bun run typecheck` and `bun test` to verify."
dependencies:
  - commission-Dalton-20260312-065505
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:55:21.503Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:55:21.505Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
