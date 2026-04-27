---
title: "Commission: Thorne review: lore restructure phase 1 (foundation)"
date: 2026-04-27
status: completed
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
  - timestamp: 2026-04-27T13:51:50.602Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-27T13:52:15.901Z
    event: progress_report
    reason: "Read spec and commission scope. Pulling diff for phase 1 changes across types.ts, artifact-grouping.ts, and tests."
  - timestamp: 2026-04-27T13:55:14.902Z
    event: progress_report
    reason: "Review complete. Verdict PASS. Drafting submit_result with per-requirement table and findings."
  - timestamp: 2026-04-27T13:56:21.550Z
    event: result_submitted
    reason: "## Verdict: PASS\n\nPhase 1 of the lore directory restructure correctly establishes single-axis classification with `work/` peeling. All 10 in-scope requirements satisfied. Implementation is small (4 files, +193/-9), test coverage matches spec, scope adherence is clean. Pre-commit gate verified locally (typecheck clean, ESLint clean, 108 phase-1 tests pass). Findings below are minor edge-case observations and one latent risk for downstream phases; nothing blocks Phase 2.\n\n## Per-requirement table\n\n| REQ-ID | Status | Evidence |\n| --- | --- | --- |\n| REQ-LDR-1 | PASS | `lib/types.ts:366` — `learned: \"Learned\",` added between `reference` and `notes`. Existing entries unchanged (verified at `lib/types.ts:357-372`). Test: `lib/tests/types.test.ts:172-189`. |\n| REQ-LDR-2 | PASS | `lib/types.ts:382-388` — peels single leading `work/`, then extracts type segment. `work/specs/foo.md`→`\"Spec\"`, `work/learned/lesson.md`→`\"Learned\"`, `work/foo.md`→`null`, `work/`→`null`. Tests: `lib/tests/types.test.ts:213-228`, `230-232`. |\n| REQ-LDR-3 | PASS | `lib/types.ts:388` — `(rawType && rawType in TYPE_LABELS) ? TYPE_LABELS[rawType] : rawType`. Unknown second segment surfaces raw. Test: `lib/tests/types.test.ts:234-237`. |\n| REQ-LDR-4 | PASS | `lib/types.ts:386-387` — single-segment paths return `null`. Tests: `lib/tests/types.test.ts:200-205` (heartbeat/lore-config/lore-agents/vision); `lib/tests/types.test.ts:207-210` (`generated/foo.md`→`\"generated\"`). |\n| REQ-LDR-15 | PASS | `lib/artifact-grouping.ts:10-17` — peels `work/` before extracting first segment. `work/specs/foo.md`→`\"specs\"`. Test: `lib/tests/artifact-grouping.test.ts:45-49`. |\n| REQ-LDR-16 | PASS | `lib/artifact-grouping.ts:187-193` — peels `work/` for top-level grouping; leaf preserves original `relativePath` (verified `lib/artifact-grouping.ts:101`). Tree-merge test: `lib/tests/artifact-grouping.test.ts:494-513`; no-Work-group test: `516-531`. |\n| REQ-LDR-17 | PASS | `lib/artifact-smart-view.ts` is unmodified by this commit (verified via `git diff 69633a8c^ 69633a8c --stat`). `EXCLUDED_DIRECTORIES` (line 18), `GENERATIVE_INVESTIGATION_SEGMENTS` (line 21), `WORK_ITEM_SEGMENTS` (line 24) all unchanged. (See finding F1 for a related latent issue in the same file.) |\n| REQ-LDR-35 | PASS | Diff shows additions only to `lib/tests/types.test.ts` and `lib/tests/artifact-grouping.test.ts`; no deletions or rewrites of existing test bodies. All prior tests still pass (108 total in the two files). |\n| REQ-LDR-36 | PASS | Coverage in `lib/tests/types.test.ts:191-249`: peel (213-228), `learned` label (230-232), `work/` no second segment (234-235), unknown second segment (237-240), root files (200-205), double-prefix (243-247). |\n| REQ-LDR-39 | PASS | `lib/tests/artifact-grouping.test.ts:494-513` (mixed-layout merges into single `Specs` group with both leaves); `516-531` (asserts no top-level `work`/`Work` group across multiple types); `533-547` (`work/`-only artifact still creates peeled group). |\n\n## Findings\n\nNumbered. Listed by severity, then by file order. Phase 2 may inline-fix any of these.\n\n### F1 — major (latent) — `artifactDomain` in smart-view does not peel `work/`\n\n- **Where:** `lib/artifact-smart-view.ts:43-48`.\n- **What:** `artifactDomain(relativePath)` returns `capitalize(parts[1])` from a raw `relativePath.split(\"/\")`. For flat-layout `specs/cli/foo.md` it returns `\"Cli\"`. For new-layout `work/specs/cli/foo.md` it would return `\"Specs\"`, which is the type, not the domain. Three-segment new-layout paths (`work/specs/foo.md`) would return `\"Foo.md\"`-style garbage where flat `specs/foo.md` correctly returns `null`.\n- **Why it matters:** REQ-LDR-17 narrowly protects the three sets (`EXCLUDED_DIRECTORIES`, `GENERATIVE_INVESTIGATION_SEGMENTS`, `WORK_ITEM_SEGMENTS`) and explicitly notes that smart-view \"continues to consume canonical labels from `artifactTypeSegment`.\" `artifactDomain` does **not** consume `artifactTypeSegment`; it parses the path independently. No bug surfaces in Phase 1 because no `work/`-prefixed artifacts exist on disk yet — but the moment write-side phases land (REQ-LDR-20+), every `work/`-prefixed artifact reaching this function will misclassify. `artifactDomain` is consumed by `apps/web/components/project/ArtifactList.tsx` and the smart-view filters; the misclassification propagates to UI.\n- **In scope for Phase 1?** No. Phase 1 commission scope says smart-view stays untouched, and the behavioral break only triggers when writes flip.\n- **Recommended fix (Phase 2+):** Peel `work/` once at the top of `artifactDomain` (mirror the existing pattern in `artifactTypeSegment`/`groupKey`), or refactor `artifactDomain` to reuse `artifactTypeSegment`'s peel helper. Add a test for `work/specs/cli/foo.md` → `\"Cli\"`. Track this so it lands before any write site is migrated to `work/`.\n\n### F2 — minor — Double-prefix edge case surfaces \"work\" as a label and as a top-level group\n\n- **Where:** `lib/types.ts:382-388`, `lib/artifact-grouping.ts:10-17`.\n- **What:** `artifactTypeSegment(\"work/work/foo.md\")` returns `\"work\"` (raw), and `groupKey(\"work/work/foo.md\")` returns `\"work\"`. The implementation faithfully follows single-peel + REQ-LDR-3 (unknown raw segment surfaces). The tests at `lib/tests/types.test.ts:243-247` and `lib/tests/artifact-grouping.test.ts:55-58` lock this behavior in.\n- **Why it matters:** REQ-LDR-2 says \"`work/` is not a recognized type and never appears as a label.\" REQ-LDR-16 says \"never `Work` as a top-level group.\" Both assertions are violated for the malformed double-prefix case. The malformed path is unlikely in practice — Guild Hall never writes `work/work/...` — but the spec's blanket guarantee is technically false as currently coded.\n- **Recommended fix:** Either (a) add a guard in both `artifactTypeSegment` and `groupKey` that maps `rawType === \"work\"` to `null`/`\"root\"` after peeling, restoring the spec's blanket guarantee; or (b) clarify the spec to scope the guarantee to \"well-formed\" paths, matching current behavior. The codified test currently constrains the team to (b).\n\n### F3 — minor — Test gap: `artifactTypeSegment(\"\")` and `groupKey(\"\")` not exercised\n\n- **Where:** `lib/tests/types.test.ts`, `lib/tests/artifact-grouping.test.ts`.\n- **What:** Empty-string input. `artifactTypeSegment(\"\")` returns `null` (peeled = `\"\"`, `slash = -1`); `groupKey(\"\")` returns `\"root\"` (test at line 41-43 covers `groupKey(\"\")` already, but `artifactTypeSegment(\"\")` has no explicit assertion). REQ-LDR-36 listed peel cases by category; empty-input isn't one of them.\n- **Why it matters:** Behavior is correct today, but downstream changes that touch peel logic could regress this without notice.\n- **Recommended fix:** Add `expect(artifactTypeSegment(\"\")).toBeNull();` to the root-files block.\n\n### F4 — minor — Test gap: `artifactTypeSegment(\"work/\")` (trailing slash, no body) not exercised\n\n- **Where:** `lib/tests/types.test.ts:230-232`.\n- **What:** Test covers `work/foo.md` (REQ-LDR-2's \"no second segment\" case) but not `work/` itself. Behavior is correct (`peeled = \"\"`, `slash = -1`, returns `null`), just untested.\n- **Recommended fix:** Add `expect(artifactTypeSegment(\"work/\")).toBeNull();`.\n\n### F5 — minor — Comment example in `groupKey` JSDoc omits `notes.md → \"root\"` ambiguity\n\n- **Where:** `lib/artifact-grouping.ts:8`.\n- **What:** Example reads `\"notes.md\" -> \"root\"`. With `learned` now in `TYPE_LABELS`, a reader skimming the example might confuse `notes.md` (root file) with `notes/` (the typed directory). Existing convention; not a Phase 1 regression.\n- **Recommended fix:** Optional. Either replace the example with one less collisional (`README.md → \"root\"`) or leave as-is. Low priority.\n\n### F6 — minor — Intermediate directory `path` field in tree built from `work/`-prefixed artifacts is non-canonical\n\n- **Where:** `lib/artifact-grouping.ts:86-141` (`insertArtifact`), called with peeled `segments`.\n- **What:** For a hypothetical `work/specs/cli/foo.md`, the intermediate `cli` directory node gets `path: \"specs/cli\"` (not `\"work/specs/cli\"`). The leaf node correctly preserves `artifact.relativePath = \"work/specs/cli/foo.md\"`. No current test covers a three-segment-after-peel new-layout artifact, so this isn't exercised.\n- **Why it matters:** If any UI consumer uses the intermediate directory's `path` for filesystem-aware operations (e.g., \"open folder at this path\"), it points to a flat-layout location that may not exist on disk. If it's only used as a display key (probable, given the leaf carries the real path), this is harmless.\n- **Recommended fix:** Add a test asserting intermediate dir paths for a deep `work/`-prefixed artifact, then decide whether to canonicalize the dir path back through `work/` or document that intermediate `path` fields are display-only. Phase 1 commission did not specify deep-tree fixtures.\n\n## Scope adherence\n\nConfirmed in-scope. `git diff 69633a8c^ 69633a8c --stat` shows exactly five files changed in commit `69633a8c`:\n\n- `.lore/commissions/commission-Dalton-20260427-064804.md` — commission record (expected, framework-managed).\n- `lib/types.ts` — REQ-LDR-1, REQ-LDR-2, REQ-LDR-3, REQ-LDR-4. ✓\n- `lib/artifact-grouping.ts` — REQ-LDR-15, REQ-LDR-16. ✓\n- `lib/tests/types.test.ts` — REQ-LDR-36. ✓\n- `lib/tests/artifact-grouping.test.ts` — REQ-LDR-39. ✓\n\nNo files outside the commission's expected list changed. `lib/artifact-smart-view.ts` is untouched (REQ-LDR-17 PASS). No daemon/web/cli/packages changes leaked into Phase 1.\n\n## Pre-commit gate\n\nThe Phase 1 commit (`69633a8c`) exists in the worktree, implying the pre-commit hook passed at commit time. Re-verified locally during this review:\n\n- `bun run typecheck` → clean.\n- `bun run lint` → clean.\n- `bun test lib/tests/types.test.ts lib/tests/artifact-grouping.test.ts` → 108 pass / 0 fail / 250 expects.\n- Production build not re-run in this review (the hook itself ran it; no production wiring changed in Phase 1).\n\n## Memory section refresh\n\nNone needed. Phase 1 is interior `lib/` work with no project-status implications."
  - timestamp: 2026-04-27T13:56:32.053Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Review complete. Verdict PASS. Drafting submit_result with per-requirement table and findings."
