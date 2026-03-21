---
title: "Plan: Triggered Commissions Web UI"
date: 2026-03-21
status: draft
tags: [commissions, triggers, web-ui, next-js]
modules: [web-ui, daemon-routes, commission-list, commission-detail]
related:
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/plans/commissions/triggered-commissions-core.md
  - .lore/plans/commissions/triggered-commissions-tools.md
  - .lore/specs/commissions/guild-hall-scheduled-commissions.md
depends-on:
  - .lore/plans/commissions/triggered-commissions-core.md
  - .lore/plans/commissions/triggered-commissions-tools.md
---

# Plan: Triggered Commissions Web UI

## Spec Reference

**Spec**: `.lore/specs/commissions/triggered-commissions.md`
**Phase 1 plan**: `.lore/plans/commissions/triggered-commissions-core.md`
**Phase 2 plan**: `.lore/plans/commissions/triggered-commissions-tools.md`

Requirements addressed (Phase 3, web UI):

- REQ-TRIG-38: Trigger list view (status gem, "Trigger" label, worker, timestamp, prompt preview)
- REQ-TRIG-39: Trigger detail view (TriggerInfo and TriggerActions panels in sidebar)
- REQ-TRIG-40: Next.js API route for trigger status updates
- REQ-TRIG-41: Filter group integration (active/paused/completed triggers in existing groups)
- REQ-TRIG-42: Spawned commission provenance links ("from: [trigger-id]")

**Not covered by this plan** (earlier phases):
- REQ-TRIG-1 through 37: Core architecture and toolbox tools (Phases 1 and 2)

## Dependency on Phase 1 and Phase 2

This plan assumes both earlier phases are complete:

- `CommissionType` includes `"triggered"` in `daemon/types.ts`
- `TriggerBlock` type exists with `match`, `approval`, `maxDepth`, `runs_completed`, `last_triggered`, `last_spawned_id`
- Trigger artifacts exist in `.lore/commissions/` with `type: triggered` and a `trigger:` frontmatter block
- The daemon route `/commission/schedule/commission/update` (or its trigger equivalent) handles trigger status transitions
- `CommissionRecordOps` has `readTriggerMetadata()` for parsing trigger frontmatter
- Spawned commissions carry `triggered_by` in frontmatter with `source_id`, `trigger_artifact`, `depth`
- The trigger evaluator manages subscriptions via `registerTrigger`/`unregisterTrigger`

## Codebase Context

**Commission detail page** (`web/app/projects/[name]/commissions/[id]/page.tsx`): Server component. Fetches commission detail from the daemon, builds `scheduleInfo` when `type === "scheduled"`, and passes `commissionType` and `scheduleInfo` as props to `CommissionView`. The trigger equivalent needs the same treatment: detect `type === "triggered"`, build a `triggerInfo` prop, pass it down.

**CommissionView** (`web/components/commission/CommissionView.tsx`): Client component. Lines 270-291 show the conditional sidebar rendering. When `commissionType === "scheduled"` and `scheduleInfo` is present, it renders `CommissionScheduleInfo` + `CommissionScheduleActions` in `Panel` wrappers. Otherwise it renders `CommissionActions`. Triggered commissions will add a third branch.

**CommissionScheduleInfo** (`web/components/commission/CommissionScheduleInfo.tsx`): Server component. Renders a `<dl>` of schedule fields (cron, runs, last run, next run) and a "Recent Runs" list with linked commission IDs. This is the structural template for `TriggerInfo`.

**CommissionScheduleActions** (`web/components/commission/CommissionScheduleActions.tsx`): Client component with `"use client"`. Manages `loading`/`error` state. Calls `POST /api/commissions/[id]/schedule-status` with `{ status: targetStatus }`. Shows Pause/Resume toggle and Complete button. Returns null for terminal statuses. This is the structural template for `TriggerActions`.

**Schedule status API route** (`web/app/api/commissions/[commissionId]/schedule-status/route.ts`): Thin proxy. Takes `commissionId` from params, merges request body, calls `daemonFetch("/commission/schedule/commission/update", ...)`. Returns daemon response. The trigger-status route follows the same pattern, calling a trigger-specific daemon endpoint.

**Commission list** (`web/components/commission/CommissionList.tsx`): Renders the list. Line 123 shows the "Recurring" label for scheduled commissions. Lines 143-150 show the `sourceSchedule` provenance link. Triggered commissions need: a "Trigger" label (parallel to "Recurring") and a `triggered_by` provenance link (parallel to `sourceSchedule`).

