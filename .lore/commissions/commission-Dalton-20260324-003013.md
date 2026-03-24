---
title: "Commission: Guild Compendium: PluginMetadata type/schema + package structure (Steps 1-2) [recommission]"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1 and 2 from the approved plan at `.lore/plans/packages/guild-compendium.md`.\n\n**Step 1: Add PluginMetadata type and schema**\n\nIn `lib/types.ts`:\n- Add `PluginMetadata` interface with `type: \"plugin\"`, `name: string`, `description: string`\n- Update `PackageMetadata` union to include `PluginMetadata`\n\nIn `lib/packages.ts`:\n- Add `pluginMetadataSchema` (Zod)\n- Update `packageMetadataSchema` union (append plugin last, after worker and toolbox)\n\nTests (new `tests/lib/plugin-metadata.test.ts`):\n- Schema accepts/rejects valid/invalid plugin metadata\n- `packageMetadataSchema` accepts plugin type\n- `discoverPackages` discovers plugin packages, sets `pluginPath`\n- `getWorkers()` and `getToolboxes()` exclude plugin packages\n- `validatePackageModels` passes plugin packages through\n- Integration: `prepareSdkSession` resolves plugin path when worker declares it in `domainPlugins`\n\n**Step 2: Create package structure**\n\nCreate `packages/guild-compendium/` with:\n- `package.json` (per plan, `type: \"plugin\"`)\n- `plugin/.claude-plugin/plugin.json` (standard manifest, skills only)\n- `plugin/skills/consult-compendium/SKILL.md` (placeholder: \"Skill content pending.\")\n- `plugin/skills/consult-compendium/reference/.gitkeep` (empty dir for future entries)\n- `plugin/skills/propose-entry/SKILL.md` (placeholder: \"Skill content pending.\")\n\nNOTE: Previous commissions for this work completed but the downstream chain broke. Check if any of this work already exists before duplicating. If the files and tests are already in place and passing, verify and move on.\n\nAll tests must pass: `bun test`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T07:30:13.228Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T07:30:13.230Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
