---
title: "Plan: Triggered Commissions Toolbox Tools"
date: 2026-03-21
status: executed
tags: [commissions, triggers, manager-toolbox, daemon]
modules: [manager-toolbox, trigger-evaluator]
related:
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/plans/commissions/triggered-commissions-core.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
  - .lore/plans/commissions/guild-hall-scheduled-commissions.md
depends-on:
  - .lore/plans/commissions/triggered-commissions-core.md
---

# Plan: Triggered Commissions Toolbox Tools

## Spec Reference

**Spec**: `.lore/specs/commissions/triggered-commissions.md`
**Phase 1 plan**: `.lore/plans/commissions/triggered-commissions-core.md`

Requirements addressed (Phase 2, Guild Master toolbox tools):

- REQ-TRIG-25a: `create_triggered_commission` tool
- REQ-TRIG-25b: `update_trigger` tool
- REQ-TRIG-25c: DI patterns (same `make*Handler(deps: ManagerToolboxDeps)` pattern)
- REQ-TRIG-25d: Dynamic subscription registration without daemon restart

**Not covered by this plan** (separate plans):
- REQ-TRIG-1 through 37: Core architecture (Phase 1, already planned)
- REQ-TRIG-38 through 42: Web UI (Phase 3, not yet planned)

## Dependency on Phase 1

This plan assumes the Phase 1 core architecture plan (`.lore/plans/commissions/triggered-commissions-core.md`) is complete. Specifically:

- `CommissionType` includes `"triggered"` in `apps/daemon/types.ts`
- `TriggerBlock` and `TriggeredBy` type definitions exist in `apps/daemon/types.ts`
- `createCommission()` supports `sourceTrigger` in options (REQ-TRIG-33)
- `CommissionRecordOps` has `readTriggerMetadata()`, `writeTriggerFields()`, `readTriggeredBy()`
- `createTriggerEvaluator()` exists in `apps/daemon/services/trigger-evaluator.ts` with `registerTrigger(artifactPath, projectName)` and `unregisterTrigger(commissionId)` methods
- The trigger evaluator is wired in `createProductionApp()` and accessible via a lazy ref
- `SYSTEM_EVENT_TYPES` in `lib/types.ts` lists all valid event type strings

## Codebase Context

**Manager toolbox** (`apps/daemon/services/manager/toolbox.ts`): Thirteen tools registered via `createSdkMcpServer()`. Each tool is a `make*Handler(deps: ManagerToolboxDeps)` factory returning `(args) => Promise<ToolResult>`. Tool schemas use Zod inline in the `tool()` call. The factory takes `ManagerToolboxDeps` which provides `callRoute`, `guildHallHome`, `projectName`, `eventBus`, `config`, `scheduleLifecycle`, `recordOps`, `packages`, and `log`.

**`makeCreateScheduledCommissionHandler`** (line 730): The pattern for `create_triggered_commission`. Delegates to the daemon route `/commission/request/commission/create` via `deps.callRoute`, passing `type: "scheduled"` and schedule-specific fields. Returns `{ commissionId, created: true, status: "active" }`.

**`makeUpdateScheduleHandler`** (line 814): The pattern for `update_trigger`. Operates directly on the artifact file (not through a daemon route). Validates the commission is `type: "scheduled"`. Handles status transitions through `deps.scheduleLifecycle` and field updates via `deps.recordOps.writeScheduleFields()` and regex replacement. Returns current state after updates.

**`ManagerToolboxDeps`** (line 93): DI interface. Already has `scheduleLifecycle?: ScheduleLifecycle` for schedule tools. The trigger evaluator will be added as an optional field following the same pattern.

**`managerToolboxFactory`** (line 1396): Factory that wires `ManagerToolboxDeps` from `GuildHallToolboxDeps.services`. Reads `scheduleLifecycle` from `ctx.services`. Will read `triggerEvaluator` from the same bag.

**Daemon route for commission creation** (`apps/daemon/routes/commissions.ts`): The `/commission/request/commission/create` route already handles `type: "scheduled"` with schedule-specific fields. For triggered commissions, the route needs to handle `type: "triggered"` with trigger-specific fields (`match`, `approval`, `maxDepth`).

**`SYSTEM_EVENT_TYPES`** (`lib/types.ts:352`): The full list of event types, used for validating `match.type` in the create tool.

