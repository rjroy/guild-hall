---
title: Triggered Commission Creation UX
date: 2026-03-21
status: approved
tags: [ui, commissions, triggers, form, client-component]
modules: [web/components/commission/CommissionForm]
related:
  - .lore/brainstorm/triggered-commission-creation-ux.md
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/specs/ui/halted-commission-actions.md
req-prefix: TCF
---

# Spec: Triggered Commission Creation UX

## Overview

The commission creation form (`CommissionForm.tsx`) supports two commission types: One-shot and Schedule. The daemon already handles `type: "triggered"` in the creation route, including validation of `match.type` against `SYSTEM_EVENT_TYPES`. The trigger detail view components (`TriggerInfo`, `TriggerActions`) already exist. What's missing is the ability to create a triggered commission from the web UI.

This spec adds "Trigger" as a third option on the type selector, renders trigger-specific form fields when selected, and wires the payload through the existing API proxy. No daemon or API route changes are required. The web API proxy at `web/app/api/commissions/route.ts` already passes the full request body through to the daemon via `JSON.stringify(body)`.

## Entry Points

One surface: the commission creation form rendered by `CreateCommissionButton` on the commissions tab of the project view (`/projects/[name]`). The form is `CommissionForm.tsx` in `web/components/commission/`.

## Requirements

### Type Selector

- REQ-TCF-1: "Trigger" is added as a third option to the commission type radio toggle. The `commissionType` state type expands from `"one-shot" | "scheduled"` to `"one-shot" | "scheduled" | "triggered"`. The toggle renders three segments: "One-shot", "Schedule", "Trigger". The new option uses the same visual treatment as the existing two (`.typeOption` / `.typeOptionActive` CSS classes).

### Trigger Section

- REQ-TCF-2: When `commissionType === "triggered"`, a trigger-specific section renders between the type toggle and the shared fields (Title, Worker, Prompt, Dependencies). The section uses the same container style as `.scheduleFields`: a bordered, lightly-tinted box that visually groups the trigger-specific inputs.

- REQ-TCF-3: The trigger section contains four field groups in this order:

  1. **Event type** (required): a `<select>` dropdown populated from `SYSTEM_EVENT_TYPES`. The list is hardcoded in the component from `lib/types.ts`. The dropdown includes a placeholder option ("Select an event type...") with empty value. All 11 event types are listed: `commission_status`, `commission_progress`, `commission_result`, `commission_artifact`, `commission_manager_note`, `commission_queued`, `commission_dequeued`, `meeting_started`, `meeting_ended`, `schedule_spawned`, `toolbox_replicate`.

  2. **Approval** (radio buttons): "Confirm before dispatch" (default, value `"confirm"`) and "Auto-dispatch" (value `"auto"`). Two radio buttons using standard HTML radio inputs, not the segmented control style used for the type toggle. The distinction matters: the type toggle is a mode selector for the form, while approval is a configuration field within it.

  3. **Project filter** (optional): a text input. Label: "Project filter (optional)". Hint below the input: "Only respond to events from this project. Leave blank for any." Maps to `match.projectName`.

  4. **Field patterns** (optional): a dynamic key-value input. Each row has a Key text input, a Pattern text input, and a remove button. An "Add pattern" button appends a new empty row. The section starts with zero rows. Maps to `match.fields` as `Record<string, string>`.

### Field Pattern Rows

- REQ-TCF-4: Each field pattern row consists of:
  - A Key text input (placeholder: "field name")
  - A Pattern text input (placeholder: "glob pattern")
  - A remove button (text or icon, consistent with existing UI patterns)

  Rows are stored as an array of `{ key: string; value: string }` objects in component state. On submit, rows with both key and value non-empty are collected into the `match.fields` object. Rows where either key or value is empty are silently dropped.

