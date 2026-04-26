---
title: Halted commission action buttons
date: 2026-03-20
status: executed
tags: [ui, commissions, halted, client-component, plan]
modules: [commission-actions, api-proxy]
related:
  - .lore/specs/ui/halted-commission-actions.md
  - .lore/_abandoned/specs/commission-halted-continuation.md
  - .lore/brainstorm/halted-commission-ui.md
---

# Plan: Halted Commission Action Buttons

## Spec Reference

**Spec**: `.lore/specs/ui/halted-commission-actions.md`

Requirements addressed:

- REQ-HCA-1: Continue button renders for halted status, disabled when offline/loading &rarr; Step 2
- REQ-HCA-2: Continue confirmation dialog with correct text &rarr; Step 2
- REQ-HCA-3: Continue handler calls proxy, transitions to in_progress &rarr; Steps 1, 2
- REQ-HCA-4: Continue button uses brass tones (`.continueButton`) &rarr; Step 3
- REQ-HCA-5: Save button renders for halted status, disabled when offline/loading &rarr; Step 2
- REQ-HCA-6: Save confirmation dialog with optional reason textarea &rarr; Step 2
- REQ-HCA-7: Save handler calls proxy, omits reason when empty, transitions to completed &rarr; Steps 1, 2
- REQ-HCA-8: Save button uses secondary amber tones (`.saveButton`) &rarr; Step 3
- REQ-HCA-9: Cancel button hidden for halted status &rarr; Step 2
- REQ-HCA-10: Confirming state type expands with "continue" and "save" &rarr; Step 2
- REQ-HCA-11: `saveReason` state tracks optional reason, resets on dismiss &rarr; Step 2
- REQ-HCA-12: Continue proxy route at `/api/commissions/[commissionId]/continue` &rarr; Step 1
- REQ-HCA-13: Save proxy route at `/api/commissions/[commissionId]/save` &rarr; Step 1
- REQ-HCA-14: SSE reactivates after successful Continue (no changes needed) &rarr; Step 4 validates
- REQ-HCA-15: Save transitions to completed, no SSE (no changes needed) &rarr; Step 4 validates
- REQ-HCA-16: Button order: Continue, Save, Abandon &rarr; Step 2

## Codebase Context

**`CommissionActions.tsx`** (286 lines): Client component with `status`, `commissionId`, `onStatusChange` props. Status-conditional rendering via boolean flags (`showDispatch`, `showCancel`, etc.) at lines 127-136. The `confirming` state (line 32-34) is a union of `"cancel" | "redispatch" | "abandon" | null`. Each action follows the same pattern: a boolean flag controls visibility, clicking the button sets `confirming`, the confirmation block renders inline with Yes/No buttons, and the handler calls a proxy route then invokes `onStatusChange`.

**`showCancel` on line 129** includes `status === "halted"`. This is the line that changes for REQ-HCA-9.

**Proxy route patterns**: Two distinct shapes exist.
- `dispatch/route.ts` (no request body): Extracts `commissionId` from params, calls `daemonFetch` with `{ commissionId }`, forwards the response. The Continue route follows this pattern.
- `abandon/route.ts` (with request body): Parses `request.json()` for `{ reason }`, calls `daemonFetch` with `{ commissionId, reason }`. The Save route follows this pattern, but `reason` is optional (the daemon generates a default when omitted, per REQ-COM-44).

**CSS module** (`CommissionActions.module.css`, 180 lines): Shared button base selector at lines 9-14 lists all button classes. New `.continueButton` and `.saveButton` classes need to be added to this selector. The `.dispatchButton` color values (lines 36-44) provide the template for `.continueButton`. The `.redispatchButton` values (lines 61-69) provide the template for `.saveButton` (lower opacity brass, secondary treatment).

**Test pattern**: The existing test file `commission-queued.test.tsx` uses type-contract testing for client components (no React render context in bun test). Tests verify boolean logic and handler behavior by extracting the conditions from the component and testing them in isolation. The spec's AI Validation section prescribes 10 test categories. Type-contract tests cover the status visibility logic and handler call shapes. Fetch mocking isn't available (no `mock.module()`), so handler tests verify the logic shape rather than end-to-end fetch behavior.

**`lib/daemon-client.ts`**: Provides `daemonFetch` and `isDaemonError` used by all proxy routes.

