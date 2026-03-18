---
title: Plan for scheduled commissions
date: 2026-03-08
status: executed
tags: [commissions, scheduling, cron, daemon]
modules: [commission-orchestrator, daemon-scheduler, manager-toolbox, web-ui]
related:
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/brainstorm/scheduled-commissions.md
  - .lore/specs/commissions/guild-hall-commissions.md
  - .lore/specs/commissions/commission-layer-separation.md
  - .lore/specs/infrastructure/model-selection.md
  - .lore/plans/infrastructure/model-selection.md
---

# Plan: Scheduled Commissions

## Spec Reference

**Spec**: `.lore/specs/commissions/guild-hall-scheduled-commissions.md`
**Brainstorm**: `.lore/brainstorm/scheduled-commissions.md`
**Layer spec**: `.lore/specs/commissions/commission-layer-separation.md`

Requirements addressed:

- REQ-SCOM-1: Commission type field (`one-shot` / `scheduled`) -> Steps 1, 2
- REQ-SCOM-2: Type determines status set and lifecycle -> Steps 1, 3
- REQ-SCOM-3, 3a, 3b: Scheduled commission artifact shape -> Steps 2, 5
- REQ-SCOM-4: Scheduled commission status set (active, paused, completed, failed) -> Step 3
- REQ-SCOM-5: Valid status transitions for schedules -> Step 3
- REQ-SCOM-6: Timeline recording for schedule transitions -> Steps 3, 4
- REQ-SCOM-7: Auto-completion on repeat count -> Step 6
- REQ-SCOM-8: Spawned commissions with source_schedule field -> Steps 2, 6
- REQ-SCOM-9, 10, 11: Spawned commissions follow one-shot lifecycle -> Step 6
- REQ-SCOM-12: Daemon scheduler service (60s tick) -> Step 6
- REQ-SCOM-13: Tick interval rationale (no code change, documented) -> Step 6
- REQ-SCOM-14: Catch-up on daemon startup -> Step 7
- REQ-SCOM-15: Respect concurrent commission limits -> Step 6
- REQ-SCOM-16: Schedule-specific timeline events -> Steps 4, 6
- REQ-SCOM-17: Stuck run escalation via meeting request -> Step 6
- REQ-SCOM-18: At most once escalation per stuck commission -> Step 6
- REQ-SCOM-19: Manager toolbox tools -> Step 5
- REQ-SCOM-20: Zod schemas and error handling -> Step 5
- REQ-SCOM-21: Parity principle (UI + manager produce same artifact) -> Steps 5, 9
- REQ-SCOM-22: Project view visual distinction -> Step 9
- REQ-SCOM-23: Commission detail view adaptation -> Step 9
- REQ-SCOM-24: Dashboard dependency map -> Step 9
- REQ-SCOM-25: Schedule creation form -> Step 9
- REQ-SCOM-26: Spawned commissions eligible for cleanup -> Step 2 (source_schedule field)
- REQ-SCOM-27: Schedule artifacts NOT eligible for cleanup -> Step 9 (cleanup filter)
- REQ-SCOM-28: Timeline compression (tend concern, not scheduler) -> no step (out of scope)

Cross-cutting from [Plan: Model Selection](.lore/plans/infrastructure/model-selection.md):

- REQ-MODEL-7: Commission `resource_overrides` accepts `model?: string` -> Steps 2, 5, 6
- REQ-MODEL-10: Scheduled commission templates include `model` in `resource_overrides` -> Steps 5, 6, 9

## Codebase Context

**Commission layer** (`daemon/services/commission/`): Four layers per REQ-CLS-26. Layer 1 (`record.ts`) handles YAML I/O with regex-based field replacement. Layer 2 (`lifecycle.ts`) owns the one-shot state machine with per-entry promise chains for concurrency. Layer 4 (`orchestrator.ts`, 1912 lines) coordinates everything and implements `CommissionSessionForRoutes`.

**Daemon startup** (`daemon/app.ts`): `createProductionApp()` assembles all services via DI factories. Commission layers are built sequentially (L1 -> L2 -> L3 -> L4). The orchestrator receives all deps including `createMeetingRequestFn` for escalation. Signal handlers clean up on SIGINT/SIGTERM.

