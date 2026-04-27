---
title: "Commission: Lore restructure phase 3: daemon write paths and route prefixes"
date: 2026-04-27
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Context\n\nImplementing **phase 3 of 4** of the lore directory restructure. Spec: `.lore/specs/infrastructure/lore-directory-restructure.md`. Discovery: `.lore/issues/lore-directory-restructure-discovery.md`.\n\nPhases 1 and 2 are complete:\n- Phase 1 (`commission-Dalton-20260427-064804`): classification + grouping foundation.\n- Phase 1 review (`commission-Thorne-20260427-064828`).\n- Phase 2 (`commission-Dalton-20260427-064858`): path helpers + dual-read merge + phase 1 fixes.\n\nPhase 2 introduced helpers (`commissionArtifactPath`, `meetingArtifactPath`, and a generic `workArtifactPath`-style helper per REQ-LDR-5). Read-side merging is in place. Now we wire the write side and the route prefix detection.\n\n## In Scope (Phase 3)\n\nImplement these requirements:\n\n- **REQ-LDR-18**: `apps/daemon/routes/artifacts.ts` prefix detection (currently lines 111-121) recognizes `work/meetings/` and `work/commissions/` alongside flat `meetings/` and `commissions/`. The branch chosen routes to the meeting / commission base-path resolver.\n- **REQ-LDR-19**: Web UI prefix checks recognize both flat and `work/` layouts:\n  - `apps/web/app/projects/[name]/artifacts/[...path]/page.tsx`\n  - `apps/web/components/dashboard/RecentArtifacts.tsx`\n  - `apps/web/components/project/MeetingList.tsx`\n  Logic that prepends `meetings/` to a meeting filename now targets `work/meetings/` for newly-created meetings; reads still accept flat paths.\n- **REQ-LDR-20**: Manager toolbox commission and meeting writes (`apps/daemon/services/manager/toolbox.ts:418, 664, 698`) target `.lore/work/commissions/` and `.lore/work/meetings/` via the helpers from REQ-LDR-5.\n- **REQ-LDR-21**: Meeting record (`apps/daemon/services/meeting/record.ts:44`) writes to `.lore/work/meetings/<id>.md`.\n- **REQ-LDR-22**: Commission orchestrator writes (`apps/daemon/services/commission/orchestrator.ts:348, 653, 1019`) target `.lore/work/commissions/`. Remove flat-path knowledge from the write side.\n- **REQ-LDR-23**: Outcome triage (`apps/daemon/services/outcome-triage.ts:206, 212, 232`) computes its activity-type subdirectory under `.lore/work/`. Triage reads use dual-read helpers; triage writes target the new location.\n- **REQ-LDR-24**: Workspace issue create (`apps/daemon/routes/workspace-issue.ts:118`) creates `.lore/work/issues/` lazily and writes new issues there.\n- **REQ-LDR-38**: Tests for dual-write behavior at every daemon write site listed above. Assertions verify the new path is written and the flat path is not.\n- **REQ-LDR-40**: Tests for daemon route prefix detection covering `work/meetings/` and `work/commissions/`.\n\n## Important Constraints\n\n- The phase 2 helpers from REQ-LDR-5 / REQ-LDR-6 / REQ-LDR-7 are the single source of truth for write paths. DO NOT hand-compose `path.join(..., \".lore\", \"commissions\", ...)` anywhere in this phase. Every write call goes through a helper.\n- Flat-layout reads must continue to work after this phase. The phase 2 dual-read merge handles listing; this phase removes flat-path **writes**, not reads.\n- Squash-merge auto-resolution (REQ-LDR-25) and sparse checkout (REQ-LDR-26) require no code change; do not edit those files.\n\n## Out of Scope (Phase 4)\n\nDo NOT touch:\n- LLM-facing strings: briefing prompt, manager/meeting toolbox tool descriptions, workspace-issue operation descriptions, worker postures (`packages/guild-hall-*/posture.md`), worker skills (`packages/guild-hall-writer/plugin/skills/`, `packages/guild-compendium/plugin/skills/`), CLI help (`apps/cli/surface.ts`, `apps/cli/help.ts`).\n- The `add_heartbeat_entry` description (REQ-LDR-29 — no change needed; root file).\n- The web \"discuss artifact\" prompt at `CreateMeetingButton.tsx:26` (REQ-LDR-34 — no change needed).\n\n## Verification\n\n```bash\nbun run typecheck\nbun run lint\nbun test\n```\n\nRun an end-to-end commission and meeting smoke test if reasonable; otherwise flag in report.\n\n## Report\n\n1. Diff summary by file.\n2. Confirmation that NO `path.join(..., \".lore\", \"commissions\"|\"meetings\"|\"issues\", ...)` survives at write sites. Provide the grep output.\n3. Test delta.\n4. Any deviations from the spec with rationale."
dependencies:
  - commission-Dalton-20260427-064858
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-27T13:49:25.389Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:49:25.390Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-27T14:20:49.228Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-27T14:20:49.231Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
