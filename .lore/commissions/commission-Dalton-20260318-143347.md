---
title: "Commission: Implement Illuminator worker package (Sienna)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Illuminator worker package based on the spec at `.lore/specs/workers/art-director-worker.md`. Read the full spec first.\n\nCreate `packages/guild-hall-illuminator/` with:\n\n1. **`package.json`** — `guildHall` metadata block exactly as specified in REQ-ILL-2. Type \"worker\", identity for Sienna (Guild Illuminator), model \"sonnet\", domainToolboxes `[\"guild-hall-replicate\"]`, builtInTools including Bash, canUseToolRules constraining Bash to file operations within `.lore/`, checkoutScope \"sparse\", maxTurns 120.\n\n2. **`soul.md`** — Character, Voice (anti-examples + calibration pairs), and Vibe sections per REQ-ILL-10. The spec includes example soul content; use it as a starting point but make it your own. The soul must convey that Sienna reads before generating, iterates on drafts, articulates creative decisions, and treats cost awareness as craft.\n\n3. **`posture.md`** — Principles, Workflow, and Quality Standards sections per REQ-ILL-11. No personality content in posture. Principles cover: read before generating, never modify source code, articulate creative decisions, be cost-aware, iterate on drafts, maintain visual consistency. Workflow covers the commission execution sequence (REQ-ILL-11). Quality standards cover creative brief requirements, cost visibility, model selection justification.\n\n4. **`index.ts`** — Single `activate` function delegating to `activateWorkerWithSharedPattern` per REQ-ILL-25. Look at existing worker packages for the exact pattern.\n\n**Testing:** Write tests that verify:\n- Package discovery (Illuminator is found as a valid worker)\n- Identity, soul, and posture load correctly\n- `guild-hall-replicate` appears in the domain toolbox declaration\n- builtInTools includes Bash\n- canUseToolRules are present and constrain Bash correctly\n- Activation delegates to shared pattern\n\nLook at existing worker package tests (e.g., `tests/packages/guild-hall-writer/`, `tests/packages/guild-hall-steward/`) for test patterns.\n\nRun `bun test` at the end to verify all existing and new tests pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T21:33:47.276Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T21:33:47.279Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
