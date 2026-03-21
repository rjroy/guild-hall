---
title: "Commission: Plan: Worker sub-agents"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the worker sub-agents spec at `.lore/specs/infrastructure/worker-sub-agents.md`.\n\nThe spec is approved with 31 requirements (REQ-SUBAG-1 through REQ-SUBAG-31). It adds sub-agent support so workers can invoke other workers via the SDK's Task tool during commissions and meetings, carrying the invoked worker's identity, posture, and memory.\n\n**Key implementation areas:**\n1. `subAgentModel` property on WorkerMetadata + package validation (REQ-SUBAG-1 through REQ-SUBAG-4, REQ-SUBAG-29)\n2. Agent map construction in prepareSdkSession (REQ-SUBAG-5 through REQ-SUBAG-9)\n3. Sub-agent model resolution (REQ-SUBAG-10, REQ-SUBAG-11)\n4. Sub-agent activation path: new \"subagent\" context type, ActivationContext construction (REQ-SUBAG-13 through REQ-SUBAG-16)\n5. Description generation: buildSubAgentDescription with lookup table + fallback (REQ-SUBAG-17 through REQ-SUBAG-20)\n6. SdkQueryOptions extension + runSdkSession passthrough (REQ-SUBAG-21, REQ-SUBAG-22)\n7. Logging (REQ-SUBAG-30, REQ-SUBAG-31)\n\n**Reference files to read:**\n- `.lore/specs/infrastructure/worker-sub-agents.md` — the spec (read first)\n- `daemon/lib/agent-sdk/sdk-runner.ts` — prepareSdkSession, runSdkSession, SdkQueryOptions, SessionPrepSpec, SessionPrepDeps\n- `lib/types.ts` — WorkerMetadata, ActivationContext, VALID_MODELS\n- `daemon/services/context-type-registry.ts` — registry pattern\n- `packages/shared/worker-activation.ts` — buildSystemPrompt, activateWorkerWithSharedPattern\n- `tests/daemon/services/sdk-runner.test.ts` — existing test patterns\n\n**Plan should cover:**\n- Phased implementation ordered for build safety\n- REQ coverage per phase\n- Test strategy matching the AI Validation section\n- Delegation guide (Dalton implements, Thorne reviews)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:23:21.625Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:23:21.627Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
