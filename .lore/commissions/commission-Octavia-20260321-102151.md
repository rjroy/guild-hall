---
title: "Commission: Spec: Event Router advanced matching Phase 2 (glob patterns via micromatch)"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for Phase 2 of the Event Router advanced matching extension, based on the brainstorm at `.lore/brainstorm/event-router-advanced-matching.md`.\n\n**Read first:**\n- The brainstorm: `.lore/brainstorm/event-router-advanced-matching.md` (Phase 2 recommendation)\n- The Phase 1 spec (being written now, but reference the brainstorm's Phase 1 description for context): `.lore/specs/infrastructure/event-router-field-matching.md`\n- The implemented Event Router spec: `.lore/specs/infrastructure/event-router.md`\n- The current router implementation: `daemon/services/event-router.ts`\n- `daemon/lib/agent-sdk/sdk-runner.ts` (existing micromatch usage for canUseToolRules, around line 292)\n\n**Scope: Phase 2 only.** Upgrade the `fields` value comparison from exact string match to micromatch glob patterns. This builds on Phase 1 (which adds `fields` with exact match). Phase 2 replaces the exact comparison with `micromatch.isMatch()`.\n\n**Key points from the brainstorm:**\n- One-line change in the matching function: replace `String(eventRecord[key]) !== expected` with `!micromatch.isMatch(String(eventRecord[key]), expected)`\n- micromatch is already a dependency (used in `sdk-runner.ts` for `canUseToolRules`)\n- Exact strings without glob characters still match literally (backward compatible with Phase 1)\n- Brace expansion (`{completed,failed}`) provides single-field OR\n- Negation (`!pending`) comes free from micromatch\n- Do NOT use `{ dot: true }` — event field values aren't file paths\n- Config validation consideration: invalid glob patterns (e.g., `[unclosed`) can't be caught at parse time without running micromatch. Spec should address whether to pre-validate or let invalid patterns silently never match.\n\n**Output:** Write to `.lore/specs/infrastructure/event-router-glob-matching.md`. Include REQ IDs, success criteria, AI validation checks. Reference the brainstorm, the Phase 1 spec, and the implemented Event Router spec. Make it clear this spec depends on Phase 1 being implemented first."
dependencies:
  - commission-Octavia-20260321-102135
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:21:51.199Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:21:51.201Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
