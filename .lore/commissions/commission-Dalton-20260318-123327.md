---
title: "Commission: Replicate toolbox foundation (Steps 1-4)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-4 of the Replicate native domain toolbox plan at `.lore/plans/infrastructure/replicate-native-toolbox.md`. Read the full plan first.\n\n**Step 1:** Package scaffold and two-state factory at `packages/guild-hall-replicate/`. Follow `guild-hall-email` as the direct precedent. All 8 tools stubbed, unconfigured state returns `isError: true`.\n\n**Step 2:** `ReplicateClient` HTTP wrapper with DI fetch. All methods listed in the plan. Error handling for 401/404/429/500 and network errors.\n\n**Step 3:** Model registry with the 7+ models. Use these defaults from user answers:\n- img2img: `black-forest-labs/flux-2-pro`\n- background removal: `lucataco/remove-bg`\n- upscale: `google/upscaler`\n\n**Step 4:** Output handling utilities (resolveOutputDir, generateFilename, detectExtension, validateInputFile).\n\nEach step has its own test file. Run `bun test` after each step. All tests must pass before moving to the next step. Run the full test suite at the end to verify nothing is broken.\n\nConsult the spec at `.lore/specs/infrastructure/replicate-native-toolbox.md` for requirement details."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T19:33:27.875Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T19:34:15.590Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
