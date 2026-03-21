---
title: "Commission: Spec update + fix plan: Sub-agent description from worker identity"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Two deliverables in one commission:\n\n**1. Update the worker sub-agents spec** at `.lore/specs/infrastructure/worker-sub-agents.md`.\n\nThe current spec (REQ-SUBAG-18 through REQ-SUBAG-20) defines description generation using a hardcoded lookup table in `buildSubAgentDescription`. This is wrong. The invocation guidance should be defined in each worker's `package.json` as part of their identity block, not centralized in a lookup table.\n\n**Revise the spec to:**\n- Add a `guidance` property (or similar name that fits) to `WorkerIdentity` in the worker's `package.json` `guildHall.identity` block. This string describes WHEN to invoke this worker as a sub-agent. Each worker declares this about itself.\n- `buildSubAgentDescription` reads the guidance from the worker's identity instead of looking it up in a hardcoded table.\n- Fallback when `guidance` is omitted: use `identity.description` (same as the current table-miss fallback).\n- Remove the lookup table requirement. The table was a workaround for guidance not being in the package metadata.\n- Update REQ-SUBAG-18, REQ-SUBAG-19, REQ-SUBAG-20 accordingly. Add a new REQ for the `guidance` property on WorkerIdentity if needed.\n- Update the package validation requirements if the new property needs validation.\n\n**2. Write a fix plan** to update the existing implementation. The sub-agents feature has already been implemented (Phases 1-4 are done). The fix plan should cover:\n- Adding `guidance` to `WorkerIdentity` in `lib/types.ts`\n- Adding `guidance` to the Zod schema in `lib/packages.ts`\n- Adding `guidance` values to each worker's `package.json`\n- Updating `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts` to read from identity instead of the lookup table\n- Updating tests in `tests/packages/shared/sub-agent-description.test.ts`\n- Updating any sdk-runner tests that construct mock worker metadata\n\nSave the fix plan at `.lore/plans/infrastructure/sub-agent-description-fix.md`.\n\n**Reference files:**\n- `.lore/specs/infrastructure/worker-sub-agents.md` — spec to update\n- `packages/shared/sub-agent-description.ts` — current implementation with lookup table\n- `tests/packages/shared/sub-agent-description.test.ts` — current tests\n- `lib/types.ts` — WorkerIdentity type\n- `lib/packages.ts` — workerMetadataSchema\n- `packages/*/package.json` — worker packages that need guidance values"
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/worker-sub-agents.md

  - .lore/plans/infrastructure/sub-agent-description-fix.md
  - .lore/plans/infrastructure/sub-agent-description-fix.md
activity_timeline:
  - timestamp: 2026-03-21T08:45:14.373Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T08:45:14.375Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T08:45:14.420Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T08:45:22.671Z
    event: progress_report
    reason: "Reading all reference files to understand current state before drafting."
  - timestamp: 2026-03-21T08:45:52.483Z
    event: progress_report
    reason: "All reference files read. Starting spec revision and fix plan drafting."
  - timestamp: 2026-03-21T08:46:27.477Z
    event: progress_report
    reason: "Drafting spec revision (REQ-SUBAG-18 through REQ-SUBAG-20) and fix plan."
  - timestamp: 2026-03-21T08:49:19.792Z
    event: progress_report
    reason: "Both deliverables drafted. Spec revised (REQ-SUBAG-32/33 added, REQ-SUBAG-18-20 updated). Fix plan written at .lore/plans/infrastructure/sub-agent-description-fix.md. Running fresh-eyes review."
  - timestamp: 2026-03-21T08:51:11.807Z
    event: result_submitted
    reason: "Two deliverables completed:\n\n**1. Spec revision** (`.lore/specs/infrastructure/worker-sub-agents.md`):\n- Added REQ-SUBAG-32: `guidance` optional string property on `WorkerIdentity`, declared in each worker's `package.json` under `guildHall.identity.guidance`.\n- Added REQ-SUBAG-33: `workerIdentitySchema` adds `guidance` as optional string in the Zod schema.\n- Updated REQ-SUBAG-18: Description now uses `identity.guidance` instead of posture-derived text. Fallback to `identity.description` when guidance absent.\n- Updated REQ-SUBAG-19: `buildSubAgentDescription` takes only `WorkerIdentity` (posture parameter removed since guidance is now on identity).\n- Updated REQ-SUBAG-20: Reads `identity.guidance` directly. No hardcoded lookup table. Each worker owns its own guidance.\n- Updated REQ-SUBAG-7 step 4, Constraints, Exit Points, Success Criteria, and AI Validation sections for consistency.\n- Added Context note explaining the revision history.\n\n**2. Fix plan** (`.lore/plans/infrastructure/sub-agent-description-fix.md`):\n- 7 steps covering all affected files: `lib/types.ts`, `lib/packages.ts`, 8 worker `package.json` files, `packages/shared/sub-agent-description.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`, `tests/packages/shared/sub-agent-description.test.ts`, `tests/daemon/services/sdk-runner.test.ts`.\n- Guidance values for all 8 workers sourced from the current `INVOCATION_GUIDANCE` lookup table (identical output, different source).\n- Single-commission scope for Dalton, with Thorne review."
  - timestamp: 2026-03-21T08:51:56.502Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Both deliverables drafted. Spec revised (REQ-SUBAG-32/33 added, REQ-SUBAG-18-20 updated). Fix plan written at .lore/plans/infrastructure/sub-agent-description-fix.md. Running fresh-eyes review."
projectName: guild-hall
---
Two deliverables completed:

**1. Spec revision** (`.lore/specs/infrastructure/worker-sub-agents.md`):
- Added REQ-SUBAG-32: `guidance` optional string property on `WorkerIdentity`, declared in each worker's `package.json` under `guildHall.identity.guidance`.
- Added REQ-SUBAG-33: `workerIdentitySchema` adds `guidance` as optional string in the Zod schema.
- Updated REQ-SUBAG-18: Description now uses `identity.guidance` instead of posture-derived text. Fallback to `identity.description` when guidance absent.
- Updated REQ-SUBAG-19: `buildSubAgentDescription` takes only `WorkerIdentity` (posture parameter removed since guidance is now on identity).
- Updated REQ-SUBAG-20: Reads `identity.guidance` directly. No hardcoded lookup table. Each worker owns its own guidance.
- Updated REQ-SUBAG-7 step 4, Constraints, Exit Points, Success Criteria, and AI Validation sections for consistency.
- Added Context note explaining the revision history.

**2. Fix plan** (`.lore/plans/infrastructure/sub-agent-description-fix.md`):
- 7 steps covering all affected files: `lib/types.ts`, `lib/packages.ts`, 8 worker `package.json` files, `packages/shared/sub-agent-description.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`, `tests/packages/shared/sub-agent-description.test.ts`, `tests/daemon/services/sdk-runner.test.ts`.
- Guidance values for all 8 workers sourced from the current `INVOCATION_GUIDANCE` lookup table (identical output, different source).
- Single-commission scope for Dalton, with Thorne review.
