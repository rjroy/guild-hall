---
title: "Commission: Test Worker canUseToolRules (Steps 3-4 new tests)"
date: 2026-03-13
status: pending
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Add tests for the worker canUseToolRules declarations per the plan at `.lore/plans/workers/worker-tool-rules.md`.\n\nYou are doing Step 3 and the new test cases from Step 4.\n\n## What to Do\n\n**Step 3: canUseTool callback tests** (`tests/daemon/services/sdk-runner.test.ts`)\n\nAdd two new `describe` blocks inside the existing `canUseTool callback` describe block. Follow the existing test pattern: inject rules through `resolveToolSet` mock, call `prepareSdkSession`, invoke the returned `canUseTool` function.\n\nRead the plan for the exact test structure. The test cases are defined in REQ-WTR-17 of `.lore/specs/workers/worker-tool-rules.md`:\n\nOctavia rules (cases 1-7):\n1. `rm .lore/commissions/commission-Octavia-20260312.md` — allowed\n2. `rm -f .lore/meetings/audience-Guild-Master-20260311.md` — allowed\n3. `rm .lore/specs/some-spec.md` — allowed\n4. `rm -rf /` — denied\n5. `ls .lore/` — denied\n6. `cat .lore/specs/some-spec.md` — denied\n7. `rm -rf .lore/commissions/` — denied\n\nGuild Master rules (cases 8-15):\n8. `git status` — allowed\n9. `git log --oneline -10` — allowed\n10. `git diff HEAD~3..HEAD` — allowed\n11. `git show abc123` — allowed\n12. `git diff -- src/lib/foo.ts` — denied\n13. `git push origin master` — denied\n14. `git checkout -b new-branch` — denied\n15. `curl http://example.com` — denied\n\n**Step 4 new tests** (in `tests/daemon/services/manager-worker.test.ts`):\n\n16. `createManagerPackage()` returns metadata with `builtInTools` containing `\"Bash\"`\n17. `createManagerPackage()` returns metadata with `canUseToolRules` containing the expected allowlist and catch-all deny\n\nAlso add the optional package.json validation test in `tests/lib/packages.test.ts`:\n18. `guild-hall-writer package.json` passes `workerMetadataSchema` validation\n\n## What NOT to Do\n\n- Do not modify production code\n- Do not change existing test assertions (Dalton already updated them)\n\n## Verification\n\nRun `bun test tests/daemon/services/sdk-runner.test.ts tests/daemon/services/manager-worker.test.ts tests/daemon/services/manager/worker.test.ts tests/lib/packages.test.ts` — all must pass."
dependencies:
  - commission-Dalton-20260312-220524
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T05:05:38.931Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