## Implementation Steps

### Step 1: Extend ManagerToolboxDeps with trigger evaluator

**Files**: `apps/daemon/services/manager/toolbox.ts`
**Addresses**: REQ-TRIG-25c

Add the trigger evaluator as an optional dependency on `ManagerToolboxDeps`, following the `scheduleLifecycle` pattern.

```typescript
// In ManagerToolboxDeps:
triggerEvaluator?: TriggerEvaluator;
```

Import the `TriggerEvaluator` type from `apps/daemon/services/trigger-evaluator.ts`.

In `managerToolboxFactory` (line 1396), pass `triggerEvaluator` from `ctx.services`:

```typescript
triggerEvaluator: ctx.services?.triggerEvaluator,
```

This requires adding `triggerEvaluator` to the services bag that `createProductionApp()` populates. The Phase 1 plan already wires the trigger evaluator in `apps/daemon/app.ts` via a lazy ref. The ref needs to be threaded into the services bag that `GuildHallToolboxDeps` carries.

Update the services type definition (in `apps/daemon/services/toolbox-types.ts` or wherever the services bag is typed) to include `triggerEvaluator?: TriggerEvaluator`. This follows the same pattern used for `scheduleLifecycle`.

Tests:
- `createManagerToolbox` accepts deps with `triggerEvaluator` present.
- `createManagerToolbox` accepts deps with `triggerEvaluator` absent (backward-compatible).

### Step 2: Extend commission creation route for triggered type

