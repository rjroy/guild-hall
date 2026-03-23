---
title: Commission Incomplete Status
date: 2026-03-20
status: wontfix
tags: [commissions, lifecycle, incomplete, toolbox, event-bus, triage]
modules: [daemon/services/commission/orchestrator, daemon/services/commission/lifecycle, daemon/services/commission/toolbox, daemon/lib/event-bus, daemon/types]
related:
  - .lore/brainstorm/worker-sub-agents-and-mail-removal.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/commission-halted-continuation.md
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md
  - .lore/brainstorm/triggered-commissions.md
req-prefix: CINC
---

# Spec: Commission Incomplete Status

## Overview

When a worker realizes it cannot finish a commission (wrong specialization, missing context, blocked by something outside its scope), it has no honest exit. It either forces a `completed` with caveats, or burns turns until `halted`. Both waste resources and obscure what actually happened.

This spec adds `incomplete` as a terminal commission status. A worker calls `submit_incomplete` to declare what it accomplished, why it stopped, and what should happen next. Partial work is merged. Dependencies do not fire. The annotation surfaces to the Guild Master for triage.

The distinction from `halted` matters: `halted` means "ran out of turns" (system-initiated, recoverable). `incomplete` means "recognized a boundary" (worker-initiated, terminal). The worker made a deliberate judgment call.

## Entry Points

- Worker calls `submit_incomplete` during an active commission (from commission toolbox)
- Source brainstorm: `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 3
- Extends the commission lifecycle defined in [Spec: Guild Hall Commissions](guild-hall-commissions.md)
- Follows patterns from [Spec: Commission Halted State](commission-halted-continuation.md) for partial work preservation

## Requirements

### Status and Lifecycle

- REQ-CINC-1: Add `"incomplete"` to `CommissionStatus` in `daemon/types.ts`. This is a terminal status, like `completed`, `failed`, `cancelled`, and `abandoned`.

- REQ-CINC-2: Add transition `in_progress -> incomplete` to the lifecycle state machine in `daemon/services/commission/lifecycle.ts`. No other state transitions to `incomplete`. Unlike `halted`, there is no recovery path: `incomplete` is terminal and cannot transition to any other state.

- REQ-CINC-3: The commission has ten states after this change (amends REQ-COM-34): `pending`, `blocked`, `dispatched`, `in_progress`, `halted`, `incomplete`, `completed`, `failed`, `cancelled`, `abandoned`.

- REQ-CINC-4: `incomplete` does NOT satisfy dependency checks. In `checkDependencyTransitions`, a dependency commission with status `incomplete` is not counted as satisfied. The existing logic checks for `completed` or `abandoned` (orchestrator.ts:1089-1091). `incomplete` is deliberately excluded so the dependency chain breaks, surfacing the gap to the manager rather than silently proceeding.

- REQ-CINC-5: `incomplete` commissions do not count against concurrent commission limits. Once the status transitions, the execution context is cleaned up the same way as `completed` or `failed`.

### Commission Toolbox

- REQ-CINC-6: Add a `submit_incomplete` tool to the commission toolbox alongside `submit_result`. Parameters:
  - `summary` (string, required): What the worker accomplished before stopping.
  - `reason` (string, required): Why the worker cannot finish. Should name the specific boundary (wrong specialization, missing context, blocked by external dependency, etc.).
  - `annotation` (string, required): What should happen next. Directed at the Guild Master for triage ("this needs a developer, not a writer", "blocked on X being resolved first", "the spec is ambiguous about Y").

- REQ-CINC-7: `submit_incomplete` is mutually exclusive with `submit_result`. If the worker has already called `submit_result`, `submit_incomplete` returns an error. If the worker has called `submit_incomplete`, subsequent calls to `submit_result` or `submit_incomplete` return errors. `report_progress` remains callable after `submit_incomplete` (the worker may log cleanup activity).

- REQ-CINC-8: `submit_incomplete` writes to the commission artifact before signaling. Three writes:
  1. Update `result_summary` with the summary (same field as `submit_result`, so the artifact viewer shows what was accomplished).
  2. Append a timeline event of type `result_incomplete` with the reason.
  3. Append an `## Incomplete` section to the artifact body containing the reason and annotation, formatted as:

  ```markdown
  ## Incomplete

  **Reason:** {reason}

  **Annotation:** {annotation}
  ```

- REQ-CINC-9: After the file writes succeed, `submit_incomplete` sets `incompleteSubmitted = true` on the session state and fires the `onIncomplete` callback. The callback is the notification path to the orchestrator, same pattern as `onResult`.

### Orchestrator Behavior