- REQ-TCF-5: Below the field pattern rows, a contextual hint shows available field keys for the selected event type. When no event type is selected, the hint reads: "Select an event type to see available field keys." When an event type is selected, the hint lists keys relevant to that event type and appends glob syntax guidance.

  The event-type-to-field mapping is a static `Record<string, string[]>` in the component:

  | Event Type | Available Keys |
  |------------|---------------|
  | `commission_status` | `commissionId`, `status`, `oldStatus`, `projectName`, `reason` |
  | `commission_result` | `commissionId`, `summary`, `artifacts` |
  | `commission_progress` | `commissionId`, `summary` |
  | `commission_artifact` | `commissionId`, `artifactPath` |
  | `commission_manager_note` | `commissionId`, `content` |
  | `commission_queued` | `commissionId`, `reason` |
  | `commission_dequeued` | `commissionId`, `reason` |
  | `meeting_started` | `meetingId`, `worker` |
  | `meeting_ended` | `meetingId` |
  | `schedule_spawned` | `scheduleId`, `spawnedId`, `projectName`, `runNumber` |
  | `toolbox_replicate` | `action`, `tool`, `model`, `files`, `cost`, `projectName`, `contextId` |

  This mapping is derived from `SystemEvent` variants in `daemon/lib/event-bus.ts`. It is a static snapshot. If `SystemEvent` gains new variants or fields, this map must be updated manually. A sync test is not required for v1 since the event type list itself is already tested for consistency between `SystemEvent` and `SYSTEM_EVENT_TYPES`.

  The glob syntax hint appends: "Supports glob patterns: `*`, `?`, `{a,b}`, `!pattern`"

### Template Variable Hints

- REQ-TCF-6: When `commissionType === "triggered"`, the Title and Prompt fields show a contextual hint below them listing available template variables. The hint updates based on the selected event type.

  When no event type is selected: "Template variables: select an event type to see available variables."

  When an event type is selected, the hint lists variables as inline code tokens: e.g., `` `{{commissionId}}` `{{status}}` `{{oldStatus}}` `{{projectName}}` `{{reason}}` `` for `commission_status`.

  The variable names are identical to the field keys from REQ-TCF-5. They're the same data used in two contexts: field key hints help you write match rules, template variable hints help you write prompts and titles.

  The hint is not shown for One-shot or Schedule types.

### Max Chain Depth

- REQ-TCF-7: A "Max chain depth" number input is added to the Resource Overrides expander. It is rendered only when `commissionType === "triggered"`. The input has `min="1"`, placeholder "3" (reflecting the default), and maps to the `maxDepth` field in the submission payload.

  Placing it in Resource Overrides rather than the trigger section keeps the trigger section focused on the core match/approval configuration. Max depth is conceptually a resource constraint (how deep should automation go before human review is required), and the Resource Overrides section already holds similar safety knobs (max turns, max budget).

### Match Summary

- REQ-TCF-8: When `commissionType === "triggered"` and at least the event type is selected, a human-readable summary line renders above the button row. The summary is generated from form state with no backend call.

  Format examples:
  - Event type only: "This trigger will fire on any `commission_status` event."
  - With project filter: "This trigger will fire on `commission_status` events from project `guild-hall`."
  - With field patterns: "This trigger will fire on `commission_status` events where `status` matches `completed`."
  - With project filter and field patterns: "This trigger will fire on `commission_status` events from project `guild-hall` where `status` matches `completed` and `commissionId` matches `commission-Dalton-*`."

  The summary uses the `.fieldHint` CSS class (small, muted, monospace font) for the code elements and regular body text for the connecting words.

  If no event type is selected, the summary is not shown.

### Submit Button

- REQ-TCF-9: The submit button label changes based on commission type:
  - `"one-shot"`: "Create Commission" (existing)
  - `"scheduled"`: "Create Schedule" (existing)
  - `"triggered"`: "Create Trigger"

  During submission: "Creating..." (existing behavior, unchanged).

### Validation and canSubmit

- REQ-TCF-10: The `canSubmit` condition extends to require `matchType` (the selected event type) when `commissionType === "triggered"`. The full condition becomes:

  ```
  title.trim().length > 0
  && workerName.length > 0
  && prompt.trim().length > 0
  && (commissionType === "one-shot"
      || (commissionType === "scheduled" && cron.trim().length > 0)
      || (commissionType === "triggered" && matchType.length > 0))
  && !submitting
  && isOnline
  ```

  Field patterns and project filter are optional and do not affect `canSubmit`.

### Submission Payload

