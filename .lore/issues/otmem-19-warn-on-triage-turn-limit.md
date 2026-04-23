---
title: Outcome triage doesn't warn when session hits turn limit (REQ-OTMEM-19)
date: 2026-04-18
status: open
tags: [bug, observability, commissions, memory, outcome-triage]
modules: [apps/daemon/services/outcome-triage]
related:
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md
  - .lore/retros/commission-cleanup-2026-03-21.md
---

# Outcome Triage — Missing Warn on Turn-Limit Cutoff

## What Happens

The outcome triage runner emits the same `info` log whether the SDK loop completed normally or hit `TRIAGE_MAX_TURNS` (the safety cap from REQ-OTMEM-15). The spec at REQ-OTMEM-19 requires a `warn` log when the session exceeds the turn limit. If triage starts silently maxing out — for example, because a prompt change makes the model loop on tools — the operator has no signal until project memory entries stop appearing and somebody investigates.

Originally flagged as a Thorne WARN-level finding during the OTMEM implementation review (March 2026). The fix commission addressed 5 of 6 review findings; this one was dropped from the fix prompt. Re-surfaced 2026-04-18 during the 2026-03-21 commission retro validation pass.

## Verified Locations (2026-04-18)

**Spec — REQ-OTMEM-19:** `.lore/specs/infrastructure/commission-outcomes-to-memory.md:179-181`
```
- info: triage initiated (...), triage completed (...).
- warn: triage session failed, session exceeded turn limit.
- debug: triage skipped for cancelled commission.
```

**Spec — REQ-OTMEM-15:** `.lore/specs/infrastructure/commission-outcomes-to-memory.md:167`
> "The triage session enforces a turn limit (e.g., 10 turns) to prevent runaway tool-use loops. If the limit is reached, the session stops."

**Implementation — runs the loop:** `apps/daemon/services/outcome-triage.ts:300-318`
```ts
return async (systemPrompt, userMessage, tools) => {
  const generator = queryFn({
    prompt: userMessage,
    options: {
      systemPrompt,
      mcpServers: tools,
      model: TRIAGE_MODEL,
      maxTurns: TRIAGE_MAX_TURNS,
      permissionMode: "dontAsk",
    },
  });

  let turns = 0;
  for await (const _message of generator) {
    turns++;
  }

  log.info(`triage session completed after ${turns} turn(s)`);
};
```

The `info` log fires unconditionally. There is no comparison against `TRIAGE_MAX_TURNS`, and no `warn` path for the cutoff case.

## Why It Matters

The turn limit exists as a runaway-loop safety bound, not an expected operating point. When it fires regularly, something is wrong — the prompt is bad, the model is confused, tools are misconfigured, or the outcome data is too complex for a 10-turn budget. Right now that signal is invisible. The system writes a normal-looking log line and moves on; partial writes from `edit_memory` calls earlier in the session stay on disk (per REQ-OTMEM-15) but no one knows triage stopped early.

This is the kind of silent failure that costs more to debug later than to add the warn now. Project memory should be reliable; if it stops being reliable, the operator should hear about it.

## Fix Direction

One branch on the existing `turns` counter. Pseudocode:

```ts
let turns = 0;
for await (const _message of generator) {
  turns++;
}

if (turns >= TRIAGE_MAX_TURNS) {
  log.warn(`triage session exceeded turn limit (${turns}/${TRIAGE_MAX_TURNS}); partial writes may have occurred`);
} else {
  log.info(`triage session completed after ${turns} turn(s)`);
}
```

Note: the SDK may end the iterator at `maxTurns` exactly, or may report `>= maxTurns` depending on how the loop drains; verify behavior with a small integration test before locking in the comparator.

While in this code, also confirm REQ-OTMEM-19's other clauses:
- `info` on triage initiated — present at lines 329 ("triage initiated for commission ${commissionId}") and 358 (meeting equivalent if applicable).
- `warn` on triage session failed — verify the surrounding try/catch logs at warn level.
- `debug` on cancelled commission — verify the cancelled-skip branch logs at debug level.

If any of those drift from the spec too, fold the fixes into the same change.

## Verification After Fix

- Unit test: inject a `queryFn` mock that yields exactly `TRIAGE_MAX_TURNS` messages, assert `log.warn` is called with the turn-limit message and `log.info` is not.
- Unit test: inject a `queryFn` mock that yields fewer than `TRIAGE_MAX_TURNS` messages, assert `log.info` is called and `log.warn` is not.
- Confirm REQ-OTMEM-19's other log levels still match the spec (one assertion per case).

## Notes for the Fix

- This is the leftover from the OTMEM review. Closing it brings the implementation fully into alignment with the spec.
- `TRIAGE_MAX_TURNS` should be exported (or already is) so the test can import the same constant rather than hardcoding `10`. Check for the existing export before adding one.