- REQ-CINC-10: When the session runner reports an incomplete signal (via the `onIncomplete` callback translated through EventBus), the orchestrator:
  1. Transitions the lifecycle to `incomplete` with the reason as the transition reason.
  2. Persists any `record_decision` entries to the artifact (REQ-DSRF-3, same step as `handleSuccessfulCompletion`). This is separate from the `## Incomplete` section written by the toolbox in REQ-CINC-8.
  3. Runs `workspace.finalize()` to squash-merge partial work to `claude`, same flow as `saveCommission` on halted commissions. The commit message is `Commission incomplete: {commissionId}`.
  4. On successful merge: emits `commission_status` event, deletes state file, cleans up worktree.
  5. On merge conflict: transitions to `failed` and escalates to Guild Master meeting request, same as the existing conflict handler. The worker's intent (`incomplete`) is preserved in the artifact body's `## Incomplete` section, but the lifecycle status reflects the merge failure. This matches the pattern from `saveCommission` where a merge conflict during save also transitions to `failed`.
  6. Calls `enqueueAutoDispatch()` (so queued commissions waiting for capacity can dispatch) but does NOT call `checkDependencyTransitions()`. The incomplete status deliberately does not unblock anything.

- REQ-CINC-11: If the session ends normally after `submit_incomplete` was called (the worker may do cleanup work after submitting), the orchestrator treats it as incomplete, not as "completed without submitting result." The `incompleteSubmitted` flag takes precedence over the absence of `resultSubmitted`.

- REQ-CINC-12: If the session ends with an error after `submit_incomplete` was called, the commission is still `incomplete` (not `failed`). The incomplete signal was explicitly registered before the error, same logic as REQ-COM-14 ("Error with submitted result: transition to completed").

### Crash Recovery

- REQ-CINC-23: Crash recovery does not introduce special handling for incomplete commissions. If the daemon crashes after `submit_incomplete` writes to the artifact but before `workspace.finalize()` completes, the existing crash recovery path (REQ-COM-27) transitions the commission to `failed`. This is accepted behavior: the `## Incomplete` section in the artifact body survives the crash (it was written before the signal), so the worker's reason and annotation are preserved even though the lifecycle status says `failed`. The manager or user can read the artifact to understand what happened.

### Event Bus

- REQ-CINC-13: Add a `commission_incomplete` event type to `SystemEvent` in `daemon/lib/event-bus.ts`:

  ```typescript
  | { type: "commission_incomplete"; commissionId: string; summary: string; reason: string; annotation: string }
  ```

  This event is emitted by the commission toolbox (via the `onIncomplete` callback through EventBus) when `submit_incomplete` is called. It is a domain event distinct from `commission_status` because it carries structured fields (`reason`, `annotation`) that the status event does not.

- REQ-CINC-14: The `commission_status` event is also emitted during the lifecycle transition (as with all status changes), carrying `status: "incomplete"` and the reason. Both events fire: `commission_incomplete` from the toolbox (with the full payload) and `commission_status` from the lifecycle (with the transition metadata). Consumers choose which to subscribe to based on what they need.

- REQ-CINC-15: Add `"commission_incomplete"` to `SYSTEM_EVENT_TYPES` in `lib/types.ts`.

### Outcomes-to-Memory Integration

- REQ-CINC-16: The outcomes-to-memory triage service subscribes to `commission_incomplete` events in addition to `commission_result` and `meeting_ended` (amends REQ-OTMEM-2). The outcomes-to-memory spec excluded non-completed commissions because `failed` broke before reaching conclusions and `halted` is recoverable. `incomplete` is different: the worker reached a deliberate conclusion about its own limits and produced structured analysis (reason, annotation) worth extracting. The annotation in particular contains forward-looking recommendations that future workers should know about.

- REQ-CINC-17: The triage session's input assembly for incomplete commissions includes: worker name, task description (from the artifact), outcome status `"incomplete"`, result text (the summary), and the reason and annotation fields. The annotation is particularly valuable because it contains the worker's judgment about what should happen next.

### Briefing Integration

- REQ-CINC-18: Incomplete commissions surface in the Guild Master's briefing context. The briefing generator includes `incomplete` commissions in the active work summary alongside `halted` and `failed`, with the annotation text visible. The annotation is the Guild Master's primary signal for triage: it tells the manager what the worker thinks should happen next.

### UI

- REQ-CINC-19: The web UI commission viewer displays `incomplete` as a distinct terminal status. The annotation from the `## Incomplete` section is visible in the commission detail view. The status should be visually distinct from `completed` (success), `failed` (error), and `halted` (waiting).

- REQ-CINC-20: The commission list view shows `incomplete` commissions in the terminal group alongside `completed`, `failed`, `cancelled`, and `abandoned`. The status label distinguishes it from the others.

### Event Router Integration

- REQ-CINC-21: The `commission_incomplete` event is available for event router notification rules. A rule with `match.type: "commission_incomplete"` fires when any commission is marked incomplete. This enables notifications when workers hit boundaries (e.g., shell command to alert the user, webhook to a tracking system).

