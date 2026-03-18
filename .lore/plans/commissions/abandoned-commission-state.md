---
title: "Plan: Abandoned commission state"
date: 2026-02-27
updated: 2026-03-03
status: executed
tags: [commissions, lifecycle, abandoned, terminal-state]
modules: [commission/lifecycle, commission/orchestrator, commission-routes, manager-toolbox, commission-actions]
related: [.lore/specs/commissions/guild-hall-commissions.md]
---

# Plan: Abandoned Commission State

## Status

**Type and state machine are done.** `"abandoned"` exists in `CommissionStatus` (daemon/types.ts), the `TRANSITIONS` map in `CommissionLifecycle` includes all valid edges, and `lifecycle.abandon()` is implemented and tested. The infrastructure to transition a commission to abandoned status works at Layer 2.

**Everything above Layer 2 is missing.** There is no way for a user or the Guild Master to trigger an abandon. The orchestrator, daemon routes, Next.js proxy, UI, and manager toolbox all lack abandon support. The `lifecycle.abandon()` signature also hardcodes the reason string, which needs to accept a caller-supplied reason.

## Goal

Wire abandon from the lifecycle layer up through all consumer layers so users can close commissions that failed due to infrastructure issues, had work completed outside the commission process, or are no longer relevant. Abandon requires a reason for the audit trail (unlike cancel, which has a default reason).

## What's Already Done

| Layer | Component | Status |
|-------|-----------|--------|
| Types | `CommissionStatus` includes `"abandoned"` | Done |
| Layer 2 | `TRANSITIONS` map: pending/blocked/failed/cancelled -> abandoned | Done |
| Layer 2 | `lifecycle.abandon(id)` method | Done (needs reason param) |
| Layer 2 | Terminal state: no outgoing edges from abandoned | Done |

## What's Missing

| Layer | Component | Status |
|-------|-----------|--------|
| Layer 2 | `lifecycle.abandon()` should accept a `reason` parameter | Missing |
| Layer 5 | `abandonCommission()` on `CommissionSessionForRoutes` interface | Missing |
| Layer 5 | `abandonCommission()` implementation in orchestrator | Missing |
| Routes | `POST /commissions/:id/abandon` daemon route | Missing |
| Proxy | `web/app/api/commissions/[commissionId]/abandon/route.ts` | Missing |
| UI | Abandon button + reason textarea in `CommissionActions.tsx` | Missing |
| Manager | `abandon_commission` tool in `manager-toolbox.ts` | Missing |
| Display | `"abandoned"` in `BLOCKED_STATUSES` (lib/types.ts) | Missing |

## Design Decisions

**Reason is required, not optional.** Unlike cancel (which has a default reason), abandon always requires the caller to explain why. The whole point is the audit trail. The daemon endpoint rejects requests without a reason. The UI requires the text field to be non-empty before the confirm button enables. The manager tool schema marks `reason` as required.

