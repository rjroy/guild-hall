---
title: "Commission: Thorne final review: lore restructure (full spec, all 40 requirements)"
date: 2026-04-27
status: blocked
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "## Task\n\nFinal full-spec review of the lore directory restructure. Spec: `.lore/specs/infrastructure/lore-directory-restructure.md` (40 requirements). Discovery: `.lore/issues/lore-directory-restructure-discovery.md`.\n\nImplementation chain:\n- Phase 1 build (`commission-Dalton-20260427-064804`) — foundation.\n- Phase 1 review (`commission-Thorne-20260427-064828`).\n- Phase 2 build (`commission-Dalton-20260427-064858`) — path helpers + dual-read.\n- Phase 3 build (`commission-Dalton-20260427-064925`) — write paths + route prefixes.\n- Phase 4 build (`commission-Dalton-20260427-064954`) — LLM-facing strings.\n\nThis is the final gate. Be exhaustive.\n\n## Review Scope\n\nVerify EVERY requirement REQ-LDR-1 through REQ-LDR-40. For each: PASS / FAIL / PARTIAL with file:line evidence.\n\nCross-cutting checks:\n\n1. **Acceptance criteria.** Run through every checkbox in the spec's Acceptance Criteria section. Report status for each. The spec lists ~20 explicit criteria.\n\n2. **AI Validation greps.** The spec includes specific grep checks. Run them and report output:\n   - `grep -rn \"TYPE_LABELS\" lib/`\n   - `grep -rn \"work/\" lib/types.ts`\n   - `grep -rn '\"\\.lore\", \"commissions\"' apps/daemon/services/`\n   - `grep -rn '\"\\.lore\", \"meetings\"' apps/daemon/services/`\n   - `grep -rn '\\.lore/commissions/' apps/daemon/services/briefing-generator.ts`\n   - `grep -rn 'work/commissions\\|work/meetings\\|work/issues\\|work/specs\\|work/plans' apps/daemon/services/ apps/daemon/routes/ packages/`\n\n3. **Coexistence preserved.** Spot-check that flat-layout reads still work everywhere they used to. Pick at least three reader sites and trace the dual-read path.\n\n4. **Single canonical type label.** Confirm no consumer surfaces `work` as a separate axis. Group keys, smart-view filters, recency filter, tree builder — all peel before classifying.\n\n5. **Write-side convergence.** Confirm zero `path.join(..., \".lore\", \"commissions\"|\"meetings\"|\"issues\", ...)` survives at write sites. Confirm every write goes through the helpers from REQ-LDR-5/6/7.\n\n6. **LLM-facing strings.** Spot-check the briefing prompt, two toolbox descriptions, two postures, and two skill files. Each should name `.lore/work/...` as the write target and note dual-layout reads where applicable.\n\n7. **Squash-merge and sparse checkout.** Confirm both still match `.lore/...` patterns and cover `work/`. No code change expected; this is a read-and-confirm.\n\n8. **Test coverage.** Verify the new test counts align with the spec's REQ-LDR-36, 37, 38, 39, 40. Look for obvious gaps:\n   - Peel: double prefix, unknown second segment, root files, `learned`, mixed-layout tree merge.\n   - Dual-read: same ID in both layouts (work wins), only-flat, only-work, neither.\n   - Dual-write: every write site verified to write `work/` and not flat.\n   - Prefix detection: both flat and work prefixes route correctly.\n\n9. **Pre-commit hook passing.** Each phase commission must have committed only after typecheck + lint + tests + build all passed. Confirm this is documented and that the final state passes all four.\n\n10. **Spec drift.** Did anything in the spec turn out to be wrong during implementation? If a phase deviated and flagged it in the result, document the gap and recommend whether the spec needs updating.\n\n## Output\n\nResult body structure:\n\n1. **Verdict** — PASS / FAIL / PARTIAL.\n2. **Per-requirement table** — REQ-LDR-1 through REQ-LDR-40, each with status and file:line evidence.\n3. **Acceptance criteria checklist** — every checkbox with status.\n4. **Findings** — numbered, severity-ranked (blocker/major/minor). Include EVERY finding. Do not triage. Do not pre-filter.\n5. **Spec drift** — anything to update in the spec.\n6. **Recommended next action** — fix commission needed? Spec update needed? Or ready to merge?\n\nYou cannot write files. The findings list is the input for any follow-up fix commission."
dependencies:
  - commission-Dalton-20260427-064954
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-27T13:50:22.175Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-27T13:50:22.177Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
