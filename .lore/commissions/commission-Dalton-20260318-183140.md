---
title: "Commission: Model registry: singular capability to capabilities array"
date: 2026-03-19
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nRefactor the model registry in `packages/guild-hall-replicate/model-registry.ts` to support multiple capabilities per model.\n\n## Changes\n\n### 1. `model-registry.ts`\n\n- Rename `capability: Capability` to `capabilities: Capability[]` on `ModelEntry`\n- Update all registry entries to use arrays (e.g., `capabilities: [\"text-to-image\"]`)\n- **Remove `flux-1.1-pro`** entirely. `flux-2-pro` supersedes it.\n- **Update `flux-2-pro`** to `capabilities: [\"text-to-image\", \"image-to-image\"]`. Update its description to reflect both capabilities. Move it up to the text-to-image section or remove section comments since models span categories now.\n- Update `getModels()` filter: use `.some()` instead of `===` to match any capability in the array\n- `findModel()`, `getCostEstimate()`, `getDefaultModel()` are unchanged (they work by model ID, not capability)\n\n### 2. `tests/packages/guild-hall-replicate/model-registry.test.ts`\n\n- Update capability coverage test: check that capabilities arrays contain the expected values (use `.some(m => m.capabilities.includes(...))` or similar)\n- Update the text-to-image filter test: the count assertion may change since flux-1.1-pro is removed but flux-2-pro now appears in text-to-image results. Adjust the `toBeGreaterThanOrEqual` threshold accordingly.\n- Update the registry entry count assertion (one fewer model after removing flux-1.1-pro)\n- Ensure all existing test semantics are preserved\n\n### 3. Verify\n\n- Run `bun test tests/packages/guild-hall-replicate/` and confirm all pass\n- Run `bun run typecheck` to confirm no type errors across the codebase (other files import `ModelEntry` and `Capability` types)\n\n### Notes\n\n- The tool handlers (`generate-image.ts`, `edit-image.ts`, etc.) use `getDefaultModel()` and `getCostEstimate()` by model ID. They don't reference `capability` directly, so they should need no changes. But verify with typecheck.\n- `flux-2-pro` notes field: add something like \"Best for production images and image-to-image transformation.\" to replace the note that was on flux-1.1-pro.\n"
dependencies: []
linked_artifacts:
  - packages/guild-hall-replicate/model-registry.ts

  - tests/packages/guild-hall-replicate/model-registry.test.ts
  - tests/packages/guild-hall-replicate/tools/discovery.test.ts
  - tests/packages/guild-hall-replicate/model-registry.test.ts
  - tests/packages/guild-hall-replicate/tools/discovery.test.ts
activity_timeline:
  - timestamp: 2026-03-19T01:31:40.552Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-19T01:31:40.555Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-19T01:31:40.595Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-19T01:31:53.096Z
    event: progress_report
    reason: "Read source files. Implementing multi-capability refactor now."
  - timestamp: 2026-03-19T01:33:09.719Z
    event: result_submitted
    reason: "Refactored model registry to support multiple capabilities per model.\n\nChanges:\n- `ModelEntry.capability: Capability` renamed to `capabilities: Capability[]`\n- All registry entries updated to use arrays\n- Removed `flux-1.1-pro` (superseded by `flux-2-pro`)\n- `flux-2-pro` now has `capabilities: [\"text-to-image\", \"image-to-image\"]` with updated description and notes\n- `getModels()` filter uses `.includes()` instead of `===`\n- Updated tests in `model-registry.test.ts` and `tools/discovery.test.ts` to match new schema and adjusted count thresholds\n\nVerification: 91 tests pass, 0 failures, typecheck clean."
  - timestamp: 2026-03-19T01:33:14.489Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read source files. Implementing multi-capability refactor now."
projectName: guild-hall
---
Refactored model registry to support multiple capabilities per model.

Changes:
- `ModelEntry.capability: Capability` renamed to `capabilities: Capability[]`
- All registry entries updated to use arrays
- Removed `flux-1.1-pro` (superseded by `flux-2-pro`)
- `flux-2-pro` now has `capabilities: ["text-to-image", "image-to-image"]` with updated description and notes
- `getModels()` filter uses `.includes()` instead of `===`
- Updated tests in `model-registry.test.ts` and `tools/discovery.test.ts` to match new schema and adjusted count thresholds

Verification: 91 tests pass, 0 failures, typecheck clean.