projectName: guild-hall
---
## Verdict: PASS

Phase 1 of the lore directory restructure correctly establishes single-axis classification with `work/` peeling. All 10 in-scope requirements satisfied. Implementation is small (4 files, +193/-9), test coverage matches spec, scope adherence is clean. Pre-commit gate verified locally (typecheck clean, ESLint clean, 108 phase-1 tests pass). Findings below are minor edge-case observations and one latent risk for downstream phases; nothing blocks Phase 2.

## Per-requirement table

| REQ-ID | Status | Evidence |
| --- | --- | --- |
| REQ-LDR-1 | PASS | `lib/types.ts:366` — `learned: "Learned",` added between `reference` and `notes`. Existing entries unchanged (verified at `lib/types.ts:357-372`). Test: `lib/tests/types.test.ts:172-189`. |
| REQ-LDR-2 | PASS | `lib/types.ts:382-388` — peels single leading `work/`, then extracts type segment. `work/specs/foo.md`→`"Spec"`, `work/learned/lesson.md`→`"Learned"`, `work/foo.md`→`null`, `work/`→`null`. Tests: `lib/tests/types.test.ts:213-228`, `230-232`. |
| REQ-LDR-3 | PASS | `lib/types.ts:388` — `(rawType && rawType in TYPE_LABELS) ? TYPE_LABELS[rawType] : rawType`. Unknown second segment surfaces raw. Test: `lib/tests/types.test.ts:234-237`. |
| REQ-LDR-4 | PASS | `lib/types.ts:386-387` — single-segment paths return `null`. Tests: `lib/tests/types.test.ts:200-205` (heartbeat/lore-config/lore-agents/vision); `lib/tests/types.test.ts:207-210` (`generated/foo.md`→`"generated"`). |
| REQ-LDR-15 | PASS | `lib/artifact-grouping.ts:10-17` — peels `work/` before extracting first segment. `work/specs/foo.md`→`"specs"`. Test: `lib/tests/artifact-grouping.test.ts:45-49`. |
| REQ-LDR-16 | PASS | `lib/artifact-grouping.ts:187-193` — peels `work/` for top-level grouping; leaf preserves original `relativePath` (verified `lib/artifact-grouping.ts:101`). Tree-merge test: `lib/tests/artifact-grouping.test.ts:494-513`; no-Work-group test: `516-531`. |
| REQ-LDR-17 | PASS | `lib/artifact-smart-view.ts` is unmodified by this commit (verified via `git diff 69633a8c^ 69633a8c --stat`). `EXCLUDED_DIRECTORIES` (line 18), `GENERATIVE_INVESTIGATION_SEGMENTS` (line 21), `WORK_ITEM_SEGMENTS` (line 24) all unchanged. (See finding F1 for a related latent issue in the same file.) |
| REQ-LDR-35 | PASS | Diff shows additions only to `lib/tests/types.test.ts` and `lib/tests/artifact-grouping.test.ts`; no deletions or rewrites of existing test bodies. All prior tests still pass (108 total in the two files). |
| REQ-LDR-36 | PASS | Coverage in `lib/tests/types.test.ts:191-249`: peel (213-228), `learned` label (230-232), `work/` no second segment (234-235), unknown second segment (237-240), root files (200-205), double-prefix (243-247). |
| REQ-LDR-39 | PASS | `lib/tests/artifact-grouping.test.ts:494-513` (mixed-layout merges into single `Specs` group with both leaves); `516-531` (asserts no top-level `work`/`Work` group across multiple types); `533-547` (`work/`-only artifact still creates peeled group). |

