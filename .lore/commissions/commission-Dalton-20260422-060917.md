---
title: "Commission: C9 — Gate 3 Fixes (MIN-1 + NOTE-3)"
date: 2026-04-22
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Two fixes from Thorne's Gate 3 review (`.lore/commissions/commission-Thorne-20260421-085249.md`).\n\n## MIN-1 — `ARTIFACT_DOCUMENT_WRITE_OP` is a workaround\n\n**File:** `cli/surface.ts` (~line 27)\n\nThe operation ID is currently assembled via array-join because a pre-write security hook flags the literal substring. Per `rules/lessons-learned.md` (\"Fix the Problem, Not the Symptom\"): workarounds train future contributors to obfuscate strings whenever tooling misfires.\n\n**Steps:**\n1. Find the offending hook. Check `.claude/settings.json`, `.claude/settings.local.json`, and `~/.claude/settings.json`. Hook matchers that flag literal substrings live in `PreToolUse` or `PreWrite` entries.\n2. Identify the pattern that flags the literal. Narrow it (e.g. match only actual secret-shaped values, not operation IDs). If the pattern is irreducibly broad, add a targeted allow for the specific CLI source file(s) rather than leaving the global workaround.\n3. Validate: after narrowing, the codebase can write the literal directly. Verify by temporarily inlining and running typecheck + a write operation (remove after confirming).\n4. Collapse the array join back to a string literal in `cli/surface.ts:27`.\n5. Remove the explanatory comment — no comment is better than a comment explaining a workaround that no longer exists.\n\nIf you genuinely cannot narrow the hook (e.g. it lives somewhere user-owned and the risk of touching it is high), stop and document precisely what blocks the fix. Do NOT leave the obfuscation in place without escalating; report back and the user will decide.\n\n## NOTE-3 — `METHOD_OVERRIDES` missing `subscribe`\n\n**File:** `cli/surface-utils.ts`\n\n`GET_VERBS` omits `subscribe` and `METHOD_OVERRIDES` is empty. `system.events.stream.subscribe` (and any future SSE stream operation) would resolve to POST under pure heuristic inference when reached through `package-op` without a registry. SSE streams are conventionally GET.\n\n**Steps:**\n1. Add `METHOD_OVERRIDES` entry (or extend GET_VERBS, whichever matches the existing design): `subscribe` → GET for any operation whose path segment contains `stream`, OR a direct override for `system.events.stream.subscribe`. Prefer the narrow override unless you see a clear pattern for broader verb treatment.\n2. Add a test in `tests/cli/package-op.test.ts` (or `tests/cli/surface-structural.test.ts`, whichever fits) asserting that `inferMethodFromOperationId(\"system.events.stream.subscribe\")` returns GET. Pin this behavior.\n\n## Validation\n\nRun full `bun run typecheck && bun run lint && bun test && bun run build`. All must pass.\n\n## Scope\n\nDo not touch anything outside MIN-1 and NOTE-3. If you discover other issues while working, file them as notes in your commission result body, do not fix them here."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-22T13:09:17.854Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-22T13:09:17.856Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
