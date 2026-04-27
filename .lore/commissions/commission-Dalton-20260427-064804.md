---
title: "Commission: Lore restructure phase 1: classification and grouping foundation"
date: 2026-04-27
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Context\n\nImplementing **phase 1 of 4** of the lore directory restructure. Spec: `.lore/specs/infrastructure/lore-directory-restructure.md` (40 requirements, READ THE WHOLE SPEC before starting). Discovery: `.lore/issues/lore-directory-restructure-discovery.md`.\n\nThe restructure introduces `.lore/work/<type>/` as the new home for in-flight artifacts (specs, plans, brainstorm, design, retros, reviews, issues, notes, research, commissions, meetings) alongside the existing flat `.lore/<type>/` layout. Coexistence is permanent: both layouts must be readable. New writes go under `work/`. Type classification peels a leading `work/` segment so consumers see one canonical type label.\n\nThis phase delivers the **classification choke point**. Every later phase depends on it being correct.\n\n## In Scope\n\nImplement these requirements only:\n\n- **REQ-LDR-1**: Add `learned: \"Learned\"` to `lib/types.ts:TYPE_LABELS`. Preserve all other entries unchanged.\n- **REQ-LDR-2**: Update `lib/types.ts:artifactTypeSegment(relativePath)` to peel a single leading `work/` segment before extracting the type segment.\n- **REQ-LDR-3**: Unknown second segments under `work/` (e.g., `work/foo/bar.md`) return the raw second segment as-is, matching flat-layout behavior for unknown segments.\n- **REQ-LDR-4**: Root-level files continue to return `null`. `.lore/generated/` continues to return `\"generated\"` raw segment.\n- **REQ-LDR-15**: Update `lib/artifact-grouping.ts:groupKey(relativePath)` to peel a leading `work/` segment.\n- **REQ-LDR-16**: Update `lib/artifact-grouping.ts:buildArtifactTree` so `work/` is peeled at the top level. No top-level `Work` group.\n- **REQ-LDR-17**: Confirm `lib/artifact-smart-view.ts` does NOT add `work` to its sets. Smart-view consumes canonical labels from `artifactTypeSegment`, which already peels `work/`. No code change here unless a real bug surfaces; document the decision in your result.\n- **REQ-LDR-35**: Existing flat-layout tests must continue to pass without modification.\n- **REQ-LDR-36**: New tests for peel behavior in `artifactTypeSegment` (work prefix peeled, double-prefixed paths like `work/work/foo.md`, unknown second segments, root-level files, `learned` label).\n- **REQ-LDR-39**: New tests for `groupKey` and `buildArtifactTree` with mixed-layout artifact lists. The tree must show a single `Specs` group when both `specs/foo.md` and `work/specs/bar.md` are present.\n\n## Out of Scope (Later Phases)\n\nDo NOT touch in this phase:\n- `lib/paths.ts` (helpers for write paths) — phase 2\n- `lib/artifacts.ts:scanArtifacts` and `recentArtifacts` — phase 2\n- `lib/commissions.ts:scanCommissions`, `lib/meetings.ts:scanMeetings` — phase 2\n- Any `apps/daemon/services/` or `apps/daemon/routes/` files — phase 3\n- LLM-facing strings (briefing prompt, tool descriptions, postures, skills, CLI help) — phase 4\n\nIf you find yourself editing files outside `lib/types.ts`, `lib/artifact-grouping.ts`, and the corresponding test files, stop and reconsider.\n\n## Verification\n\nRun before declaring complete:\n```bash\nbun run typecheck\nbun run lint\nbun test lib/tests/\n```\n\nReport:\n1. The diff summary (files changed, lines added/removed).\n2. Test count delta (how many new tests, total tests passing).\n3. Any deviations from the spec with rationale.\n\nDo not amend the spec or rewrite anything outside the listed requirements. If the spec is wrong, flag it; do not fix it silently."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-27T13:48:04.498Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:48:04.500Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
