---
title: "Commission: Review: Meeting context compaction against spec"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the meeting context compaction implementation against the spec at `.lore/specs/meetings/meeting-context-compaction.md` and the plan at `.lore/plans/meetings/meeting-context-compaction.md`.\n\nDalton built steps 1-7 in the preceding commission. Check all 16 REQs (MCC-1 through MCC-16).\n\nReview scope from the plan's delegation guide:\n1. **Spec compliance** — all 16 REQs addressed, no drift\n2. **Event translator** — compact_boundary handled, other subtypes still dropped, comment updated\n3. **Hook wiring** — only registered when `onCompactSummary` is present, returns `{ continue: true }`, type cast is safe\n4. **Hook-stream correlation** — `lastCompactSummary` on `ActiveMeetingEntry` consumed correctly, post-loop cleanup for late arrivals\n5. **Transcript** — marker format matches spec, parser handles `## Context Compacted` headings, `truncateTranscript` regex extended\n6. **Parallel parser** — `lib/meetings.ts` `parseTranscriptToMessages` updated (easy to miss)\n7. **ChatMessage role union** — extended in `lib/types.ts` (shared type, affects both daemon and web)\n8. **MessageBubble system role** — info banner rendering, not speech bubble, `<details>` for summary\n9. **Commission passthrough** — `drainSdkSession` ignores unknown event types (REQ-MCC-15, MCC-16)\n10. **Exhaustive role checks audited** — grep for `role === \"user\"` and `role === \"assistant\"` patterns\n11. **Test coverage** — translator (6 cases), sdk-runner (4 cases), transcript (6 cases), parallel parser (3 cases), post-loop cleanup (1 case)\n\nWrite findings to `.lore/reviews/` as usual."
dependencies:
  - commission-Dalton-20260330-120739
linked_artifacts:
  - .lore/specs/meetings/meeting-context-compaction.md

  - .lore/plans/meetings/meeting-context-compaction.md
  - .lore/commissions/commission-Dalton-20260330-120739.md
  - .lore/plans/meetings/meeting-context-compaction.md
  - .lore/commissions/commission-Dalton-20260330-120739.md