**Files**: `apps/daemon/routes/commissions.ts`, `apps/daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-TRIG-25a (artifact creation path)

The daemon route `/commission/request/commission/create` already handles `type: "scheduled"` with cron/repeat fields. Extend it to handle `type: "triggered"` with trigger-specific fields.

When `type: "triggered"` is provided:
- Accept `match` (required: `{ type, projectName?, fields? }`), `approval` (optional, defaults to `"confirm"`), and `maxDepth` (optional, defaults to 3).
- Validate `match.type` against `SYSTEM_EVENT_TYPES`. Return 400 on invalid type.
- Validate `workerName` against discovered packages. Return 400 on unknown worker.
- Generate a trigger commission artifact with the `trigger` block containing:
  - `match`: the provided match rule
  - `approval`: the provided value or `"confirm"`
  - `maxDepth`: the provided value or 3
  - `runs_completed: 0`
  - `last_triggered: null`
  - `last_spawned_id: null`
- Set `status: active` in the artifact frontmatter.
- Return `{ commissionId }`.

The orchestrator's `createCommission()` method builds the YAML template string. Extend it to include the `trigger:` block when `type === "triggered"`, following the same pattern as the `schedule:` block for scheduled commissions.

Tests:
- Route accepts `type: "triggered"` with valid `match` and writes a trigger artifact.
- Trigger artifact contains correct `trigger` block with match, approval, maxDepth, and initial state.
- Route rejects invalid `match.type` with 400.
- Route rejects unknown `workerName` with 400.
- Omitted `approval` defaults to `"confirm"` in artifact.
- Omitted `maxDepth` defaults to 3 in artifact.

### Step 3: create_triggered_commission handler

**Files**: `apps/daemon/services/manager/toolbox.ts`
**Addresses**: REQ-TRIG-25a, REQ-TRIG-25d

Create `makeCreateTriggeredCommissionHandler(deps: ManagerToolboxDeps)`. This follows the `makeCreateScheduledCommissionHandler` pattern: delegate to the daemon route for artifact creation, then notify the trigger evaluator for subscription registration.

```typescript
export function makeCreateTriggeredCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    title: string;
    workerName: string;
    prompt: string;
    match: { type: string; projectName?: string; fields?: Record<string, string> };
    approval?: "auto" | "confirm";
    maxDepth?: number;
    dependencies?: string[];
  }): Promise<ToolResult> => {
    // ...
  };
}
```

Handler logic:

1. **Validate `match.type`** against `SYSTEM_EVENT_TYPES`. Return error with `isError: true` if invalid. This is a client-side validation before the route call, providing a better error message than a generic 400.

2. **Validate `workerName`** against `deps.packages`. Return error if unknown. Same validation pattern as the route, but the handler can produce a more descriptive error listing available workers.

3. **Call the daemon route** via `deps.callRoute("/commission/request/commission/create", { ... })` with:
   - `projectName: deps.projectName`
   - `title: args.title`
   - `workerName: args.workerName`
   - `prompt: args.prompt`
   - `type: "triggered"`
   - `match: args.match`
   - `approval: args.approval`
   - `maxDepth: args.maxDepth`
   - `dependencies: args.dependencies`

4. **Register the subscription** (REQ-TRIG-25d). On successful route response, call `deps.triggerEvaluator!.registerTrigger(artifactPath, deps.projectName)` where `artifactPath` is resolved from the returned `commissionId`. This registers the trigger on the Event Router immediately, without requiring a daemon restart.

5. **Return** `{ commissionId, created: true, status: "active" }`.

Error handling: wrap in try/catch. Log failures at `error` level. Return `routeError()` on failure.

The `artifactPath` is computed as:
```typescript
const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
const artifactPath = path.join(intPath, ".lore", "commissions", `${commissionId}.md`);
```

This is the same path resolution pattern used in `makeUpdateScheduleHandler`.

Tests:
- Handler calls the daemon route with `type: "triggered"` and trigger fields.
- Handler calls `triggerEvaluator.registerTrigger()` after successful creation.
- Handler returns `{ commissionId, created: true, status: "active" }` on success.
- Handler rejects invalid `match.type` with descriptive error before calling the route.
- Handler rejects unknown `workerName` with descriptive error before calling the route.
- Route failure returns `isError: true` without calling `registerTrigger`.
- `registerTrigger` failure after successful creation logs error but still returns `{ commissionId, created: true, status: "active" }` (the artifact exists; the subscription is recovered on next daemon restart via `initialize()`).

### Step 4: update_trigger handler

**Files**: `apps/daemon/services/manager/toolbox.ts`
**Addresses**: REQ-TRIG-25b, REQ-TRIG-25d

Create `makeUpdateTriggerHandler(deps: ManagerToolboxDeps)`. This follows the `makeUpdateScheduleHandler` pattern: operate directly on the artifact and manage trigger evaluator subscriptions.

```typescript
export function makeUpdateTriggerHandler(
  deps: ManagerToolboxDeps,
) {
  const log = deps.log ?? nullLog("manager");
  return async (args: {
    commissionId: string;
    status?: string;
    match?: { type: string; projectName?: string; fields?: Record<string, string> };
    approval?: "auto" | "confirm";
    prompt?: string;
  }): Promise<ToolResult> => {
    // ...
  };
}
```

Handler logic:

1. **Resolve and validate the artifact.** Compute the artifact path from `args.commissionId` using `integrationWorktreePath`. Read the commission type via `deps.recordOps!.readType(artifactPath)`. If not `"triggered"`, return error: `Commission "{id}" is type "{type}", not "triggered". Only triggered commissions can be updated with this tool.` (Mirrors the validation in `makeUpdateScheduleHandler`.)

2. **Handle status transitions.** If `args.status` is provided:

   Define valid transitions (parallel to `SCHEDULE_STATUS_ACTIONS`):

   ```typescript
   const TRIGGER_STATUS_TRANSITIONS: Record<string, string[]> = {
     active: ["paused", "completed"],
     paused: ["active", "completed"],
   };
   ```

   `completed` and `failed` are terminal; no transitions out. Read current status from artifact. If the transition is invalid, return error: `Cannot transition from "{current}" to "{requested}": not a valid trigger status transition.`

   On valid transition:
   - **active to paused**: Call `deps.triggerEvaluator!.unregisterTrigger(args.commissionId)` to remove the router subscription. Write `status: paused` to the artifact via `deps.recordOps!.writeStatusAndTimeline(artifactPath, "paused", "Trigger paused via manager toolbox")`.
   - **paused to active**: Register the subscription via `deps.triggerEvaluator!.registerTrigger(artifactPath, deps.projectName)`. Write `status: active` to the artifact.
   - **active/paused to completed**: Call `unregisterTrigger` if currently active (has a subscription). Write `status: completed` to the artifact.

   The artifact write happens alongside the subscription change. If the artifact write fails after unregister, the subscription is already removed but the status is stale. On next daemon restart, `initialize()` reads the artifact status and won't re-register a completed trigger. If the artifact write fails after register, the subscription is live but the status says paused. On restart, `initialize()` won't register (reads paused). Net effect: the trigger fires until restart. Acceptable given this is a narrow failure window and the trigger was being resumed anyway.

   **Combined status + field updates.** When a caller provides both `status` and field changes (e.g., `status: "active"` with a new `match`), the ordering is: status transition first (which may register a subscription), then field updates write to the artifact, then field-driven subscription replacement runs. If a status transition to `active` already registered a subscription, and a `match` update then triggers unregister+register, the net result is correct (the final subscription uses the updated match rule). But the intermediate register from the status transition is immediately torn down. To avoid this: when `args.status` is provided alongside field changes, skip the subscription registration during the status transition and let the field update's subscription replacement handle it. The final subscription always reflects the latest artifact state.

3. **Handle field updates.** If `args.match`, `args.approval`, or `args.prompt` is provided:

   - **match validation**: If `args.match` is provided, validate `args.match.type` against `SYSTEM_EVENT_TYPES`. Return error on invalid type.

   - **Write field updates** to the artifact. For `match`, replace the `match:` block in the trigger YAML. For `approval`, replace the `approval:` line. For `prompt`, replace the `prompt:` line (same regex pattern as `makeUpdateScheduleHandler`).

   - **Subscription replacement** (REQ-TRIG-25d): If the trigger is `active` and any of `match`, `approval`, or `prompt` changes, the old subscription's handler closure captured stale configuration. Remove the old subscription via `unregisterTrigger`, then re-register via `registerTrigger`. The new registration reads the updated artifact, picking up the new match rule/approval/prompt.

     If the trigger is `paused`, just write the fields. No subscription management needed.

4. **Return** the updated state: `{ commissionId, status, updated: true }`.

**Match field serialization.** Writing the `match` block requires YAML serialization. The match block in a trigger artifact looks like:

```yaml
trigger:
  match:
    type: commission_status
    fields:
      status: completed
