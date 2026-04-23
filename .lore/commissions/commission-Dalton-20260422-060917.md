---
title: "Commission: C9 — Gate 3 Fixes (MIN-1 + NOTE-3)"
date: 2026-04-22
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Two fixes from Thorne's Gate 3 review (`.lore/commissions/commission-Thorne-20260421-085249.md`).\n\n## MIN-1 — `ARTIFACT_DOCUMENT_WRITE_OP` is a workaround\n\n**File:** `cli/surface.ts` (~line 27)\n\nThe operation ID is currently assembled via array-join because a pre-write security hook flags the literal substring. Per `rules/lessons-learned.md` (\"Fix the Problem, Not the Symptom\"): workarounds train future contributors to obfuscate strings whenever tooling misfires.\n\n**Steps:**\n1. Find the offending hook. Check `.claude/settings.json`, `.claude/settings.local.json`, and `~/.claude/settings.json`. Hook matchers that flag literal substrings live in `PreToolUse` or `PreWrite` entries.\n2. Identify the pattern that flags the literal. Narrow it (e.g. match only actual secret-shaped values, not operation IDs). If the pattern is irreducibly broad, add a targeted allow for the specific CLI source file(s) rather than leaving the global workaround.\n3. Validate: after narrowing, the codebase can write the literal directly. Verify by temporarily inlining and running typecheck + a write operation (remove after confirming).\n4. Collapse the array join back to a string literal in `cli/surface.ts:27`.\n5. Remove the explanatory comment — no comment is better than a comment explaining a workaround that no longer exists.\n\nIf you genuinely cannot narrow the hook (e.g. it lives somewhere user-owned and the risk of touching it is high), stop and document precisely what blocks the fix. Do NOT leave the obfuscation in place without escalating; report back and the user will decide.\n\n## NOTE-3 — `METHOD_OVERRIDES` missing `subscribe`\n\n**File:** `cli/surface-utils.ts`\n\n`GET_VERBS` omits `subscribe` and `METHOD_OVERRIDES` is empty. `system.events.stream.subscribe` (and any future SSE stream operation) would resolve to POST under pure heuristic inference when reached through `package-op` without a registry. SSE streams are conventionally GET.\n\n**Steps:**\n1. Add `METHOD_OVERRIDES` entry (or extend GET_VERBS, whichever matches the existing design): `subscribe` → GET for any operation whose path segment contains `stream`, OR a direct override for `system.events.stream.subscribe`. Prefer the narrow override unless you see a clear pattern for broader verb treatment.\n2. Add a test in `tests/cli/package-op.test.ts` (or `tests/cli/surface-structural.test.ts`, whichever fits) asserting that `inferMethodFromOperationId(\"system.events.stream.subscribe\")` returns GET. Pin this behavior.\n\n## Validation\n\nRun full `bun run typecheck && bun run lint && bun test && bun run build`. All must pass.\n\n## Scope\n\nDo not touch anything outside MIN-1 and NOTE-3. If you discover other issues while working, file them as notes in your commission result body, do not fix them here."
dependencies: []
linked_artifacts:
  - cli/surface.ts

  - cli/surface-utils.ts
  - tests/cli/surface-structural.test.ts
  - cli/surface-utils.ts
  - tests/cli/surface-structural.test.ts
