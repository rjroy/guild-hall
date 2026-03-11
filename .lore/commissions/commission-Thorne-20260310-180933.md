---
title: "Commission: Review: SDK tool availability enforcement"
date: 2026-03-11
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Fresh-context review of the SDK tool availability enforcement implementation against the spec at `.lore/specs/tool-availability-enforcement.md` and plan at `.lore/plans/tool-availability-enforcement.md`.\n\nVerify:\n1. `prepareSdkSession` passes `tools` as a `string[]` from `activation.tools.builtInTools`\n2. Both `tools` and `allowedTools` are present in the SDK options (REQ-TAE-8)\n3. `settingSources` is unchanged at `[\"local\", \"project\", \"user\"]` (REQ-TAE-9)\n4. No callers of `prepareSdkSession` or `SdkQueryOptions` are broken\n5. `builtInTools` flows through the activation chain without changes to worker activation code\n6. All test fixtures include `builtInTools`\n7. New tests cover the cases specified in REQ-TAE-10\n\nTrace the full path: `resolveToolSet` return → `ActivationContext.resolvedTools` → `ActivationResult.tools` → `prepareSdkSession`'s `activation.tools.builtInTools` → `options.tools`.\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` to confirm everything passes."
dependencies:
  - commission-Sable-20260310-180923
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T01:09:33.618Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:33.620Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