**Manager toolbox** (`daemon/services/manager/toolbox.ts`): Eight tools registered via `createSdkMcpServer()`. Each tool has a `make*Handler` factory returning `(args) => Promise<ToolResult>`. Uses Zod schemas inline in the `tool()` calls. The factory pattern with `ManagerToolboxDeps` provides testability.

**Artifact creation** (`orchestrator.ts:1159-1244`): `createCommission()` validates project/worker, generates the commission ID, writes YAML to the integration worktree, and returns `{ commissionId }`. Commission IDs follow `commission-<sanitized-worker-name>-<timestamp>`. The function escapes YAML values and builds the frontmatter as a template string.

**Event system** (`daemon/lib/event-bus.ts`): `SystemEvent` union type with `emit`/`subscribe`. Commission events include `commission_status`, `commission_progress`, `commission_result`. SSE endpoint at `GET /events` broadcasts to UI subscribers.

**No existing timer pattern**: The daemon currently has zero timer-based services. The scheduler will be the first, establishing the pattern for future periodic services.

**Key integration points**: The scheduler needs `CommissionSessionForRoutes.createCommission()` to spawn one-shot commissions (reuses the existing creation path), `createMeetingRequestFn` for stuck run escalation, and read access to integration worktrees for scanning schedule artifacts.

## Implementation Steps

### Step 1: Type system extensions

**Files**: `daemon/types.ts`, `daemon/lib/event-bus.ts`
**Addresses**: REQ-SCOM-1, REQ-SCOM-2

Add the types that the rest of the implementation depends on.

In `daemon/types.ts`:
- Add `CommissionType = "one-shot" | "scheduled"`.
- Add `ScheduledCommissionStatus = "active" | "paused" | "completed" | "failed"` as a separate type from `CommissionStatus`. The two status sets do not overlap (REQ-SCOM-2).
- The branded `CommissionId` type works for both one-shot and scheduled commissions (same ID format, same directory).

In `daemon/lib/event-bus.ts`:
- Add a `schedule_spawned` event to `SystemEvent`: `{ type: "schedule_spawned"; scheduleId: string; spawnedId: string; projectName: string; runNumber: number }`. This lets the SSE endpoint push schedule activity to the UI.

Tests: Type-level only, no runtime tests needed for this step.

### Step 2: Commission artifact schema extensions

**Files**: `daemon/services/commission/orchestrator.ts` (createCommission), `daemon/services/commission/record.ts`
**Addresses**: REQ-SCOM-1, REQ-SCOM-3, REQ-SCOM-8, REQ-SCOM-26

Extend the commission artifact to support the new fields.

In `orchestrator.ts`, modify `createCommission()`:
- Add a trailing options parameter: `options?: { type?: CommissionType; sourceSchedule?: string }`. Default `type` to `"one-shot"`. This approach is backward-compatible: all existing callers (`daemon/routes/commissions.ts`, `daemon/services/manager/toolbox.ts`, tests) continue to work without modification because the options parameter is optional with safe defaults.
- When `sourceSchedule` is provided, write `source_schedule: <value>` into the frontmatter. This is how spawned commissions reference their parent schedule.
- The artifact content template string adds `type: one-shot` (or `type: scheduled`) as a new frontmatter field. Existing commissions without `type` are treated as `one-shot` by any code that reads the field (REQ-SCOM-1).

Update `CommissionSessionForRoutes` interface to add the trailing options parameter:
```typescript
createCommission(
  projectName: string,
  title: string,
  workerName: string,
  prompt: string,
  dependencies?: string[],
  resourceOverrides?: { maxTurns?: number; maxBudgetUsd?: number; model?: string },
  options?: { type?: CommissionType; sourceSchedule?: string },
): Promise<{ commissionId: string }>;
```
Existing callers pass at most 6 arguments, so adding a 7th optional parameter is non-breaking. The `model` field in `resourceOverrides` is added by the model selection feature (REQ-MODEL-7); the scheduled commissions plan assumes that type change is already in place.

In `record.ts`, add a `readType()` function:
- Parses the `type` field from frontmatter, returns `"one-shot"` when absent (backward compatibility).

Tests:
- Commission created without `type` parameter writes `type: one-shot` in frontmatter.
- Commission created with `sourceSchedule` writes `source_schedule` field.
- `readType()` returns `"one-shot"` for artifacts without the field (backward compatibility).

### Step 3: Schedule lifecycle

