---
title: "Commission: Replicate toolbox final fixes + integration tests (Step 8)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Final pass on the Replicate native domain toolbox: address review feedback and implement Step 8.\n\nRead the plan at `.lore/plans/infrastructure/replicate-native-toolbox.md`.\n\n**First:** Check the spec validation review from commission `commission-Thorne-20260318-123359` at `.lore/commissions/commission-Thorne-20260318-123359/`. Address all findings before proceeding to Step 8.\n\n**Step 8:** Integration tests and cleanup.\n- Create `tests/packages/guild-hall-replicate/integration.test.ts` gated behind `REPLICATE_INTEGRATION_TESTS=true` env var. When absent, all tests skip.\n- Test 1: `generate_image` end-to-end with `flux-schnell` (~$0.003)\n- Test 2: `get_model_params` live (free)\n- Test 3: `check_prediction` using Test 1's prediction ID (free)\n- Tests run sequentially (Test 3 depends on Test 1)\n- Add `.lore/generated/` to `.gitignore` (REQ-RPL-34)\n\nDo NOT run the integration tests yourself (they require the API token and cost money). Just write them correctly. Run the full unit test suite to verify everything passes.\n\nRun `bun test` at the end to confirm all existing and new tests pass."
dependencies:
  - commission-Thorne-20260318-123359
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T19:34:09.807Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T19:40:06.647Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