**Filter groups** (`web/components/commission/commission-filter.ts`): `FILTER_GROUPS` defines four groups: Idle (pending, blocked, paused), Active (dispatched, in_progress, halted, active), Failed (failed, cancelled), Done (abandoned, completed). Trigger statuses map directly onto these groups: `active` is already in Active, `paused` is already in Idle, `completed` is in Done, `failed` is in Failed. No filter group changes needed (REQ-TRIG-41).

**CommissionMeta** (`lib/commissions.ts:19`): Interface for list items. Has `type: string`, `sourceSchedule: string`, `worker`, `status`, etc. Needs a `triggeredBy` field (or equivalent) for the provenance link, and the trigger metadata needs to flow from the daemon detail response.

**Daemon commission detail route** (`daemon/routes/commissions.ts`): Returns commission metadata including `scheduleInfo` when `type === "scheduled"`. Needs a parallel `triggerInfo` block when `type === "triggered"`.

## Implementation Steps

### Step 1: Extend daemon detail response with trigger info

**Files**: `daemon/routes/commissions.ts`, `daemon/services/commission/record.ts`
**Addresses**: REQ-TRIG-39 (data source for TriggerInfo panel)

The daemon's commission detail endpoint needs to return trigger metadata when `type === "triggered"`, following the `scheduleInfo` pattern.

In the commission detail route handler:

1. After reading the commission artifact, check `type`. When `type === "triggered"`, call `recordOps.readTriggerMetadata(artifactPath)` to get the trigger block.

2. Return a `triggerInfo` block in the response:

```typescript
triggerInfo: {
  match: triggerMeta.match,           // { type, projectName?, fields? }
  approval: triggerMeta.approval ?? "confirm",
  maxDepth: triggerMeta.maxDepth ?? 3,
  runsCompleted: triggerMeta.runs_completed,
  lastTriggered: triggerMeta.last_triggered,
  lastSpawnedId: triggerMeta.last_spawned_id,
}
```

This mirrors how `scheduleInfo` is built from `readScheduleMetadata()`.

Tests:
- Detail endpoint returns `triggerInfo` when commission type is `"triggered"`.
- Detail endpoint omits `triggerInfo` when commission type is `"one-shot"` or `"scheduled"`.
- `triggerInfo` contains all trigger block fields with correct values.
- Missing optional fields (approval, maxDepth) use defaults in the response.

### Step 2: Extend CommissionMeta with trigger provenance

**Files**: `lib/commissions.ts`, `daemon/routes/commissions.ts`
**Addresses**: REQ-TRIG-42 (provenance links in list view)

Add trigger provenance to the commission list data.

In `CommissionMeta` (`lib/commissions.ts`):
```typescript
/** For spawned commissions created by a trigger, the trigger artifact ID. */
sourceTrigger: string;
```

This follows the `sourceSchedule` pattern. The value comes from `triggered_by.trigger_artifact` in the commission's frontmatter, set to empty string when absent.

In the daemon's commission list route: when building `CommissionMeta` for each commission, read `triggered_by` from frontmatter and populate `sourceTrigger` with `triggered_by.trigger_artifact` (or empty string).

Tests:
- List endpoint populates `sourceTrigger` from `triggered_by.trigger_artifact`.
- Commissions without `triggered_by` have empty `sourceTrigger`.

### Step 3: TriggerInfo component

**Files**: `web/components/commission/TriggerInfo.tsx` (new), `web/components/commission/TriggerInfo.module.css` (new)
**Addresses**: REQ-TRIG-39 (TriggerInfo panel)

Create a display component for trigger configuration and runtime state, structurally parallel to `CommissionScheduleInfo.tsx`.

**Interface:**

```typescript
export interface TriggerInfoData {
  match: {
    type: string;
    projectName?: string;
    fields?: Record<string, string>;
  };
  approval: string;
  maxDepth: number;
  runsCompleted: number;
  lastTriggered: string | null;
  lastSpawnedId: string | null;
  /** Populated on the detail page from the all-commissions list, not from the daemon response. */
  recentSpawns: Array<{
    commissionId: string;
    status: string;
    date: string;
  }>;
}

interface TriggerInfoProps {
  trigger: TriggerInfoData;
  projectName: string;
}
```

Note: The daemon detail response (Step 1) returns raw trigger metadata without `recentSpawns`. The detail page (Step 7) assembles the full `TriggerInfoData` by filtering the all-commissions list for entries with `sourceTrigger` matching the trigger ID, same pattern as scheduled commission recent runs. `TriggerInfoData` is the assembled type consumed by the component, not the daemon response shape.

