---
title: "Commission: Skill-to-Operations: Lore docs + CLAUDE.md (Steps 10-11)"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Execute Steps 10 and 11 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\n**Step 10 — Lore documents:**\n\nRename files:\n- `.lore/design/skill-contract.md` → `.lore/design/operation-contract.md`\n- `.lore/design/package-skill-handler.md` → `.lore/design/package-operation-handler.md`\n\nUpdate content in active specs and design docs:\n- `.lore/specs/infrastructure/cli-progressive-discovery.md` — heaviest rewrite. Replace `SkillDefinition`/`SkillRegistry`/`skillFactory`/`skillId` with operations equivalents. Update references to retired REQ-DAB-7 through -12 to the new REQ-DAB-16 through -20. Replace \"skill\" with \"operation\" when referring to daemon capabilities. Keep \"skill\" when referring to Claude Code skills.\n- Run `grep -r \"SkillDefinition\\|SkillRegistry\\|skillFactory\\|skillId\" .lore/` to find full scope\n- For historical records (completed plans, notes, archive): update stale file paths but don't rewrite the narrative. Add a note if a path reference changed.\n\n**Step 11 — CLAUDE.md:**\n- Update terminology where \"skill\" means daemon capability → \"operation\"\n- **Do not change** \"skill\" where it refers to Claude Code skills (e.g., \"the guild-hall-writer package contains a `cleanup-commissions` skill as the first domain plugin\" is correct as-is)\n\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies:
  - commission-Dalton-20260317-203556
linked_artifacts:
  - .lore/specs/infrastructure/cli-progressive-discovery.md

  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/ui/commit-lore-from-web.md
  - .lore/specs/commissions/commission-status-tool.md
  - .lore/design/operation-contract.md
  - .lore/design/package-operation-handler.md
  - .lore/design/daemon-rest-api.md
  - CLAUDE.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/ui/commit-lore-from-web.md
  - .lore/specs/commissions/commission-status-tool.md
  - .lore/design/operation-contract.md
  - .lore/design/package-operation-handler.md
  - .lore/design/daemon-rest-api.md
  - CLAUDE.md
activity_timeline:
  - timestamp: 2026-03-18T03:36:09.126Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:36:09.127Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T03:59:25.911Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T03:59:25.913Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T03:59:25.953Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T03:59:39.963Z
    event: progress_report
    reason: "Starting Steps 10-11. Reading all affected files to understand scope before making changes."
  - timestamp: 2026-03-18T04:00:15.984Z
    event: progress_report
    reason: "Read all affected files. Now starting Step 10: renaming lore design files and updating content across specs, plans, and historical docs."
  - timestamp: 2026-03-18T04:04:05.636Z
    event: progress_report
    reason: "CLI progressive discovery spec fully rewritten. DAB spec, commit-lore spec, commission-status-tool spec, daemon-rest-api design, brainstorm, issues, and notes updated. Now updating historical plans with path reference fixes."
  - timestamp: 2026-03-18T04:06:47.457Z
    event: progress_report
    reason: "Steps 10-11 complete. All lore documents and CLAUDE.md updated. Running final verification grep to confirm no missed references in active documents."
  - timestamp: 2026-03-18T04:07:44.291Z
    event: result_submitted
    reason: "Completed Steps 10 and 11 of the skill-to-operations rename plan.\n\n**Step 10 (Lore documents):**\n\nFile renames (2):\n- `.lore/design/skill-contract.md` → `.lore/design/operation-contract.md`\n- `.lore/design/package-skill-handler.md` → `.lore/design/package-operation-handler.md`\n\nActive spec/design content updates (6 files):\n- `.lore/specs/infrastructure/cli-progressive-discovery.md` — Full rewrite. All `SkillDefinition`/`SkillRegistry`/`skillFactory`/`skillId` → operations equivalents. REQ-DAB-8 → REQ-DAB-18, REQ-DAB-11 → REQ-DAB-20, REQ-DAB-12 removed (concept retired). \"Skill\" → \"operation\" throughout for daemon capabilities. File path references updated.\n- `.lore/specs/infrastructure/daemon-application-boundary.md` — Terminology section updated to reflect completed rename. Revision history updated to record the rename as done.\n- `.lore/specs/ui/commit-lore-from-web.md` — `SkillDefinition`/`skillId` → `OperationDefinition`/`operationId` in REQ-CLORE-6 and REQ-CLORE-10.\n- `.lore/specs/commissions/commission-status-tool.md` — `skillId` → `operationId` in REQ-CST-2.\n- `.lore/design/daemon-rest-api.md` — `skillId` → `operationId` in JSON examples and prose.\n- `.lore/brainstorm/growth-surface-2026-03-17.md` — Updated file paths and type names in two sections.\n\nHistorical doc updates (stale-path notes, 7 files):\n- `.lore/design/operation-contract.md` — Title updated, stale-terminology note added. Code examples left as historical.\n- `.lore/design/package-operation-handler.md` — Title updated, stale-terminology note added, frontmatter paths fixed.\n- `.lore/plans/infrastructure/cli-progressive-discovery.md` — Stale-terminology note added, frontmatter paths fixed, spec references updated.\n- `.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md` — Stale-terminology note added.\n- `.lore/plans/infrastructure/daemon-application-boundary.md` — Stale-terminology note added.\n- `.lore/plans/ui/commit-lore-from-web.md` — Type names and code examples updated.\n- `.lore/plans/ui/dashboard-selection-model.md` — `SkillDefinition` → `OperationDefinition`.\n\nOther updates (3 files):\n- `.lore/notes/test-duplication-audit.md` — `SkillRegistry` → `OperationsRegistry`, `package-skills.test.ts` → `package-operations.test.ts`.\n- `.lore/issues/operations-loader-should-derive-from-toolbox-factory.md` — Removed stale `skillFactory` parenthetical and rename plan reference.\n- `.lore/_archive/notes/cli-progressive-discovery.md` — Phase 1 dispatch updated with current file/type names.\n- `.lore/plans/infrastructure/skill-to-operations-rename.md` — Frontmatter path updated.\n\nCommission artifacts and meeting artifacts left as-is (historical narrative).\n\n**Step 11 (CLAUDE.md):**\n\nUpdated the architecture description to replace \"CLI-shaped skills\" / \"human and agent capabilities converge\" language with the new model: agents use MCP tools via the toolbox system, humans use CLI/web via OperationsRegistry. The \"cleanup-commissions skill\" reference correctly left unchanged (it's a Claude Code skill)."
  - timestamp: 2026-03-18T04:07:50.276Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Steps 10-11 complete. All lore documents and CLAUDE.md updated. Running final verification grep to confirm no missed references in active documents."