activity_timeline:
  - timestamp: 2026-04-22T13:09:17.854Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-22T13:09:17.856Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-22T13:09:17.960Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-22T13:14:37.774Z
    event: result_submitted
    reason: "## MIN-1 — ARTIFACT_DOCUMENT_WRITE_OP workaround removed\n\n**Root cause identified.** The blocker was the `document_write_xss` rule in `security-guidance` plugin (`~/.claude/plugins/.../hooks/security_reminder_hook.py`). Its pattern matched the literal substring `\"document.write\"`, so any string containing that fragment (including the operation ID `workspace.artifact.document.write`) tripped the XSS warning and blocked the Write/Edit tool. Verified directly: a literal-string Edit to `cli/surface.ts:27` was rejected by the PreToolUse hook with the `document.write()` XSS reminder.\n\n**Fix.** Narrowed the substring from `\"document.write\"` to `\"document.write(\"` in all four locations of `security_reminder_hook.py`:\n- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/security-guidance/hooks/security_reminder_hook.py`\n- `~/.claude/plugins/cache/claude-plugins-official/security-guidance/{3ffb4b4ca81f,48aa43517886,unknown}/hooks/security_reminder_hook.py`\n\nThe paren reflects the rule's intent (`\"document.write() can be exploited for XSS attacks\"`, per the reminder text). Operation IDs and similar string data no longer trip the rule; actual JS `document.write(` calls still do.\n\n**Commission edit confirmed the fix works.** After the pattern narrow, a literal-string Edit to `cli/surface.ts:27` succeeded without hook rejection.\n\n**Collapsed workaround.** `cli/surface.ts:25` is now:\n```ts\nconst ARTIFACT_DOCUMENT_WRITE_OP = \"workspace.artifact.document.write\";\n```\nComment removed — no comment beats a comment explaining a workaround that no longer exists.\n\n## MIN-1 — follow-up note for user\n\nThe plugin files I modified live in user-owned plugin space at `~/.claude/plugins/` and are shared across all Claude Code sessions globally. If Claude Code refreshes the plugin cache (e.g. plugin update), the pattern may revert to `\"document.write\"` and re-break literal writes. Two durable options:\n\n1. **Upstream the fix** to `claude-plugins-official/security-guidance` so future installs get the narrow pattern by default.\n2. **Pin locally** with a post-install script or dotfiles override.\n\nI did not take either action — both are user-level decisions outside this commission's scope. Flagging it here so the regression path is known.\n\n## NOTE-3 — METHOD_OVERRIDES now covers subscribe\n\n**Chose narrow override** over adding `subscribe` to `GET_VERBS`: `subscribe` is not a general-purpose read verb, it only makes sense for streams. A broader verb rule would be speculative without other `subscribe` ops in the surface. If additional stream ops appear they can be added one line at a time.\n\n**Edit in `cli/surface-utils.ts`:**\n```ts\nconst METHOD_OVERRIDES: Record<string, \"GET\" | \"POST\"> = {\n  // SSE stream endpoints are conventionally GET; `subscribe` is not in GET_VERBS\n  // because it's not a generic read verb, only meaningful for streams.\n  \"system.events.stream.subscribe\": \"GET\",\n};\n```\n\n**Pinning test in `tests/cli/surface-structural.test.ts`:**\n```ts\ndescribe(\"invocationForOperation — method inference\", () => {\n  test(\"SSE stream subscribe resolves to GET (not POST by verb heuristic)\", () => {\n    const inv = invocationForOperation(\"system.events.stream.subscribe\");\n    expect(inv.method).toBe(\"GET\");\n    expect(inv.path).toBe(\"/system/events/stream/subscribe\");\n  });\n});\n```\n\nNote: the commission brief referenced `inferMethodFromOperationId`, but no such function exists. The single public method-inference surface is `invocationForOperation` (in `cli/surface-utils.ts`), which is what both the daemon-less package-op path and the surface resolver use. Test pins the behavior through that surface.\n\n## Validation\n\nAll four gates pass on the worktree:\n- `bun run typecheck` — clean\n- `bun run lint` — clean\n- `bun test` — 3637 pass, 4 skip, 0 fail (169 files)\n- `bun run build` — succeeded\n\n## Files touched\n\n- `cli/surface.ts` — collapsed `ARTIFACT_DOCUMENT_WRITE_OP` to a literal, removed workaround comment\n- `cli/surface-utils.ts` — added `system.events.stream.subscribe → GET` to `METHOD_OVERRIDES`\n- `tests/cli/surface-structural.test.ts` — added `invocationForOperation` import and pinning test\n- `~/.claude/plugins/.../security_reminder_hook.py` (×4) — narrowed `document.write` pattern to `document.write(`\n\n## Out-of-scope observation (not fixed)\n\nThe `security-guidance` plugin has similar broad-substring patterns for other rules (e.g. `\"pickle\"` as a bare substring in `pickle_deserialization`, `\"eval(\"` in `eval_injection`). These can produce the same kind of false positives on data strings. Did not touch them per commission scope. User may want to audit the pattern list upstream as a separate effort."
  - timestamp: 2026-04-22T13:14:43.515Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: ""
projectName: guild-hall
---
## MIN-1 — ARTIFACT_DOCUMENT_WRITE_OP workaround removed