**Rendering** (definition list format, matching `CommissionScheduleInfo`):

- **Match rule summary**: Event type displayed in a `<code>` block. If `projectName` is set, show it. If `fields` has entries, show each as `fieldName: pattern` in a compact list.
- **Approval**: "auto" or "confirm" with a brief indicator (e.g., a different text color or label for auto vs confirm).
- **Max depth**: Numeric display.
- **Runs completed**: Numeric display.
- **Last triggered**: Formatted timestamp via the same `formatTimestamp` helper, or "Never" if null.
- **Last spawned ID**: Clickable link to the spawned commission's detail page (same link pattern as `CommissionScheduleInfo` recent runs). Show "None" if null.
- **Recent spawns section**: List of recently spawned commissions (up to 10) with status and timestamp. Same `<ul>` structure as the "Recent Runs" section in `CommissionScheduleInfo`. Each entry links to the commission detail page.

The CSS module follows the same structure as `CommissionScheduleInfo.module.css`: `container`, `label`, `fields`, `field`, `fieldLabel`, `fieldValue`, `recentRuns`, `runList`, `runItem`, `runLink`, `runId`, `runMeta`, `runStatus`, `runDate`.

Extract `formatTimestamp` into a shared utility (`web/components/commission/format-timestamp.ts`) since both `CommissionScheduleInfo` and `TriggerInfo` need it. Update `CommissionScheduleInfo` to import from the shared location. Verify `CommissionScheduleInfo` renders correctly after the refactor.

Tests:
- Renders match rule with event type.
- Renders match fields when present.
- Shows "Never" when `lastTriggered` is null.
- Shows "None" when `lastSpawnedId` is null.
- Last spawned ID links to the correct commission detail URL.
- Recent spawns list renders with status and timestamps.
- Empty recent spawns list doesn't render the section.
- `CommissionScheduleInfo` still works after `formatTimestamp` extraction.

### Step 4: TriggerActions component

**Files**: `web/components/commission/TriggerActions.tsx` (new), `web/components/commission/TriggerActions.module.css` (new)
**Addresses**: REQ-TRIG-39 (TriggerActions panel)

Create action buttons for trigger lifecycle management, structurally parallel to `CommissionScheduleActions.tsx`.

**Interface:**

```typescript
interface TriggerActionsProps {
  status: string;
  commissionId: string;
  onStatusChange: (newStatus: string) => void;
}
```

**State management** (same pattern as `CommissionScheduleActions`):
- `loading: boolean` for disabling buttons during requests.
- `error: string | null` for displaying errors.

**`handleAction(targetStatus: string)`**: Calls `POST /api/commissions/${commissionId}/trigger-status` with `{ status: targetStatus }`. On success, calls `onStatusChange`. On failure, sets error message. Same try/catch/finally pattern as `CommissionScheduleActions`.

**Rendering**:
- Returns `null` when `isTerminal` (status is `"completed"` or `"failed"`).
- **Pause/Resume toggle**: When `active`, show "Pause Trigger" button. When `paused`, show "Resume Trigger" button. Loading states: "Pausing..." / "Resuming...".
- **Complete Trigger button**: Always shown for non-terminal states. Loading: "Completing...".
- **Daemon offline**: The spec requires buttons to be disabled when the daemon is offline (REQ-TRIG-39). Check whether `CommissionScheduleActions` handles this (it may rely on the error response pattern rather than a dedicated offline check). If the existing pattern uses `useDaemonStatus()` or similar, follow it. If it relies on the fetch error path, the same pattern suffices here.
- **Error display**: `<p>` at the bottom of the component, same as `CommissionScheduleActions`.

The CSS module follows `CommissionScheduleActions.module.css`: `container`, `label`, `buttonGroup`, `pauseButton`, `resumeButton`, `completeButton`, `error`.

Tests:
- Shows "Pause Trigger" when status is `active`.
- Shows "Resume Trigger" when status is `paused`.
- Shows "Complete Trigger" for both active and paused.
- Returns null for `completed` and `failed` statuses.
- Calls the trigger-status API with correct payload on button click.
- Disables buttons while loading.
- Displays error message on failed requests.
- Calls `onStatusChange` on success.

### Step 5: Trigger status API route

**Files**: `web/app/api/commissions/[commissionId]/trigger-status/route.ts` (new)
**Addresses**: REQ-TRIG-40