**Files**: `daemon/services/scheduler/schedule-lifecycle.ts` (new)
**Addresses**: REQ-SCOM-4, REQ-SCOM-5, REQ-SCOM-6

Create a state machine for scheduled commission status transitions, following the same pattern as `CommissionLifecycle` but with the four-state graph.

The `ScheduleLifecycle` class:
- Tracks schedule state in-memory: `Map<CommissionId, TrackedSchedule>` where `TrackedSchedule` holds `{ scheduleId, projectName, status, artifactPath }`.
- Transition graph (from REQ-SCOM-5):
  - active -> paused, completed, failed
  - paused -> active, completed, failed
  - failed -> active
- Methods: `pause()`, `resume()`, `complete()`, `fail()`, `reactivate()`.
- Each transition writes status + timeline entry via `CommissionRecordOps` (the same Layer 1 used by `CommissionLifecycle`). This respects REQ-CLS-4. `ScheduleLifecycle` receives `recordOps` as a constructor dep.
- Emits a `commission_status` event through the EventBus after each transition. Reuses the existing event type with the scheduled status values.
- Per-entry promise chains for concurrency control (same pattern as `CommissionLifecycle.withLock()`).
- `register(id, projectName, status, artifactPath)` method for loading existing schedules without writing to disk (needed for daemon startup). The `artifactPath` is the full path in the integration worktree, computed by the caller using `integrationWorktreePath(guildHallHome, projectName)` from `@/lib/paths`.

This is a separate class from `CommissionLifecycle`, not an extension. The two state machines have no overlap (REQ-SCOM-2).

Tests:
- Each valid transition succeeds and writes status + timeline.
- Invalid transitions return `{ outcome: "skipped" }` with descriptive reason.
- Concurrent transitions on the same schedule are serialized.

### Step 4: Schedule record operations

**Files**: `daemon/services/commission/record.ts` (extend existing Layer 1)
**Addresses**: REQ-SCOM-3a, REQ-SCOM-6, REQ-SCOM-16

**Layer boundary decision**: Schedule artifacts live in `.lore/commissions/` and are commission artifacts. Per REQ-CLS-4, "All commission artifact writes go through Layer 1." Rather than creating a parallel `ScheduleRecordOps` module (which would violate the layer separation spec), extend the existing `CommissionRecordOps` in `record.ts` with schedule-aware methods. This keeps all artifact I/O in one Layer 1.

Add the following methods to `CommissionRecordOps`:
- `readScheduleMetadata(artifactPath)`: Parses the `schedule` block from frontmatter. Returns `{ cron, repeat, runsCompleted, lastRun, lastSpawnedId }`. Uses gray-matter for parsing (read-only, no stringify issues).
- `writeScheduleFields(artifactPath, updates)`: Updates specific fields within the `schedule` block using regex-based replacement (same pattern as the existing `writeStatus`). Fields: `runs_completed`, `last_run`, `last_spawned_id`.
- `readScheduleStatus(artifactPath)`: Returns the `status` field. Used by the scheduler tick to filter active schedules. (This reuses the existing `readStatus` since the field name is the same.)

The existing `appendTimeline()` method already handles arbitrary timeline entries. Schedule-specific events (`commission_spawned`, `commission_spawned_catchup`, `escalation_created`) use the same append pattern with different event names and extra fields. The existing `writeStatusAndTimeline()` handles schedule status transitions (the `ScheduleLifecycle` calls this same method).

All functions use regex-based field replacement to preserve raw YAML formatting (REQ-CLS-5 pattern).

Tests:
- `readScheduleMetadata` correctly parses all schedule block fields.
- `writeScheduleFields` updates only the targeted fields, leaves everything else intact.
- `appendScheduleTimeline` adds entries in the correct YAML format.
- Backward compatibility: functions handle missing `schedule` block gracefully.

### Step 5: Manager toolbox extensions

**Files**: `daemon/services/manager/toolbox.ts`
**Addresses**: REQ-SCOM-19, REQ-SCOM-20, REQ-SCOM-21

Add two new tools to the manager toolbox.

