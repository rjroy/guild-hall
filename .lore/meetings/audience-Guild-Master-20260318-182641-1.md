---
title: "Audience with Guild Master"
date: 2026-03-19
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Discuss some issues with guild-hall-replicate"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-19T01:26:41.784Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-19T03:07:08.608Z
    event: closed
    reason: "User closed audience"
---
GUILD HALL MEETING NOTES
guild-hall-replicate Model Registry Issues
2026-03-19 | Guild Master + User

DISCUSSION SUMMARY

The meeting addressed a fundamental architecture problem in the model registry where the `capability` field in `ModelEntry` was singular, but multiple models can serve multiple purposes. Specifically, `flux-2-pro` provides both text-to-image and image-to-image capabilities, yet the current data structure only allows a single capability per model. This architectural constraint led to both `flux-1.1-pro` and `flux-2-pro` being kept in the registry despite v2 completely superseding v1.1.

Two sets of changes were identified. First, the registry structure itself needs refactoring: change `capability: Capability` to `capabilities: Capability[]`, remove the now-redundant `flux-1.1-pro`, update `flux-2-pro` to declare both text-to-image and image-to-image capabilities, and modify `getModels()` to use `.some()` instead of `===` for filtering. Second, the model list itself should be curated by removing `flux-dev` (which is intended for fine-tuning workflows, not direct generation) and adding `google/nano-banana-pro` (an expensive but exceptional model at $0.15/image, particularly strong for infographics and mockups like those in `.lore/prototypes/agentic-ux`).

DECISIONS MADE

Refactor ModelEntry interface from singular to plural capability field to accurately represent multi-purpose models. Remove `flux-1.1-pro` due to complete supersession by `flux-2-pro`. Update `flux-2-pro` to declare both text-to-image and image-to-image capabilities. Modify the `getModels()` filter function to use array matching logic. Remove `flux-dev` from the registry as it serves a different use case (model fine-tuning) than direct image generation. Add `google/nano-banana-pro` to the registry as a premium option for high-quality infographics and mockup generation.

ARTIFACTS REFERENCED

packages/guild-hall-replicate/model-registry.ts (primary registry definition)
tests/packages/guild-hall-replicate/model-registry.test.ts (test suite requiring updates)
packages/guild-hall-replicate/tools/generate-image.ts (uses getDefaultModel and getCostEstimate)
packages/guild-hall-replicate/tools/edit-image.ts (uses getDefaultModel and getCostEstimate)
packages/guild-hall-replicate/tools/remove-background.ts (uses getDefaultModel)
packages/guild-hall-replicate/tools/upscale-image.ts (uses getDefaultModel)
packages/guild-hall-replicate/tools/list-models.ts (uses getModels filtering)

COMMISSIONS DISPATCHED

Commission-Dalton-20260318-183140: Model registry multi-capability refactor. Status: completed. Updated registry structure and filtering logic.

Commission-Dalton-20260318-183640: Registry list curation. Status: dispatched. To remove flux-dev and add google/nano-banana-pro.