Create the Next.js API route that proxies trigger status updates to the daemon. This follows the `schedule-status/route.ts` pattern exactly.

```typescript
import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const result = await daemonFetch(
    "/commission/trigger/commission/update",
    {
      method: "POST",
      body: JSON.stringify({ commissionId, ...body }),
    },
  );

  if (isDaemonError(result)) {
    return NextResponse.json(
      { error: "Daemon is not running" },
      { status: 503 },
    );
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
```

The daemon endpoint path (`/commission/trigger/commission/update`) follows the pattern established by `/commission/schedule/commission/update`. Phase 2's `update_trigger` handler operates through the manager toolbox, but the web UI needs a direct daemon route for trigger status transitions. This route delegates to the same trigger evaluator lifecycle methods.

**Daemon-side route needed.** The daemon must expose a route at `/commission/trigger/commission/update` that accepts `{ commissionId, status }`, validates the transition, calls `triggerEvaluator.unregisterTrigger()`/`registerTrigger()` as appropriate, and updates the artifact status. This is the daemon-side counterpart to the web route. If Phase 2's `update_trigger` toolbox handler already exposes this through a callable path, the daemon route can delegate to the same logic. If not, the route needs its own handler following the `update_schedule` route pattern.

**Decision**: The Phase 2 plan's `update_trigger` operates through the MCP toolbox (Guild Master's tools). The web UI can't call MCP tools directly; it needs a REST route. The daemon needs a new route in `daemon/routes/commissions.ts` that handles trigger status updates. This route reuses the same record ops and trigger evaluator methods that the toolbox handler uses, not the handler itself.

Tests:
- Route returns 503 when daemon is offline.
- Route proxies status updates and returns daemon response.
- Route passes `commissionId` from URL params.

### Step 6: Daemon route and orchestrator method for trigger status updates

**Files**: `daemon/services/commission/orchestrator.ts`, `daemon/routes/commissions.ts`
**Addresses**: REQ-TRIG-40 (daemon side)

This step follows the same pattern as scheduled commission status updates: the route calls an orchestrator method, not the trigger evaluator directly. This keeps `CommissionRoutesDeps` unchanged and routes all stateful commission operations through `CommissionSessionForRoutes`.

**6a: Add `updateTriggerStatus()` to `CommissionSessionForRoutes`.**

In the orchestrator interface, add:

```typescript
updateTriggerStatus(commissionId: string, status: string, projectName: string): Promise<{ commissionId: string; status: string }>;
```

Implementation in the orchestrator (parallel to `updateScheduleStatus`):

1. Resolve the artifact path from `commissionId`.
2. Read the commission type via `recordOps.readType()`. Reject if not `"triggered"`.
3. Read current status. Validate the transition:

   ```typescript
   const TRIGGER_STATUS_TRANSITIONS: Record<string, string[]> = {
     active: ["paused", "completed"],
     paused: ["active", "completed"],
   };
   ```

   `completed` and `failed` are terminal; no transitions out. Invalid transitions throw.

4. Execute the transition:
   - **active to paused**: Call `triggerEvaluatorRef.current!.unregisterTrigger(commissionId)`. Write `status: paused` via `recordOps.writeStatusAndTimeline()`.
   - **paused to active**: Call `triggerEvaluatorRef.current!.registerTrigger(artifactPath, projectName)`. Write `status: active`.
   - **active/paused to completed**: Unregister if currently active. Write `status: completed`.

5. Return `{ commissionId, status: newStatus }`.

The orchestrator already has `triggerEvaluatorRef` in its deps (from Phase 2 Step 6 wiring). No new deps needed.

**6b: Add the daemon route.**

Add `POST /commission/trigger/commission/update` in `daemon/routes/commissions.ts`. The handler:

1. Parses `{ commissionId, status, projectName }` from the request body.
2. Calls `commissionSession.updateTriggerStatus(commissionId, status, projectName)`.
3. Returns the result or a 400 on validation errors.

The route factory receives `commissionSession` from existing deps. No `triggerEvaluator` in route deps needed; the orchestrator owns that reference.

This mirrors how `/commission/schedule/commission/update` calls `commissionSession.updateScheduleStatus()`.

**Shared logic with Phase 2's MCP tool.** The `update_trigger` MCP tool (Phase 2) and this orchestrator method both implement trigger status transitions. Extract the `TRIGGER_STATUS_TRANSITIONS` map and the transition validation into a shared constant (e.g., in `daemon/services/commission/trigger-lifecycle.ts`). Both the orchestrator method and the MCP tool handler import it. This prevents the two code paths from drifting.

