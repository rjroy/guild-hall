---
title: "Commission: Thorne review: lore restructure phase 1 (foundation)"
date: 2026-04-27
status: dispatched
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "## Task\n\nReview **phase 1** of the lore directory restructure. Spec: `.lore/specs/infrastructure/lore-directory-restructure.md`. Phase 1 commission: `commission-Dalton-20260427-064804`.\n\nThis is the foundation phase. Every subsequent phase depends on the classification and grouping logic being correct, so flag everything that could compound downstream.\n\n## Files Expected to Change\n\n- `lib/types.ts` — `TYPE_LABELS` and `artifactTypeSegment` updated.\n- `lib/artifact-grouping.ts` — `groupKey` and `buildArtifactTree` updated to peel `work/`.\n- `lib/tests/types.test.ts` (or wherever `artifactTypeSegment` is currently tested) — new peel tests.\n- `lib/tests/artifact-grouping.test.ts` — new tree-merge tests.\n- Possibly `lib/artifact-smart-view.ts` — confirm it stays untouched (REQ-LDR-17).\n\nIf files OUTSIDE this list changed, flag them. Foundation phase scope creep is the most expensive class of bug here.\n\n## Requirements to Verify\n\nREQ-LDR-1, REQ-LDR-2, REQ-LDR-3, REQ-LDR-4, REQ-LDR-15, REQ-LDR-16, REQ-LDR-17, REQ-LDR-35, REQ-LDR-36, REQ-LDR-39.\n\nFor each requirement, state: PASS / FAIL / PARTIAL with file:line evidence.\n\n## Specific Things to Check\n\n1. **Peel correctness.** Does `artifactTypeSegment(\"work/specs/foo.md\")` return `\"Spec\"`? Does `artifactTypeSegment(\"work/learned/lesson.md\")` return `\"Learned\"`? Does it correctly handle edge cases — `work/` (no second segment), `work/foo.md` (one segment after work), root-level files, `_archive/work/specs/foo.md` (work not at root)?\n\n2. **Coexistence preserved.** `artifactTypeSegment(\"specs/foo.md\")` still returns `\"Spec\"`. Existing tests pass without modification.\n\n3. **Single-axis classification.** Nothing surfaces `work` as a layout group label anywhere. The peel happens at one place (the type-segment function and the group-key function); no caller is forced to handle layout group as a separate concern.\n\n4. **Tree merge.** Given mixed-layout input (`specs/foo.md` + `work/specs/bar.md`), does `buildArtifactTree` produce ONE `Specs` group containing both? No top-level `Work` group?\n\n5. **Smart-view untouched.** `lib/artifact-smart-view.ts` should not have added `work` to `EXCLUDED_DIRECTORIES`, `GENERATIVE_INVESTIGATION_SEGMENTS`, or `WORK_ITEM_SEGMENTS`. If it was added, that is a FAIL — it would incorrectly classify peeled-but-still-`work`-prefixed labels.\n\n6. **Test coverage gaps.** Are there obvious peel cases the tests miss? Specifically: double prefix, unknown second segment, root files, `learned` label, the new tree-merge case.\n\n7. **Pre-commit hook.** All four checks (typecheck, lint, tests, production build) must have passed when the commission committed. Verify this.\n\n8. **Memory section refresh.** No memory writes belong in this phase.\n\n## Output\n\nYou cannot write files. Provide your review as the commission result body. Structure it as:\n\n1. **Verdict** — PASS / FAIL / PARTIAL.\n2. **Per-requirement table** — REQ-ID | status | file:line evidence.\n3. **Findings** — numbered list. Each finding: severity (blocker/major/minor), file:line, description, recommended fix. INCLUDE EVERY FINDING. Do not triage. Do not pre-filter \"minor\" issues. The Guild Master decides what gets fixed.\n4. **Scope adherence** — confirm only in-scope files changed.\n\nFindings will become the input to the phase 2 fix work. Be precise about file:line because phase 2 will inline-fix what you flag."
dependencies:
  - commission-Dalton-20260427-064804
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-27T13:48:28.105Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:48:28.109Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-27T13:51:50.549Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-27T13:51:50.552Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
