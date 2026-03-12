---
title: "Commission: Sandboxed Execution: Phase 1 Implementation (Steps 1-3)"
date: 2026-03-12
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 1 of sandboxed execution per `.lore/plans/infrastructure/sandboxed-execution.md`, Steps 1-3.\n\n**Read the full plan first.** The plan has precise file locations, line numbers, and code examples. Follow it closely.\n\n**Step 1**: Add `sandbox` to `SdkQueryOptions` in `daemon/lib/agent-sdk/sdk-runner.ts`. Optional field, structural type mirroring SDK's `SandboxSettings`.\n\n**Step 2**: Inject sandbox settings in `prepareSdkSession` for Bash-capable workers. Check `activation.tools.builtInTools.includes(\"Bash\")` (post-TAE resolution). Settings: `enabled: true`, `autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, `network: { allowLocalBinding: false }`. Non-Bash workers get no sandbox at all.\n\n**Step 3**: Bubblewrap prerequisite detection at daemon startup in `daemon/app.ts`. Linux-only check for `bwrap` binary when Bash-capable workers are loaded. Warning only, not blocking.\n\nRun `bun run typecheck` after each step. All three steps touch production code only (no test changes). The `sandbox` field is optional and additive, so no fixture updates needed."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:54:31.789Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:54:31.790Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