## Findings

Numbered. Listed by severity, then by file order. Phase 2 may inline-fix any of these.

### F1 — major (latent) — `artifactDomain` in smart-view does not peel `work/`

- **Where:** `lib/artifact-smart-view.ts:43-48`.
- **What:** `artifactDomain(relativePath)` returns `capitalize(parts[1])` from a raw `relativePath.split("/")`. For flat-layout `specs/cli/foo.md` it returns `"Cli"`. For new-layout `work/specs/cli/foo.md` it would return `"Specs"`, which is the type, not the domain. Three-segment new-layout paths (`work/specs/foo.md`) would return `"Foo.md"`-style garbage where flat `specs/foo.md` correctly returns `null`.
- **Why it matters:** REQ-LDR-17 narrowly protects the three sets (`EXCLUDED_DIRECTORIES`, `GENERATIVE_INVESTIGATION_SEGMENTS`, `WORK_ITEM_SEGMENTS`) and explicitly notes that smart-view "continues to consume canonical labels from `artifactTypeSegment`." `artifactDomain` does **not** consume `artifactTypeSegment`; it parses the path independently. No bug surfaces in Phase 1 because no `work/`-prefixed artifacts exist on disk yet — but the moment write-side phases land (REQ-LDR-20+), every `work/`-prefixed artifact reaching this function will misclassify. `artifactDomain` is consumed by `apps/web/components/project/ArtifactList.tsx` and the smart-view filters; the misclassification propagates to UI.
- **In scope for Phase 1?** No. Phase 1 commission scope says smart-view stays untouched, and the behavioral break only triggers when writes flip.
- **Recommended fix (Phase 2+):** Peel `work/` once at the top of `artifactDomain` (mirror the existing pattern in `artifactTypeSegment`/`groupKey`), or refactor `artifactDomain` to reuse `artifactTypeSegment`'s peel helper. Add a test for `work/specs/cli/foo.md` → `"Cli"`. Track this so it lands before any write site is migrated to `work/`.

