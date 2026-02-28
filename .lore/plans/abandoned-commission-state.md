---
title: "Plan: Abandoned commission state"
date: 2026-02-27
status: draft
tags: [commissions, lifecycle, abandoned, terminal-state]
modules: [commission-session, commission-routes, manager-toolbox, commission-actions]
related: [.lore/specs/guild-hall-commissions.md, .lore/plans/cancel-commission-tool.md]
---

# Plan: Abandoned Commission State

## Goal

Add `abandoned` as a fourth terminal state for commissions. This closes commissions that failed due to infrastructure issues (worktree destroyed during commit, daemon crash) where the work was completed outside the commission process, or marks work that's no longer relevant. Currently, `failed` and `cancelled` commissions sit in limbo: they can only be re-dispatched or left as-is. Abandon gives an explicit "this is done, here's why" closure with an audit trail.

## Transition Rules

Valid transitions to `abandoned`:
- `pending` -> `abandoned` (never started, not going to)
- `blocked` -> `abandoned` (giving up on blocked work)
- `failed` -> `abandoned` (work done elsewhere or not worth retrying)
- `cancelled` -> `abandoned` (changed mind about re-dispatch)

NOT valid from `dispatched` or `in_progress`. Those states have active sessions. Cancel first, then abandon. This is deliberate: you shouldn't abandon running work without stopping it.

`abandoned` has no outgoing edges. Once abandoned, a commission is closed permanently.

## Design Decisions

**Reason is required, not optional.** Unlike cancel (which has a default reason), abandon always requires the caller to explain why. The whole point is the audit trail. The daemon endpoint rejects requests without a reason. The UI requires the text field to be non-empty before the confirm button enables. The manager tool schema marks `reason` as required.

