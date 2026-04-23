---
title: "Plan: Triggered Commissions Core Architecture"
date: 2026-03-21
status: executed
tags: [commissions, event-router, triggers, daemon]
modules: [event-router, commission-orchestrator, trigger-evaluator]
related:
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/specs/infrastructure/event-router.md
  - .lore/specs/infrastructure/event-router-field-matching.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
---

# Plan: Triggered Commissions Core Architecture

## Spec Reference

**Spec**: `.lore/specs/commissions/triggered-commissions.md`
**Brainstorm**: `.lore/brainstorm/triggered-commissions.md`
**Event Router**: `.lore/specs/infrastructure/event-router.md`
**Field Matching**: `.lore/specs/infrastructure/event-router-field-matching.md`

Requirements addressed (Phase 1, daemon-side infrastructure):

- REQ-TRIG-1, 2, 3: Trigger artifact shape (type, trigger block, match rule)
- REQ-TRIG-4, 5, 6: Trigger lifecycle (active/paused/completed/failed status set)
- REQ-TRIG-7, 8, 9: Commission template (worker, prompt, title, dependencies, project scope)
- REQ-TRIG-10, 11, 12: Template variable expansion (`{{fieldName}}` substitution)
- REQ-TRIG-13, 14, 15, 16: Approval model (auto/confirm, depth downgrade)
- REQ-TRIG-17, 18, 19: Provenance tracking (`triggered_by` block, depth computation)
- REQ-TRIG-20, 21, 22, 23, 24: Loop prevention (depth limit, source exclusion)
- REQ-TRIG-25, 26: Trigger state updates (runs_completed, last_triggered, last_spawned_id)
- REQ-TRIG-27, 28, 29, 30, 31, 32: Architecture (trigger evaluator service, router integration, handler structure)
- REQ-TRIG-33, 34, 35: Commission creation (sourceTrigger option, triggered_by frontmatter, timeline)
- REQ-TRIG-36, 37: Type definitions (TriggeredBy, TriggerBlock)

**Not covered by this plan** (separate plans):
- REQ-TRIG-25a through 25d: Guild Master toolbox tools (create_triggered_commission, update_trigger)
- REQ-TRIG-38 through 42: Web UI (trigger panels, actions, API routes)

## Codebase Context

**Commission orchestrator** (`apps/daemon/services/commission/orchestrator.ts`): Layer 5. Implements `CommissionSessionForRoutes` with `createCommission()` at line 1268. Already accepts `options?: { type?: CommissionType; sourceSchedule?: string }`. The `createScheduledCommission()` method at line 1366 is a separate function for schedule artifacts. Triggered commissions reuse `createCommission()` because spawned commissions are one-shot, not triggered.

**Event Router** (`apps/daemon/services/event-router.ts`): Generic filtered subscription layer. `subscribe(rule, handler)` returns an unsubscribe function. The router evaluates `EventMatchRule` (type, projectName, fields with micromatch glob patterns) and calls handlers for matches. Handlers run fire-and-forget; errors are caught and logged.

**Notification Service** (`apps/daemon/services/notification-service.ts`): First Event Router consumer. Pattern to follow: receives router as a dep, iterates rules, calls `router.subscribe()` per rule, holds unsubscribe callbacks, returns a cleanup function. Fire-and-forget async wrapper for dispatch. This is the template for the trigger evaluator.

**Scheduler** (`apps/daemon/services/scheduler/index.ts`): Class-based service with `start()/stop()`. Scans `.lore/commissions/` for `type: scheduled`, `status: active`. Processes per-schedule with error isolation. Uses `CommissionSessionForRoutes` to spawn one-shot commissions. Reads/writes schedule metadata via `CommissionRecordOps`. This plan's trigger evaluator follows a different activation model (event-driven, not timer-driven) but shares the scan-on-startup pattern.