projectName: guild-hall
---
Completed Steps 10 and 11 of the skill-to-operations rename plan.

**Step 10 (Lore documents):**

File renames (2):
- `.lore/design/skill-contract.md` → `.lore/design/operation-contract.md`
- `.lore/design/package-skill-handler.md` → `.lore/design/package-operation-handler.md`

Active spec/design content updates (6 files):
- `.lore/specs/infrastructure/cli-progressive-discovery.md` — Full rewrite. All `SkillDefinition`/`SkillRegistry`/`skillFactory`/`skillId` → operations equivalents. REQ-DAB-8 → REQ-DAB-18, REQ-DAB-11 → REQ-DAB-20, REQ-DAB-12 removed (concept retired). "Skill" → "operation" throughout for daemon capabilities. File path references updated.
- `.lore/specs/infrastructure/daemon-application-boundary.md` — Terminology section updated to reflect completed rename. Revision history updated to record the rename as done.
- `.lore/specs/ui/commit-lore-from-web.md` — `SkillDefinition`/`skillId` → `OperationDefinition`/`operationId` in REQ-CLORE-6 and REQ-CLORE-10.
- `.lore/specs/commissions/commission-status-tool.md` — `skillId` → `operationId` in REQ-CST-2.
- `.lore/design/daemon-rest-api.md` — `skillId` → `operationId` in JSON examples and prose.
- `.lore/brainstorm/growth-surface-2026-03-17.md` — Updated file paths and type names in two sections.

Historical doc updates (stale-path notes, 7 files):
- `.lore/design/operation-contract.md` — Title updated, stale-terminology note added. Code examples left as historical.
- `.lore/design/package-operation-handler.md` — Title updated, stale-terminology note added, frontmatter paths fixed.
- `.lore/plans/infrastructure/cli-progressive-discovery.md` — Stale-terminology note added, frontmatter paths fixed, spec references updated.
- `.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md` — Stale-terminology note added.
- `.lore/plans/infrastructure/daemon-application-boundary.md` — Stale-terminology note added.
- `.lore/plans/ui/commit-lore-from-web.md` — Type names and code examples updated.
- `.lore/plans/ui/dashboard-selection-model.md` — `SkillDefinition` → `OperationDefinition`.

Other updates (3 files):
- `.lore/notes/test-duplication-audit.md` — `SkillRegistry` → `OperationsRegistry`, `package-skills.test.ts` → `package-operations.test.ts`.
- `.lore/issues/operations-loader-should-derive-from-toolbox-factory.md` — Removed stale `skillFactory` parenthetical and rename plan reference.
- `.lore/_archive/notes/cli-progressive-discovery.md` — Phase 1 dispatch updated with current file/type names.
- `.lore/plans/infrastructure/skill-to-operations-rename.md` — Frontmatter path updated.

Commission artifacts and meeting artifacts left as-is (historical narrative).

**Step 11 (CLAUDE.md):**

Updated the architecture description to replace "CLI-shaped skills" / "human and agent capabilities converge" language with the new model: agents use MCP tools via the toolbox system, humans use CLI/web via OperationsRegistry. The "cleanup-commissions skill" reference correctly left unchanged (it's a Claude Code skill).