**No git operations.** Abandon operates on commissions that are NOT in `activeCommissions` (they're in terminal states already, or never started). There's no worktree to clean up, no branch to commit, no session to abort. The operation is purely a status update + timeline entry on the integration worktree artifact, plus a state file update.

**No SSE subscription needed.** Abandon is a synchronous status change on an already-terminal (or never-started) commission. The `commission_status` event emitted by the daemon is enough for any open browser tabs to react via the existing SSE handler in `CommissionView.tsx`.

**Confirmation dialog includes a reason input.** The existing cancel/redispatch confirmations are simple "Yes/No" dialogs. Abandon adds a textarea for the reason. This is a new UI pattern for CommissionActions, but straightforward: when `confirming === "abandon"`, render a textarea + confirm/cancel buttons instead of the simple text + buttons.

## Implementation Steps

### Step 1: Type definition and status machine

**Files:**
- `daemon/types.ts` (line ~35)
- `daemon/services/commission-session.ts` (lines 12-17, 72-80)

Add `"abandoned"` to the `CommissionStatus` union type:

```typescript
export type CommissionStatus =
  | "pending"
  | "blocked"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "abandoned";
```

Update the transition graph comment and `VALID_TRANSITIONS` constant:

```typescript
// The full transition graph:
//   pending -> dispatched, blocked, cancelled, abandoned
//   blocked -> pending, cancelled, abandoned
//   dispatched -> in_progress, failed
//   in_progress -> completed, failed, cancelled
//   completed, failed, cancelled, abandoned -> (terminal, no outgoing edges)
//
// Note: failed and cancelled can also transition to abandoned (closing
// out commissions that won't be re-dispatched).

const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled", "abandoned"],
  blocked: ["pending", "cancelled", "abandoned"],
  dispatched: ["in_progress", "failed"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["abandoned"],
  cancelled: ["abandoned"],
  abandoned: [],
};
```

### Step 2: Gem mapping

**File:** `lib/types.ts` (line ~149)

Add `"abandoned"` to `BLOCKED_STATUSES` so it renders with a red gem, matching `failed` and `cancelled`:

```typescript
const BLOCKED_STATUSES = new Set([
  "superseded", "outdated", "wontfix", "declined", "failed", "cancelled",
  "abandoned",
]);
```

No changes needed in components that call `statusToGem()`, they all go through this set.

### Step 3: Daemon `abandonCommission()` method

**File:** `daemon/services/commission-session.ts`

Add `abandonCommission` to the `CommissionSessionForRoutes` interface:

```typescript
abandonCommission(commissionId: CommissionId, reason: string): Promise<void>;
```

Implement the function inside `createCommissionSession()`. Unlike `cancelCommission()`, this operates on commissions that are NOT in `activeCommissions` (or on pending/blocked commissions that were never dispatched). The logic:

1. Read the commission artifact from the integration worktree to get the current status.
2. Validate the transition (current status -> "abandoned") via `validateTransition()`.
3. Call `transitionCommission()` on the integration worktree to update status and append the timeline entry.
4. Emit `commission_status` event with `status: "abandoned"` and the reason.
5. Update the state file to reflect the new terminal status.
6. Trigger dependency checks (abandoning a commission that others depend on should propagate).

Where the commission artifact lives depends on state:
- `pending` and `blocked` commissions have their artifact on the integration worktree only (never dispatched, no activity worktree).
- `failed` and `cancelled` commissions have already been synced to the integration worktree by the exit path. The activity worktree was removed; the branch was preserved. The integration worktree copy is the source of truth.

So in all cases, the abandon operation writes to the integration worktree path.

```typescript
async function abandonCommission(
  commissionId: CommissionId,
  reason: string,
): Promise<void> {
  // 1. Find the project from the state file or artifact scan
  const stateFile = await readStateFile(commissionId);
  const projectName = stateFile?.projectName;
  if (!projectName) {
    throw new Error(`Commission "${commissionId}" not found`);
  }

  const project = findProject(projectName);
  if (!project) {
    throw new Error(`Project "${projectName}" not found in config`);
  }

  const integrationPath = integrationWorktreePath(projectName);

  // 2. Read current status and validate transition
  const currentStatus = await readCommissionStatus(
    integrationPath,
    commissionId,
  );
  validateTransition(currentStatus, "abandoned");

  // 3. Transition on integration worktree
  await transitionCommission(
    integrationPath,
    commissionId,
    currentStatus,
    "abandoned",
    reason,
  );

  // 4. Emit event
  deps.eventBus.emit({
    type: "commission_status",
    commissionId: commissionId as string,
    status: "abandoned",
    reason,
  });

  // 5. Update state file
  await writeStateFile(commissionId, {
    commissionId: commissionId as string,
    projectName,
    workerName: stateFile.workerName,
    status: "abandoned",
  }).catch((err: unknown) => {
    console.error(
      `[commission-session] Failed to write state file for ${commissionId}:`,
      err instanceof Error ? err.message : String(err),
    );
  });

  // 6. Dependency check
  await checkDependencyTransitions(projectName);
}
```

Add `abandonCommission` to the returned object from the factory.

**Key difference from cancelCommission:** Cancel operates on commissions in `activeCommissions` (with live sessions). Abandon operates on commissions NOT in `activeCommissions` (already terminal or never dispatched). There's no abort signal, no worktree cleanup, no partial commit. Just a status update on the integration worktree.

### Step 4: Daemon route

**File:** `daemon/routes/commissions.ts`

Add a new endpoint following the cancel/note route patterns:

```typescript
// POST /commissions/:id/abandon - Abandon a commission
routes.post("/commissions/:id/abandon", async (c) => {
  const commissionId = asCommissionId(c.req.param("id"));

  let body: { reason?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { reason } = body;
  if (!reason) {
    return c.json({ error: "Missing required field: reason" }, 400);
  }

  try {
    console.log(
      `[route] POST /commissions/${commissionId as string}/abandon`,
    );
    await deps.commissionSession.abandonCommission(commissionId, reason);
    return c.json({ status: "ok" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    if (message.includes("Invalid commission transition")) {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 500);
  }
});
```

Update the route comment block at the top of the function to include the new endpoint.

### Step 5: Next.js proxy route

**New file:** `app/api/commissions/[commissionId]/abandon/route.ts`

Standard proxy pattern matching `redispatch/route.ts` and `note/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commissionId: string }> },
) {
  const { commissionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await daemonFetch(
    `/commissions/${commissionId}/abandon`,
    {
      method: "POST",
      body: JSON.stringify(body),
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

### Step 6: UI button with reason input

**File:** `components/commission/CommissionActions.tsx`

This is the most involved UI change. The existing confirmation pattern (simple "Yes/No" dialog) needs to accommodate a reason textarea for abandon.

Changes:

1. Expand the `confirming` state type to include `"abandon"`:

```typescript
const [confirming, setConfirming] = useState<
  "cancel" | "redispatch" | "abandon" | null
>(null);
```

2. Add `abandonReason` local state:

```typescript
const [abandonReason, setAbandonReason] = useState("");
```

3. Add `handleAbandon` callback:

```typescript
const handleAbandon = useCallback(async () => {
  setLoading(true);
  setError(undefined);
  setConfirming(null);
  try {
    const res = await fetch(`/api/commissions/${encodedId}/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: abandonReason }),
    });
    if (res.ok) {
      onStatusChange?.("abandoned");
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Abandon failed");
    }
  } catch {
    setError("Network error");
  } finally {
    setLoading(false);
    setAbandonReason("");
  }
}, [encodedId, onStatusChange, abandonReason]);
```

4. Add visibility logic:

```typescript
const showAbandon =
  status === "pending" ||
  status === "blocked" ||
  status === "failed" ||
  status === "cancelled";
```

5. Render the abandon section. For `failed` and `cancelled`, the Abandon button appears alongside Re-dispatch. For `pending` and `blocked`, it appears standalone (alongside Dispatch for pending, solo for blocked).

The confirmation dialog includes a textarea for the reason. The "Yes, Abandon" button is disabled until the reason is non-empty:

```tsx
{showAbandon && (
  <>
    {confirming === "abandon" ? (
      <div className={styles.confirmRow}>
        <span className={styles.confirmText}>Abandon this commission?</span>
        <textarea
          className={styles.abandonReason}
          placeholder="Why is this being abandoned?"
          value={abandonReason}
          onChange={(e) => setAbandonReason(e.target.value)}
          rows={2}
        />
        <div className={styles.confirmButtons}>
          <button
            className={styles.confirmYes}
            onClick={() => void handleAbandon()}
            disabled={loading || !isOnline || !abandonReason.trim()}
            title={offlineTitle}
            type="button"
          >
            {loading ? "Abandoning..." : "Yes, Abandon"}
          </button>
          <button
            className={styles.confirmNo}
            onClick={() => {
              setConfirming(null);
              setAbandonReason("");
            }}
            disabled={loading}
            type="button"
          >
            No
          </button>
        </div>
      </div>
    ) : (
      <button
        className={styles.abandonButton}
        onClick={() => setConfirming("abandon")}
        disabled={loading || !isOnline}
        title={offlineTitle}
        type="button"
      >
        Abandon
      </button>
    )}
  </>
)}
```

**File:** `components/commission/CommissionActions.module.css`

Add styles for the new button and textarea:

- `.abandonButton`: Same styling pattern as `.cancelButton` (muted/destructive appearance, not primary).
- `.abandonReason`: Basic textarea styling matching the design system (parchment background, brass border, body font).
- `.confirmButtons`: Flex row for the buttons below the textarea.

### Step 7: Guild Master tool

**File:** `daemon/services/manager-toolbox.ts`

Add `makeAbandonCommissionHandler(deps)` factory following the `makeCancelCommissionHandler` pattern:

```typescript
export function makeAbandonCommissionHandler(
  deps: ManagerToolboxDeps,
) {
  return async (args: {
    commissionId: string;
    reason: string;
  }): Promise<ToolResult> => {
    try {
      const cid = asCommissionId(args.commissionId);
      await deps.commissionSession.abandonCommission(cid, args.reason);

      console.log(
        `[manager-toolbox] Abandoned commission "${args.commissionId}"`,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              commissionId: args.commissionId,
              status: "abandoned",
            }),
          },
        ],
      };
    } catch (err: unknown) {
      console.error(
        `[manager-toolbox] Failed to abandon commission "${args.commissionId}":`,
        err instanceof Error ? err.message : String(err),
      );
      return {
        content: [
          {
            type: "text",
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        isError: true,
      };
    }
  };
}
```

Register the tool in `createManagerToolbox()`:

```typescript
const abandonCommission = makeAbandonCommissionHandler(deps);

// ... in the tools array:
tool(
  "abandon_commission",
  "Abandon a commission that won't be completed through the commission process. Use when work was done elsewhere, is no longer relevant, or isn't worth retrying. Valid from pending, blocked, failed, or cancelled states. Requires a reason for the audit trail.",
  {
    commissionId: z.string().describe("The commission ID to abandon"),
    reason: z.string().describe("Why the commission is being abandoned"),
  },
  (args) => abandonCommission(args),
),
```

Note: `reason` is required in the schema (no `.optional()`), matching the design decision.

### Step 8: SSE handler in CommissionView

**File:** `components/commission/CommissionView.tsx`

The existing SSE handler already processes `commission_status` events generically. When it receives `status: "abandoned"`, it will update the local state via `setStatus()`. The timeline entry creation in the SSE handler should already work because status change events create timeline entries with `event: "status_<status>"` format.

Verify this works and add no changes if it does. If the status change handler has an allow-list of statuses rather than a generic handler, add `"abandoned"` to the list.

## File Change Summary

| File | Change | New? |
|------|--------|------|
| `daemon/types.ts` | Add `"abandoned"` to `CommissionStatus` union | No |
| `daemon/services/commission-session.ts` | Update transition graph, add `abandonCommission()`, update interface and return object | No |
| `lib/types.ts` | Add `"abandoned"` to `BLOCKED_STATUSES` | No |
| `daemon/routes/commissions.ts` | Add `POST /commissions/:id/abandon` route | No |
| `app/api/commissions/[commissionId]/abandon/route.ts` | Proxy route to daemon | Yes |
| `components/commission/CommissionActions.tsx` | Add abandon button, reason textarea, handler | No |
| `components/commission/CommissionActions.module.css` | Add abandon button and textarea styles | No |
| `daemon/services/manager-toolbox.ts` | Add `abandon_commission` tool | No |
| `components/commission/CommissionView.tsx` | Verify SSE handler works with "abandoned" status (likely no changes) | No |

## Files That Need No Changes

These work generically with any status string:

- `daemon/services/commission-artifact-helpers.ts`: `updateCommissionStatus()` and `appendTimelineEntry()` accept arbitrary strings.
- `daemon/services/event-bus.ts`: The `commission_status` event type already carries a string status field.
- `lib/commissions.ts`: `parseActivityTimeline()` parses any event string.
- `components/commission/CommissionTimeline.tsx`: The `status_change` renderer is generic (shows from/to gems via `statusToGem()`). The `abandoned` status will render correctly with the red gem from step 2.
- `components/commission/CommissionHeader.tsx`, `CommissionList.tsx`: Use `statusToGem()` generically.

## Test Strategy

### Unit tests for status machine (update existing)

**File:** `tests/daemon/commission-session.test.ts`

Update `validateTransition` test tables:

**Valid edges to add:**
- `pending` -> `abandoned`
- `blocked` -> `abandoned`
- `failed` -> `abandoned`
- `cancelled` -> `abandoned`

**Invalid edges to add:**
- `dispatched` -> `abandoned`
- `in_progress` -> `abandoned`
- `completed` -> `abandoned`
- `abandoned` -> `pending`
- `abandoned` -> `dispatched`
- `abandoned` -> (any other status)

**Transition with timeline verification:** Add a test that transitions from `failed` to `abandoned` and verifies the timeline entry contains the reason.

### Unit tests for `abandonCommission()` method

**File:** `tests/daemon/commission-session.test.ts`

New describe block `"abandonCommission"`:

1. **Abandons a pending commission:** Create a pending commission (no dispatch), call `abandonCommission()`, verify status is "abandoned" and timeline has the reason.
2. **Abandons a failed commission:** Dispatch, simulate failure, call `abandonCommission()`, verify status and timeline.
3. **Abandons a cancelled commission:** Dispatch, cancel, call `abandonCommission()`, verify.
4. **Rejects abandon from dispatched:** Dispatch (without completing), attempt abandon, expect error about invalid transition.
5. **Rejects abandon from in_progress:** Same pattern, expect error.
6. **Rejects abandon without reason:** Verify the implementation requires a non-empty reason (this is enforced at the route level, but the method signature makes it explicit).
7. **Emits commission_status event:** Verify `eventBus.emit()` is called with `status: "abandoned"` and the reason.
8. **Updates state file:** Verify the state file reflects `status: "abandoned"` after the call.
9. **Triggers dependency check:** Verify `checkDependencyTransitions()` is called (abandoning a dependency should propagate).

### Route tests

**File:** `tests/daemon/routes/commissions.test.ts`

New describe block `"POST /commissions/:id/abandon"`:

1. **Returns 200 on success:** POST with `{ reason: "Work done elsewhere" }`, verify 200 and `{ status: "ok" }`.
2. **Returns 400 when reason is missing:** POST with empty body or `{}`, verify 400 and error message.
3. **Returns 400 on invalid JSON:** POST with non-JSON body, verify 400.
4. **Returns 404 when commission not found:** Mock session throws "not found", verify 404.
5. **Returns 409 on invalid transition:** Mock session throws "Invalid commission transition", verify 409.
6. **Returns 500 on unexpected error:** Mock session throws generic error, verify 500.

### Manager toolbox tests

**File:** `tests/daemon/services/manager-toolbox.test.ts`

New describe block `"abandon_commission"`:

1. **Abandons commission with reason:** Call handler with `commissionId` and `reason`, verify `abandonCommission()` was called on the mock session, verify success response.
2. **Returns error when commission not found:** Mock session throws, verify `isError: true` response.
3. **Returns error on invalid transition:** Mock session throws transition error, verify `isError: true`.

### Gem mapping tests

**File:** `tests/lib/types.test.ts` (if it exists, otherwise add to the nearest relevant test file)

Verify `statusToGem("abandoned")` returns the blocked/red gem indicator.

## Implementation Order

1. **Step 1** (types + transitions): Foundation that everything else depends on.
2. **Step 2** (gem mapping): Small, independent.
3. **Step 3** (session method): Core logic.
4. **Step 4** (daemon route): Exposes the method via HTTP.
5. **Step 5** (proxy route): Exposes the daemon route to the browser.
6. **Step 6** (UI): Consumes the proxy route.
7. **Step 7** (manager tool): Consumes the session method directly.
8. **Step 8** (SSE verification): Confirm existing handlers work.

Steps 1-2 can be done together. Steps 4-5 can be done together. Step 6 and Step 7 are independent of each other.

Tests should be written alongside each step, not deferred. Each step should leave the test suite passing before moving on.
