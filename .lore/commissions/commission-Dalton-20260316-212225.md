---
title: "Commission: Implement Celeste, the Guild Visionary worker package"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Guild Visionary worker package from the spec at `.lore/specs/workers/guild-hall-visionary-worker.md`.\n\n**What to build:**\nThe `packages/guild-hall-visionary/` worker package with four files: `package.json`, `soul.md`, `posture.md`, and `index.ts`.\n\n**Key references:**\n- **Spec:** `.lore/specs/workers/guild-hall-visionary-worker.md` — this is the authoritative source. Follow the REQ-CEL-* requirements.\n- **Template:** `packages/guild-hall-writer/` — Octavia's package. Celeste mirrors this structure. Use it as your starting template.\n- **Activation pattern:** `packages/shared/worker-activation.ts` — `activateWorkerWithSharedPattern` is the activation function to use (REQ-CEL-8a).\n- **Worker roster spec:** `.lore/specs/workers/guild-hall-worker-roster.md` — for roster conventions.\n\n**Implementation notes:**\n- `soul.md` content is provided as an example in REQ-CEL-9. Use it as a strong starting point but ensure it meets all the requirements in that section.\n- `posture.md` must have Principles, Workflow, and Quality Standards sections per REQ-CEL-10. No personality content in posture.\n- `package.json` metadata is specified in REQ-CEL-2. Follow it closely.\n- `index.ts` delegates to `activateWorkerWithSharedPattern` per REQ-CEL-8a. Look at Octavia's `index.ts` for the pattern.\n- Run tests after implementation to confirm nothing breaks. The worker should be discoverable by the package system.\n- A portrait image is referenced in the spec (`/images/portraits/celeste-visionary.webp`). Don't worry about creating the actual image file — just make sure the path is declared in the metadata.\n\n**Success criteria from the spec (REQ-CEL section \"Success Criteria\"):**\n- Package exists with all four files\n- Package metadata is correct (type worker, identity, checkoutScope full, no domain toolboxes)\n- Soul has Character, Voice (anti-examples + calibration pairs), Vibe\n- Posture has Principles, Workflow, Quality Standards with no personality leakage\n- Activation function uses shared pattern\n- canUseToolRules match REQ-CEL-5"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T04:22:25.797Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T04:22:25.799Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
