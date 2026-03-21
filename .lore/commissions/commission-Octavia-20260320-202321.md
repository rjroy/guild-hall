---
title: "Commission: Plan: Worker sub-agents"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the worker sub-agents spec at `.lore/specs/infrastructure/worker-sub-agents.md`.\n\nThe spec is approved with 31 requirements (REQ-SUBAG-1 through REQ-SUBAG-31). It adds sub-agent support so workers can invoke other workers via the SDK's Task tool during commissions and meetings, carrying the invoked worker's identity, posture, and memory.\n\n**Key implementation areas:**\n1. `subAgentModel` property on WorkerMetadata + package validation (REQ-SUBAG-1 through REQ-SUBAG-4, REQ-SUBAG-29)\n2. Agent map construction in prepareSdkSession (REQ-SUBAG-5 through REQ-SUBAG-9)\n3. Sub-agent model resolution (REQ-SUBAG-10, REQ-SUBAG-11)\n4. Sub-agent activation path: new \"subagent\" context type, ActivationContext construction (REQ-SUBAG-13 through REQ-SUBAG-16)\n5. Description generation: buildSubAgentDescription with lookup table + fallback (REQ-SUBAG-17 through REQ-SUBAG-20)\n6. SdkQueryOptions extension + runSdkSession passthrough (REQ-SUBAG-21, REQ-SUBAG-22)\n7. Logging (REQ-SUBAG-30, REQ-SUBAG-31)\n\n**Reference files to read:**\n- `.lore/specs/infrastructure/worker-sub-agents.md` — the spec (read first)\n- `daemon/lib/agent-sdk/sdk-runner.ts` — prepareSdkSession, runSdkSession, SdkQueryOptions, SessionPrepSpec, SessionPrepDeps\n- `lib/types.ts` — WorkerMetadata, ActivationContext, VALID_MODELS\n- `daemon/services/context-type-registry.ts` — registry pattern\n- `packages/shared/worker-activation.ts` — buildSystemPrompt, activateWorkerWithSharedPattern\n- `tests/daemon/services/sdk-runner.test.ts` — existing test patterns\n\n**Plan should cover:**\n- Phased implementation ordered for build safety\n- REQ coverage per phase\n- Test strategy matching the AI Validation section\n- Delegation guide (Dalton implements, Thorne reviews)"
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/worker-sub-agents.md

activity_timeline:
  - timestamp: 2026-03-21T03:23:21.625Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:23:21.627Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T03:23:21.674Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T03:23:35.308Z
    event: progress_report
    reason: "Reading the spec and all reference files before drafting the plan."
  - timestamp: 2026-03-21T03:24:17.351Z
    event: progress_report
    reason: "All reference files read. Now drafting the implementation plan."
  - timestamp: 2026-03-21T03:32:54.974Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/infrastructure/worker-sub-agents.md` (status: draft).\n\n**Four phases, 12 steps, all 31 REQs covered:**\n\n- **Phase 1 (Type Foundations)**: `subAgentModel` on WorkerMetadata, Zod schema, package validation, `\"subagent\"` context type. REQ-SUBAG-1 through REQ-SUBAG-4, REQ-SUBAG-13, REQ-SUBAG-14, REQ-SUBAG-29.\n\n- **Phase 2 (Description Generation)**: Pure `buildSubAgentDescription` function with lookup table keyed by worker name, fallback for unknown workers. New file `packages/shared/sub-agent-description.ts`. REQ-SUBAG-17 through REQ-SUBAG-20.\n\n- **Phase 3 (Options Extension)**: `agents` field on `SdkQueryOptions`, passthrough in `runSdkSession`. REQ-SUBAG-21, REQ-SUBAG-22.\n\n- **Phase 4 (Agent Map Construction)**: Core integration in `prepareSdkSession` between step 4 and step 5. Concurrent memory loading via `Promise.allSettled`, per-worker error isolation, logging. REQ-SUBAG-5 through REQ-SUBAG-12, REQ-SUBAG-15, REQ-SUBAG-16, REQ-SUBAG-23 through REQ-SUBAG-28, REQ-SUBAG-30, REQ-SUBAG-31.\n\n**Delegation**: 8 commissions (4 implement by Dalton, 4 review by Thorne) with dependencies for sequential execution.\n\n**Plan reviewed** by lore-development:plan-reviewer. Three findings addressed: Dalton lookup table entry aligned with spec example, Phase 3 type-only test clarified, REQ-SUBAG-11 explicit-model test added.\n\n**Commit blocked** by pre-existing flaky test (`guild-hall-email/operations.test.ts` timeout on Fastmail network call). The plan file is staged and ready to commit once the test passes."
  - timestamp: 2026-03-21T03:32:58.856Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All reference files read. Now drafting the implementation plan."
projectName: guild-hall
---
Implementation plan written at `.lore/plans/infrastructure/worker-sub-agents.md` (status: draft).

**Four phases, 12 steps, all 31 REQs covered:**

- **Phase 1 (Type Foundations)**: `subAgentModel` on WorkerMetadata, Zod schema, package validation, `"subagent"` context type. REQ-SUBAG-1 through REQ-SUBAG-4, REQ-SUBAG-13, REQ-SUBAG-14, REQ-SUBAG-29.

- **Phase 2 (Description Generation)**: Pure `buildSubAgentDescription` function with lookup table keyed by worker name, fallback for unknown workers. New file `packages/shared/sub-agent-description.ts`. REQ-SUBAG-17 through REQ-SUBAG-20.

- **Phase 3 (Options Extension)**: `agents` field on `SdkQueryOptions`, passthrough in `runSdkSession`. REQ-SUBAG-21, REQ-SUBAG-22.

- **Phase 4 (Agent Map Construction)**: Core integration in `prepareSdkSession` between step 4 and step 5. Concurrent memory loading via `Promise.allSettled`, per-worker error isolation, logging. REQ-SUBAG-5 through REQ-SUBAG-12, REQ-SUBAG-15, REQ-SUBAG-16, REQ-SUBAG-23 through REQ-SUBAG-28, REQ-SUBAG-30, REQ-SUBAG-31.

**Delegation**: 8 commissions (4 implement by Dalton, 4 review by Thorne) with dependencies for sequential execution.

**Plan reviewed** by lore-development:plan-reviewer. Three findings addressed: Dalton lookup table entry aligned with spec example, Phase 3 type-only test clarified, REQ-SUBAG-11 explicit-model test added.

**Commit blocked** by pre-existing flaky test (`guild-hall-email/operations.test.ts` timeout on Fastmail network call). The plan file is staged and ready to commit once the test passes.