- REQ-CINC-22: The `commission_incomplete` event is a natural trigger source for the triggered commissions system (when implemented). The event payload carries `commissionId`, `summary`, `reason`, and `annotation`, all of which are available as template variables in trigger commission definitions. A trigger matching `commission_incomplete` could automatically dispatch a follow-up commission to the right worker based on the annotation.

  > **Design gap:** The triggered commissions system is not yet implemented. REQ-CINC-22 is a forward-looking note, not a requirement for this spec. The event payload is designed with triggered commissions in mind so the integration is clean when it arrives. No work is required for this requirement beyond emitting the event with the specified fields (REQ-CINC-13).

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Triggered commissions | `commission_incomplete` event could auto-dispatch follow-up work | [Brainstorm: triggered-commissions](../../brainstorm/triggered-commissions.md) |
| Guild Master triage | Manager reads annotation and decides next action | Existing manager toolbox (manual dispatch) |

## Success Criteria

- [ ] `CommissionStatus` includes `"incomplete"` and lifecycle allows `in_progress -> incomplete`
- [ ] `submit_incomplete` tool exists in commission toolbox with summary, reason, and annotation parameters
- [ ] `submit_incomplete` is mutually exclusive with `submit_result`
- [ ] Calling `submit_incomplete` writes the summary, reason, and annotation to the commission artifact
- [ ] Partial work is squash-merged to `claude` on incomplete (same as save on halted)
- [ ] Dependencies of the incomplete commission do NOT fire
- [ ] `commission_incomplete` event emitted with full payload (commissionId, summary, reason, annotation)
- [ ] Outcomes-to-memory triage fires on `commission_incomplete` events
- [ ] Briefing generator surfaces incomplete commissions with annotation
- [ ] Crash recovery: daemon restart with mid-incomplete commission transitions to `failed`; `## Incomplete` section survives in artifact
- [ ] Merge conflict during incomplete finalization transitions to `failed` and escalates
- [ ] Web UI displays incomplete status with annotation visible

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem, git operations, and session management
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- State machine test: `in_progress -> incomplete` succeeds; no other state transitions to `incomplete`; `incomplete` has no outgoing transitions
- Toolbox mutual exclusion test: `submit_incomplete` after `submit_result` returns error; `submit_result` after `submit_incomplete` returns error; double `submit_incomplete` returns error
- Artifact write test: after `submit_incomplete`, artifact contains updated `result_summary`, `result_incomplete` timeline event, and `## Incomplete` section with reason and annotation
- Dependency test: commission B depends on commission A; A completes as `incomplete`; B remains `blocked` (does not transition to `pending`)
- Merge test: incomplete commission's partial work is squash-merged to `claude`; worktree is cleaned up; state file is deleted
- Event test: `commission_incomplete` event is emitted with correct payload fields; `commission_status` event is also emitted with `status: "incomplete"`
- Session end test: session ends normally after `submit_incomplete`; commission is `incomplete`, not `failed`
- Session error test: session ends with error after `submit_incomplete`; commission is still `incomplete`
- Crash recovery test: simulate daemon restart with `submit_incomplete` file writes done but no merge; commission transitions to `failed`; `## Incomplete` section present in artifact on branch
- Merge conflict test: `workspace.finalize()` fails with conflict during incomplete handling; commission transitions to `failed`; Guild Master meeting request created
- Briefing test: briefing generator with incomplete commission produces output containing the annotation text

## Constraints

- `incomplete` is terminal. There is no continue, save, or redispatch path. If the work needs to be retried, the manager creates a new commission. This is intentional: the worker's annotation explains what needs to change, and a retry with the same inputs would hit the same boundary.
- The only prerequisite for `submit_incomplete` is `in_progress` status, regardless of how the commission reached that state.
- The `## Incomplete` section in the artifact body is append-only. If a commission somehow reaches `submit_incomplete` twice (guarded by REQ-CINC-7, but defense in depth), the section is not duplicated.
- No new state file type for incomplete commissions. Unlike `halted` (which preserves the worktree for continuation), incomplete commissions finalize immediately. The state file is deleted after merge.

## Context

- [Brainstorm: Worker Sub-Agents and Mail Removal](.lore/brainstorm/worker-sub-agents-and-mail-removal.md): Proposal 3 is the source for this spec. The brainstorm frames `incomplete` as a replacement for the mail system's delegation use case: instead of "ask someone else," the worker says "I can't, here's why, here's what should happen."
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): Parent spec for the commission lifecycle. This spec extends it with the eleventh state.
- [Spec: Commission Halted State](commission-halted-continuation.md): Closest precedent. The halted spec added a new status with worktree preservation and user-initiated actions. This spec follows the same patterns for lifecycle changes, artifact updates, and orchestrator integration, but with a simpler flow (no continue/save, just merge and clean up).
- [Spec: Event Router](../infrastructure/event-router.md): Defines the notification system that will route `commission_incomplete` events.
- [Spec: Outcomes to Memory](../infrastructure/commission-outcomes-to-memory.md): Currently listens only to `commission_result` and `meeting_ended`. This spec extends it to also listen to `commission_incomplete`.
- [Brainstorm: Triggered Commissions](.lore/brainstorm/triggered-commissions.md): Forward-looking integration point. The `commission_incomplete` event payload is designed to serve as a trigger source when that system is built.