activity_timeline:
  - timestamp: 2026-03-30T19:07:51.832Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T19:07:51.834Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-30T19:18:45.718Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-30T19:18:45.721Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T19:18:45.770Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T19:18:52.270Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and preceding commission artifact."
  - timestamp: 2026-03-30T19:19:08.861Z
    event: progress_report
    reason: "Spec, plan, and commission artifact read. Now reading the implementation files to verify against all 16 REQs."
  - timestamp: 2026-03-30T19:19:39.725Z
    event: progress_report
    reason: "Core implementation files verified. Now reading tests and checking role exhaustiveness, commission passthrough, and orchestrator wiring details."
  - timestamp: 2026-03-30T19:20:16.594Z
    event: progress_report
    reason: "All source files and tests read. Checking final details: role exhaustiveness in web layer and commission orchestrator passthrough."
  - timestamp: 2026-03-30T19:20:28.924Z
    event: progress_report
    reason: "All code and tests reviewed. Writing findings to .lore/reviews/."
  - timestamp: 2026-03-30T19:22:50.959Z
    event: result_submitted
    reason: "# Review: Meeting Context Compaction (commission-Dalton-20260330-120739)\n\n## Scope\n\nReviewed against the spec at `.lore/specs/meetings/meeting-context-compaction.md` (16 REQs) and the plan at `.lore/plans/meetings/meeting-context-compaction.md` (steps 1-7, delegation guide review scope items 1-11).\n\n## REQ Compliance\n\nAll 16 requirements are addressed. No drift from spec.\n\n| REQ | Status | Evidence |\n|-----|--------|----------|\n| MCC-1 | **Satisfied** | `event-translator.ts:212-223` — `translateSystemMessage` emits `context_compacted` for `compact_boundary` |\n| MCC-2 | **Satisfied** | `sdk-runner.ts:43` — `SdkRunnerEvent` union includes `context_compacted` variant with correct shape |\n| MCC-3 | **Satisfied** | `event-translator.ts:26-34` — `SdkSystemMessage` extended with `compact_metadata` |\n| MCC-4 | **Satisfied** | `event-translator.ts:226-227` — fallthrough returns `[]`; comment updated to list remaining internal subtypes without `compact_boundary` |\n| MCC-5 | **Satisfied** | `sdk-runner.ts:112` — `onCompactSummary` on `SessionPrepSpec` |\n| MCC-6 | **Satisfied** | `sdk-runner.ts:490-517` — `PostCompact` hook wired when callback present |\n| MCC-7 | **Satisfied** | `sdk-runner.ts:93` — `hooks` field on `SdkQueryOptions` |\n| MCC-8 | **Satisfied** | `sdk-runner.ts:491` — guard prevents hook registration when callback absent |\n| MCC-9 | **Satisfied** | `daemon/types.ts:95` — `context_compacted` variant on `GuildHallEvent` |\n| MCC-10 | **Satisfied** | `session-loop.ts:137-156` — maps event, attaches summary, yields `GuildHallEvent` |\n| MCC-11 | **Satisfied** | `orchestrator.ts:519-521` — `onCompactSummary` stores summary on `meeting.lastCompactSummary` |\n| MCC-12 | **Satisfied** | `transcript.ts:220-238` — `appendCompactionMarker` writes `## Context Compacted` section matching spec format |\n| MCC-13 | **Satisfied** | `transcript.ts:327,337-340,353-358` — parser recognizes headings, maps to `role: \"system\"` |\n| MCC-14 | **Satisfied** | `ChatInterface.tsx:302-318` SSE handler; `MessageBubble.tsx:23-38` renders info banner with `<details>` |\n| MCC-15 | **Satisfied** | `sdk-runner.ts:226-236` — `drainSdkSession` iterates without handling `context_compacted`; event falls through silently |\n| MCC-16 | **Satisfied** | No `onCompactSummary` reference in `daemon/services/commission/` |\n\n## Review Scope Items\n\n**1. Spec compliance** — All 16 REQs addressed, no drift. ✓\n\n**2. Event translator** — `compact_boundary` handled at `event-translator.ts:212`. Other subtypes (`status`, `hook_*`, `task_*`, `files_persisted`) continue returning `[]` via the fallthrough at line 227. Comment updated at line 226 to remove `compact_boundary` from internal list. ✓\n\n**3. Hook wiring** — Registered only when `onCompactSummary` is present (guard at `sdk-runner.ts:491`). Returns `{ continue: true }` (line 511). Type cast is safe: runtime checks on `typed.trigger` (line 502) and `typed.compact_summary` (line 507) before passing to callback. ✓\n\n**4. Hook-stream correlation** — `lastCompactSummary` on `ActiveMeetingEntry` (`registry.ts:28`) consumed at `session-loop.ts:139-140`. Post-loop cleanup at lines 179-186 handles late-arriving summaries. ✓\n\n**5. Transcript** — Marker format matches spec (`## Context Compacted (timestamp)` + description + optional `> Summary:`). Parser regex extended at `transcript.ts:327`. `truncateTranscript` regex extended at line 168. ✓\n\n**6. Parallel parser** — `lib/meetings.ts:288` regex updated. Role mapping at lines 298-300. System handling at lines 314-319. ✓\n\n**7. ChatMessage role union** — `lib/types.ts:389` includes `\"system\"`. Web types re-export chain (`web/components/meeting/types.ts` → `@/lib/types`) passes it through. ✓\n\n**8. MessageBubble system role** — Centered info banner (line 29, `styles.systemMessage`), not speech bubble. No portrait. `<details>` for summary (lines 32-36). CSS at `MessageBubble.module.css:126-156`. ✓\n\n**9. Commission passthrough** — `drainSdkSession` only checks `session`, `aborted`, `error`, `turn_end`. Unknown event types fall through silently. ✓\n\n**10. Exhaustive role checks** — Grepped `web/` and `daemon/` for `role === \"user\"` and `role === \"assistant\"` patterns. `MessageBubble.tsx` guards system first (line 23) before the `isUser` check (line 41). `transcript.ts` parser has explicit system handling at line 353. `lib/meetings.ts` parser has explicit system handling at line 314. No unhandled sites. ✓\n\n**11. Test coverage** — See findings below.\n\n## Findings\n\n### WARN-1: Post-loop cleanup test missing\n\n**Where:** Plan step 7e specifies a test for late-arriving `lastCompactSummary` after the `for await` loop exits. No such test exists in the test files.\n\n**Impact:** `session-loop.ts:179-186` is the race condition handler for when the PostCompact hook fires after the boundary event was already processed. This path is untested. Since it handles an asynchronous timing edge case, it's the exact kind of code that benefits most from a dedicated test.\n\n**Recommendation:** Add a test that simulates `meeting.lastCompactSummary` being set after the generator is exhausted and verifies `appendCompactSummarySafe` is called and the field is cleared. The plan suggests placing this in `tests/daemon/services/sdk-runner.test.ts` or a new session-loop test file.\n\n### WARN-2: Compaction tests nested under misleading describe block\n\n**Where:** `tests/daemon/event-translator.test.ts:454` — the compact_boundary tests are inside `describe(\"unknown/internal message types\")`.\n\n**Impact:** These are now handled types, not unknown/internal. The describe block name contradicts what the tests verify. Someone reading the test file would wrongly assume compact_boundary messages are dropped.\n\n**Recommendation:** Move the compaction tests to their own `describe(\"compact_boundary system messages\")` block, or rename the parent describe.\n\n### INFO-1: Orchestrator callback drops trigger parameter\n\n**Where:** `orchestrator.ts:519` — `onCompactSummary: (summary) => { meeting.lastCompactSummary = summary; }`\n\n**Impact:** The callback receives `(summary, trigger)` per the type, but `trigger` is unused. The current design only needs the summary for transcript attachment. Not a defect. If future work needs the trigger value on `ActiveMeetingEntry`, it would require adding a field.\n\n### INFO-2: Multiple compactions per session could misattribute summaries\n\n**Where:** `registry.ts:28` — single `lastCompactSummary` field.\n\n**Impact:** If the SDK compacts twice in one session and the events interleave (boundary1 arrives, hook1 fires, boundary2 arrives), hook1's summary could be attached to boundary2's event. The spec acknowledges this timing dependency (\"correlated by timing within the same turn\"). Multiple compactions per session are rare. Acceptable limitation for v1.\n\n## Test Coverage Summary\n\n| Category | Plan target | Actual | Gap |\n|----------|-------------|--------|-----|\n| Event translator | 6 cases | 6 cases (auto, manual, missing metadata, status→[], hook_started→[], stateful passthrough) | None |\n| SDK runner | 4 cases | 4 cases (hooks present, hooks absent, callback invocation, commission passthrough) | None |\n| Transcript | 6 cases | 6 cases (write with trigger, includes summary, omits summary, parser recognition, no toolUses, truncation) | None |\n| Parallel parser | 3 cases | 3 cases (system role, interleaved ordering, no toolUses) | None |\n| Post-loop cleanup | 1 case | 0 cases | **Missing** |\n| GuildHallEvent type | compile-time | compile-time + explicit constructibility test | None |\n\n## Verdict\n\nClean implementation. All 16 REQs satisfied with no spec drift. One test gap (WARN-1: post-loop cleanup) and one naming issue (WARN-2: misleading describe block). Two informational observations about edge cases that don't require action. No structural defects.\n\n---\n\n*Note: `.lore/reviews/` directory does not exist. Review artifact could not be written to disk (read-only posture). Full review content is in this submission.*"
  - timestamp: 2026-03-30T19:22:55.793Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All code and tests reviewed. Writing findings to .lore/reviews/."