**`create_scheduled_commission`** handler (`makeCreateScheduledCommissionHandler`):
- Parameters: `title`, `workerName`, `prompt`, `cron`, `repeat?`, `dependencies?`, `resourceOverrides?` (includes `maxTurns?`, `maxBudgetUsd?`, `model?`).
- Validates the worker exists via `getWorkerByName(packages, workerName)` (same check as `createCommission`).
- If `resourceOverrides.model` is provided, validates it against `VALID_MODELS` from `lib/types.ts` using `isValidModel()`. Rejects invalid model names with `isError: true` (same pattern as the `create_commission` tool's model validation in `.lore/plans/infrastructure/model-selection.md` Step 7).
- Validates the cron expression using `isValidCron()` from Step 10's cron wrapper. Rejects invalid expressions with `isError: true`.
- Writes the schedule artifact directly to the integration worktree's `.lore/commissions/` directory (not through the orchestrator's `createCommission`, because schedule artifacts have a different shape: they include the `schedule` block and use a different status set). The artifact includes: `type: scheduled`, `status: active`, the `schedule` block with the cron expression and zeroed counters (`runs_completed: 0`, `last_run: null`, `last_spawned_id: null`), `resource_overrides` (with `maxTurns`, `maxBudgetUsd`, and `model` if provided), `tags: [commission, scheduled]`, and the initial timeline entry. The creation pattern follows the same template-string approach as `orchestrator.ts:1216-1234`.
- Commits the artifact to the `claude` branch via project lock (same pattern as `makeInitiateMeetingHandler`).
- Registers the schedule with `ScheduleLifecycle` so the scheduler picks it up on the next tick.
- The tool description should include a note that the prompt must be self-contained since no human is present at spawn time (REQ-SCOM-3b).
- Returns `{ commissionId, created: true, status: "active" }`.

**`update_schedule`** handler (`makeUpdateScheduleHandler`):
- Parameters: `commissionId`, `cron?`, `repeat?`, `prompt?`, `status?`, `resourceOverrides?` (includes `maxTurns?`, `maxBudgetUsd?`, `model?`).
- Reads current schedule metadata via `recordOps.readScheduleMetadata()`. Validates the schedule exists and has `type: scheduled` via `recordOps.readType()`.
- For `status` changes: map the requested status to the correct `ScheduleLifecycle` method based on current state:
  - Current `active` + requested `paused` -> `scheduleLifecycle.pause()`
  - Current `active` + requested `completed` -> `scheduleLifecycle.complete()`
  - Current `paused` + requested `active` -> `scheduleLifecycle.resume()`
  - Current `paused` + requested `completed` -> `scheduleLifecycle.complete()`
  - Current `failed` + requested `active` -> `scheduleLifecycle.reactivate()`
  - Any invalid combination returns `isError: true` with the specific invalid transition.
- For field updates (`cron`, `repeat`, `prompt`): writes via `recordOps.writeScheduleFields()` (extended Layer 1). If `repeat` is set lower than `runs_completed`, transitions to `completed` (REQ-SCOM-19 edge case).
- For `resourceOverrides` updates: writes via regex-based YAML replacement on the `resource_overrides` block. If `resourceOverrides.model` is provided, validates against `VALID_MODELS` before writing. Future spawned commissions inherit the updated overrides; already-spawned commissions are unaffected.
- Returns `{ commissionId, updated: true, status }`.

The `ManagerToolboxDeps` interface gains two new optional fields: `scheduleLifecycle?: ScheduleLifecycle` and `recordOps?: CommissionRecordOps`. These are optional so existing tests that don't exercise schedule tools don't need to provide them.

Register both tools in `createManagerToolbox()` alongside the existing eight tools. Each gets a Zod schema inline in the `tool()` call.

Tests:
- `create_scheduled_commission` with valid inputs produces a correct artifact.
- Invalid cron expression returns `isError: true`.
- Invalid worker name returns `isError: true`.
- `update_schedule` with valid status transition succeeds.
- `update_schedule` with invalid transition returns `isError: true`.
- Setting `repeat` below `runs_completed` triggers auto-completion.
- `create_scheduled_commission` with `resourceOverrides: { model: "haiku" }` writes `model: haiku` in the artifact's `resource_overrides`.
- Invalid model name in `resourceOverrides` returns `isError: true`.
- `update_schedule` with `resourceOverrides: { model: "sonnet" }` updates the model in the artifact.

### Step 6: Scheduler service

**Files**: `daemon/services/scheduler/index.ts` (new), `daemon/services/scheduler/cron.ts` (new)
**Addresses**: REQ-SCOM-12, REQ-SCOM-13, REQ-SCOM-15, REQ-SCOM-7, REQ-SCOM-8, REQ-SCOM-9, REQ-SCOM-10, REQ-SCOM-11, REQ-SCOM-16, REQ-SCOM-17, REQ-SCOM-18