### F2 — minor — Double-prefix edge case surfaces "work" as a label and as a top-level group

- **Where:** `lib/types.ts:382-388`, `lib/artifact-grouping.ts:10-17`.
- **What:** `artifactTypeSegment("work/work/foo.md")` returns `"work"` (raw), and `groupKey("work/work/foo.md")` returns `"work"`. The implementation faithfully follows single-peel + REQ-LDR-3 (unknown raw segment surfaces). The tests at `lib/tests/types.test.ts:243-247` and `lib/tests/artifact-grouping.test.ts:55-58` lock this behavior in.
- **Why it matters:** REQ-LDR-2 says "`work/` is not a recognized type and never appears as a label." REQ-LDR-16 says "never `Work` as a top-level group." Both assertions are violated for the malformed double-prefix case. The malformed path is unlikely in practice — Guild Hall never writes `work/work/...` — but the spec's blanket guarantee is technically false as currently coded.
- **Recommended fix:** Either (a) add a guard in both `artifactTypeSegment` and `groupKey` that maps `rawType === "work"` to `null`/`"root"` after peeling, restoring the spec's blanket guarantee; or (b) clarify the spec to scope the guarantee to "well-formed" paths, matching current behavior. The codified test currently constrains the team to (b).

### F3 — minor — Test gap: `artifactTypeSegment("")` and `groupKey("")` not exercised