projectName: guild-hall
---
# Review: Meeting Context Compaction (commission-Dalton-20260330-120739)

## Scope

Reviewed against the spec at `.lore/specs/meetings/meeting-context-compaction.md` (16 REQs) and the plan at `.lore/plans/meetings/meeting-context-compaction.md` (steps 1-7, delegation guide review scope items 1-11).

## REQ Compliance

All 16 requirements are addressed. No drift from spec.

| REQ | Status | Evidence |
|-----|--------|----------|
| MCC-1 | **Satisfied** | `event-translator.ts:212-223` — `translateSystemMessage` emits `context_compacted` for `compact_boundary` |
| MCC-2 | **Satisfied** | `sdk-runner.ts:43` — `SdkRunnerEvent` union includes `context_compacted` variant with correct shape |
| MCC-3 | **Satisfied** | `event-translator.ts:26-34` — `SdkSystemMessage` extended with `compact_metadata` |
| MCC-4 | **Satisfied** | `event-translator.ts:226-227` — fallthrough returns `[]`; comment updated to list remaining internal subtypes without `compact_boundary` |
| MCC-5 | **Satisfied** | `sdk-runner.ts:112` — `onCompactSummary` on `SessionPrepSpec` |
| MCC-6 | **Satisfied** | `sdk-runner.ts:490-517` — `PostCompact` hook wired when callback present |
| MCC-7 | **Satisfied** | `sdk-runner.ts:93` — `hooks` field on `SdkQueryOptions` |
| MCC-8 | **Satisfied** | `sdk-runner.ts:491` — guard prevents hook registration when callback absent |
| MCC-9 | **Satisfied** | `daemon/types.ts:95` — `context_compacted` variant on `GuildHallEvent` |
| MCC-10 | **Satisfied** | `session-loop.ts:137-156` — maps event, attaches summary, yields `GuildHallEvent` |
| MCC-11 | **Satisfied** | `orchestrator.ts:519-521` — `onCompactSummary` stores summary on `meeting.lastCompactSummary` |
| MCC-12 | **Satisfied** | `transcript.ts:220-238` — `appendCompactionMarker` writes `## Context Compacted` section matching spec format |
| MCC-13 | **Satisfied** | `transcript.ts:327,337-340,353-358` — parser recognizes headings, maps to `role: "system"` |
| MCC-14 | **Satisfied** | `ChatInterface.tsx:302-318` SSE handler; `MessageBubble.tsx:23-38` renders info banner with `<details>` |
| MCC-15 | **Satisfied** | `sdk-runner.ts:226-236` — `drainSdkSession` iterates without handling `context_compacted`; event falls through silently |
| MCC-16 | **Satisfied** | No `onCompactSummary` reference in `daemon/services/commission/` |