This is the core new service. It runs on a 60-second timer within the daemon process.

**`daemon/services/scheduler/cron.ts`**: Thin wrapper around the cron library.
- `nextOccurrence(cronExpr: string, after: Date): Date | null`: Returns the next time the cron expression fires after the given timestamp.
- `isValidCron(cronExpr: string): boolean`: Validates a cron expression (used by manager toolbox validation).
- `intervalSeconds(cronExpr: string): number`: Returns the approximate interval in seconds between occurrences (used for stuck run threshold calculation).

**`daemon/services/scheduler/index.ts`**: The `SchedulerService` class.

Constructor deps (DI pattern):
```typescript
interface SchedulerDeps {
  scheduleLifecycle: ScheduleLifecycle;
  recordOps: CommissionRecordOps;  // Extended Layer 1 (Step 4)
  commissionSession: CommissionSessionForRoutes;
  createMeetingRequestFn: (params: { projectName: string; workerName: string; reason: string }) => Promise<void>;
  eventBus: EventBus;
  config: GuildHallConfig;
  guildHallHome: string;
}
```

**`start()`**: Calls `setInterval(tick, 60_000)`. Stores the interval ID for cleanup. Runs an initial tick immediately (catches anything due right now).

**`stop()`**: Calls `clearInterval()`. Called by daemon shutdown handler.

**`tick()`** (the core loop, runs every 60 seconds):
1. Scan `.lore/commissions/` in all registered projects' integration worktrees (resolve paths via `integrationWorktreePath(guildHallHome, projectName)` from `@/lib/paths`). For each `.md` file, read `type` via `recordOps.readType()` and `status` via `recordOps.readStatus()`. Filter to `type: scheduled` and `status: active`.
2. For each active schedule:
   a. Read schedule metadata (`cron`, `last_run`, `last_spawned_id`, `runs_completed`, `repeat`).
   b. Compute next occurrence: `nextOccurrence(cron, last_run ?? schedule_creation_date)`. If `now < nextOccurrence`, skip.
   c. **Overlap check** (REQ-SCOM-12 step 3): If `last_spawned_id` is set, read the spawned commission's status via `recordOps.readStatus()` from the same `.lore/commissions/` directory. A commission is "still active" if its status is `dispatched`, `in_progress`, or `sleeping` (these three `CommissionStatus` values from `daemon/types.ts`). If still active:
      - **Stuck run check** (REQ-SCOM-17): Compute the cadence interval from the cron expression. If the spawned commission has been active for more than 2x the interval, and we haven't already escalated for this `last_spawned_id` (tracked in-memory via a `Set<string>`), escalate by calling `createMeetingRequestFn` with a descriptive reason. Append `escalation_created` timeline entry. Mark as escalated in the in-memory set.
      - Skip this schedule for this tick (no overlapping runs).
   d. **Spawn** (REQ-SCOM-12 steps 4-7): Create a one-shot commission by calling `commissionSession.createCommission()` with the schedule's `workerName` (the `worker` field from the artifact maps to the `workerName` parameter), `prompt`, `dependencies`, `tags`, and `resourceOverrides` (REQ-SCOM-11). The `resourceOverrides` object is copied in full from the schedule template, including `model` if present (REQ-MODEL-10). The spawned commission inherits the model through the standard commission override flow (REQ-MODEL-9: commission `resource_overrides.model` > worker default > fallback "opus"). Pass `options: { type: "one-shot", sourceSchedule: scheduleId }`. Tags on the spawned commission should be `[commission]` (standard one-shot tag), not `[commission, scheduled]`. This reuses the existing commission creation path, including worker validation and artifact writing.
   e. **Dispatch**: The spawned commission ID comes back from `createCommission()` as `{ commissionId: string }` (unbranded). Cast to branded type via `asCommissionId(commissionId)` from `@/daemon/types` before calling `commissionSession.dispatchCommission()`. This respects concurrent limits (REQ-SCOM-15). If at capacity, the commission stays `pending` and queues for auto-dispatch. The schedule artifact still records the spawn.
   f. **Update schedule artifact**: Increment `runs_completed`, set `last_run` to now, set `last_spawned_id` to the new commission ID. Write via `recordOps.writeScheduleFields()` (extended Layer 1 from Step 4).
   g. **Timeline**: Append `commission_spawned` event with `spawned_id`, `run_number`, and `previous_run_outcome`.
   h. **Emit event**: `schedule_spawned` via EventBus.
   i. **Auto-completion** (REQ-SCOM-7): If `repeat` is set and `runs_completed` now equals `repeat`, transition the schedule to `completed` via `ScheduleLifecycle` with reason "Repeat count reached (N/N)."

