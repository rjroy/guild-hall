---
title: "Commission: Skill-to-Operations: Lore docs + CLAUDE.md (Steps 10-11)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Execute Steps 10 and 11 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\n**Step 10 — Lore documents:**\n\nRename files:\n- `.lore/design/skill-contract.md` → `.lore/design/operation-contract.md`\n- `.lore/design/package-skill-handler.md` → `.lore/design/package-operation-handler.md`\n\nUpdate content in active specs and design docs:\n- `.lore/specs/infrastructure/cli-progressive-discovery.md` — heaviest rewrite. Replace `SkillDefinition`/`SkillRegistry`/`skillFactory`/`skillId` with operations equivalents. Update references to retired REQ-DAB-7 through -12 to the new REQ-DAB-16 through -20. Replace \"skill\" with \"operation\" when referring to daemon capabilities. Keep \"skill\" when referring to Claude Code skills.\n- Run `grep -r \"SkillDefinition\\|SkillRegistry\\|skillFactory\\|skillId\" .lore/` to find full scope\n- For historical records (completed plans, notes, archive): update stale file paths but don't rewrite the narrative. Add a note if a path reference changed.\n\n**Step 11 — CLAUDE.md:**\n- Update terminology where \"skill\" means daemon capability → \"operation\"\n- **Do not change** \"skill\" where it refers to Claude Code skills (e.g., \"the guild-hall-writer package contains a `cleanup-commissions` skill as the first domain plugin\" is correct as-is)\n\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies:
  - commission-Dalton-20260317-203556
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T03:36:09.126Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:36:09.127Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