## Review Scope Items

**1. Spec compliance** — All 16 REQs addressed, no drift. ✓

**2. Event translator** — `compact_boundary` handled at `event-translator.ts:212`. Other subtypes (`status`, `hook_*`, `task_*`, `files_persisted`) continue returning `[]` via the fallthrough at line 227. Comment updated at line 226 to remove `compact_boundary` from internal list. ✓

**3. Hook wiring** — Registered only when `onCompactSummary` is present (guard at `sdk-runner.ts:491`). Returns `{ continue: true }` (line 511). Type cast is safe: runtime checks on `typed.trigger` (line 502) and `typed.compact_summary` (line 507) before passing to callback. ✓

**4. Hook-stream correlation** — `lastCompactSummary` on `ActiveMeetingEntry` (`registry.ts:28`) consumed at `session-loop.ts:139-140`. Post-loop cleanup at lines 179-186 handles late-arriving summaries. ✓

**5. Transcript** — Marker format matches spec (`## Context Compacted (timestamp)` + description + optional `> Summary:`). Parser regex extended at `transcript.ts:327`. `truncateTranscript` regex extended at line 168. ✓

**6. Parallel parser** — `lib/meetings.ts:288` regex updated. Role mapping at lines 298-300. System handling at lines 314-319. ✓

**7. ChatMessage role union** — `lib/types.ts:389` includes `"system"`. Web types re-export chain (`web/components/meeting/types.ts` → `@/lib/types`) passes it through. ✓