**Production wiring** (`apps/daemon/app.ts`): `createProductionApp()` assembles all services. Event Router is created from EventBus. Notification service and scheduler are wired after the commission orchestrator. The trigger evaluator slots in after the Event Router, same position as the notification service.

**Type system** (`apps/daemon/types.ts`): `CommissionType = "one-shot" | "scheduled"`. Needs `"triggered"` added. `SYSTEM_EVENT_TYPES` in `lib/types.ts` lists all event type strings.

**Commission record ops** (`apps/daemon/services/commission/record.ts`): Layer 1 YAML I/O. `readScheduleMetadata()`, `writeScheduleFields()`, `appendTimeline()`, `writeStatusAndTimeline()` exist for scheduled commissions. The trigger evaluator needs similar read/write for the `trigger` block.

## Implementation Steps

### Step 1: Type definitions

**Files**: `apps/daemon/types.ts`, `lib/types.ts`
**Addresses**: REQ-TRIG-1, REQ-TRIG-36, REQ-TRIG-37

Extend the type system with trigger-specific types.

In `apps/daemon/types.ts`:
- Extend `CommissionType` to `"one-shot" | "scheduled" | "triggered"`.
- Add `TriggeredBy` interface: `{ source_id: string; trigger_artifact: string; depth: number }`.
- Add `TriggerBlock` interface: `{ match: EventMatchRule; approval?: "auto" | "confirm"; maxDepth?: number; runs_completed: number; last_triggered: string | null; last_spawned_id: string | null }`. Import `EventMatchRule` from `apps/daemon/services/event-router.ts`.

No new event types needed. Trigger firings produce `commission_status` events from the spawned commissions through the existing commission lifecycle.

Tests: Type-level only. Verify the existing `CommissionType` tests still pass with the new union member.

### Step 2: Commission creation with trigger provenance