- REQ-TCF-11: When `commissionType === "triggered"`, the `handleSubmit` function builds the payload with these additional fields:

  ```typescript
  payload.type = "triggered";
  payload.match = {
    type: matchType,
    ...(projectFilter.trim() && { projectName: projectFilter.trim() }),
    ...(fieldPatternsAsRecord && { fields: fieldPatternsAsRecord }),
  };
  if (approval !== "confirm") {
    payload.approval = approval;
  }
  if (maxDepth.trim()) {
    const parsed = parseInt(maxDepth, 10);
    if (!isNaN(parsed) && parsed > 0) {
      payload.maxDepth = parsed;
    }
  }
  ```

  The `approval` field is omitted when it equals `"confirm"` because that's the daemon default (REQ-TRIG-13). Including it would be harmless but unnecessary.

  `fieldPatternsAsRecord` is built from the field pattern rows: filter out rows where key or value is empty, then reduce to `Record<string, string>`. If the result is an empty object, `fields` is omitted from `match`.

### Component State

- REQ-TCF-12: The following state variables are added to `CommissionForm`:

  | Variable | Type | Initial Value | Purpose |
  |----------|------|---------------|---------|
  | `matchType` | `string` | `""` | Selected event type for trigger match |
  | `approval` | `"confirm" \| "auto"` | `"confirm"` | Approval mode |
  | `projectFilter` | `string` | `""` | Optional project name filter |
  | `fieldPatterns` | `{ key: string; value: string }[]` | `[]` | Dynamic field pattern rows |
  | `maxDepth` | `string` | `""` | Max chain depth (string for input binding, parsed on submit) |

  These are only used when `commissionType === "triggered"`. They persist across type toggle switches within the same form session (switching to One-shot and back to Trigger preserves the trigger fields). This matches how Schedule fields (cron, repeat) persist when toggling away and back.

### CSS

- REQ-TCF-13: A `.triggerFields` class is added to `CommissionForm.module.css` with the same styling as `.scheduleFields`: bordered container with light tint to visually group the trigger section.

- REQ-TCF-14: A `.fieldPatternRow` class styles each key-value row as a horizontal flex layout. A `.fieldPatternInputs` class holds the two text inputs side by side. A `.removeButton` class styles the remove button. An `.addPatternButton` class styles the "Add pattern" button as a subtle text button (similar to `.overridesToggle` but smaller).

- REQ-TCF-15: A `.templateVarHint` class styles the template variable hints below Title and Prompt. Uses `.fieldHint` base styling (small, muted) with inline `<code>` elements for variable names. Code elements use `var(--font-code)` and a slightly brighter color than the surrounding hint text for readability.

- REQ-TCF-16: A `.matchSummary` class styles the match summary line. Same base as `.fieldHint` with slightly more vertical padding to set it apart from the button row.

## Component Structure

The trigger section does not warrant a separate component. The existing form is a single component with conditional sections (schedule fields appear conditionally today). The trigger section follows the same pattern: conditional rendering within `CommissionForm.tsx` gated on `commissionType === "triggered"`.

The event-type-to-fields mapping and the match summary generation logic are pure functions. They can live as module-level constants and a helper function at the top of `CommissionForm.tsx`, or in a small utility if the file exceeds comfortable reading length. The implementer should use judgment; if the form file stays under ~300 lines after the additions, keeping everything in one file is fine.

## Success Criteria

- [ ] "Trigger" appears as a third option on the commission type toggle
- [ ] Selecting "Trigger" renders the trigger section with event type dropdown, approval radios, project filter, and field pattern inputs
- [ ] Event type dropdown lists all `SYSTEM_EVENT_TYPES` values
- [ ] Field pattern rows can be added and removed dynamically
- [ ] Field key hints update based on selected event type, showing available keys and glob syntax
- [ ] Template variable hints appear below Title and Prompt when type is Trigger
- [ ] Max chain depth field appears in Resource Overrides section only for Trigger type
- [ ] Match summary line renders above buttons when event type is selected
- [ ] Submit button reads "Create Trigger" for Trigger type
- [ ] `canSubmit` requires event type selection for Trigger type
- [ ] Payload includes `type: "triggered"`, `match`, and optionally `approval` and `maxDepth`
- [ ] Field patterns with empty key or value are excluded from the payload
- [ ] `approval` is omitted from payload when set to default ("confirm")
- [ ] Form state persists when toggling between commission types
- [ ] Trigger creation succeeds end-to-end (form submit creates a triggered commission via the existing daemon route)

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm `commissionType` state type includes `"triggered"` in `CommissionForm.tsx`.
- Confirm a third radio option with value `"triggered"` and label "Trigger" exists in the type toggle.
- Confirm trigger-specific state variables exist: `matchType`, `approval`, `projectFilter`, `fieldPatterns`, `maxDepth`.
- Confirm the event type dropdown is a `<select>` populated with `SYSTEM_EVENT_TYPES` values.
- Confirm approval uses HTML radio inputs, not the segmented control style.
- Confirm field pattern rows use `{ key: string; value: string }[]` state with add/remove controls.
- Confirm the event-type-to-fields mapping exists as a static data structure.
- Confirm template variable hints render conditionally (only for triggered type, update on event type change).
- Confirm max chain depth input renders inside the Resource Overrides expander, gated on triggered type.
- Confirm `canSubmit` requires `matchType.length > 0` when `commissionType === "triggered"`.
- Confirm `handleSubmit` builds `match`, `approval`, and `maxDepth` fields in the payload for triggered type.
- Confirm empty field pattern rows are filtered out before payload construction.
- Confirm no changes to `web/app/api/commissions/route.ts` (the proxy already passes the full body through).

