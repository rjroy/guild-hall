---
title: "Commission: Spec: Event Router advanced matching Phase 2 (glob patterns via micromatch)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for Phase 2 of the Event Router advanced matching extension, based on the brainstorm at `.lore/brainstorm/event-router-advanced-matching.md`.\n\n**Read first:**\n- The brainstorm: `.lore/brainstorm/event-router-advanced-matching.md` (Phase 2 recommendation)\n- The Phase 1 spec (being written now, but reference the brainstorm's Phase 1 description for context): `.lore/specs/infrastructure/event-router-field-matching.md`\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The current router implementation: `daemon/services/event-router.ts`\n- `daemon/lib/agent-sdk/sdk-runner.ts` (existing micromatch usage for canUseToolRules, around line 292)\n\n**Scope: Phase 2 only.** Upgrade the `fields` value comparison from exact string match to micromatch glob patterns. This builds on Phase 1 (which adds `fields` with exact match). Phase 2 replaces the exact comparison with `micromatch.isMatch()`.\n\n**Key points from the brainstorm:**\n- One-line change in the matching function: replace `String(eventRecord[key]) !== expected` with `!micromatch.isMatch(String(eventRecord[key]), expected)`\n- micromatch is already a dependency (used in `sdk-runner.ts` for `canUseToolRules`)\n- Exact strings without glob characters still match literally (backward compatible with Phase 1)\n- Brace expansion (`{completed,failed}`) provides single-field OR\n- Negation (`!pending`) comes free from micromatch\n- Do NOT use `{ dot: true }` — event field values aren't file paths\n- Config validation consideration: invalid glob patterns (e.g., `[unclosed`) can't be caught at parse time without running micromatch. Spec should address whether to pre-validate or let invalid patterns silently never match.\n\n**Output:** Write to `.lore/specs/infrastructure/event-router-glob-matching.md`. Include REQ IDs, success criteria, AI validation checks. Reference the brainstorm, the Phase 1 spec, and the implemented Event Router spec. Make it clear this spec depends on Phase 1 being implemented first."
dependencies:
  - commission-Octavia-20260321-102135
linked_artifacts:
  - .lore/specs/infrastructure/event-router-glob-matching.md

activity_timeline:
  - timestamp: 2026-03-21T17:21:51.199Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:21:51.201Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T17:23:36.059Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T17:23:36.062Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T17:23:36.102Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T17:23:53.841Z
    event: progress_report
    reason: "Read all source documents: brainstorm, Phase 1 spec, implemented Event Router spec, current router implementation, and micromatch usage in sdk-runner.ts. Now drafting the Phase 2 spec."
  - timestamp: 2026-03-21T17:25:29.321Z
    event: result_submitted
    reason: "Wrote the Phase 2 spec at `.lore/specs/infrastructure/event-router-glob-matching.md`.\n\nThe spec covers:\n- Replacing exact string comparison in the `fields` matching loop with `micromatch.isMatch()` (one-line change)\n- Backward compatibility: exact strings without glob characters still match literally\n- Pattern capabilities documented: wildcards, brace expansion, negation, character classes\n- Invalid glob pattern handling: try/catch in the matching loop, logged at warn level, treated as non-match\n- No `{ dot: true }` option (event fields aren't file paths, unlike the sdk-runner.ts usage)\n- Config schema unchanged (values stay `z.string()`, no parse-time pattern validation)\n- Only file modified: `daemon/services/event-router.ts` (one import, one line change in `matches()`)\n- 14 requirements (REQ-EVGM-1 through REQ-EVGM-14), success criteria, and AI validation checks\n- Explicit dependency on Phase 1 spec (`event-router-field-matching.md`)"
  - timestamp: 2026-03-21T17:25:36.443Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all source documents: brainstorm, Phase 1 spec, implemented Event Router spec, current router implementation, and micromatch usage in sdk-runner.ts. Now drafting the Phase 2 spec."
projectName: guild-hall
---
Wrote the Phase 2 spec at `.lore/specs/infrastructure/event-router-glob-matching.md`.

The spec covers:
- Replacing exact string comparison in the `fields` matching loop with `micromatch.isMatch()` (one-line change)
- Backward compatibility: exact strings without glob characters still match literally
- Pattern capabilities documented: wildcards, brace expansion, negation, character classes
- Invalid glob pattern handling: try/catch in the matching loop, logged at warn level, treated as non-match
- No `{ dot: true }` option (event fields aren't file paths, unlike the sdk-runner.ts usage)
- Config schema unchanged (values stay `z.string()`, no parse-time pattern validation)
- Only file modified: `daemon/services/event-router.ts` (one import, one line change in `matches()`)
- 14 requirements (REQ-EVGM-1 through REQ-EVGM-14), success criteria, and AI validation checks
- Explicit dependency on Phase 1 spec (`event-router-field-matching.md`)