```

Use the same regex-based replacement approach as `writeScheduleFields`. Read the raw artifact, replace the `match:` subsection within the `trigger:` block. For the fields sub-block, build the YAML string from the `Record<string, string>`. The `projectName` line is conditional (only present when provided).

This is the most delicate part of the handler because YAML block replacement with regex is fragile. An alternative: read the entire frontmatter via gray-matter, update the parsed object, re-serialize. But gray-matter's `stringify()` reformats YAML (per the retro lesson in CLAUDE.md), causing noisy diffs. The regex approach is the established pattern.

Practical mitigation: write a helper function `serializeTriggerMatchBlock(match)` that produces the YAML lines for the match sub-block. This isolates the serialization logic for testing.

Tests:
- Handler rejects non-triggered commissions with descriptive error.
- **Status transitions**:
  - active to paused: calls `unregisterTrigger`, writes `status: paused`.
  - paused to active: calls `registerTrigger`, writes `status: active`.
  - active to completed: calls `unregisterTrigger`, writes `status: completed`.
  - paused to completed: writes `status: completed` (no subscription to remove).
  - completed to active: returns error (terminal state).
  - completed to paused: returns error (terminal state).
  - failed to anything: returns error (terminal state).
- **Field updates**:
  - Updates `match` and writes valid YAML to artifact.
  - Updates `approval` from `"auto"` to `"confirm"`.
  - Updates `prompt` with proper YAML escaping.
  - Invalid `match.type` returns error without modifying artifact.
- **Subscription replacement**:
  - Updating `match` on an active trigger calls `unregisterTrigger` then `registerTrigger`.
  - Updating `approval` on an active trigger calls `unregisterTrigger` then `registerTrigger`.
  - Updating fields on a paused trigger writes to artifact without subscription management.
  - Combined `status: "active"` + new `match` produces a single subscription with the updated match rule (no double register).
- Handler returns `{ commissionId, status, updated: true }` on success.

### Step 5: Register tools in the MCP server

**Files**: `apps/daemon/services/manager/toolbox.ts`
**Addresses**: REQ-TRIG-25a, REQ-TRIG-25b

In `createManagerToolbox()`, instantiate the two new handlers and register them as tools. This follows the existing pattern: create handler at the top, register via `tool()` in the tools array.

```typescript
const createTriggeredCommission = makeCreateTriggeredCommissionHandler(deps);
const updateTrigger = makeUpdateTriggerHandler(deps);
```

Tool registrations:

```typescript
tool(
  "create_triggered_commission",
  "Create an event-triggered commission that spawns one-shot commissions when matching events occur. The trigger starts in 'active' status and begins listening for events immediately. Use match to specify the event pattern. [internal: no daemon route]",
  {
    title: z.string().describe("Short title for the trigger"),
    workerName: z.string().describe("Worker package name for spawned commissions"),
    prompt: z.string().describe("Commission prompt (supports {{fieldName}} template variables from the matched event)"),
    match: z.object({
      type: z.string().describe("Event type to match (e.g. 'commission_status', 'commission_result', 'meeting_ended')"),
      projectName: z.string().optional().describe("Exact project name to match (omit for all projects)"),
      fields: z.record(z.string()).optional().describe("Field patterns to match via glob (e.g. { status: 'completed', commissionId: 'commission-Dalton-*' })"),
    }).describe("Event matching criteria"),
    approval: z.enum(["auto", "confirm"]).optional().describe("Dispatch behavior for spawned commissions. 'auto' dispatches immediately, 'confirm' creates in pending for review. Defaults to 'confirm'."),
    maxDepth: z.number().optional().describe("Maximum trigger chain depth before downgrading to confirm. Defaults to 3."),
    dependencies: z.array(z.string()).optional().describe("Commission dependency IDs (each supports {{fieldName}} template variables)"),
  },
  (args) => createTriggeredCommission(args),
),
tool(
  "update_trigger",
  "Update a triggered commission's configuration or status. Can change the match rule, approval mode, prompt, or status (active/paused/completed). Pausing removes the event subscription; resuming re-registers it. Field updates on active triggers replace the subscription. [internal: no daemon route]",
  {
    commissionId: z.string().describe("The triggered commission ID to update"),
    status: z.string().optional().describe("New status: 'active', 'paused', or 'completed'"),
    match: z.object({
      type: z.string().describe("Event type to match"),
      projectName: z.string().optional().describe("Exact project name to match"),
      fields: z.record(z.string()).optional().describe("Field patterns to match via glob"),
    }).optional().describe("New event matching criteria"),
    approval: z.enum(["auto", "confirm"]).optional().describe("New approval mode"),
    prompt: z.string().optional().describe("New commission prompt"),
  },
  (args) => updateTrigger(args),
),
```

Update the module docstring at the top of the file to reflect fifteen tools (currently thirteen) and list the two new ones.

Tests:
- Both tools are registered in the MCP server's tool list.
- Zod schemas validate correctly: required fields rejected when missing, optional fields accepted when absent.
- `match.type` accepts string (Zod doesn't restrict to `SYSTEM_EVENT_TYPES` at schema level; the handler validates).
- `approval` accepts only `"auto"` or `"confirm"` via `z.enum`.

### Step 6: Wire trigger evaluator into the services bag

**Files**: `apps/daemon/app.ts`, `apps/daemon/services/toolbox-types.ts` (or wherever the services bag type lives), `apps/daemon/services/commission/orchestrator.ts`
**Addresses**: REQ-TRIG-25c

The Phase 1 plan (Step 6) creates the trigger evaluator in `createProductionApp()` and stores it in a lazy ref (`triggerEvaluatorRef`). This step threads that ref through to the manager toolbox so the tool handlers can call `registerTrigger`/`unregisterTrigger`.

**The services bag is assembled inline in the orchestrator, not in `apps/daemon/app.ts`.** The `scheduleLifecycle` wiring demonstrates the actual path: `createProductionApp()` passes a `scheduleLifecycleRef` into the commission orchestrator's deps at construction time. The orchestrator then dereferences it in two inline services bag construction sites (lines 1847-1856 and 2108-2117 in `apps/daemon/services/commission/orchestrator.ts`) when building the `GuildHallToolServices` for toolbox resolution. The trigger evaluator must follow this same pattern.

Changes required:

1. **Services bag type** (in `apps/daemon/services/toolbox-types.ts` or equivalent): Add `triggerEvaluator?: TriggerEvaluator` to `GuildHallToolServices`.

2. **Orchestrator deps interface** (`apps/daemon/services/commission/orchestrator.ts`): Add `triggerEvaluatorRef?: { current: TriggerEvaluator | undefined }` alongside the existing `scheduleLifecycleRef`.

3. **Orchestrator inline services bags** (two sites in the orchestrator, around lines 1847-1856 and 2108-2117): Add `triggerEvaluator: deps.triggerEvaluatorRef?.current` to both services bag constructions, parallel to the `scheduleLifecycle: deps.scheduleLifecycleRef?.current` line.

4. **`createProductionApp()`** (`apps/daemon/app.ts`): Pass the `triggerEvaluatorRef` (already created in Phase 1's Step 6) into the orchestrator's deps alongside `scheduleLifecycleRef`.

The full wiring path:

```
createProductionApp() -> triggerEvaluatorRef -> orchestrator deps -> inline services bag -> GuildHallToolboxDeps.services -> managerToolboxFactory -> ManagerToolboxDeps.triggerEvaluator -> tool handlers
```

This matches the `scheduleLifecycle` path exactly.

Tests:
- Integration test: `createProductionApp()` passes `triggerEvaluatorRef` to the orchestrator.
- Both inline services bag constructions in the orchestrator include `triggerEvaluator`.
- Manager toolbox factory receives `triggerEvaluator` from services and passes it to handlers.

## Phase Ordering

Steps 1 and 2 can run in parallel. They modify different parts of the codebase: Step 1 extends the toolbox deps interface, Step 2 extends the commission creation route.

Steps 3 and 4 depend on Steps 1 and 2 (they use the extended deps and route).

Step 5 depends on Steps 3 and 4 (it registers the handlers as tools).

Step 6 depends on Step 1 (it wires the dep) but can run in parallel with Steps 3-5 since it modifies `apps/daemon/app.ts` and the services bag type, not the toolbox file.

Recommended sequence:

1. **Steps 1 + 2** (parallel): Extend deps interface, extend creation route.
2. **Steps 3 + 4 + 6** (parallel): Create handler, update handler, wire services bag.
3. **Step 5**: Register tools in MCP server (depends on 3 and 4).

## Delegation Guide

| Step | Reviewer | Why |
|------|----------|-----|
| Steps 1-2 | Thorne (Warden) | Interface and route extensions touch the DI boundary. Catch type mismatches early. |
| Steps 3-4 | Fresh-context agent | The handlers contain subscription lifecycle management (register/unregister timing, failure modes). A reviewer without implementation context will question the ordering assumptions. |
| Step 5 | None needed | Mechanical registration with Zod schemas. Covered by the Step 3-4 review. |
| Step 6 | Thorne (Warden) | Wiring in `app.ts` affects startup order. Verify the trigger evaluator is available before the manager toolbox is used. |

## Risk Notes

- **Match block YAML serialization.** Writing the `match` sub-block via regex is the established pattern (see `writeScheduleFields`) but is inherently fragile. The `fields` sub-block adds a third nesting level (trigger > match > fields). A `serializeTriggerMatchBlock` helper isolates this and makes it testable. If the regex approach proves too brittle, consider a targeted gray-matter read-modify-write for just the trigger block, accepting the formatting diff risk for that block only.

- **Subscription lifecycle ordering.** When `update_trigger` changes both status and fields, the status transition happens first (to determine if subscriptions need management), then field updates write to the artifact, then subscription replacement runs. If the field write fails between unregister and register, the trigger has no subscription. Recovery: the trigger's artifact still says `active`, so on daemon restart, `initialize()` re-registers it with the old configuration. The field update is lost. This is the same failure mode as `update_schedule` and is acceptable given the narrow window.

- **Route extension scope.** Step 2 extends the commission creation route to handle `type: "triggered"`. This touches the same route that `create_scheduled_commission` uses. The conditional logic for type-specific fields (`cron`/`repeat` for scheduled, `match`/`approval`/`maxDepth` for triggered) needs to be cleanly separated. Consider extracting the type-specific YAML generation into helper functions if the route handler grows unwieldy.

- **Lazy ref timing.** The trigger evaluator is created after the commission orchestrator in `createProductionApp()`. The manager toolbox is created during a commission/meeting session, not at startup. By the time the toolbox runs, the trigger evaluator is guaranteed to exist. The lazy ref pattern protects against the startup ordering concern. But if someone changes the startup order, the ref could be null when the tool runs. The `!` assertion on `deps.triggerEvaluator!` would throw. This is acceptable: the same pattern is used for `scheduleLifecycle` without issues.