**Behavioral checks:**
- Render test: mount `CommissionForm`, select "Trigger" type, verify trigger section appears with all four field groups.
- Event type selection test: select an event type, verify field key hints update to show correct keys.
- Template variable test: select "Trigger" type and an event type, verify Title and Prompt fields show template variable hints.
- Field pattern add/remove test: click "Add pattern", verify a row appears. Fill in key/value. Click remove, verify row is gone.
- Empty field pattern test: add a pattern row with empty key, submit the form, verify the empty row is excluded from the payload.
- canSubmit test: select "Trigger" type without event type, verify submit button is disabled. Select an event type, verify button becomes enabled (given title, worker, prompt are filled).
- Payload test: fill out a complete trigger form (event type, approval=auto, project filter, field patterns, max depth), submit, verify the fetch body matches the expected shape.
- Type toggle persistence test: fill trigger fields, switch to One-shot, switch back to Trigger, verify trigger fields are preserved.
- Match summary test: select event type and add field patterns, verify summary text renders correctly.
- Submit button label test: verify button shows "Create Trigger" when type is "triggered", "Create Schedule" for scheduled, "Create Commission" for one-shot.

## Constraints

- No daemon changes. The creation route already handles `type: "triggered"` with `match`, `approval`, and `maxDepth` fields.
- No API proxy changes. `web/app/api/commissions/route.ts` passes the full request body through.
- The event-type-to-fields mapping is a static snapshot. It does not auto-sync with `SystemEvent` type definitions. Manual update is required when event types change.
- Click-to-insert for template variables (clicking a variable token inserts it at cursor position in the prompt) is not in scope. It's a nice-to-have that requires cursor position tracking and `textarea` selection management.
- Field key autocomplete (dropdown suggestions in the Key input based on event type) is not in scope. The hint text is sufficient for v1.

## Out of Scope

- **Trigger editing.** This spec covers creation only. Editing an existing trigger's match rule or approval mode is a separate concern handled through the trigger detail view (REQ-TRIG-25b, `TriggerActions`).
- **Click-to-insert template variables.** Cursor management in textareas is non-trivial. The variable names are shown as hints; users copy them manually.
- **Field key autocomplete.** Dropdown suggestions in the Key input would reduce typos but add complexity. The hint text lists available keys.
- **Trigger test/dry-run.** The triggered commissions spec (REQ-TRIG non-goals) explicitly defers this.
- **Any daemon or API route changes.** This is a frontend-only spec.

## Context

- [Brainstorm: Triggered Commission Creation UX](../../brainstorm/triggered-commission-creation-ux.md): Explored three layout options (flat, basic/advanced split, event-driven hints). Recommended Option A + C. This spec implements that recommendation with all open questions resolved.
- [Spec: Triggered Commissions](../commissions/triggered-commissions.md): Defines the trigger data model, lifecycle, and daemon creation route this form submits to. REQ-TRIG-1 through REQ-TRIG-3 define the artifact shape. REQ-TRIG-25a defines the `createTriggeredCommission` tool parameters which mirror what the form sends.
- [Spec: Halted Commission Action Buttons](halted-commission-actions.md): Prior UI spec in the same directory, used as a format reference.
- `CommissionForm.tsx`: The form component this spec modifies. Currently supports one-shot and scheduled types with a type toggle and conditional schedule section.
- `web/app/api/commissions/route.ts`: The API proxy. Passes full request body to daemon. No changes needed.
- `daemon/routes/commissions.ts:104-121`: The daemon creation route for `type: "triggered"`. Validates `match.type` against `SYSTEM_EVENT_TYPES`.
