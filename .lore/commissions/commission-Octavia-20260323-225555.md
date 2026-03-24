---
title: "Commission: Guild Compendium: Skill authoring (Steps 3-4)"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Author the two skills for the guild compendium package per Steps 3 and 4 from the approved plan at `.lore/plans/packages/guild-compendium.md`. The spec is at `.lore/specs/packages/guild-compendium.md`.\n\n**Step 3: consult-compendium SKILL.md**\n\nFile: `packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md`\n\nThis skill must:\n1. Trigger reliably (REQ-CMP-10): Name specific contexts in the description: \"starting a code review,\" \"writing a spec,\" \"beginning implementation from a plan,\" \"writing a commission prompt,\" \"working with TypeScript patterns,\" \"generating images,\" or entering any domain the compendium covers.\n2. Guide file reads (REQ-CMP-11): Instruct the agent to Glob `reference/` to see available entries, Read relevant ones, absorb key points. The skill does NOT inject content automatically.\n3. Stay passive (REQ-CMP-12): No posture/identity/tool changes. Just reference material.\n4. Document entry format (REQ-CMP-17-20): Note the frontmatter shape (`title`, `domain`, `last_updated`, `source`), 500-1000 word size, self-contained, worker-agnostic.\n5. Handle empty reference dir gracefully: If no entries exist, proceed without reference material.\n\n**Step 4: propose-entry SKILL.md**\n\nFile: `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`\n\nThis skill must:\n1. Trigger on gap recognition (REQ-CMP-13): \"the compendium doesn't cover this,\" \"this domain would benefit from a reference entry,\" etc.\n2. Write a structured issue to `.lore/issues/compendium-proposal-{topic}.md` (REQ-CMP-14): Frontmatter with `title`, `date`, `status: open`, `tags` including `compendium-proposal`. Body with domain, evidence, suggested scope.\n3. Write to `.lore/issues/`, NOT to the compendium (REQ-CMP-15, REQ-CMP-16).\n4. Note Write tool requirement: Workers without Write (Thorne) cannot execute this skill. The skill should instruct the agent to note the gap rather than fail silently.\n\nRead the spec for full requirement details. Read existing skills in other packages (e.g., `packages/guild-hall-writer/plugin/skills/`) for format reference."
dependencies: []
linked_artifacts:
  - packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md

  - packages/guild-compendium/plugin/skills/propose-entry/SKILL.md
  - packages/guild-compendium/plugin/skills/propose-entry/SKILL.md
activity_timeline:
  - timestamp: 2026-03-24T05:55:55.124Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:55:55.126Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:55:55.176Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:56:22.662Z
    event: progress_report
    reason: "Read spec, plan, and existing skills for reference. Package structure doesn't exist yet (Step 2 hasn't run), so I'll create the directories alongside the skill files. Now authoring both SKILL.md files."
  - timestamp: 2026-03-24T05:57:35.629Z
    event: result_submitted
    reason: "Authored both SKILL.md files for the guild compendium package per Steps 3 and 4 of the approved plan.\n\n**consult-compendium** (`packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md`): Triggers on code review, spec writing, implementation, commission prompts, TypeScript, image generation, strategic analysis. Guides the agent through Glob/Read of the `reference/` directory. Handles empty directory gracefully. Documents the entry format (frontmatter shape, size constraints, self-contained, worker-agnostic). Stays passive per REQ-CMP-12.\n\n**propose-entry** (`packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`): Triggers on gap recognition. Provides a complete issue template targeting `.lore/issues/compendium-proposal-{topic}.md` with required frontmatter and structured body (Domain, Evidence, Suggested Scope). Notes Write tool requirement up front with fallback guidance for read-only workers (Thorne). Explicitly states proposals go to issues, not to the compendium.\n\nAlso created the directory structure (`packages/guild-compendium/plugin/skills/consult-compendium/reference/` and `packages/guild-compendium/plugin/skills/propose-entry/`) since Step 2 hadn't run yet. The `reference/` directory is empty, awaiting content from Steps 7-8."
  - timestamp: 2026-03-24T05:57:39.562Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec, plan, and existing skills for reference. Package structure doesn't exist yet (Step 2 hasn't run), so I'll create the directories alongside the skill files. Now authoring both SKILL.md files."
projectName: guild-hall
---
Authored both SKILL.md files for the guild compendium package per Steps 3 and 4 of the approved plan.

**consult-compendium** (`packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md`): Triggers on code review, spec writing, implementation, commission prompts, TypeScript, image generation, strategic analysis. Guides the agent through Glob/Read of the `reference/` directory. Handles empty directory gracefully. Documents the entry format (frontmatter shape, size constraints, self-contained, worker-agnostic). Stays passive per REQ-CMP-12.

**propose-entry** (`packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`): Triggers on gap recognition. Provides a complete issue template targeting `.lore/issues/compendium-proposal-{topic}.md` with required frontmatter and structured body (Domain, Evidence, Suggested Scope). Notes Write tool requirement up front with fallback guidance for read-only workers (Thorne). Explicitly states proposals go to issues, not to the compendium.

Also created the directory structure (`packages/guild-compendium/plugin/skills/consult-compendium/reference/` and `packages/guild-compendium/plugin/skills/propose-entry/`) since Step 2 hadn't run yet. The `reference/` directory is empty, awaiting content from Steps 7-8.
