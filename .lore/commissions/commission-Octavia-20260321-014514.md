---
title: "Commission: Spec update + fix plan: Sub-agent description from worker identity"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Two deliverables in one commission:\n\n**1. Update the worker sub-agents spec** at `.lore/specs/infrastructure/worker-sub-agents.md`.\n\nThe current spec (REQ-SUBAG-18 through REQ-SUBAG-20) defines description generation using a hardcoded lookup table in `buildSubAgentDescription`. This is wrong. The invocation guidance should be defined in each worker's `package.json` as part of their identity block, not centralized in a lookup table.\n\n**Revise the spec to:**\n- Add a `guidance` property (or similar name that fits) to `WorkerIdentity` in the worker's `package.json` `guildHall.identity` block. This string describes WHEN to invoke this worker as a sub-agent. Each worker declares this about itself.\n- `buildSubAgentDescription` reads the guidance from the worker's identity instead of looking it up in a hardcoded table.\n- Fallback when `guidance` is omitted: use `identity.description` (same as the current table-miss fallback).\n- Remove the lookup table requirement. The table was a workaround for guidance not being in the package metadata.\n- Update REQ-SUBAG-18, REQ-SUBAG-19, REQ-SUBAG-20 accordingly. Add a new REQ for the `guidance` property on WorkerIdentity if needed.\n- Update the package validation requirements if the new property needs validation.\n\n**2. Write a fix plan** to update the existing implementation. The sub-agents feature has already been implemented (Phases 1-4 are done). The fix plan should cover:\n- Adding `guidance` to `WorkerIdentity` in `lib/types.ts`\n- Adding `guidance` to the Zod schema in `lib/packages.ts`\n- Adding `guidance` values to each worker's `package.json`\n- Updating `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts` to read from identity instead of the lookup table\n- Updating tests in `tests/packages/shared/sub-agent-description.test.ts`\n- Updating any sdk-runner tests that construct mock worker metadata\n\nSave the fix plan at `.lore/plans/infrastructure/sub-agent-description-fix.md`.\n\n**Reference files:**\n- `.lore/specs/infrastructure/worker-sub-agents.md` — spec to update\n- `packages/shared/sub-agent-description.ts` — current implementation with lookup table\n- `tests/packages/shared/sub-agent-description.test.ts` — current tests\n- `lib/types.ts` — WorkerIdentity type\n- `lib/packages.ts` — workerMetadataSchema\n- `packages/*/package.json` — worker packages that need guidance values"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T08:45:14.373Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T08:45:14.375Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
