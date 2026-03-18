---
title: "Commission: Skill-to-Operations: Full verification (Step 12)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Execute Step 12 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\nRun full verification of the skill-to-operations rename:\n\n1. Run `bun run typecheck`, `bun run lint`, and `bun test`. All must pass.\n\n2. Run the comprehensive grep to catch what typecheck misses:\n```\ngrep -r \"SkillDefinition\\|SkillRegistry\\|skillFactory\\|CliSkill\\|skillId\\|RouteModule\\.skills\\|formatSkillHelp\\|fetchSkills\\|loadPackageSkills\\|PackageSkill\\|SkillHandler\\|SkillStreamHandler\" daemon/ lib/ cli/ tests/\n```\nReport any remaining hits (there should be zero).\n\n3. Check the DAB spec (`.lore/specs/infrastructure/daemon-application-boundary.md`) and spot-check renamed files for consistency between spec terminology and code naming. Specifically check:\n   - CLI layer (`cli/resolve.ts`, `cli/index.ts`) — local types not caught by typecheck\n   - Manager toolbox string literals (`daemon/services/manager/toolbox.ts`) — not caught by typecheck or lint\n   - Help route wire format (`daemon/routes/help.ts`) — response JSON field names\n\n4. Verify the agent injection removal (Step 1 work):\n   - `formatSkillDiscoveryContext` should not exist anywhere\n   - `isCommandAllowed` should not exist anywhere\n   - `SessionPrepDeps` should not have `skillRegistry`\n\n5. Check CLAUDE.md for correct \"skill\" vs \"operation\" usage — \"skill\" should only appear for Claude Code skills, not daemon capabilities.\n\nReport all findings with actual impact. Do not suppress anything as pre-existing.\n\nSpec: `.lore/specs/infrastructure/daemon-application-boundary.md`\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies:
  - commission-Octavia-20260317-203609
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T03:36:20.739Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:36:20.741Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
