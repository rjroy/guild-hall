---
title: "Commission: Review: Guild Compendium plugin package (full REQ-by-REQ validation)"
date: 2026-03-24
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Fresh-context validation of the guild compendium implementation against the spec. The previous review attempt confirmed tests pass but did not produce the REQ-by-REQ validation report. This commission completes that work.\n\n**Spec**: `.lore/specs/packages/guild-compendium.md` (26 REQs: REQ-CMP-1 through REQ-CMP-26)\n**Plan**: `.lore/plans/packages/guild-compendium.md`\n\n**Your deliverable is a REQ-by-REQ validation report.** For each of the 26 requirements, state PASS or FAIL with specific file/line evidence. Group findings by severity (DEFECT, WARN, INFO).\n\n**Review checklist**:\n\n1. Walk every REQ (CMP-1 through CMP-26) and verify it maps to an implemented change or a confirmed no-change.\n\n2. **Infrastructure** (REQ-CMP-1 through CMP-5):\n   - `PluginMetadata` type and `pluginMetadataSchema` exist in `lib/types.ts` and `lib/packages.ts`\n   - `PackageMetadata` union includes plugin\n   - Plugin packages excluded from `getWorkers()` and `getToolboxes()`\n   - Discovery, plugin resolution, and model validation work correctly for plugin type\n\n3. **Package structure** (REQ-CMP-6 through CMP-9):\n   - Directory layout matches spec exactly\n   - `package.json` and `plugin.json` contents correct\n   - `reference/` directory is inside `consult-compendium` skill directory\n\n4. **Skills** (REQ-CMP-10 through CMP-16):\n   - `consult-compendium` triggers on named contexts, guides file reads, stays passive\n   - `propose-entry` triggers on gap recognition, writes to `.lore/issues/`, notes Write requirement\n   - Neither skill modifies the compendium directly\n\n5. **Reference entries** (REQ-CMP-17 through CMP-20):\n   - Frontmatter format (title, domain, last_updated, source)\n   - 500-1000 words each (count them)\n   - Self-contained, worker-agnostic\n\n6. **Worker declarations** (REQ-CMP-23, CMP-23a, CMP-24):\n   - Six workers declare `guild-compendium` in `domainPlugins`\n   - Researcher (Verity) does NOT declare it\n   - Each declaring worker has a posture line referencing relevant domains\n   - Sienna's posture line uses explicit file-read language (she lacks Skill tool)\n\n7. **Tests**: The previous review confirmed 3359 tests pass including 11 plugin-metadata tests. You don't need to re-run, but verify the test file covers the spec's success criteria.\n\n**Files to review**:\n- `lib/types.ts`, `lib/packages.ts` (infrastructure)\n- `packages/guild-compendium/` (entire package)\n- 6 worker `package.json` and `posture.md` files\n- `tests/lib/plugin-metadata.test.ts`\n- 5 reference entries in `packages/guild-compendium/plugin/skills/consult-compendium/reference/`"
dependencies:
  - commission-Dalton-20260324-010057
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T08:01:22.730Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T08:01:22.731Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
