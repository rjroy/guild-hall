---
title: "Commission: Guild Compendium: Skill authoring (Steps 3-4) [recommission]"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Author the two skills for the guild compendium package per Steps 3 and 4 from the approved plan at `.lore/plans/packages/guild-compendium.md`. The spec is at `.lore/specs/packages/guild-compendium.md`.\n\n**Step 3: consult-compendium SKILL.md**\n\nFile: `packages/guild-compendium/plugin/skills/consult-compendium/SKILL.md`\n\nThis skill must:\n1. Trigger reliably (REQ-CMP-10): Name specific contexts in the description: \"starting a code review,\" \"writing a spec,\" \"beginning implementation from a plan,\" \"writing a commission prompt,\" \"working with TypeScript patterns,\" \"generating images,\" or entering any domain the compendium covers.\n2. Guide file reads (REQ-CMP-11): Instruct the agent to Glob `reference/` to see available entries, Read relevant ones, absorb key points. The skill does NOT inject content automatically.\n3. Stay passive (REQ-CMP-12): No posture/identity/tool changes. Just reference material.\n4. Document entry format (REQ-CMP-17-20): Note the frontmatter shape (`title`, `domain`, `last_updated`, `source`), 500-1000 word size, self-contained, worker-agnostic.\n5. Handle empty reference dir gracefully: If no entries exist, proceed without reference material.\n\n**Step 4: propose-entry SKILL.md**\n\nFile: `packages/guild-compendium/plugin/skills/propose-entry/SKILL.md`\n\nThis skill must:\n1. Trigger on gap recognition (REQ-CMP-13): \"the compendium doesn't cover this,\" \"this domain would benefit from a reference entry,\" etc.\n2. Write a structured issue to `.lore/issues/compendium-proposal-{topic}.md` (REQ-CMP-14): Frontmatter with `title`, `date`, `status: open`, `tags` including `compendium-proposal`. Body with domain, evidence, suggested scope.\n3. Write to `.lore/issues/`, NOT to the compendium (REQ-CMP-15, REQ-CMP-16).\n4. Note Write tool requirement: Workers without Write (Thorne) cannot execute this skill. The skill should instruct the agent to note the gap rather than fail silently.\n\nNOTE: Previous commissions for this work completed but the downstream chain broke. Check if SKILL.md files already have real content (not placeholders) before overwriting. If they're already authored correctly, verify and move on.\n\nRead the spec for full requirement details. Read existing skills in other packages (e.g., `packages/guild-hall-writer/plugin/skills/`) for format reference."
dependencies:
  - commission-Dalton-20260324-003013
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T07:30:32.511Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T07:30:32.513Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T07:31:29.088Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-24T07:31:29.091Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
