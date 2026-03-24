---
title: "Commission: Specify: Guild Compendium as Plugin Package"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec from the brainstorm at `.lore/brainstorm/guild-compendium-as-plugin.md`.\n\nThe brainstorm is thorough. Your job is to distill it into a proper spec with testable requirements. Key decisions from the brainstorm:\n\n1. **Pure plugin package** in `packages/guild-compendium/` (Option B). Requires a small infrastructure change: `PluginMetadata` type and schema so the package discovery system can validate `type: \"plugin\"` packages.\n\n2. **Two skills**: `consult-compendium` (read reference entries on demand) and `propose-entry` (file a proposal to `.lore/issues/` when a worker notices a knowledge gap). No `update-entry` skill (deliberate friction).\n\n3. **Reference entries** are markdown files in `plugin/skills/consult-compendium/reference/` with frontmatter (title, domain, last_updated, source). Entries are 500-1000 words, self-contained.\n\n4. **Population workflow**: Research commissions (Verity), direct writes, or retro promotion. User gates all additions.\n\n5. **Workers opt in** via `domainPlugins: [\"guild-compendium\"]`. Not every worker needs it.\n\n6. **On-demand access**, not injected. Agents pull reference material when they need it via skills.\n\nThe spec should cover:\n- The infrastructure change (PluginMetadata type/schema in lib/types.ts and lib/packages.ts)\n- The package structure and package.json shape\n- The two skills (trigger conditions, behavior, output)\n- Reference entry format and constraints\n- Which workers should declare it as a domain plugin\n- What the spec does NOT include (no automatic curation, no update skill, no prepareSdkSession injection)\n\nThe brainstorm's open questions (1-5) should be resolved in the spec as decisions, not left open. Read the brainstorm carefully for the reasoning behind each.\n\nPlace the spec at `.lore/specs/packages/guild-compendium.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/packages/guild-compendium.md

activity_timeline:
  - timestamp: 2026-03-24T04:15:15.705Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T04:15:15.707Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T04:15:15.752Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T04:15:22.196Z
    event: progress_report
    reason: "Reading brainstorm and existing infrastructure to understand requirements before drafting spec."
  - timestamp: 2026-03-24T04:16:21.520Z
    event: progress_report
    reason: "Read brainstorm, verified infrastructure code (lib/types.ts, lib/packages.ts, sdk-runner.ts), reviewed all worker package.json files, and read the worker-domain-plugins spec for conventions. Now drafting the spec."
  - timestamp: 2026-03-24T04:22:32.823Z
    event: result_submitted
    reason: "Wrote the Guild Compendium plugin package spec at `.lore/specs/packages/guild-compendium.md`. The spec covers:\n\n**26 requirements** across 7 sections: infrastructure (PluginMetadata type/schema), package structure, two skills (consult-compendium and propose-entry), reference entry format, population workflow, worker declarations, and initial content.\n\n**Key decisions from brainstorm resolved:**\n1. Workers cannot write to the compendium during commissions; `propose-entry` is the sanctioned channel\n2. `.lore/` holds project artifacts, compendium holds craft knowledge; proposals go to `.lore/issues/`\n3. Four workers opt in (writer, reviewer, developer, steward); three do not (researcher, illuminator, visionary)\n4. Entries are worker-agnostic; posture shapes interpretation\n5. No growth limit; on-demand access makes collection size a non-issue\n\n**Infrastructure change is minimal:** One new type (`PluginMetadata`) and one new Zod schema (`pluginMetadataSchema`). The discovery loop, plugin resolution, and worker/toolbox filtering all work without changes because existing narrowing patterns already exclude the `\"plugin\"` case.\n\n**Fresh-eyes review applied.** The spec-reviewer identified 3 priority improvements, all addressed: (1) clarified DiscoveredPackage.metadata type ripple from the union change, (2) added posture guidance requirement (REQ-CMP-23a) as belt-and-suspenders for skill triggering, (3) specified propose-entry output format conforming to existing `.lore/issues/` frontmatter. Also refined the skill mechanism description, SDK access constraint language, initial content shipping state, and separated success criteria into automated vs manual categories."
  - timestamp: 2026-03-24T04:22:37.548Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read brainstorm, verified infrastructure code (lib/types.ts, lib/packages.ts, sdk-runner.ts), reviewed all worker package.json files, and read the worker-domain-plugins spec for conventions. Now drafting the spec."
projectName: guild-hall
---
Wrote the Guild Compendium plugin package spec at `.lore/specs/packages/guild-compendium.md`. The spec covers:

**26 requirements** across 7 sections: infrastructure (PluginMetadata type/schema), package structure, two skills (consult-compendium and propose-entry), reference entry format, population workflow, worker declarations, and initial content.

**Key decisions from brainstorm resolved:**
1. Workers cannot write to the compendium during commissions; `propose-entry` is the sanctioned channel
2. `.lore/` holds project artifacts, compendium holds craft knowledge; proposals go to `.lore/issues/`
3. Four workers opt in (writer, reviewer, developer, steward); three do not (researcher, illuminator, visionary)
4. Entries are worker-agnostic; posture shapes interpretation
5. No growth limit; on-demand access makes collection size a non-issue

**Infrastructure change is minimal:** One new type (`PluginMetadata`) and one new Zod schema (`pluginMetadataSchema`). The discovery loop, plugin resolution, and worker/toolbox filtering all work without changes because existing narrowing patterns already exclude the `"plugin"` case.

**Fresh-eyes review applied.** The spec-reviewer identified 3 priority improvements, all addressed: (1) clarified DiscoveredPackage.metadata type ripple from the union change, (2) added posture guidance requirement (REQ-CMP-23a) as belt-and-suspenders for skill triggering, (3) specified propose-entry output format conforming to existing `.lore/issues/` frontmatter. Also refined the skill mechanism description, SDK access constraint language, initial content shipping state, and separated success criteria into automated vs manual categories.