Tests:
- `updateTriggerStatus` transitions active to paused, paused to active, either to completed.
- `updateTriggerStatus` rejects invalid transitions (completed to active) with descriptive error.
- `updateTriggerStatus` rejects non-triggered commissions.
- Unregister is called on pause; register is called on resume.
- Route returns 400 on validation errors, 200 on success.
- Route calls `commissionSession.updateTriggerStatus()` (not triggerEvaluator directly).

### Step 7: Wire TriggerInfo and TriggerActions into CommissionView

**Files**: `web/components/commission/CommissionView.tsx`, `web/app/projects/[name]/commissions/[id]/page.tsx`
**Addresses**: REQ-TRIG-39 (integration)

**CommissionDetail interface** (in the detail page, around line 27): Add a `triggerInfo` field alongside `scheduleInfo`:

```typescript
triggerInfo?: {
  match: { type: string; projectName?: string; fields?: Record<string, string> };
  approval: string;
  maxDepth: number;
  runsCompleted: number;
  lastTriggered: string | null;
  lastSpawnedId: string | null;
};
```

This is the daemon response shape (Step 1). The page assembles the full `TriggerInfoData` (with `recentSpawns`) before passing it to `CommissionView`.

**CommissionView props**: Add `triggerInfo?: TriggerInfoData` alongside the existing `scheduleInfo?: ScheduleInfo`.

**Sidebar conditional** (currently lines 270-291): Extend from two branches to three:

```tsx
{commissionType === "triggered" && triggerInfo ? (
  <>
    <Panel size="sm">
      <TriggerInfo trigger={triggerInfo} projectName={projectName} />
    </Panel>
    <Panel size="sm">
      <TriggerActions
        status={status}
        commissionId={commissionId}
        onStatusChange={handleStatusChange}
      />
    </Panel>
  </>
) : commissionType === "scheduled" && scheduleInfo ? (
  <>
    <Panel size="sm">
      <CommissionScheduleInfo schedule={scheduleInfo} projectName={projectName} />
    </Panel>
    <Panel size="sm">
      <CommissionScheduleActions
        status={status}
        commissionId={commissionId}
        onStatusChange={handleStatusChange}
      />
    </Panel>
  </>
) : (
  <Panel size="sm">
    <CommissionActions
      status={status}
      commissionId={commissionId}
      onStatusChange={handleStatusChange}
    />
  </Panel>
)}
```

**Detail page** (`web/app/projects/[name]/commissions/[id]/page.tsx`): Build `triggerInfo` from the daemon response, same pattern as `scheduleInfo`:

1. The daemon detail response now includes `triggerInfo` (from Step 1).
2. When `triggerInfo` is present, build recent spawns by filtering the all-commissions list for those with `sourceTrigger` matching this commission's ID.
3. Pass `triggerInfo` to `CommissionView`.

Tests:
- CommissionView renders TriggerInfo when `commissionType === "triggered"` and `triggerInfo` is present.
- CommissionView renders TriggerActions in the same case.
- CommissionView still renders ScheduleInfo for scheduled commissions.
- CommissionView still renders CommissionActions for one-shot commissions.
- Detail page builds triggerInfo with recent spawns from matching commissions.

### Step 8: Commission list "Trigger" label and provenance links

**Files**: `web/components/commission/CommissionList.tsx`
**Addresses**: REQ-TRIG-38 (list view), REQ-TRIG-42 (provenance links)

**"Trigger" label** (parallel to the "Recurring" label at line 123):

Add a conditional alongside the "Recurring" check:

```tsx
{commission.type === "triggered" && (
  <span className={styles.triggerLabel}>Trigger</span>
)}
```

Add CSS for `triggerLabel` in `CommissionList.module.css`, using the same styling approach as `recurringLabel`.

**Provenance link** (parallel to `sourceSchedule` at lines 143-150):

```tsx
{commission.sourceTrigger && (
  <span className={styles.sourceTrigger}>
    from:{" "}
    <Link
      href={`/projects/${encodedName}/commissions/${encodeURIComponent(commission.sourceTrigger)}`}
      className={styles.sourceTriggerLink}
    >
      {commission.sourceTrigger}
    </Link>
  </span>
)}
```

The link points to the trigger artifact's commission detail page, since triggers are commission artifacts. This differs from `sourceSchedule` which links to `/projects/.../schedules/...`. Triggers live in the commissions namespace.

