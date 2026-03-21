---
title: Halted commission action buttons
date: 2026-03-20
status: approved
tags: [ui, commissions, halted-state, client-component]
modules: [web/components/commission/CommissionActions, web/app/api/commissions]
related:
  - .lore/specs/commissions/commission-halted-continuation.md
  - .lore/brainstorm/halted-commission-ui.md
  - .lore/issues/halted-commission-ui-gap.md
req-prefix: HCA
---

# Spec: Halted Commission Action Buttons

## Overview

The daemon supports three recovery actions for halted commissions: continue, save, and abandon. The web UI's `CommissionActions` component already renders Cancel and Abandon buttons for halted status, but not Continue or Save. This leaves a gap: the user sees a halted commission and can only cancel or abandon it, with no way to recover the work through the browser.

This spec adds Continue and Save buttons to `CommissionActions` when the commission status is `halted`, removes the Cancel button for halted commissions (it's redundant with Abandon in that state), and defines the confirmation dialogs, API proxy routes, and post-action behavior for each.

No daemon changes are required. The daemon endpoints already exist and are tested:

- `POST /commission/run/continue` (takes `commissionId`)
- `POST /commission/run/save` (takes `commissionId`, optional `reason`)

## Entry Points

One surface: the commission detail page (`/projects/[name]/commissions/[id]`), rendered by `CommissionView` which includes `CommissionActions`. The buttons appear in the action bar alongside existing status-dependent buttons.

## Requirements

### Continue Button

- REQ-HCA-1: `CommissionActions` renders a Continue button when `status === "halted"`. The button label is "Continue Commission". The button is disabled when the daemon is offline (`!isOnline`) or when another action is loading.

- REQ-HCA-2: Clicking Continue opens an inline confirmation dialog (same pattern as the existing Cancel confirmation at `CommissionActions.tsx:162-194`). The confirmation text is: "Resume this commission with a fresh turn budget?" with "Yes, Continue" and "No" buttons.

  The confirmation does not include a turn budget adjustment field. The daemon's continue endpoint does not accept budget overrides, and adding that capability is out of scope.

- REQ-HCA-3: On confirmation, the handler calls `POST /api/commissions/[commissionId]/continue`. On success, it calls `onStatusChange("in_progress")`. On failure, it sets the error message from the response body.

  The daemon may return HTTP 429 if at capacity (REQ-COM-47). The error message from the 429 response ("At capacity, cannot continue commission") should display as-is. The commission remains halted; the user can retry when capacity frees up.

- REQ-HCA-4: The Continue button uses the same visual treatment as the Dispatch button (brass tones from `.dispatchButton` in `CommissionActions.module.css`). Continue is the primary recovery action for halted commissions and should be visually prominent. A new CSS class (`.continueButton`) follows the same color values as `.dispatchButton`.

### Save Button

- REQ-HCA-5: `CommissionActions` renders a Save button when `status === "halted"`. The button label is "Save Partial Work". The button is disabled when the daemon is offline or when another action is loading.

- REQ-HCA-6: Clicking Save opens an inline confirmation dialog with a textarea for an optional reason. The confirmation text is: "Merge partial work from this commission?" The textarea placeholder is: "Why is this partial work worth keeping? (optional)". The textarea follows the same styling as the existing abandon reason textarea (`.abandonReason` in `CommissionActions.module.css`).

  The reason field is optional. The "Yes, Save" button is enabled regardless of whether the user types a reason. This differs from Abandon, where a reason is required (the abandon handler checks `!abandonReason.trim()`). The daemon's save endpoint accepts `reason` as optional and generates a default message ("Partial work saved") when omitted.

- REQ-HCA-7: On confirmation, the handler calls `POST /api/commissions/[commissionId]/save`. If the reason textarea is non-empty, the body includes `{ reason }`. If the textarea is empty, the body is `{}` (omit the `reason` key entirely so the daemon generates its default message per REQ-COM-44). On success, it calls `onStatusChange("completed")`. On failure, it sets the error message.

  Save can fail if the squash-merge conflicts (daemon returns 409 or 500 depending on the conflict type). The error message should display as-is. The commission remains halted.

- REQ-HCA-8: The Save button uses a new CSS class (`.saveButton`) styled as a secondary positive action. Amber/brass tones at lower opacity than the Continue button, similar to the relationship between `.dispatchButton` and `.redispatchButton`. Save is a recovery action but less common than Continue, so it should be visually present without competing for attention.

### Cancel Button Removal for Halted Status

- REQ-HCA-9: The Cancel button is hidden when `status === "halted"`. Currently, `showCancel` is true for halted commissions (`CommissionActions.tsx:129`). This changes to exclude `halted` from that condition.

  Rationale: For dispatched or in-progress commissions, Cancel stops a running session and transitions to `cancelled`. For halted commissions, there is no running session to stop. Cancel would transition to `cancelled` while preserving the branch, which is functionally identical to what Abandon does (transitions to `abandoned`, preserves the branch) except Abandon records a reason. Offering both creates a false choice. The halted action set becomes: Continue, Save, Abandon.

### Confirming State

- REQ-HCA-10: The `confirming` state type in `CommissionActions` expands to include `"continue"` and `"save"` as possible values. The existing `confirming` state (`"cancel" | "redispatch" | "abandon" | null`) becomes `"cancel" | "redispatch" | "abandon" | "continue" | "save" | null`.

  Only one confirmation dialog is visible at a time. Clicking any action button while another confirmation is open replaces the previous confirmation (this is the existing behavior: setting `confirming` to a new value implicitly closes the previous one).

- REQ-HCA-11: A `saveReason` state (`useState<string>("")`) tracks the optional reason for the Save confirmation dialog. It resets to empty when the Save confirmation is dismissed (same pattern as `abandonReason` resetting on dismiss at `CommissionActions.tsx:259`).

### API Proxy Routes

- REQ-HCA-12: A new Next.js API route at `web/app/api/commissions/[commissionId]/continue/route.ts` proxies to the daemon's `POST /commission/run/continue` endpoint. The route follows the same pattern as the existing dispatch proxy (`web/app/api/commissions/[commissionId]/dispatch/route.ts`): extract `commissionId` from params, call `daemonFetch("/commission/run/continue", ...)` with `{ commissionId }` in the body, forward the response status and body.

- REQ-HCA-13: A new Next.js API route at `web/app/api/commissions/[commissionId]/save/route.ts` proxies to the daemon's `POST /commission/run/save` endpoint. The route extracts `commissionId` from params and parses the request body for an optional `reason`. It calls `daemonFetch("/commission/run/save", ...)` with `{ commissionId, reason }` and forwards the response. The structure follows the abandon proxy (`web/app/api/commissions/[commissionId]/abandon/route.ts`), but note: the daemon's save endpoint treats `reason` as optional (unlike abandon, which returns 400 if `reason` is missing). The proxy should forward whatever the client sends without additional validation.

### Post-Action Behavior

- REQ-HCA-14: When Continue succeeds, `onStatusChange("in_progress")` calls `setStatus("in_progress")` and `router.refresh()` in the parent `CommissionView`. The React re-render cycle recomputes `isLive` (`CommissionView.tsx:76`) to `true`, which triggers the `useEffect` that manages the SSE subscription. The effect body creates a new `EventSource`, and the commission detail page begins receiving live progress and status events again.

  No changes to `CommissionView` are required. The `onStatusChange` handler, `isLive` derivation, and SSE `useEffect` already compose correctly for the `halted -> in_progress` transition.

- REQ-HCA-15: When Save succeeds, `onStatusChange("completed")` triggers `router.refresh()`. The `isLive` check evaluates false for `completed`, so no SSE subscription is opened. The page displays the final state with the completion timeline entry (which includes `partial: true` per REQ-COM-44 of the halted continuation spec).

### Button Order

- REQ-HCA-16: For halted commissions, the buttons render in this order: Continue, Save, Abandon. Continue is the most common recovery action (the brainstorm observes that "I know what I want to do" is the more common scenario for users who reach the detail page). Save is secondary. Abandon is the destructive fallback.

  This means the component renders: Continue at the top, then Save, then Abandon at the bottom. The existing layout (`flex-direction: column` in `.container`) stacks them vertically.

## Success Criteria

- [ ] Continue button appears for halted commissions, dispatches to daemon via `/api/commissions/[id]/continue`, transitions to `in_progress` on success
- [ ] Save button appears for halted commissions with optional reason textarea, dispatches via `/api/commissions/[id]/save`, transitions to `completed` on success
- [ ] Cancel button is hidden for halted commissions
- [ ] Both buttons are disabled when daemon is offline
- [ ] Capacity error (429) from Continue displays an inline error message without changing commission status
- [ ] SSE subscription reactivates after successful Continue
- [ ] Two new Next.js API proxy routes exist and follow the established pattern
- [ ] Confirmation dialogs match existing visual patterns (inline confirm row, not modal)

## AI Validation

**Defaults:**
- Unit tests with mocked fetch calls and component rendering
- Code review by fresh-context sub-agent

**Custom:**
- Render test: mount `CommissionActions` with `status="halted"`, verify Continue, Save, and Abandon buttons are present, Cancel button is absent.
- Continue confirmation test: click Continue, verify confirmation dialog appears with correct text. Click "Yes, Continue", verify fetch to `/api/commissions/.../continue` with POST method. Verify `onStatusChange` called with `"in_progress"`.
- Continue capacity error test: mock fetch to return 429, verify error message displayed, verify `onStatusChange` not called.
- Save confirmation test: click Save, verify confirmation dialog with textarea appears. Submit without reason, verify fetch sends `{}` or omits reason. Submit with reason, verify fetch includes `{ reason: "..." }`. Verify `onStatusChange` called with `"completed"`.
- Save reason optional test: verify "Yes, Save" button is enabled when reason textarea is empty (unlike Abandon which requires a reason).
- Save failure test: mock fetch to return 409 (merge conflict), verify error message displayed and `onStatusChange` not called.
- Save reason reset test: open Save confirmation, type a reason, dismiss with No, reopen Save confirmation, verify reason textarea is empty.
- Mutual exclusion test: open Continue confirmation, then click Save, verify Continue confirmation is replaced by Save confirmation.
- Non-halted status test: mount with `status="in_progress"`, verify Continue and Save buttons are absent. Mount with `status="failed"`, same check.
- API route test: verify `/api/commissions/[id]/continue/route.ts` proxies correctly to daemon. Same for save route.

## Constraints

- No daemon changes. The endpoints exist and are tested. This spec adds UI and proxy routes only.
- No changes to `CommissionView`. The existing `isLive` condition and `onStatusChange` callback handle all transitions this spec introduces.
- The confirmation dialogs are inline (within the action bar), not modal popups. This matches the existing pattern for Cancel, Redispatch, and Abandon confirmations.
- The Save reason textarea uses the same CSS class as the Abandon reason textarea (`.abandonReason`). If a shared class name feels wrong, rename it to something generic (`.actionReason`), but that's a cosmetic decision for the implementer.

## Out of Scope

- **Turn budget adjustment on Continue.** The daemon's continue endpoint doesn't accept it. If the user wants a different budget, they update `resource_overrides` on the commission artifact before continuing (REQ-COM-40a).
- **Halted diagnostic callout** (turns used, last progress, elapsed time). Surfacing this information on the commission detail page is a separate concern that makes Continue/Save decisions more informed, but it's not gated by the buttons existing. The brainstorm identifies this as the next piece to spec.
- **Recommendation engine, batch operations, CLI commands.** The brainstorm explores all three. None are prerequisites for the buttons.
- **Any daemon changes.** This is a web-only spec.

## Context

- [Spec: Commission Halted State and Continuation](../commissions/commission-halted-continuation.md): Defines the halted lifecycle, continue/save semantics, and daemon endpoints this UI consumes.
- [Brainstorm: Halted Commission UI](../../brainstorm/halted-commission-ui.md): Explored six directions. This spec implements the "richer version" minus the diagnostic callout (buttons + cancel removal + confirmation dialogs).
- [Issue: Halted commission UI gap](../../issues/halted-commission-ui-gap.md): The tracking issue.
