---
title: "Commission: Plan: Guild Compendium plugin package"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the approved spec at `.lore/specs/packages/guild-compendium.md`.\n\nThe spec defines a pure plugin package (`packages/guild-compendium/`) containing curated craft knowledge that workers consult on demand. It has two parts:\n\n1. **Infrastructure**: Add a `\"plugin\"` package type to the discovery system (`lib/types.ts` PluginMetadata, `lib/packages.ts` pluginMetadataSchema, PackageMetadata union). REQ-CMP-1 through REQ-CMP-5.\n\n2. **Package creation**: The `guild-compendium` package itself with two skills (`consult-compendium`, `propose-entry`), reference directory structure, and worker opt-in declarations. REQ-CMP-6 through REQ-CMP-26.\n\nKey considerations for the plan:\n- The spec identifies what doesn't need changes (REQ-CMP-3, REQ-CMP-4, REQ-CMP-5). Verify those claims against current code.\n- Six worker packages need `domainPlugins` updated and posture lines added (REQ-CMP-23, REQ-CMP-23a).\n- The `reference/` directory ships empty. Content is follow-on work.\n- Skill files are text (SKILL.md), not code. They need careful authoring for trigger reliability.\n- The spec notes that `propose-entry` writes to `.lore/issues/`, which requires the worker to have Write tool access. Verify which workers in the opt-in list have Write in their builtInTools.\n\nWrite the plan to `.lore/plans/packages/guild-compendium.md`. Follow the project's plan format (see existing plans in `.lore/plans/` for structure). Map every REQ to a step, identify file changes, estimate scope, define the delegation table, and call out risks."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:02:37.334Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:02:37.337Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