**Files**: `apps/daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-TRIG-33, REQ-TRIG-34, REQ-TRIG-35

Extend `createCommission()` to support trigger provenance, following the same pattern as `sourceSchedule`.

In `CommissionSessionForRoutes` interface, extend the `options` parameter:
```typescript
options?: {
  type?: CommissionType;
  sourceSchedule?: string;
  sourceTrigger?: {
    triggerArtifact: string;
    sourceId: string;
    depth: number;
  };
}
```

In `createCommission()` implementation (line 1268):
- When `options.sourceTrigger` is provided, write a `triggered_by` YAML block into the frontmatter with `source_id`, `trigger_artifact`, and `depth` fields. Same approach as `sourceScheduleLine`: build a conditional string inserted into the template.
- Update the `activity_timeline` creation reason to: `"Commission created by trigger: {triggerArtifact} (source: {sourceId}, depth: {depth})"` when `sourceTrigger` is present.
- `sourceTrigger` and `sourceSchedule` are mutually exclusive. No runtime enforcement needed; each spawn path provides one or the other.

This step is backward-compatible: all existing callers pass `options` without `sourceTrigger`.

Tests:
- `createCommission` with `sourceTrigger` writes `triggered_by` block in frontmatter.
- `triggered_by` contains correct `source_id`, `trigger_artifact`, and `depth` values.
- Activity timeline entry mentions the trigger artifact name and depth.
- Existing `createCommission` calls without `sourceTrigger` are unaffected.

### Step 3: Trigger record operations

**Files**: `apps/daemon/services/commission/record.ts`
**Addresses**: REQ-TRIG-2, REQ-TRIG-25, REQ-TRIG-26

Extend Layer 1 with trigger-aware read/write methods, following the same pattern as `readScheduleMetadata()`/`writeScheduleFields()`.

Add to `CommissionRecordOps`:
- `readTriggerMetadata(artifactPath: string)`: Parses the `trigger` block from frontmatter. Returns `TriggerBlock` (match, approval, maxDepth, runs_completed, last_triggered, last_spawned_id). Uses gray-matter for parsing.
- `writeTriggerFields(artifactPath: string, updates: { runs_completed?: number; last_triggered?: string | null; last_spawned_id?: string | null })`: Updates specific fields within the `trigger` block using regex-based replacement (same pattern as `writeScheduleFields`).
- `readTriggeredBy(artifactPath: string)`: Reads the `triggered_by` block from a commission artifact. Returns `TriggeredBy | null`. Used by the trigger evaluator's handler to compute depth and check source exclusion. Uses gray-matter.

The existing `readType()` already returns `CommissionType`; it just needs to handle `"triggered"` as a valid value.

Tests:
- `readTriggerMetadata` correctly parses all trigger block fields including `match` with `fields`.
- `writeTriggerFields` updates only targeted fields, leaves everything else intact.
- `readTriggeredBy` returns the block when present, `null` when absent.
- `readTriggeredBy` returns `null` gracefully on parse errors.

### Step 4: Template variable expansion

**Files**: `apps/daemon/services/trigger-evaluator.ts` (new, utility function)
**Addresses**: REQ-TRIG-10, REQ-TRIG-11, REQ-TRIG-12

Create the template expansion utility. This is a pure function, easy to test in isolation before the full evaluator exists.

```typescript
function expandTemplate(template: string, event: SystemEvent): string
```

Behavior:
- Replace `{{fieldName}}` with the corresponding top-level field value from the event object.
- String values substitute directly. Array values (like `artifacts`) are joined with commas.
- Undefined or missing fields expand to empty string.
- No nested access. `{{foo.bar}}` is treated as a field named `foo.bar`, which won't match any event field and expands to empty string.

This function is used on `prompt`, `title`, and each entry in `dependencies` before commission creation.

Tests:
- `{{commissionId}}` expands to the event's commissionId.
- `{{status}}` expands to the event's status.
- `{{nonexistent}}` expands to empty string.
- Array fields expand to comma-separated string.
- Multiple variables in one template all expand.
- Template with no variables passes through unchanged.

### Step 5: Trigger evaluator service

**Files**: `apps/daemon/services/trigger-evaluator.ts` (new)
**Addresses**: REQ-TRIG-27, REQ-TRIG-28, REQ-TRIG-29, REQ-TRIG-30, REQ-TRIG-31, REQ-TRIG-32, REQ-TRIG-4, REQ-TRIG-5, REQ-TRIG-6, REQ-TRIG-7, REQ-TRIG-8, REQ-TRIG-9, REQ-TRIG-13, REQ-TRIG-14, REQ-TRIG-15, REQ-TRIG-16, REQ-TRIG-17, REQ-TRIG-18, REQ-TRIG-19, REQ-TRIG-20, REQ-TRIG-21, REQ-TRIG-22, REQ-TRIG-23, REQ-TRIG-24, REQ-TRIG-25, REQ-TRIG-26

This is the core new service. It follows the notification service pattern (receives router, registers subscriptions, fire-and-forget handlers) but adds trigger-specific logic.

**Dependency interface:**

```typescript
interface TriggerEvaluatorDeps {
  router: EventRouter;
  recordOps: CommissionRecordOps;
  commissionSession: CommissionSessionForRoutes;
  config: AppConfig;
  guildHallHome: string;
  log: Log;
}
```

**Factory function:** `createTriggerEvaluator(deps: TriggerEvaluatorDeps)` returns:

```typescript
interface TriggerEvaluator {
  /** Scan all projects and register subscriptions for active triggers. */
  initialize(): Promise<void>;
  /** Register a subscription for a new or resumed trigger. */
  registerTrigger(artifactPath: string, projectName: string): Promise<void>;
  /** Remove subscription for a paused/completed trigger. */
  unregisterTrigger(commissionId: string): void;
  /** Cleanup: unsubscribe all handlers. */
  shutdown(): void;
}
```

**`initialize()`** (called once at startup):
1. Scan `.lore/commissions/` in all registered projects' integration worktrees.
2. For each `.md` file, read `type` via `recordOps.readType()`. Filter to `type: triggered`.
3. Read `status`. Filter to `status: active` (REQ-TRIG-4: only active triggers get subscriptions).
4. Read trigger metadata via `recordOps.readTriggerMetadata()`.
5. For each active trigger, call `registerTrigger()`.

When no active triggers exist across any project, no subscriptions are created (REQ-TRIG-32).

**`registerTrigger(artifactPath, projectName)`**:
1. Read trigger metadata from the artifact.
2. Extract the `match` rule (an `EventMatchRule`).
3. Call `router.subscribe(match, handler)` where `handler` is the trigger dispatch handler (below).
4. Store the unsubscribe callback in a `Map<string, () => void>` keyed by commission ID (extracted from the artifact filename).

**`unregisterTrigger(commissionId)`**:
1. Look up the unsubscribe callback in the map.
2. Call it. Remove from map.

**Trigger dispatch handler** (the function passed to `router.subscribe()`):

This is where the meat of the trigger logic lives. The handler runs in a fire-and-forget async wrapper so it doesn't block the router. All work is wrapped in try/catch; failures log at `warn` level with trigger name and event type (REQ-TRIG-31).

Steps:
1. **Read source commission artifact** (for commission-sourced events only). An event is commission-sourced if its `type` is `commission_status` or `commission_result`. All other event types (`schedule_spawned`, `meeting_ended`, `commission_progress`, etc.) are non-commission sources.

   Extract the source context ID from the event for provenance tracking:

   | Event type | `source_id` field | Commission-sourced? |
   |-----------|-------------------|-------------------|
   | `commission_status` | `commissionId` | Yes |
   | `commission_result` | `commissionId` | Yes |
   | `schedule_spawned` | `scheduleId` | No |
   | `meeting_ended` | `meetingId` | No |
   | Any other | `""` (empty string, log warning) | No |

   For commission-sourced events: read the source commission's artifact from the integration worktree. Parse `triggered_by` using `recordOps.readTriggeredBy()`. This single read provides both depth and source exclusion data. If the artifact is unreadable, default depth to 1 and skip source exclusion (REQ-TRIG-19, REQ-TRIG-24).

   For non-commission sources: skip the artifact read entirely. Depth is 1 (REQ-TRIG-18).

2. **Source exclusion check** (REQ-TRIG-23). Compare the source commission's `triggered_by.trigger_artifact` against this trigger's artifact name (derived from the filename). If they match, skip silently. This prevents self-loops: a review trigger won't fire on review commissions it created.

3. **Depth computation** (REQ-TRIG-18). If the source commission has `triggered_by.depth`, the new commission gets `depth + 1`. If no `triggered_by`, new commission gets depth 1.

4. **Determine effective approval.** Start with the trigger's `approval` field, defaulting to `"confirm"` when the field is absent or undefined (REQ-TRIG-13). Then apply the depth limit check (REQ-TRIG-21, REQ-TRIG-22): compare computed depth against the trigger's `maxDepth` (default 3). If depth > maxDepth, force `effectiveApproval = "confirm"` regardless of the trigger's configured approval.

5. **Template expansion** (REQ-TRIG-10). Expand `{{fieldName}}` in `prompt`, `title`, and `dependencies` using the matched event's payload. If expanded prompt or worker is empty after expansion, skip dispatch and log a warning (REQ-TRIG-12).

6. **Commission creation** (REQ-TRIG-33). Call `commissionSession.createCommission()` with:
   - `projectName`: the project the trigger artifact belongs to (REQ-TRIG-8)
   - `title`: expanded title, defaulting to `"Triggered: {trigger artifact title}"` (REQ-TRIG-7)
   - `workerName`: from the trigger artifact's `worker` field (REQ-TRIG-7)
   - `prompt`: expanded prompt
   - `dependencies`: expanded dependencies
   - `options.sourceTrigger`: `{ triggerArtifact, sourceId, depth }` (REQ-TRIG-34)

   Worker validation happens inside `createCommission()`. If the worker is unknown, it throws and the handler catches it (REQ-TRIG-9).

7. **Conditional dispatch** (REQ-TRIG-13, 14, 15). If `effectiveApproval === "auto"`, call `commissionSession.dispatchCommission()`. If `"confirm"`, the commission stays `pending`. The activity timeline already records the trigger provenance from step 6.

   For depth-limited downgrades, the timeline entry format is: `"Depth limit reached (depth N > maxDepth M). Created with approval: confirm."` (REQ-TRIG-22). This is appended as an additional timeline entry after creation.

8. **Update trigger artifact state** (REQ-TRIG-25, REQ-TRIG-26). After `createCommission` succeeds:
   - Increment `runs_completed` by 1.
   - Set `last_triggered` to current ISO timestamp.
   - Set `last_spawned_id` to the spawned commission ID.
   - Append an `activity_timeline` entry recording the firing.
   - Write via `recordOps.writeTriggerFields()`.

   State update happens regardless of dispatch outcome. A dispatch failure (e.g., capacity limit) does not roll back the trigger state update.

**`shutdown()`**: Call all stored unsubscribe callbacks. Clears the map.

**Design decisions:**

- The evaluator is a plain object with methods, not a class. Follows the `createNotificationService` pattern (factory function returning an interface) rather than the `SchedulerService` class pattern. The trigger evaluator has no timer state to manage; it's entirely event-driven.

- `registerTrigger` and `unregisterTrigger` manage router subscriptions only. They do not write artifact status. The trigger evaluator's `initialize()` reads status from artifacts to decide which triggers to subscribe; the subscription map is the in-memory representation of "active." Writing `status: paused` or `status: active` to the trigger artifact is the responsibility of the caller (the toolbox tools in the separate plan, or any future route handler). This separation matters: if the caller forgets to write the status, `initialize()` on the next daemon restart will disagree with the in-memory state. The toolbox plan must account for this.

- The handler closure captures the trigger's artifact path, project name, and trigger metadata at registration time. If the trigger's configuration changes (e.g., approval mode), the old subscription must be unregistered and a new one registered. The toolbox tools handle this.

Tests (this step has the most test surface):
- Active triggers register subscriptions during `initialize()`.
- Paused/completed triggers do not register subscriptions.
- Matching event fires the handler and creates a commission.
- Non-matching event does not fire the handler.
- Template variables expand correctly in the created commission's prompt.
- `triggered_by` frontmatter is written with correct source_id, trigger_artifact, depth.
- Depth is computed from source commission's `triggered_by.depth` (source has depth 2, new gets depth 3).
- Depth defaults to 1 when source commission has no `triggered_by`.
- Depth is 1 for non-commission event sources (meeting_ended).
- Source exclusion skips when source commission's trigger_artifact matches current trigger.
- Source exclusion does not skip when trigger_artifact is different.
- Source exclusion is skipped (fail-open) when source artifact is unreadable.
- Depth limit downgrades approval from `auto` to `confirm`.
- Depth limit appends the downgrade timeline entry.
- `approval: auto` calls both createCommission and dispatchCommission.
- `approval: confirm` calls createCommission only.
- Omitted `approval` field defaults to `confirm` behavior (commission created but not dispatched).
- Trigger state (runs_completed, last_triggered, last_spawned_id) is updated after firing.
- Trigger dispatch failures log at warn and don't propagate.
- No active triggers produces inert behavior (no subscriptions).
- `registerTrigger` adds a subscription dynamically.
- `unregisterTrigger` removes a subscription dynamically.
- Multiple triggers can fire on the same event independently.

### Step 6: Production wiring

**Files**: `apps/daemon/app.ts`
**Addresses**: REQ-TRIG-27 (created during startup)

Wire the trigger evaluator in `createProductionApp()`.

Position: after the Event Router is created and after the commission orchestrator is ready. The trigger evaluator needs `commissionSession` to spawn commissions, so it goes after the orchestrator, similar to where the scheduler is wired.

```typescript
const { createTriggerEvaluator } = await import(
  "@/apps/daemon/services/trigger-evaluator"
);
const triggerEvaluator = createTriggerEvaluator({
  router,
  recordOps,
  commissionSession,
  config,
  guildHallHome,
  log: createLog("trigger-evaluator"),
});
await triggerEvaluator.initialize();
```

Add `triggerEvaluator.shutdown()` to the daemon's shutdown handler, alongside `scheduler.stop()` and `cleanupNotifications()`.

Expose `triggerEvaluator` in the return value or through a ref so the manager toolbox can access `registerTrigger`/`unregisterTrigger`. Follow the same lazy-ref pattern used for `scheduleLifecycleRef`:

```typescript
const triggerEvaluatorRef: { current?: TriggerEvaluator } = { current: undefined };
// ... after creation:
triggerEvaluatorRef.current = triggerEvaluator;
```

Pass `triggerEvaluatorRef` through to the manager toolbox deps. This avoids circular dependency issues (the manager toolbox is created before the trigger evaluator in the current wiring order; the lazy ref breaks the cycle).

Tests:
- Integration test: daemon starts with a trigger artifact present, emits a matching event, verifies a commission is created.
- Daemon starts with no trigger artifacts, no errors.
- Daemon shutdown calls `triggerEvaluator.shutdown()`.

## Phase Ordering

Steps 1-3 can be implemented in parallel since they're independent type/record changes. Step 4 (template expansion) is a standalone utility. Step 5 depends on all of 1-4. Step 6 depends on 5.

Recommended implementation sequence:

1. **Steps 1 + 2 + 3** (parallel): Type definitions, commission provenance, trigger record ops. These modify existing files with additive changes.
2. **Step 4**: Template expansion utility. Pure function, no dependencies.
3. **Step 5**: Trigger evaluator service. Depends on 1-4.
4. **Step 6**: Production wiring. Depends on 5.

## Delegation Guide

| Step | Reviewer | Why |
|------|----------|-----|
| Steps 1-3 | Thorne (Warden) | Type and record changes are mechanical but touch the commission boundary. Catch schema drift early. |
| Step 4 | None needed | Pure function with comprehensive unit tests. |
| Step 5 | Fresh-context agent | The trigger evaluator is the highest-risk code: event handling, async dispatch, loop prevention. A reviewer with no implementation context will question assumptions the implementer takes for granted. |
| Step 6 | Thorne (Warden) | Wiring changes in app.ts affect startup order. Verify no circular deps or missing shutdown calls. |

## Dependencies

- **Event Router** (`apps/daemon/services/event-router.ts`): Must exist with `subscribe()` API. Already implemented.
- **Event Router field matching**: Must support `fields` with micromatch globs. Already implemented.
- **Commission orchestrator**: Must support `createCommission()` and `dispatchCommission()`. Already implemented. Step 2 extends the options parameter.
- **Commission record ops**: Must support reading `type` field. Already implemented. Step 3 extends with trigger-specific methods.

No external dependencies. No new npm packages.

## Risk Notes

- **Artifact read per trigger firing.** Each trigger firing reads the source commission artifact to compute depth and check source exclusion. Acceptable because trigger firings are infrequent relative to event volume: events fire on every commission status change, but most events won't match any trigger rule. The router filters out non-matching events before the handler runs.

- **Trigger state writes are not atomic with commission creation.** If the daemon crashes between `createCommission` and `writeTriggerFields`, the spawned commission exists but the trigger's `runs_completed` is stale. This is the same trade-off the scheduler makes. Recovery: the trigger fires again on the next matching event, potentially creating a duplicate. The `approval: confirm` default mitigates this for most triggers.

- **Handler ordering.** If two triggers match the same event, both handlers fire independently. The Event Router iterates subscriptions sequentially, but each handler's async work is fire-and-forget. No ordering guarantee between handler completions. This matches the spec's explicit non-goal: "If an event matches three triggers, three commissions are created."
