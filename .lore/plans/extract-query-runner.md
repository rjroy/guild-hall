---
title: Extract SDK query execution from meeting-session.ts
date: 2026-03-01
status: executed
tags: [refactor, meeting-session, query-runner, separation-of-concerns]
modules: [meeting-session, query-runner]
---

# Extract SDK Query Execution from meeting-session.ts

## Context

`meeting-session.ts` is 1519 lines and mixes two concerns: meeting lifecycle management (creation, artifacts, git, state files) and SDK query execution (running queries, translating messages, handling session expiry). Extracting the query execution pipeline into `query-runner.ts` separates these concerns, makes the execution layer independently testable, and brings meeting-session.ts closer to the ~800 line target.

## New File: `daemon/services/query-runner.ts`

Stateless module-level functions (no factory, no closure), following the `event-translator.ts` pattern.

### What moves

| Function | Lines | Purpose |
|----------|-------|---------|
| `isSessionExpiryError` | ~8 | Detects session expiry in error messages |
| `truncateTranscript` | ~25 | Truncates transcript preserving turn boundaries |
| `appendAssistantTurnSafe` | ~20 | Error-swallowing transcript append |
| `iterateAndTranslate` | ~60 | Wraps SDK generator, translates messages, accumulates transcript data |
| `runQueryAndTranslate` | ~55 | Calls queryFn, delegates to iterateAndTranslate, returns outcome |
| `QueryRunOutcome` type | 1 | `"ok" \| "session_expired" \| "failed"` |
| `PresetQueryPrompt` type | ~4 | Preset system prompt shape |
| `QueryOptions` type | ~16 | SDK query options |

### Types

Define a narrow `QueryRunnerMeeting` interface:
```typescript
export interface QueryRunnerMeeting {
  meetingId: string;
  workerName: string;
  sdkSessionId: SdkSessionId | null;  // mutated by iterateAndTranslate
}
```
`ActiveMeeting` satisfies this structurally, so no changes at call sites.

### Signature changes for extracted functions

- `appendAssistantTurnSafe(meetingId, textParts, toolUses, guildHallHome)` -- add explicit `guildHallHome` param
- `iterateAndTranslate(generator, translatorContext, meeting, guildHallHome)` -- add `guildHallHome`, use `QueryRunnerMeeting`
- `runQueryAndTranslate(queryFn, meeting, prompt, options, guildHallHome, suppressSessionExpiryError?)` -- add `queryFn` and `guildHallHome` params

## Edits to `daemon/services/meeting-session.ts`

1. **Imports**: Add imports from query-runner.ts (`runQueryAndTranslate`, `truncateTranscript`, `QueryRunOutcome`). Re-export `QueryOptions` and `PresetQueryPrompt` from query-runner.ts for backward compatibility.

2. **Delete**: Remove the 5 moved functions, `QueryRunOutcome` type, `QueryOptions` type, `PresetQueryPrompt` type.

3. **Update `startSession`**: Add `deps.queryFn` guard (moved from old `runQueryAndTranslate`) and pass `deps.queryFn` + `ghHome` to the imported `runQueryAndTranslate`.

4. **Update `sendMessage`**: Same guard and parameter additions at the resume call site and the renewal `startSession` call (which inherits the fix from step 3).

## Import graph (no circular dependencies)

```
query-runner.ts
  imports: event-translator, transcript, daemon/types, toolbox-utils
  exports: runQueryAndTranslate, truncateTranscript, isSessionExpiryError,
           appendAssistantTurnSafe, iterateAndTranslate,
           QueryRunOutcome, QueryRunnerMeeting, QueryOptions, PresetQueryPrompt

meeting-session.ts
  imports from query-runner.ts (values + types)
  re-exports: QueryOptions, PresetQueryPrompt (backward compat)
```

No circular imports. `query-runner.ts` does not import from `meeting-session.ts`.

## Verification

1. `bun run typecheck` -- clean compilation
2. `bun test` -- all 1536 tests pass (no test changes needed)
3. `bun run lint` -- no lint issues

## Files

- `daemon/services/query-runner.ts` -- create (new)
- `daemon/services/meeting-session.ts` -- edit (remove moved code, update call sites, add imports)