Add CSS for `sourceTrigger` and `sourceTriggerLink` in `CommissionList.module.css`, following the `sourceSchedule`/`sourceScheduleLink` styling.

Tests:
- "Trigger" label renders for commissions with `type === "triggered"`.
- "Trigger" label does not render for other types.
- Provenance link renders when `sourceTrigger` is non-empty.
- Provenance link points to the correct commission detail URL.
- "Recurring" label still renders for scheduled commissions.
- `sourceSchedule` link still renders for schedule-spawned commissions.

## Phase Ordering

Steps 1 and 2 can run in parallel (daemon-side data extensions). Steps 3 and 4 can run in parallel (independent UI components). Step 5 depends on the daemon route (Step 6), so Step 6 goes first. Step 7 depends on Steps 1, 3, 4, and 6 (it wires everything together). Step 8 depends on Step 2 (needs `sourceTrigger` in CommissionMeta).

Recommended sequence:

1. **Steps 1 + 2 + 6** (parallel): Extend daemon detail response, extend CommissionMeta, create daemon trigger-status route.
2. **Steps 3 + 4 + 5** (parallel): TriggerInfo component, TriggerActions component, Next.js API route. Step 5 can proceed once Step 6 is defined (the proxy doesn't depend on the daemon route being implemented yet, just its contract).
3. **Steps 7 + 8** (parallel): Wire into CommissionView, wire into CommissionList.

## Delegation Guide

| Step | Reviewer | Why |
|------|----------|-----|
| Steps 1-2 | Thorne (Warden) | Data contract changes between daemon and web. Catch field mismatches before the UI consumes them. |
| Steps 3-4 | Fresh-context agent | New UI components should be reviewed for visual consistency with the existing schedule panels. A reviewer with no implementation context will catch layout drift. |
| Step 5 | None needed | Mechanical copy of the schedule-status route pattern. |
| Step 6 | Thorne (Warden) | Route touches trigger evaluator lifecycle (register/unregister). Same subscription ordering concerns as Phase 2. |
| Steps 7-8 | Fresh-context agent | Integration wiring is where things fall through the cracks. A reviewer checking data flow from daemon response to component props will catch missing fields. |

## Dependencies

- **Phase 1 complete**: `CommissionType` includes `"triggered"`, `TriggerBlock` type exists, `CommissionRecordOps` has trigger methods.
- **Phase 2 complete**: Trigger evaluator wired in `createProductionApp()` with `registerTrigger`/`unregisterTrigger`. Services bag includes `triggerEvaluator`.
- **Daemon trigger route**: Step 6 creates the daemon endpoint. Step 5 creates the Next.js proxy. The daemon route needs the trigger evaluator in its DI deps, which Phase 2 already wires.

No new npm packages. No external dependencies.

## Risk Notes

- **Daemon route and MCP tool overlap.** Phase 2's `update_trigger` MCP tool and Step 6's `updateTriggerStatus()` orchestrator method both implement trigger status transitions. Step 6 addresses this by extracting the transition map into a shared constant (`daemon/services/commission/trigger-lifecycle.ts`). The orchestrator method is the canonical implementation; the MCP tool handler should be updated to call `updateTriggerStatus()` through `callRoute` rather than reimplementing the logic, if the Phase 2 implementation supports that path. If not, the shared constant prevents drift.

- **Recent spawns query.** `TriggerInfo` shows recent spawned commissions, built by filtering the all-commissions list for entries with `sourceTrigger` matching the current trigger ID. This is the same pattern as scheduled commission recent runs. For projects with many commissions, this full-list fetch could be slow. Acceptable for now; the scheduled commission pattern handles the same volume.

- **CSS duplication.** `TriggerInfo.module.css` will largely duplicate `CommissionScheduleInfo.module.css`. Extracting shared panel styles could reduce this, but CSS Modules don't compose well in this codebase (Turbopack doesn't support `composes`). Duplication is the pragmatic choice.

- **Filter group mapping.** Trigger statuses (`active`, `paused`, `completed`, `failed`) already appear in the existing filter groups. No changes needed. But if users have many triggers, the "Active" group could become crowded with both active commissions and active triggers. The status gems help distinguish them visually, and the "Trigger" label in the list provides additional context.

- **Match rule display.** The `fields` object in the match rule can contain glob patterns with special characters (`*`, `{`, `!`). The TriggerInfo panel displays these as-is in the definition list. No escaping needed for display, but long field patterns could overflow. CSS `word-break: break-all` on the fields value handles this.