**8. MessageBubble system role** — Centered info banner (line 29, `styles.systemMessage`), not speech bubble. No portrait. `<details>` for summary (lines 32-36). CSS at `MessageBubble.module.css:126-156`. ✓

**9. Commission passthrough** — `drainSdkSession` only checks `session`, `aborted`, `error`, `turn_end`. Unknown event types fall through silently. ✓

**10. Exhaustive role checks** — Grepped `web/` and `daemon/` for `role === "user"` and `role === "assistant"` patterns. `MessageBubble.tsx` guards system first (line 23) before the `isUser` check (line 41). `transcript.ts` parser has explicit system handling at line 353. `lib/meetings.ts` parser has explicit system handling at line 314. No unhandled sites. ✓

**11. Test coverage** — See findings below.

## Findings

### WARN-1: Post-loop cleanup test missing

**Where:** Plan step 7e specifies a test for late-arriving `lastCompactSummary` after the `for await` loop exits. No such test exists in the test files.

**Impact:** `session-loop.ts:179-186` is the race condition handler for when the PostCompact hook fires after the boundary event was already processed. This path is untested. Since it handles an asynchronous timing edge case, it's the exact kind of code that benefits most from a dedicated test.

**Recommendation:** Add a test that simulates `meeting.lastCompactSummary` being set after the generator is exhausted and verifies `appendCompactSummarySafe` is called and the field is cleared. The plan suggests placing this in `tests/daemon/services/sdk-runner.test.ts` or a new session-loop test file.

### WARN-2: Compaction tests nested under misleading describe block

**Where:** `tests/daemon/event-translator.test.ts:454` — the compact_boundary tests are inside `describe("unknown/internal message types")`.

**Impact:** These are now handled types, not unknown/internal. The describe block name contradicts what the tests verify. Someone reading the test file would wrongly assume compact_boundary messages are dropped.

**Recommendation:** Move the compaction tests to their own `describe("compact_boundary system messages")` block, or rename the parent describe.

### INFO-1: Orchestrator callback drops trigger parameter

**Where:** `orchestrator.ts:519` — `onCompactSummary: (summary) => { meeting.lastCompactSummary = summary; }`

**Impact:** The callback receives `(summary, trigger)` per the type, but `trigger` is unused. The current design only needs the summary for transcript attachment. Not a defect. If future work needs the trigger value on `ActiveMeetingEntry`, it would require adding a field.

### INFO-2: Multiple compactions per session could misattribute summaries

**Where:** `registry.ts:28` — single `lastCompactSummary` field.

**Impact:** If the SDK compacts twice in one session and the events interleave (boundary1 arrives, hook1 fires, boundary2 arrives), hook1's summary could be attached to boundary2's event. The spec acknowledges this timing dependency ("correlated by timing within the same turn"). Multiple compactions per session are rare. Acceptable limitation for v1.

## Test Coverage Summary

| Category | Plan target | Actual | Gap |
|----------|-------------|--------|-----|
| Event translator | 6 cases | 6 cases (auto, manual, missing metadata, status→[], hook_started→[], stateful passthrough) | None |
| SDK runner | 4 cases | 4 cases (hooks present, hooks absent, callback invocation, commission passthrough) | None |
| Transcript | 6 cases | 6 cases (write with trigger, includes summary, omits summary, parser recognition, no toolUses, truncation) | None |
| Parallel parser | 3 cases | 3 cases (system role, interleaved ordering, no toolUses) | None |
| Post-loop cleanup | 1 case | 0 cases | **Missing** |
| GuildHallEvent type | compile-time | compile-time + explicit constructibility test | None |

## Verdict

Clean implementation. All 16 REQs satisfied with no spec drift. One test gap (WARN-1: post-loop cleanup) and one naming issue (WARN-2: misleading describe block). Two informational observations about edge cases that don't require action. No structural defects.

---

*Note: `.lore/reviews/` directory does not exist. Review artifact could not be written to disk (read-only posture). Full review content is in this submission.*