**No git operations.** Abandon operates on commissions that are NOT in `activeCommissions` (they're in terminal states already, or never started). There's no worktree to clean up, no branch to commit, no session to abort. The operation is purely a status update + timeline entry on the integration worktree artifact, plus a state file update.

**No SSE subscription needed.** Abandon is a synchronous status change on an already-terminal (or never-started) commission. The `commission_status` event emitted by `lifecycle.transition()` is enough for any open browser tabs to react via the existing SSE handler in `CommissionView.tsx`, which handles `commission_status` generically.

**Confirmation dialog includes a reason input.** The existing cancel/redispatch confirmations are simple "Yes/No" dialogs. Abandon adds a textarea for the reason. When `confirming === "abandon"`, render a textarea + confirm/cancel buttons instead of the simple text + buttons.

## Implementation Steps

### Step 1: Add reason parameter to `lifecycle.abandon()`

**File:** `daemon/services/commission/lifecycle.ts:149`

Change the signature from `abandon(id: CommissionId)` to `abandon(id: CommissionId, reason: string)` and pass it through to `this.transition()`:

```typescript
async abandon(id: CommissionId, reason: string): Promise<TransitionResult> {
  return this.transition(id, "abandoned", reason);
}
```

This matches the pattern used by `cancel(id, reason)`.

### Step 2: Add `"abandoned"` to `BLOCKED_STATUSES`

**File:** `lib/types.ts:160`

Add `"abandoned"` to the `BLOCKED_STATUSES` set so `statusToGem("abandoned")` returns `"blocked"` (red gem), matching `failed` and `cancelled`. Currently it falls through to `"info"` (blue).

### Step 3: Add `abandonCommission` to orchestrator interface and implementation

**File:** `daemon/services/commission/orchestrator.ts`

Add to the `CommissionSessionForRoutes` interface (line 88):

```typescript
abandonCommission(commissionId: CommissionId, reason: string): Promise<void>;
```

Implement it in the orchestrator. Unlike `cancelCommission`, this operates on commissions NOT in `executions` (already terminal or never dispatched). No abort signal, no worktree cleanup, no session management. Just validate the commission exists, call `lifecycle.abandon()`, and trigger dependency checks.

```typescript
async function abandonCommission(
  commissionId: CommissionId,
  reason: string,
): Promise<void> {
  // Reject if commission has an active execution context
  if (executions.has(commissionId)) {
    throw new Error(
      `Cannot abandon commission "${commissionId as string}": it has an active session. Cancel it first.`,
    );
  }

  await lifecycle.abandon(commissionId, reason);

  // Abandoning a dependency may unblock others
  const projectName = lifecycle.getProjectName(commissionId);
  if (projectName) {
    await checkDependencyTransitions(projectName);
  }
}
```

Add `abandonCommission` to the returned `result` object (line 1613).

### Step 4: Daemon route

**File:** `daemon/routes/commissions.ts`

Add after the redispatch route, following the same error-handling pattern:

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
    const message = errorMessage(err);
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    if (
      message.includes("Invalid commission transition") ||
      message.includes("Cannot abandon")
    ) {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 500);
  }
});
```

Update the route comment block at the top to include the new endpoint.

### Step 5: Next.js proxy route

**New file:** `web/app/api/commissions/[commissionId]/abandon/route.ts`

Standard proxy pattern matching `redispatch/route.ts`:

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

**File:** `web/components/commission/CommissionActions.tsx`

Expand the `confirming` state type:

```typescript
const [confirming, setConfirming] = useState<
  "cancel" | "redispatch" | "abandon" | null
>(null);
```

Add `abandonReason` state and `handleAbandon` callback following the `handleCancel` pattern. The handler POSTs `{ reason: abandonReason }` to `/api/commissions/${encodedId}/abandon`.

Add visibility logic:

```typescript
const showAbandon =
  status === "pending" ||
  status === "blocked" ||
  status === "failed" ||
  status === "cancelled";
```

For `failed` and `cancelled`, Abandon appears alongside Re-dispatch. For `pending` and `blocked`, it appears alongside existing buttons.

The confirmation dialog includes a textarea for the reason. The "Yes, Abandon" button is disabled until the reason is non-empty:

```tsx
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
```

**File:** `web/components/commission/CommissionActions.module.css`

Add styles for `.abandonButton` (same muted/destructive pattern as `.cancelButton`), `.abandonReason` (textarea with parchment background, brass border, body font), and `.confirmButtons` (flex row for the buttons below the textarea).

### Step 7: Guild Master tool

**File:** `daemon/services/manager-toolbox.ts`

Add `makeAbandonCommissionHandler(deps)` factory following the `makeCancelCommissionHandler` pattern (line 434). The handler calls `deps.commissionSession.abandonCommission(cid, args.reason)`.

Register in `createManagerToolbox()` alongside existing tools:

```typescript
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

`reason` is required in the schema (no `.optional()`).

### Step 8: SSE handler verification

**File:** `web/components/commission/CommissionView.tsx`