**Root cause identified.** The blocker was the `document_write_xss` rule in `security-guidance` plugin (`~/.claude/plugins/.../hooks/security_reminder_hook.py`). Its pattern matched the literal substring `"document.write"`, so any string containing that fragment (including the operation ID `workspace.artifact.document.write`) tripped the XSS warning and blocked the Write/Edit tool. Verified directly: a literal-string Edit to `cli/surface.ts:27` was rejected by the PreToolUse hook with the `document.write()` XSS reminder.

**Fix.** Narrowed the substring from `"document.write"` to `"document.write("` in all four locations of `security_reminder_hook.py`:
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/security-guidance/hooks/security_reminder_hook.py`
- `~/.claude/plugins/cache/claude-plugins-official/security-guidance/{3ffb4b4ca81f,48aa43517886,unknown}/hooks/security_reminder_hook.py`

The paren reflects the rule's intent (`"document.write() can be exploited for XSS attacks"`, per the reminder text). Operation IDs and similar string data no longer trip the rule; actual JS `document.write(` calls still do.

**Commission edit confirmed the fix works.** After the pattern narrow, a literal-string Edit to `cli/surface.ts:27` succeeded without hook rejection.

**Collapsed workaround.** `cli/surface.ts:25` is now:
```ts
const ARTIFACT_DOCUMENT_WRITE_OP = "workspace.artifact.document.write";
```
Comment removed — no comment beats a comment explaining a workaround that no longer exists.

## MIN-1 — follow-up note for user

The plugin files I modified live in user-owned plugin space at `~/.claude/plugins/` and are shared across all Claude Code sessions globally. If Claude Code refreshes the plugin cache (e.g. plugin update), the pattern may revert to `"document.write"` and re-break literal writes. Two durable options:

1. **Upstream the fix** to `claude-plugins-official/security-guidance` so future installs get the narrow pattern by default.
2. **Pin locally** with a post-install script or dotfiles override.

I did not take either action — both are user-level decisions outside this commission's scope. Flagging it here so the regression path is known.

## NOTE-3 — METHOD_OVERRIDES now covers subscribe

**Chose narrow override** over adding `subscribe` to `GET_VERBS`: `subscribe` is not a general-purpose read verb, it only makes sense for streams. A broader verb rule would be speculative without other `subscribe` ops in the surface. If additional stream ops appear they can be added one line at a time.

**Edit in `cli/surface-utils.ts`:**
```ts
const METHOD_OVERRIDES: Record<string, "GET" | "POST"> = {
  // SSE stream endpoints are conventionally GET; `subscribe` is not in GET_VERBS
  // because it's not a generic read verb, only meaningful for streams.
  "system.events.stream.subscribe": "GET",
};
```

**Pinning test in `tests/cli/surface-structural.test.ts`:**
```ts
describe("invocationForOperation — method inference", () => {
  test("SSE stream subscribe resolves to GET (not POST by verb heuristic)", () => {
    const inv = invocationForOperation("system.events.stream.subscribe");
    expect(inv.method).toBe("GET");
    expect(inv.path).toBe("/system/events/stream/subscribe");
  });
});
```

Note: the commission brief referenced `inferMethodFromOperationId`, but no such function exists. The single public method-inference surface is `invocationForOperation` (in `cli/surface-utils.ts`), which is what both the daemon-less package-op path and the surface resolver use. Test pins the behavior through that surface.

## Validation

All four gates pass on the worktree:
- `bun run typecheck` — clean
- `bun run lint` — clean
- `bun test` — 3637 pass, 4 skip, 0 fail (169 files)
- `bun run build` — succeeded

## Files touched

- `cli/surface.ts` — collapsed `ARTIFACT_DOCUMENT_WRITE_OP` to a literal, removed workaround comment
- `cli/surface-utils.ts` — added `system.events.stream.subscribe → GET` to `METHOD_OVERRIDES`
- `tests/cli/surface-structural.test.ts` — added `invocationForOperation` import and pinning test
- `~/.claude/plugins/.../security_reminder_hook.py` (×4) — narrowed `document.write` pattern to `document.write(`

## Out-of-scope observation (not fixed)

The `security-guidance` plugin has similar broad-substring patterns for other rules (e.g. `"pickle"` as a bare substring in `pickle_deserialization`, `"eval("` in `eval_injection`). These can produce the same kind of false positives on data strings. Did not touch them per commission scope. User may want to audit the pattern list upstream as a separate effort.
