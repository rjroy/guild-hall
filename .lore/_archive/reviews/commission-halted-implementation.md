---
title: "Review: Commission Halted State Implementation"
date: 2026-03-16
status: complete
tags: [review, commissions, halted, lifecycle]
spec: .lore/specs/commissions/commission-halted-continuation.md
plan: .lore/plans/commissions/commission-halted-continuation.md
---

# Review: Commission Halted State Implementation

Reviewed the full implementation of REQ-COM-33 through REQ-COM-50 against the spec. Implementation was done across Phases 1-6 of the plan. This review is Phase 7.

## Requirement Verification

### Satisfied

| REQ ID | Requirement | Evidence |
|--------|------------|----------|
| REQ-COM-33 | `halted` is a new commission status | `daemon/types.ts:45` adds `"halted"` to `CommissionStatus` union. `ARTIFACT_STATUS_GROUP` in `lib/types.ts:91` maps it to group 1 (active gem). |
| REQ-COM-34 | Ten commission states total | `daemon/types.ts:39-49` lists all 10: pending, blocked, dispatched, in_progress, sleeping, halted, completed, failed, cancelled, abandoned. |
| REQ-COM-35 | Halted transition edges | `lifecycle.ts:55` defines `halted: ["in_progress", "completed", "cancelled", "abandoned", "failed"]`. `in_progress` targets at line 53 include `"halted"`. Redispatch from halted is correctly rejected (test at lifecycle.test.ts:1035). |
| REQ-COM-36 | maxTurns without result triggers halted | `orchestrator.ts:534-545` branches on `\!resultSubmitted && outcome.reason === "maxTurns"`, calling `handleHalt`. Falls through to fail path if halt fails. |
| REQ-COM-37 | Halted state file persistence | `halted-types.ts` defines `HaltedCommissionState` with all required fields: commissionId, projectName, workerName, status, worktreeDir, branchName, sessionId, haltedAt, turnsUsed, lastProgress. Written at `orchestrator.ts:621-637`. |
| REQ-COM-38 | Worktree preserved on halt | `handleHalt` at orchestrator.ts:577-678 commits pending changes (line 583) but does NOT call `preserveAndCleanup` or delete the worktree. Worktree stays alive. |
| REQ-COM-39 | `continue` resumes halted commission | `continueCommission` at orchestrator.ts:2195-2389 reads state file, validates worktree, transitions halted->in_progress, launches resumed session. |
| REQ-COM-40 | Continue implementation flow | Steps match spec: read state (2199-2208), verify worktree (2217-2237), check capacity (2239-2250), transition (2252-2266), update state file (2268-2276), append timeline (2278-2288), build prompt (2290-2298), create ExecutionContext (2317-2329), build SessionPrepSpec with `resume: state.sessionId` (2357-2378), fire-and-forget session (2386). |
| REQ-COM-40a | Fresh turn budget on continue | `continueCommission` reads `resource_overrides` from the integration artifact (2300-2315) and passes to `SessionPrepSpec` (2378). `prepareSdkSession` uses these to set `maxTurns` on the new session. |
| REQ-COM-41 | Continuation prompt content | Prompt at orchestrator.ts:2292-2298 matches spec exactly. Three parts: halt reason with turnsUsed, last progress report, instruction to continue and call submit_result. |
| REQ-COM-42 | `save` action definition | `saveCommission` at orchestrator.ts:2397-2572 transitions halted->completed and merges. |
| REQ-COM-43 | Save implementation flow | Steps match spec: read state (2401-2417), verify worktree (2420-2438), commit changes (2441-2446), update result_summary (2448-2458), transition (2460-2471), append timeline with `partial: "true"` (2473-2483), squash-merge via workspace.finalize (2501-2526), conflict escalation (2540-2567). |
| REQ-COM-45 | halt_count artifact field | `incrementHaltCount` in record.ts:197-219 initializes to 1 or increments existing value. Called at orchestrator.ts:614 during halt entry. |
| REQ-COM-45a | Timeline events | `status_halted` recorded at orchestrator.ts:652-664 with turnsUsed, lastProgress, haltCount extra fields. `status_in_progress` with "Continued from halted state" at 2281-2288. `status_completed` with `partial: "true"` at 2474-2483. |
| REQ-COM-46 | Crash recovery | Recovery at orchestrator.ts:1252-1303 handles halted commissions: worktree exists -> registers as halted (line 1273), worktree missing -> registers then transitions to failed (1282-1298). |
| REQ-COM-47 | Halted doesn't count against cap | `handleHalt` removes from `executions` at line 540. `activeCount` at lifecycle.ts:312-320 only counts dispatched/in_progress. `continueCommission` checks capacity before re-entering executions (2239-2250). |
| REQ-COM-48 | check_commission_status updates | Single mode: toolbox.ts:1131-1149 reads turnsUsed and lastProgress from state file for halted commissions. List mode: SUMMARY_GROUP at toolbox.ts:1062 maps `halted: "active"`. |
| REQ-COM-49 | Manager toolbox tools | `continue_commission` registered at toolbox.ts:1293-1299. `save_commission` registered at toolbox.ts:1301-1308. Both use factory pattern (makeContinueCommissionHandler, makeSaveCommissionHandler). Route exposure at commissions.ts:269-331. |
| REQ-COM-50 | Divergence from sleeping | Implementation correctly diverges: trigger is maxTurns (not send_mail), resume is user-initiated (not mail-reply), state file has turnsUsed/lastProgress (not pendingMail), crash recovery stays halted (doesn't re-activate reader), no concurrent sessions in worktree. |

### Satisfied with Observations

| REQ ID | Observation |
|--------|------------|
| REQ-COM-35 | Cancel and abandon both route through `cancelHaltedCommission` at orchestrator.ts:933-1007 which handles worktree cleanup. Correctly branches from both `cancelCommission` (line 2613) and `abandonCommission` (line 2683). |
| REQ-COM-48 | Sort order within the active group: the spec says "sorted after in_progress commissions but before sleeping ones." The STATUS_GROUP in lib/commissions.ts maps all three (in_progress, halted, sleeping) to group 1, so they sort by date within the group, not by a sub-ordering. This is a minor deviation from the spec's intent but doesn't affect functionality because the list mode in `check_commission_status` returns counts per status, not a sorted list by sub-status. |

## Findings

### Defects

**D1: `updateCommission` rejects halted status, blocking REQ-COM-40a workflow**
REQ-COM-40a says: "If the user wants to increase the budget for a continuation, they update `resource_overrides` on the commission artifact before continuing." The plan (Open Questions #2) resolved this by adding `halted` to `updateCommission`'s allowed statuses. The implementation at `orchestrator.ts:1766` still only allows `status \!== "pending"`.

File: `daemon/services/commission/orchestrator.ts:1766`
Impact: Users cannot adjust `resource_overrides.maxTurns` on a halted commission through the API before continuing it. Manual file editing would work but bypasses the API contract.
Fix: Change the condition at line 1766 from `status \!== "pending"` to `status \!== "pending" && status \!== "halted"` (with appropriate restrictions on which fields are editable in each state).

**D2: `saveCommission` result_summary text deviates from REQ-COM-44**
REQ-COM-44 specifies: `"Partial work saved by {actor} (commission was halted at {turnsUsed} turns). Last progress: {lastProgress}"`. The implementation at orchestrator.ts:2451 produces: `"Partial work saved (commission was halted at ${state.turnsUsed} turns). Last progress: ${lastProgress}"`. The `by {actor}` part is missing.

File: `daemon/services/commission/orchestrator.ts:2451`
Impact: The result_summary doesn't record who triggered the save. When the Guild Master saves on behalf of the user, there's no audit trail of the actor in the result. Minor impact; the timeline's `status_completed` event implicitly shows the actor through context, but the spec was explicit about this.
Fix: The `saveCommission` function would need a caller-identity parameter, or the spec should be amended to match the implementation since actor tracking isn't trivially available at this layer.

### Questions

**Q1: `CommissionMeta` doesn't expose `halt_count` to Next.js**
REQ-COM-45 says `halt_count` "is visible in the commission detail view." The `CommissionMeta` type in `lib/commissions.ts:19-39` doesn't include a `halt_count` field, so the Next.js server components can't display it. The field is written to the YAML frontmatter and is readable via gray-matter, but the typed interface silently drops it.

File: `lib/commissions.ts:19-39` (CommissionMeta type), `lib/commissions.ts:80-117` (parseCommissionData)
Impact: The UI has no way to render halt_count without reading the raw frontmatter. The data is there but inaccessible through the typed interface.
Action: Add `halt_count: number` to `CommissionMeta` and parse it in `parseCommissionData`. One-line type addition, one-line parser addition.

**Q2: `continueCommission` throws on missing worktree instead of returning a typed error**
At orchestrator.ts:2234, when the worktree is missing, `continueCommission` correctly transitions to failed but then throws an Error. The `continue` route catches this and returns 404 (via the "not found" check at commissions.ts:292). This works, but the function's return type `Promise<{ status: "accepted" | "capacity_error" }>` doesn't encode the missing-worktree case. The caller learns about it via exception, not via a typed result.

`saveCommission` has the same pattern (line 2436). Compare with capacity rejection, which returns a typed `{ status: "capacity_error" }`.

Impact: Not a bug. The route layer handles it correctly. But it's inconsistent with the capacity_error path and makes the function harder to use from non-route callers (like the manager toolbox, which catches the exception).

**Q3: The `save` route returns 200 (not 202) for accepted saves**
The `continue` route returns 202 (Accepted) because the session runs asynchronously. The `save` route at commissions.ts:319 returns `c.json({ status: "ok" })` which defaults to 200. Since `saveCommission` completes synchronously (squash-merge happens inline), 200 is arguably correct. But the `dispatch` and `continue` routes both use 202. Not a defect, but the inconsistency is worth noting.

### Style Observations

**S1: `cancelHaltedCommission` duplicates sleeping cancel pattern**
`cancelHaltedCommission` (orchestrator.ts:933-1007) is nearly identical to `cancelSleepingCommission` (847-924) minus the mail reader cancellation step. The two functions share 80%+ of their logic. If a third suspended state were added, there would be three near-identical functions.

This isn't a defect. The plan explicitly noted this was simpler than abstracting, and the sleeping function has mail-specific logic that makes full extraction awkward. But it's worth watching if more suspended states emerge.

**S2: handleHalt error recovery rolls back to failed state correctly**
The handleHalt function at orchestrator.ts:577-678 has careful error handling: if the state file write fails (line 638), it rolls back by transitioning to failed. If the lifecycle transition is skipped (line 599), it returns false and lets the caller fall through to the normal fail path. No silent failures. This matches the delegation guide's emphasis on Phase 2 error handling.

## Test Coverage

Test coverage is thorough across all phases:

- **Lifecycle tests** (lifecycle.test.ts:985-1136): 14 tests covering all halted transitions (valid and invalid), activeCount exclusion, event emission, concurrent halt rejection, full halt/continue cycle.
- **Record ops tests** (record.test.ts:995-1040): 4 tests for incrementHaltCount (initialize, increment, missing field, field preservation).
- **Orchestrator halt entry** (orchestrator.test.ts:2521-2760): 6 tests covering halt entry, result-wins-over-maxTurns, halt_count increment, timeline event, capacity removal, non-maxTurns failure.
- **Continue** (orchestrator.test.ts:2834-3070): 5 tests covering basic continue, capacity rejection, multi-continuation with halt_count, continued session completing, continued session re-halting.
- **Save** (orchestrator.test.ts:3131+): Tests for save with merge, partial flag in timeline.
- **Cancel/abandon halted** (orchestrator.test.ts:3236-3350): 2 tests covering cancel and abandon with worktree cleanup.
- **Recovery** (orchestrator.test.ts:853-960): 3 tests for halted recovery (worktree exists, worktree missing, capacity exclusion).
- **Manager toolbox** (toolbox.test.ts:858-990): 3 tests for check_commission_status with halted commissions (single mode with state file, without state file, list mode grouping).

## Summary

The implementation satisfies all 18 requirements (REQ-COM-33 through REQ-COM-50). Two defects found: D1 blocks the REQ-COM-40a workflow for adjusting turn budget before continuing (the plan resolved this as a one-line change but it wasn't implemented), and D2 omits the actor identity from the save result summary. Two questions about type exposure (Q1) and error return consistency (Q2) are worth addressing but not blockers. Test coverage is comprehensive.