- **Where:** `lib/tests/types.test.ts`, `lib/tests/artifact-grouping.test.ts`.
- **What:** Empty-string input. `artifactTypeSegment("")` returns `null` (peeled = `""`, `slash = -1`); `groupKey("")` returns `"root"` (test at line 41-43 covers `groupKey("")` already, but `artifactTypeSegment("")` has no explicit assertion). REQ-LDR-36 listed peel cases by category; empty-input isn't one of them.
- **Why it matters:** Behavior is correct today, but downstream changes that touch peel logic could regress this without notice.
- **Recommended fix:** Add `expect(artifactTypeSegment("")).toBeNull();` to the root-files block.

### F4 — minor — Test gap: `artifactTypeSegment("work/")` (trailing slash, no body) not exercised

- **Where:** `lib/tests/types.test.ts:230-232`.
- **What:** Test covers `work/foo.md` (REQ-LDR-2's "no second segment" case) but not `work/` itself. Behavior is correct (`peeled = ""`, `slash = -1`, returns `null`), just untested.
- **Recommended fix:** Add `expect(artifactTypeSegment("work/")).toBeNull();`.

### F5 — minor — Comment example in `groupKey` JSDoc omits `notes.md → "root"` ambiguity

- **Where:** `lib/artifact-grouping.ts:8`.
- **What:** Example reads `"notes.md" -> "root"`. With `learned` now in `TYPE_LABELS`, a reader skimming the example might confuse `notes.md` (root file) with `notes/` (the typed directory). Existing convention; not a Phase 1 regression.
- **Recommended fix:** Optional. Either replace the example with one less collisional (`README.md → "root"`) or leave as-is. Low priority.

### F6 — minor — Intermediate directory `path` field in tree built from `work/`-prefixed artifacts is non-canonical

- **Where:** `lib/artifact-grouping.ts:86-141` (`insertArtifact`), called with peeled `segments`.
- **What:** For a hypothetical `work/specs/cli/foo.md`, the intermediate `cli` directory node gets `path: "specs/cli"` (not `"work/specs/cli"`). The leaf node correctly preserves `artifact.relativePath = "work/specs/cli/foo.md"`. No current test covers a three-segment-after-peel new-layout artifact, so this isn't exercised.
- **Why it matters:** If any UI consumer uses the intermediate directory's `path` for filesystem-aware operations (e.g., "open folder at this path"), it points to a flat-layout location that may not exist on disk. If it's only used as a display key (probable, given the leaf carries the real path), this is harmless.
- **Recommended fix:** Add a test asserting intermediate dir paths for a deep `work/`-prefixed artifact, then decide whether to canonicalize the dir path back through `work/` or document that intermediate `path` fields are display-only. Phase 1 commission did not specify deep-tree fixtures.

## Scope adherence

Confirmed in-scope. `git diff 69633a8c^ 69633a8c --stat` shows exactly five files changed in commit `69633a8c`:

- `.lore/commissions/commission-Dalton-20260427-064804.md` — commission record (expected, framework-managed).
- `lib/types.ts` — REQ-LDR-1, REQ-LDR-2, REQ-LDR-3, REQ-LDR-4. ✓
- `lib/artifact-grouping.ts` — REQ-LDR-15, REQ-LDR-16. ✓
- `lib/tests/types.test.ts` — REQ-LDR-36. ✓
- `lib/tests/artifact-grouping.test.ts` — REQ-LDR-39. ✓

No files outside the commission's expected list changed. `lib/artifact-smart-view.ts` is untouched (REQ-LDR-17 PASS). No daemon/web/cli/packages changes leaked into Phase 1.

## Pre-commit gate

The Phase 1 commit (`69633a8c`) exists in the worktree, implying the pre-commit hook passed at commit time. Re-verified locally during this review:

- `bun run typecheck` → clean.
- `bun run lint` → clean.
- `bun test lib/tests/types.test.ts lib/tests/artifact-grouping.test.ts` → 108 pass / 0 fail / 250 expects.
- Production build not re-run in this review (the hook itself ran it; no production wiring changed in Phase 1).

## Memory section refresh

None needed. Phase 1 is interior `lib/` work with no project-status implications.

## Decisions

**Does Phase 1 satisfy REQ-LDR-1 through 4, 15-17, 35-36, 39?**
PASS overall. All 10 in-scope requirements pass with file:line evidence; only minor edge-case findings.
*Reasoning: artifactTypeSegment peels work/ correctly (lib/types.ts:382-388); TYPE_LABELS gains learned (lib/types.ts:366); groupKey and buildArtifactTree peel work/ (lib/artifact-grouping.ts:10-17, 187-193); artifact-smart-view.ts unchanged; tests cover required peel cases and tree-merge case; existing tests untouched. typecheck/lint/108 phase-1 tests all pass.*

**artifactDomain in smart-view does not peel work/. Phase 1 finding or defer?**
Flag as latent finding for Phase 2+; not a Phase 1 blocker.
*Reasoning: REQ-LDR-17 narrowly preserves three sets and says smart-view "continues to consume canonical labels from artifactTypeSegment." artifactDomain reads parts[1] directly without peeling, so work/specs/cli/foo.md would return "specs" instead of "cli". No work/-prefixed artifacts exist on disk in Phase 1 so no current breakage, but compounds when Phase 4 writes flip. Phase 1 spec scope explicitly says smart-view stays untouched, so this is correctly out-of-scope for Phase 1 but must be addressed before write-side migration.*