**No `CommissionView` changes needed**: The `isLive` derivation and `onStatusChange` callback in `CommissionView` already handle `halted -> in_progress` and `halted -> completed` transitions. REQ-HCA-14 and REQ-HCA-15 are satisfied by existing code.

## Implementation Steps

### Step 1: Add API proxy routes

**Files**:
- `apps/web/app/api/commissions/[commissionId]/continue/route.ts` (new)
- `apps/web/app/api/commissions/[commissionId]/save/route.ts` (new)

**Addresses**: REQ-HCA-12, REQ-HCA-13

**Continue route**: Copy the dispatch route structure. The handler extracts `commissionId` from `await params`, calls `daemonFetch("/commission/run/continue", { method: "POST", body: JSON.stringify({ commissionId }) })`, checks `isDaemonError`, and forwards the response with status. No request body parsing needed (the daemon's continue endpoint only takes `commissionId`).

**Save route**: Copy the abandon route structure. The handler extracts `commissionId` from `await params`, parses `request.json()` for an optional `reason` field. Unlike the abandon route, do not validate that `reason` is present. The daemon accepts `reason` as optional. Call `daemonFetch("/commission/run/save", { method: "POST", body: JSON.stringify({ commissionId, reason }) })`. If `reason` is undefined, `JSON.stringify` omits it from the body, which is correct behavior (the daemon generates "Partial work saved" as default).

Note on the save route body: The spec says "if the textarea is empty, the body is `{}` (omit the `reason` key)." The proxy should forward whatever the client sends. If the client sends `{}`, `reason` is `undefined` and `JSON.stringify({ commissionId, reason: undefined })` produces `{"commissionId":"..."}`, which is correct.

### Step 2: Modify `CommissionActions` component

**Files**: `apps/web/components/commission/CommissionActions.tsx`

**Addresses**: REQ-HCA-1, REQ-HCA-2, REQ-HCA-3, REQ-HCA-5, REQ-HCA-6, REQ-HCA-7, REQ-HCA-9, REQ-HCA-10, REQ-HCA-11, REQ-HCA-16

Seven changes to the component, listed in order:

**2a. Expand confirming state type** (line 32-34). Change the union to include `"continue"` and `"save"`:
```ts
const [confirming, setConfirming] = useState<
  "cancel" | "redispatch" | "abandon" | "continue" | "save" | null
>(null);
```

**2b. Add `saveReason` state**. After the `abandonReason` state (line 35), add:
```ts
const [saveReason, setSaveReason] = useState("");
```

**2c. Add `handleContinue` callback**. Pattern matches `handleDispatch` (no request body). On success, call `onStatusChange?.("in_progress")`. On failure, set error from response body. The 429 response ("At capacity") displays as-is through the same error path.

```ts
const handleContinue = useCallback(async () => {
  setLoading(true);
  setError(undefined);
  setConfirming(null);
  try {
    const res = await fetch(`/api/commissions/${encodedId}/continue`, {
      method: "POST",
    });
    if (res.ok) {
      onStatusChange?.("in_progress");
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Continue failed");
    }
  } catch {
    setError("Network error");
  } finally {
    setLoading(false);
  }
}, [encodedId, onStatusChange]);
```

**2d. Add `handleSave` callback**. Pattern matches `handleAbandon` (with request body). Body includes `{ reason: saveReason }` only when `saveReason.trim()` is non-empty; otherwise sends `{}`. On success, call `onStatusChange?.("completed")` and reset `saveReason`.

```ts
const handleSave = useCallback(async () => {
  setLoading(true);
  setError(undefined);
  setConfirming(null);
  try {
    const body: Record<string, string> = {};
    if (saveReason.trim()) {
      body.reason = saveReason;
    }
    const res = await fetch(`/api/commissions/${encodedId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onStatusChange?.("completed");
      setSaveReason("");
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Save failed");
    }
  } catch {
    setError("Network error");
  } finally {
    setLoading(false);
  }
}, [encodedId, onStatusChange, saveReason]);
```

**2e. Add visibility flags and remove halted from showCancel**. After the existing flags (lines 127-136):

```ts
const showContinue = status === "halted";
const showSave = status === "halted";
```

Change `showCancel` (line 129) to remove `"halted"`:
```ts
const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
```

**2f. Add Continue and Save JSX blocks**. The spec requires button order: Continue, Save, Abandon for halted commissions (REQ-HCA-16). Insert the Continue block before the Save block, and both before the existing Abandon block.

Place the Continue block after the `showQueued` block and before the `showCancel` block. Place the Save block after the Continue block and before the `showCancel` block.

Note: the button order (Continue, Save, Abandon) for halted commissions depends on Step 2e removing `halted` from `showCancel`. If both changes are not applied together, Cancel would still appear for halted status and the order would be wrong.

Continue confirmation JSX (follows the cancel confirmation pattern, no textarea):

```tsx
{showContinue && (
  <>
    {confirming === "continue" ? (
      <div className={styles.confirmRow}>
        <span className={styles.confirmText}>
          Resume this commission with a fresh turn budget?
        </span>
        <button
          className={styles.confirmYes}
          onClick={() => void handleContinue()}
          disabled={loading || !isOnline}
          title={offlineTitle}
          type="button"
        >
          {loading ? "Continuing..." : "Yes, Continue"}
        </button>
        <button
          className={styles.confirmNo}
          onClick={() => setConfirming(null)}
          disabled={loading}
          type="button"
        >
          No
        </button>
      </div>
    ) : (
      <button
        className={styles.continueButton}
        onClick={() => setConfirming("continue")}
        disabled={loading || !isOnline}
        title={offlineTitle}
        type="button"
      >
        Continue Commission
      </button>
    )}
  </>
)}
```

Save confirmation JSX (follows the abandon pattern with textarea, but "Yes, Save" is enabled regardless of textarea content):

```tsx
{showSave && (
  <>
    {confirming === "save" ? (
      <div className={styles.confirmRow}>
        <span className={styles.confirmText}>
          Merge partial work from this commission?
        </span>
        <textarea
          className={styles.actionReason}
          placeholder="Why is this partial work worth keeping? (optional)"
          value={saveReason}
          onChange={(e) => setSaveReason(e.target.value)}
          rows={2}
        />
        <div className={styles.confirmButtons}>
          <button
            className={styles.confirmYes}
            onClick={() => void handleSave()}
            disabled={loading || !isOnline}
            title={offlineTitle}
            type="button"
          >
            {loading ? "Saving..." : "Yes, Save"}
          </button>
          <button
            className={styles.confirmNo}
            onClick={() => {
              setConfirming(null);
              setSaveReason("");
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
        className={styles.saveButton}
        onClick={() => setConfirming("save")}
        disabled={loading || !isOnline}
        title={offlineTitle}
        type="button"
      >
        Save Partial Work
      </button>
    )}
  </>
)}
```

Key differences from Abandon's confirmation: the "Yes, Save" button has `disabled={loading || !isOnline}` without the `!saveReason.trim()` check that Abandon uses (REQ-HCA-6). The textarea class is `.actionReason` (see Step 3e).

**2g. Update component docstring** (lines 13-23). Add halted to the status list:
```
 * - halted: Continue, Save (with reason textarea), Abandon (with reason textarea)
```

### Step 3: Add CSS classes

**Files**: `apps/web/components/commission/CommissionActions.module.css`

**Addresses**: REQ-HCA-4, REQ-HCA-8

**3a. Add `.continueButton` and `.saveButton` to the shared base selector** (lines 9-14). Add them to the comma-separated list so they inherit padding, border-radius, font, cursor, transition.

**3b. Add `.continueButton:disabled` and `.saveButton:disabled` to the disabled selector** (lines 24-31).

**3c. Add `.continueButton` styles**. Same color values as `.dispatchButton` (lines 36-44):
```css
.continueButton {
  background-color: rgba(184, 134, 11, 0.2);
  border: 1px solid var(--color-brass);
  color: var(--color-brass);
}

.continueButton:hover:not(:disabled) {
  background-color: rgba(184, 134, 11, 0.35);
}
```

**3d. Add `.saveButton` styles**. Lower opacity brass, secondary treatment like `.redispatchButton` (lines 61-69):
```css
.saveButton {
  background-color: rgba(184, 134, 11, 0.15);
  border: 1px solid rgba(184, 134, 11, 0.4);
  color: var(--color-brass);
}

.saveButton:hover:not(:disabled) {
  background-color: rgba(184, 134, 11, 0.25);
}
```

**3e. Rename `.abandonReason` to `.actionReason`** (optional, per spec's Constraints section). The spec leaves this to the implementer. Recommendation: rename it. Both Save and Abandon use the same textarea styling, and `.abandonReason` on a Save textarea reads wrong. Update both the CSS class and all JSX references (the abandon textarea at line 240 and the new save textarea).

### Step 4: Add tests

**Files**: `apps/web/tests/components/commission-actions.test.tsx` (new)

**Addresses**: All REQs (validation coverage)

Follow the type-contract pattern from `commission-queued.test.tsx`. The test file verifies the boolean logic, handler call shapes, and state transitions without mounting client components in a render context.

Test categories from the spec's AI Validation section:

**4a. Render test (halted status visibility)**:
- `showContinue` is true when `status === "halted"`
- `showSave` is true when `status === "halted"`
- `showCancel` is false when `status === "halted"` (REQ-HCA-9)
- `showAbandon` is true when `status === "halted"` (existing behavior, preserved)

**4b. Non-halted status test**:
- `showContinue` is false for `"in_progress"`, `"failed"`, `"pending"`, `"completed"`
- `showSave` is false for the same statuses
- `showCancel` still true for `"dispatched"`, `"in_progress"`, `"queued"` (no regression)

**4c. Continue handler shape**:
- Verify the handler calls `/api/commissions/${encodedId}/continue` with POST method
- On success (res.ok), calls `onStatusChange("in_progress")`
- On failure, sets error from response body
- Construct the expected fetch arguments and verify structure

**4d. Continue capacity error (429)**:
- Mock response shape: `{ ok: false, status: 429, json: () => ({ error: "At capacity..." }) }`
- Verify error is set, `onStatusChange` is not called

**4e. Save handler shape**:
- When `saveReason` is empty: body is `{}` (no reason key)
- When `saveReason` is non-empty: body includes `{ reason: "..." }`
- On success, calls `onStatusChange("completed")`
- On failure, sets error

**4f. Save reason optional**:
- Verify the "Yes, Save" button's disabled condition: `loading || !isOnline` (no `!saveReason.trim()` check)
- Contrast with Abandon's disabled condition: `loading || !isOnline || !abandonReason.trim()`

**4g. Save failure (409)**:
- Mock response shape: `{ ok: false, status: 409, json: () => ({ error: "Merge conflict" }) }`
- Verify error is set, `onStatusChange` is not called

**4h. Save reason reset**:
- Verify that dismissing Save confirmation (clicking "No") resets `saveReason` to empty
- Model as: after `setConfirming(null)`, `setSaveReason("")` is called

**4i. Mutual exclusion**:
- Setting `confirming` to `"save"` implicitly replaces `"continue"` (and vice versa)
- This is inherent in `useState` behavior; test that only one value is active

**4j. Confirming state type**:
- Verify the type union accepts all six values: `"cancel"`, `"redispatch"`, `"abandon"`, `"continue"`, `"save"`, `null`

**4k. API route tests** (separate describe block):
- Verify the continue route module exports a `POST` function
- Verify the save route module exports a `POST` function

### Step 5: Validate against spec

Launch a sub-agent that reads the spec at `.lore/specs/ui/halted-commission-actions.md`, reviews the implementation across all modified files, and flags any requirements not met. The agent checks:

- All 16 REQs are addressed
- No CommissionView changes were made (constraint)
- Confirmation dialogs are inline, not modal (constraint)
- Button order is Continue, Save, Abandon for halted (REQ-HCA-16)
- Cancel is absent for halted (REQ-HCA-9)
- Save reason is optional (REQ-HCA-6, REQ-HCA-7)
- Error messages display as-is from daemon responses (REQ-HCA-3, REQ-HCA-7)

## Delegation Guide

**Dalton implements all steps.** This is a single-component feature with two small proxy routes. No step requires specialized expertise beyond frontend implementation.

**Thorne reviews after Step 4.** One review commission after all implementation and tests are complete. Review scope:

- Spec compliance: every REQ addressed, no drift
- Pattern consistency: new handlers follow existing handler shapes exactly
- CSS: new classes added to shared base selector, no orphaned styles
- Test coverage: all 10 test categories from the AI Validation section are present
- No CommissionView changes (constraint violation would be a defect)

A single post-completion review is sufficient here. The feature is self-contained (one component, two routes, one CSS file, one test file) and the risk concentration is low. Per the project's retro lessons, post-completion review catches more than per-phase reviews for medium features.

## Open Questions

None. The spec is detailed enough to implement directly. The one discretionary decision (rename `.abandonReason` to `.actionReason`) is called out in Step 3e with a recommendation.