The existing SSE handler processes `commission_status` events generically: `setStatus(data.status)`. When it receives `status: "abandoned"`, it updates local state. No changes needed. Verify this works.

## File Change Summary

| File | Change | New? |
|------|--------|------|
| `daemon/services/commission/lifecycle.ts` | Add `reason` parameter to `abandon()` | No |
| `lib/types.ts` | Add `"abandoned"` to `BLOCKED_STATUSES` | No |
| `daemon/services/commission/orchestrator.ts` | Add `abandonCommission` to interface and implementation | No |
| `daemon/routes/commissions.ts` | Add `POST /commissions/:id/abandon` route | No |
| `web/app/api/commissions/[commissionId]/abandon/route.ts` | Proxy route to daemon | Yes |
| `web/components/commission/CommissionActions.tsx` | Add abandon button, reason textarea, handler | No |
| `web/components/commission/CommissionActions.module.css` | Add abandon button and textarea styles | No |
| `daemon/services/manager-toolbox.ts` | Add `abandon_commission` tool | No |
| `web/components/commission/CommissionView.tsx` | Verify SSE handler works (likely no changes) | No |

## Files That Need No Changes

These work generically with any status string:

- `daemon/services/commission/record.ts`: `writeStatusAndTimeline()` accepts arbitrary status strings.
- `daemon/services/event-bus.ts`: The `commission_status` event carries a string status field.
- `lib/commissions.ts`: `parseActivityTimeline()` parses any event string.
- `web/components/commission/CommissionTimeline.tsx`: The `status_change` renderer shows from/to gems via `statusToGem()`. The `abandoned` status will render correctly with the red gem from step 2.
- `web/components/commission/CommissionHeader.tsx`, `CommissionList.tsx`: Use `statusToGem()` generically.

## Test Strategy

### Unit tests for lifecycle (update existing)

**File:** `tests/daemon/services/commission/lifecycle.test.ts`

The transition tests should already cover abandoned edges since they're in `TRANSITIONS`. If not, add:
- Valid: pending/blocked/failed/cancelled -> abandoned
- Invalid: dispatched/in_progress/completed -> abandoned
- Invalid: abandoned -> any status
- Verify the reason parameter is passed through to the timeline entry.

### Unit tests for orchestrator

**File:** `tests/daemon/services/commission/orchestrator.test.ts`

New describe block `"abandonCommission"`:
1. Abandons a pending commission (never dispatched)
2. Abandons a failed commission
3. Abandons a cancelled commission
4. Rejects abandon when commission has active execution context
5. Triggers dependency check after abandon

### Route tests

**File:** `tests/daemon/routes/commissions.test.ts`

New describe block `"POST /commissions/:id/abandon"`:
1. Returns 200 on success with `{ reason: "Work done elsewhere" }`
2. Returns 400 when reason is missing
3. Returns 400 on invalid JSON
4. Returns 404 when commission not found
5. Returns 409 on invalid transition
6. Returns 500 on unexpected error

### Manager toolbox tests

**File:** `tests/daemon/services/manager-toolbox.test.ts`

New describe block `"abandon_commission"`:
1. Abandons commission with reason, verify success response
2. Returns error when commission not found
3. Returns error on invalid transition

### Gem mapping tests

**File:** `tests/lib/types.test.ts`

Verify `statusToGem("abandoned")` returns `"blocked"` (red gem).

## Implementation Order

1. **Step 1** (lifecycle reason param): Foundation fix.
2. **Step 2** (gem mapping): Small, independent.
3. **Step 3** (orchestrator): Core logic connecting Layer 2 to consumers.
4. **Step 4** (daemon route): Exposes the method via HTTP.
5. **Step 5** (proxy route): Exposes the daemon route to the browser.
6. **Step 6** (UI): Consumes the proxy route.
7. **Step 7** (manager tool): Consumes the orchestrator directly.
8. **Step 8** (SSE verification): Confirm existing handlers work.

Steps 1-2 can be done together. Steps 4-5 can be done together. Steps 6 and 7 are independent of each other. Tests alongside each step.