Error handling: If any step fails for a single schedule, log the error and continue to the next schedule. Don't let one broken schedule block others. If the same schedule fails on three consecutive ticks, transition it to `failed` with a descriptive reason.

Tests (per spec's AI Validation section):
- **Scheduler tick test**: Create active schedules with various cron expressions, advance time past due, verify spawned commissions are created with correct fields.
- **Overlap prevention test**: Set `last_spawned_id` to an active commission, verify the scheduler skips the schedule.
- **Repeat count test**: Create schedule with `repeat=3`, run three ticks, verify auto-completion after third spawn.
- **Pause/resume test**: Pause an active schedule, advance past due, verify no spawn; resume, verify spawn on next tick.
- **Stuck escalation test**: Set `last_spawned_id` to a commission active for 2x cadence, verify meeting request created; verify no duplicate escalation on subsequent ticks.
- **Concurrent limits test**: Scheduler spawns commission when at capacity, verify commission is created pending and queued.

### Step 7: Startup catch-up

**Files**: `daemon/services/scheduler/index.ts` (extends Step 6)
**Addresses**: REQ-SCOM-14

Add a `catchUp()` method to `SchedulerService`, called once during daemon startup after commission recovery completes.

Logic:
1. Scan all active schedules (same scan as `tick()`).
2. For each active schedule: compute the next expected cron occurrence after `last_run` (or the schedule's creation date if `last_run` is null, same fallback as `tick()` in Step 6). If `now` is past that occurrence and no spawn has happened for it, create one catch-up spawn.
3. Only one catch-up spawn per schedule, regardless of how many runs were missed. The intent is cadence, not exact count (REQ-SCOM-14).
4. Catch-up spawns record `commission_spawned_catchup` timeline event (not `commission_spawned`) with a `missed_since` field.
5. The catch-up logic is essentially "run one tick with catch-up event type." Factor the spawn logic from `tick()` into a shared `spawnFromSchedule(schedule, eventType)` method.

Tests:
- **Catch-up test**: Simulate daemon downtime (last_run is old, current time past next cron occurrence). Verify exactly one catch-up spawn. Verify timeline records `commission_spawned_catchup` with `missed_since`.
- Schedule with `last_run` still within current cron window: no catch-up needed.

### Step 8: Daemon wiring

**Files**: `daemon/app.ts`, `daemon/index.ts`
**Addresses**: (wiring, no spec requirement directly, but essential for production)

Wire the scheduler into the daemon's production startup sequence.

In `daemon/app.ts` (`createProductionApp`):

Currently `createProductionApp` returns `Promise<Hono>`. The scheduler needs a shutdown path. Change the return type to `Promise<{ app: Hono; shutdown: () => void }>`. Update the single caller in `daemon/index.ts` (line ~39) to destructure: `const { app, shutdown } = await createProductionApp(...)`.

Assembly sequence (after commission recovery at line ~282):
1. Create the schedule lifecycle (uses existing `recordOps` from Layer 1):
   ```
   const scheduleLifecycle = new ScheduleLifecycle({
     recordOps,
     emitEvent: (event) => eventBus.emit(event),
   });
   ```
2. Create the scheduler service:
   ```
   const scheduler = new SchedulerService({
     scheduleLifecycle,
     recordOps,
     commissionSession,
     createMeetingRequestFn,
     eventBus,
     config,
     guildHallHome,
   });
   ```
3. Run catch-up: `await scheduler.catchUp()`.
4. Start the timer: `scheduler.start()`.
5. Return `{ app: createApp(deps), shutdown: () => scheduler.stop() }`.

In `daemon/index.ts`:
- Destructure the return value: `const { app, shutdown } = await createProductionApp(...)`.
- In the SIGINT/SIGTERM handler, call `shutdown()` before `server.stop()`. This clears the scheduler interval and prevents ticks from firing during shutdown.

**Critical lesson from retros**: DI factories need production wiring. Every constructor dep for `SchedulerService` must be instantiated in `createProductionApp`. The `ScheduleLifecycle` and `ScheduleRecordOps` need to be created before the scheduler (same sequential pattern as the commission layers). Add them after the commission orchestrator but before the briefing generator.

Tests:
- Integration test: `createProductionApp` succeeds with the scheduler wired in.
- Scheduler `stop()` clears the interval (no ticks fire after stop).

### Step 9: UI updates

**Files**: `web/app/projects/[name]/`, `web/components/`, `web/app/dashboard/`
**Addresses**: REQ-SCOM-22, REQ-SCOM-23, REQ-SCOM-24, REQ-SCOM-25

This step is the largest in surface area but has no backend dependencies beyond the artifact format established in earlier steps.

**9a: Commission list visual distinction** (REQ-SCOM-22):
- In the Project view's Commissions tab, read the `type` field from each commission artifact.
- Scheduled commissions get a recurring indicator (a label like "Recurring" or a cycle icon) alongside their status gem. The status gem shows the schedule-specific statuses (active, paused, completed, failed) with appropriate colors.
- One-shot commissions with a `source_schedule` field show a subtle link (text or icon) to their parent schedule.

**9b: Schedule detail view** (REQ-SCOM-23):
- When the Commission detail view renders a `type: scheduled` artifact, replace the dispatch button area with a "Schedule" section showing:
  - Cron expression in human-readable form (use the cronstrue library or a simple mapping for common patterns).
  - Next expected run (computed from cron + last_run).
  - Runs completed / repeat count (or "indefinite").
  - Last run timestamp.
- Add a "Recent Runs" section listing the last 10 spawned commissions (filter `.lore/commissions/` for artifacts with `source_schedule` matching this schedule's ID). Each entry links to the spawned commission's detail view.
- Action buttons: Pause (when active), Resume (when paused), Complete (when active or paused). Each calls the daemon API to update the schedule. The route decision (extend `PUT /commissions/:id` or add `PUT /schedules/:id`) must be made before implementing these buttons, since the form needs a POST target. This is listed as Open Question 2 below.

**9c: Dashboard dependency map** (REQ-SCOM-24):
- Render scheduled commissions as a visually distinct node (double border or recurring icon).
- Spawned commissions connect to their parent schedule node.

**9d: Schedule creation form** (REQ-SCOM-25):
- Add a type toggle or separate button in the Project view to switch between "Create Commission" and "Create Schedule."
- The schedule form includes: title, worker selection, prompt textarea, cron expression input with human-readable preview, optional repeat count, dependency selection, optional resource overrides (maxTurns, maxBudgetUsd, and model selection dropdown populated from `VALID_MODELS`).
- On submit, POST to a daemon route that calls the same `create_scheduled_commission` logic as the manager toolbox. This can either be a new route or extend the existing `POST /commissions` route with a `type` field.

**9e: Cleanup skill instructions** (REQ-SCOM-27):
- The `cleanup-commissions` skill is a SKILL.md file (`packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md`), not executable code. Update the skill's Inventory section to instruct the AI worker to skip artifacts with `type: scheduled` when collecting eligible commissions. Only `type: one-shot` (or no type field) artifacts are eligible for cleanup. Add a note that spawned commissions with `source_schedule` are eligible and the field provides provenance context for grouping (REQ-SCOM-26).

Tests:
- Component tests for visual distinction rendering.
- Schedule detail view renders cron, runs, and action buttons correctly.
- Creation form validates cron expression before submission.

### Step 10: Cron library integration

**Files**: `package.json`, `daemon/services/scheduler/cron.ts`
**Addresses**: REQ-SCOM-12 (cron evaluation)

This step can run in parallel with Steps 1-4 since it's a dependency with a clear interface.

**Research and selection**: Evaluate lightweight cron libraries. Required capability: "given this expression and a timestamp, when is the next occurrence?" Candidates:
- **croner**: Well-maintained, supports standard 5-field cron, has `nextRun(after)` API. Zero dependencies.
- **cron-parser**: Established library, supports `next()` iteration from a reference date.

Selection criteria: must work with bun, must support standard 5-field cron, must have `nextRun(after)` or equivalent, must have active maintenance. Test the selected library with bun before committing.

**Integration**: Wrap the library in `daemon/services/scheduler/cron.ts` (defined in Step 6). The wrapper isolates the third-party dependency so a library swap requires changing one file.

Tests:
- Standard cron expressions parse correctly: `0 9 * * 1` (Monday 9am), `0 0 1 * *` (1st of month), `*/5 * * * *` (every 5 min).
- `nextOccurrence` returns correct dates.
- Invalid expressions throw or return null.
- `intervalSeconds` returns approximate cadence (for stuck run threshold).

### Step 11: Validate against spec

**Addresses**: All REQ-SCOM requirements

Launch a sub-agent that reads the spec at `.lore/specs/commissions/guild-hall-scheduled-commissions.md`, reviews the implementation across all modified files, and flags any requirements not met. This step is not optional.

Verification checklist from spec's Success Criteria:
- [ ] Commission artifacts support `type` field with backward compatibility
- [ ] Scheduled commission artifacts contain `schedule` block with all fields
- [ ] Four-status lifecycle with valid transitions
- [ ] Invalid transitions rejected with descriptive errors
- [ ] Daemon scheduler ticks every 60 seconds
- [ ] Cron firing spawns one-shot commission with `source_schedule`
- [ ] No overlapping runs
- [ ] Catch-up: one spawn per missed schedule on startup
- [ ] Stuck runs escalate via meeting request (at most once)
- [ ] Manager toolbox has both new tools
- [ ] Parity principle for schedule creation
- [ ] Auto-completion on repeat count
- [ ] Pause preserves state, resume continues
- [ ] Concurrent limits respected
- [ ] Spawned commissions eligible for cleanup, schedules not
- [ ] Timeline records all event types
- [ ] UI distinguishes scheduled from one-shot everywhere
- [ ] Schedule templates support `model` in `resource_overrides`; spawned commissions inherit it (REQ-MODEL-10)
- [ ] Model names validated against `VALID_MODELS` during schedule creation and update

## Delegation Guide

Steps requiring specialized expertise:

- **Step 6** (Scheduler service): Core complexity. Benefits from a `silent-failure-hunter` review after implementation. Timer-based services have subtle failure modes (error in tick handler kills the interval, unhandled promise rejections, race conditions between tick and shutdown).
- **Step 8** (Daemon wiring): Use `code-reviewer` after wiring. Retros document repeated wiring gaps in `createProductionApp`.
- **Step 9** (UI updates): Frontend work. Use `code-reviewer` for CSS Modules and component patterns. The fantasy chrome has specific patterns (glassmorphic panels, image-based borders) that new components must follow.
- **Step 10** (Cron library): Verify the library works under bun before committing. Some npm packages have node-specific dependencies that fail under bun.
- **Step 11** (Validation): Launch a fresh-context sub-agent with spec + implementation. It catches what the implementer misses due to being too close to the code.

Consult `.lore/lore-agents.md` for available agents: `code-reviewer`, `silent-failure-hunter`, `type-design-analyzer` for the new types, `pr-test-analyzer` for test coverage.

## Open Questions

These don't block starting but should be resolved during implementation:

1. **Cron library choice**: croner vs cron-parser. Both meet the requirements. Resolve during Step 10 based on bun compatibility testing.

2. **Schedule-specific daemon route**: Should schedule status updates (pause/resume/complete) go through the existing `PUT /commissions/:id` route with type-aware logic, or a new `PUT /schedules/:id` route? The parity principle (REQ-SCOM-21) suggests the existing route extended with type awareness, since the artifacts live in the same directory. But a separate route is cleaner. Resolve during Step 9 when implementing the UI action buttons.

3. **Consecutive failure threshold**: Step 6 mentions transitioning a schedule to `failed` after three consecutive tick failures. The spec doesn't specify this number. Three is a reasonable default but could be configurable. Start with a constant and promote to config if needed.

4. **Model selection spec amendments**: The model selection spec (REQ-MODEL-10) calls out that REQ-SCOM-11 and REQ-SCOM-19 need amendments to explicitly include `model` in `resource_overrides` (they currently only list `maxTurns` and `maxBudgetUsd`). These are documentation updates to `.lore/specs/commissions/guild-hall-scheduled-commissions.md`, not code blockers. This plan already accounts for model in the implementation steps above. The spec amendments should happen alongside or after model selection lands.
