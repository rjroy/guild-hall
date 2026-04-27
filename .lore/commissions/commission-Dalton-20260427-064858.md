---
title: "Commission: Lore restructure phase 2: path helpers and dual-read merge"
date: 2026-04-27
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Context\n\nImplementing **phase 2 of 4** of the lore directory restructure. Spec: `.lore/specs/infrastructure/lore-directory-restructure.md`. Discovery: `.lore/issues/lore-directory-restructure-discovery.md`.\n\nPhase 1 (foundation: classification + grouping) was implemented in `commission-Dalton-20260427-064804` and reviewed in `commission-Thorne-20260427-064828`.\n\n## Step 0: Address Phase 1 Review Findings First\n\n**BEFORE writing any phase 2 code**, read Thorne's review (commission ID `commission-Thorne-20260427-064828` — find the review body in its commission record). Address EVERY finding flagged: blocker, major, AND minor. Do not triage. Do not defer. If Thorne flagged it, fix it as the first step of this commission, then proceed to phase 2.\n\nIf Thorne flagged the review as PASS with zero findings, note that in your result and proceed.\n\n## In Scope (Phase 2)\n\nImplement these requirements:\n\n- **REQ-LDR-5**: New write-path helper. Decide its name and location (likely `lib/paths.ts`). Commission writes resolve to `.lore/work/commissions/<id>.md`. Meeting writes to `.lore/work/meetings/<id>.md`. Issue writes to `.lore/work/issues/<filename>`. Every existing write-side site that hand-composes these paths must switch to it (sites are listed in REQ-LDR-22 and similar; you do those wirings in phase 3 — for phase 2 just create and export the helper).\n- **REQ-LDR-6**: Update `lib/paths.ts:commissionArtifactPath` to return the new `.lore/work/commissions/<id>.md` path. Add a read-side dual-layout resolver: if the new path does not exist, fall back to flat. The fallback is read-only.\n- **REQ-LDR-7**: Add `meetingArtifactPath(projectPath, meetingId)` with the same dual-layout read behavior.\n- **REQ-LDR-8**: `resolveCommissionBasePath` and `resolveMeetingBasePath` stay layout-neutral. Confirm callers compose through the new helpers, not by hand-joining.\n- **REQ-LDR-9**: `lib/artifacts.ts:scanArtifacts` already walks recursively. Confirm it produces `relativePath: \"work/specs/foo.md\"` for nested files; no code change expected unless current code excludes `work/`. Document confirmation in your result.\n- **REQ-LDR-10**: `lib/artifacts.ts:recentArtifacts` filters by canonical type label (`meta.type !== \"Commission\"` etc.), not raw segment. Update if currently filtering by raw segment.\n- **REQ-LDR-11**: `lib/commissions.ts:scanCommissions` reads from BOTH `.lore/work/commissions/` and `.lore/commissions/`. Merge results. Duplicate IDs prefer the `work/` copy.\n- **REQ-LDR-12**: `lib/meetings.ts:scanMeetings` follows the same dual-read merge.\n- **REQ-LDR-13**: Daemon meeting routes (`apps/daemon/routes/meetings.ts:333, 366`) and any other direct readers of `.lore/meetings/` resolve through the dual-read helpers.\n- **REQ-LDR-14**: Workspace issue list (`apps/daemon/routes/workspace-issue.ts`) merges `.lore/issues/` and `.lore/work/issues/` on read. Workspace issue read accepts either layout. Do NOT change the create write path here — that's REQ-LDR-24, phase 3.\n- **REQ-LDR-37**: Tests for dual-read merge in `scanCommissions`, `scanMeetings`, and the workspace issue list route. Fixtures contain artifacts in both layouts. Verify both surface and that duplicate IDs prefer `work/`.\n\n## Out of Scope (Phase 3 / 4)\n\nDo NOT touch:\n- Daemon write sites: `manager/toolbox.ts`, `commission/orchestrator.ts`, `meeting/record.ts`, `outcome-triage.ts`, `workspace-issue.ts` create handler — phase 3\n- Daemon route prefix detection in `routes/artifacts.ts` — phase 3\n- Web UI prefix checks — phase 3\n- LLM-facing strings (briefing prompt, tool descriptions, postures, skills, CLI help) — phase 4\n\nIf a daemon write site needs to be updated to call your new helper, leave a TODO comment naming the requirement (REQ-LDR-22 etc.); phase 3 will pick it up.\n\n## Verification\n\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nAll tests must pass — flat-layout AND new dual-read tests.\n\n## Report\n\n1. Phase 1 fix summary: which findings you addressed, how. If no findings, say so.\n2. Phase 2 diff summary.\n3. Test delta.\n4. Any deviations from the spec with rationale."
dependencies:
  - commission-Thorne-20260427-064828
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-27T13:48:58.723Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:48:58.725Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-27T13:56:32.355Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-27T13:56:32.357Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
