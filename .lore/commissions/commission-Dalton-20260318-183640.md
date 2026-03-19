---
title: "Commission: Model registry: remove flux-dev, add nano-banana-pro"
date: 2026-03-19
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nTwo changes to the model registry in `packages/guild-hall-replicate/model-registry.ts`.\n\n### 1. Remove `flux-dev`\n\nRemove the `black-forest-labs/flux-dev` entry entirely. It's for developing fine-tuned models, not direct image generation.\n\n### 2. Add `google/nano-banana-pro`\n\nAdd a new entry:\n- **id**: `google/nano-banana-pro`\n- **name**: Something appropriate (check Replicate if needed, or use \"Nano Banana Pro\")\n- **description**: Highlight its strength in infographics, mockups, and high-fidelity visual content\n- **capabilities**: `[\"text-to-image\"]`\n- **cost**: `$0.15/image`\n- **speed**: Check Replicate for typical generation time, or estimate based on similar premium models\n- **notes**: Something like \"Best for infographics, UI mockups, and high-fidelity visual content. Most expensive option.\"\n\n### 3. Update tests\n\n- `tests/packages/guild-hall-replicate/model-registry.test.ts`: adjust entry count assertions and any capability count checks affected by these changes\n- Run `bun test tests/packages/guild-hall-replicate/` to confirm all pass\n- Run `bun run typecheck` to confirm no type errors\n\n### Notes\n\n- The registry just lost flux-1.1-pro in the previous commission and is now losing flux-dev, so the minimum entry count in tests needs adjusting (we're adding one and removing one, so net count stays the same as current).\n- `DEFAULT_MODELS` should stay unchanged. flux-schnell remains the text-to-image default.\n"
dependencies: []
linked_artifacts:
  - packages/guild-hall-replicate/model-registry.ts

activity_timeline:
  - timestamp: 2026-03-19T01:36:40.952Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-19T01:36:40.954Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-19T01:36:40.996Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-19T01:36:53.144Z
    event: progress_report
    reason: "Read registry and tests. Making edits: remove flux-dev, add nano-banana-pro, adjust test assertions."
  - timestamp: 2026-03-19T01:37:16.643Z
    event: result_submitted
    reason: "Removed `black-forest-labs/flux-dev` from the model registry and added `google/nano-banana-pro` in its place. Net entry count unchanged (6 models), so no test assertion updates needed. All 95 replicate package tests pass, typecheck clean."
  - timestamp: 2026-03-19T01:37:19.154Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read registry and tests. Making edits: remove flux-dev, add nano-banana-pro, adjust test assertions."
projectName: guild-hall
---
Removed `black-forest-labs/flux-dev` from the model registry and added `google/nano-banana-pro` in its place. Net entry count unchanged (6 models), so no test assertion updates needed. All 95 replicate package tests pass, typecheck clean.
