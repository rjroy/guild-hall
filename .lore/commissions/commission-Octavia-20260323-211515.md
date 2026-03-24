---
title: "Commission: Specify: Guild Compendium as Plugin Package"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec from the brainstorm at `.lore/brainstorm/guild-compendium-as-plugin.md`.\n\nThe brainstorm is thorough. Your job is to distill it into a proper spec with testable requirements. Key decisions from the brainstorm:\n\n1. **Pure plugin package** in `packages/guild-compendium/` (Option B). Requires a small infrastructure change: `PluginMetadata` type and schema so the package discovery system can validate `type: \"plugin\"` packages.\n\n2. **Two skills**: `consult-compendium` (read reference entries on demand) and `propose-entry` (file a proposal to `.lore/issues/` when a worker notices a knowledge gap). No `update-entry` skill (deliberate friction).\n\n3. **Reference entries** are markdown files in `plugin/skills/consult-compendium/reference/` with frontmatter (title, domain, last_updated, source). Entries are 500-1000 words, self-contained.\n\n4. **Population workflow**: Research commissions (Verity), direct writes, or retro promotion. User gates all additions.\n\n5. **Workers opt in** via `domainPlugins: [\"guild-compendium\"]`. Not every worker needs it.\n\n6. **On-demand access**, not injected. Agents pull reference material when they need it via skills.\n\nThe spec should cover:\n- The infrastructure change (PluginMetadata type/schema in lib/types.ts and lib/packages.ts)\n- The package structure and package.json shape\n- The two skills (trigger conditions, behavior, output)\n- Reference entry format and constraints\n- Which workers should declare it as a domain plugin\n- What the spec does NOT include (no automatic curation, no update skill, no prepareSdkSession injection)\n\nThe brainstorm's open questions (1-5) should be resolved in the spec as decisions, not left open. Read the brainstorm carefully for the reasoning behind each.\n\nPlace the spec at `.lore/specs/packages/guild-compendium.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T04:15:15.705Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T04:15:15.707Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
