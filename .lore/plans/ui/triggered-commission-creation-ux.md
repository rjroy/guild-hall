---
title: Triggered commission creation UX
date: 2026-03-23
status: approved
tags: [ui, commissions, triggers, form, client-component, plan]
modules: [web/components/commission/CommissionForm]
related:
  - .lore/specs/ui/triggered-commission-creation-ux.md
  - .lore/plans/commissions/triggered-commissions-ui.md
  - .lore/specs/commissions/triggered-commissions.md
---

# Plan: Triggered Commission Creation UX

## Spec Reference

**Spec**: `.lore/specs/ui/triggered-commission-creation-ux.md`

Requirements addressed:

- REQ-TCF-1: "Trigger" as third type toggle option &rarr; Step 1
- REQ-TCF-2: Trigger section renders between type toggle and shared fields &rarr; Step 2
- REQ-TCF-3: Four field groups (event type, approval, project filter, field patterns) &rarr; Step 2
- REQ-TCF-4: Field pattern row structure (key, pattern, remove) &rarr; Step 2
- REQ-TCF-5: Contextual field key hints per event type &rarr; Step 2
- REQ-TCF-6: Template variable hints below Title and Prompt &rarr; Step 3
- REQ-TCF-7: Max chain depth in Resource Overrides &rarr; Step 3
- REQ-TCF-8: Match summary above button row &rarr; Step 3
- REQ-TCF-9: Submit button label "Create Trigger" &rarr; Step 1
- REQ-TCF-10: canSubmit requires matchType for triggered type &rarr; Step 4
- REQ-TCF-11: handleSubmit builds triggered payload &rarr; Step 4
- REQ-TCF-12: Component state variables &rarr; Step 1
- REQ-TCF-13: `.triggerFields` CSS class &rarr; Step 2
- REQ-TCF-14: Field pattern row CSS classes &rarr; Step 2
- REQ-TCF-15: `.templateVarHint` CSS class &rarr; Step 3
- REQ-TCF-16: `.matchSummary` CSS class &rarr; Step 3

## Codebase Context

**`CommissionForm.tsx`** (415 lines): Client component with `commissionType` state typed as `"one-shot" | "scheduled"`. The schedule section (lines 229-264) conditionally renders when `commissionType === "scheduled"`, using a `.scheduleFields` container. The `handleSubmit` callback (lines 119-187) builds the payload conditionally based on type. The `canSubmit` derivation (lines 189-195) uses `(commissionType === "one-shot" || cron.trim().length > 0)` to handle the schedule case. The submit button label (lines 406-410) uses a ternary on `commissionType`.

The form currently imports `SYSTEM_EVENT_TYPES` nowhere. It will need to import from `@/lib/types`.

**`CommissionForm.module.css`** (301 lines): Has `.scheduleFields` (lines 143-151) which provides the template for `.triggerFields`. Has `.fieldHint` (lines 153-157) for small muted hints. Has `.overridesSection` (lines 189-194) where the max chain depth input will go. Has `.numberInput` (lines 213-228) already styled for number fields.

**`tests/components/commission-form.test.tsx`** (211 lines): Uses type-contract testing since the component requires React render context. Tests verify module exports, prop shapes, and payload format logic. The scheduled payload tests (lines 154-181) show the exact pattern for triggered payload tests.

**`lib/types.ts`** (line 323): `SYSTEM_EVENT_TYPES` is an 11-element `as const` array. Already exported.

**No daemon or API proxy changes needed.** The creation route at `daemon/routes/commissions.ts:104-121` handles `type: "triggered"`. The web API proxy at `web/app/api/commissions/route.ts` passes the full body through.

## File Size Consideration

CommissionForm.tsx is already 415 lines. The trigger section adds roughly 150-180 lines of JSX (trigger fields, field pattern rows, template hints, match summary) plus 40-50 lines of data structures (event-type-to-fields mapping) and a helper function (match summary generation). That puts the file around 600-650 lines.

The spec says the implementer should use judgment: if the file stays under ~300 lines, keep everything together. It's already past that. The cleanest extraction is a `trigger-form-data.ts` module-level file containing:

1. The `EVENT_TYPE_FIELDS` mapping (static `Record<string, string[]>`)
2. The `buildMatchSummary()` pure function
3. The `buildTriggerPayload()` pure function (extracts field-pattern filtering and payload assembly)

This keeps CommissionForm.tsx focused on rendering and state, and makes the data structures and logic independently testable. The test file can import from the utility file directly, bypassing the React context limitation.

**Decision**: Extract `trigger-form-data.ts` into `web/components/commission/`. The form file stays as the single rendering component. Tests target the utility functions for logic coverage and the form module for type-contract tests.

## Implementation Steps

### Step 1: State and type toggle expansion

**Files**: `web/components/commission/CommissionForm.tsx`

**Changes**:

1. Expand `commissionType` state type from `"one-shot" | "scheduled"` to `"one-shot" | "scheduled" | "triggered"` (line 57).

2. Add five new state variables after the schedule state (line 59):
   - `matchType`: `string`, initial `""`
   - `approval`: `"confirm" | "auto"`, initial `"confirm"`
   - `projectFilter`: `string`, initial `""`
   - `fieldPatterns`: `{ key: string; value: string }[]`, initial `[]`
   - `maxDepth`: `string`, initial `""`

3. Add a third radio option in the type toggle (after the Schedule label, line 225):
   ```tsx
   <label className={`${styles.typeOption} ${commissionType === "triggered" ? styles.typeOptionActive : ""}`}>
     <input type="radio" name="commission-type" value="triggered"
       checked={commissionType === "triggered"}
       onChange={() => setCommissionType("triggered")}
       className={styles.typeRadio} disabled={submitting} />
     Trigger
   </label>
   ```

4. Update the submit button label ternary (line 406-410) to handle all three types:
   ```tsx
   submitting ? "Creating..."
     : commissionType === "scheduled" ? "Create Schedule"
     : commissionType === "triggered" ? "Create Trigger"
     : "Create Commission"
   ```

5. Add `import { SYSTEM_EVENT_TYPES } from "@/lib/types"` at the top.

**REQs covered**: REQ-TCF-1, REQ-TCF-9, REQ-TCF-12 (partial).

**Verify**: The type toggle shows three segments. Clicking "Trigger" selects it. Existing one-shot and schedule behavior unchanged. Tests still pass.

### Step 2: Trigger section and CSS

**Files**: `web/components/commission/CommissionForm.tsx`, `web/components/commission/CommissionForm.module.css`, `web/components/commission/trigger-form-data.ts` (new)

**Changes in `trigger-form-data.ts`**:

1. Export `EVENT_TYPE_FIELDS: Record<string, string[]>` with all 11 event types mapped to their field keys, per the spec's table.

2. Export a `buildMatchSummaryParts(matchType: string, projectFilter: string, fieldPatterns: { key: string; value: string }[]): { text: string; isCode: boolean }[]` function that returns an array of segments, each marked as plain text or code. The render site maps this array to JSX, wrapping code segments in `<code>` elements with `.fieldHint` styling. This keeps the function pure and testable (returns data, not JSX) while enabling mixed inline styling at the render site. If `matchType` is empty, returns an empty array.

3. Export a `buildTriggerPayloadFields(...)` function that assembles the trigger-specific payload fields (match, approval, maxDepth) from form state, filtering empty field pattern rows per REQ-TCF-11.

**Changes in `CommissionForm.tsx`**:

1. Import `EVENT_TYPE_FIELDS` from `./trigger-form-data`.

2. Add the trigger section JSX after the schedule section block (line 264), gated on `commissionType === "triggered"`:

   ```tsx
   {commissionType === "triggered" && (
     <div className={styles.triggerFields}>
       {/* Event type select */}
       {/* Approval radio buttons (HTML radios, not segmented) */}
       {/* Project filter text input */}
       {/* Field pattern rows + add button */}
       {/* Field key hints */}
     </div>
   )}
   ```

3. Event type: `<select>` with placeholder option and `SYSTEM_EVENT_TYPES.map()`. Binds to `matchType` state.

4. Approval: Two `<input type="radio">` with `name="trigger-approval"`, values `"confirm"` and `"auto"`. Standard HTML radio style, not the segmented `.typeOption` style.

5. Project filter: Text input with label "Project filter (optional)" and hint "Only respond to events from this project. Leave blank for any."

6. Field patterns: Map over `fieldPatterns` array. Each row renders key input, pattern input, remove button. "Add pattern" button appends `{ key: "", value: "" }`. Remove handler filters by index.

7. Field key hints: Below field patterns, render hint text from `EVENT_TYPE_FIELDS[matchType]` when `matchType` is set. Append glob syntax guidance. When no type selected: "Select an event type to see available field keys."

**Changes in CSS**:

1. `.triggerFields`: Copy `.scheduleFields` styling (bordered container, light tint).

2. `.fieldPatternRow`: `display: flex; align-items: center; gap: var(--space-sm);`

3. `.fieldPatternInputs`: `display: flex; flex: 1; gap: var(--space-sm);` (two inputs side by side).

4. `.removeButton`: Small, muted, no background. Hover shows color.

5. `.addPatternButton`: Subtle text button, similar to `.overridesToggle` but smaller font. Padding matches existing hint text area.

**REQs covered**: REQ-TCF-2, REQ-TCF-3, REQ-TCF-4, REQ-TCF-5, REQ-TCF-13, REQ-TCF-14.

**Verify**: Selecting "Trigger" renders the full trigger section. Event type dropdown shows 11 options. Field pattern rows add and remove. Hints update per event type. Schedule fields still render correctly when "Schedule" is selected.

### Step 3: Template hints, max depth, match summary, remaining CSS

**Files**: `web/components/commission/CommissionForm.tsx`, `web/components/commission/CommissionForm.module.css`

**Changes in `CommissionForm.tsx`**:

1. Template variable hints below Title input (after line 278): When `commissionType === "triggered"`, render a hint div with `.templateVarHint`. Content is the same field keys from `EVENT_TYPE_FIELDS[matchType]`, formatted as `` `{{key}}` `` code tokens. Same conditional text when no event type selected.

2. Same hint below the Prompt textarea (after line 316).

3. Max chain depth: Inside the `overridesOpen` block (line 349), add a conditional field when `commissionType === "triggered"`:
   ```tsx
   {commissionType === "triggered" && (
     <div className={styles.overridesField}>
       <label className={styles.overridesLabel} htmlFor="commission-max-depth">
         Max chain depth
       </label>
       <input id="commission-max-depth" className={styles.numberInput}
         type="number" min="1" value={maxDepth}
         onChange={(e) => setMaxDepth(e.target.value)}
         placeholder="3" disabled={submitting} />
     </div>
   )}
   ```

4. Match summary: Before the button row (line 388), render the summary when `commissionType === "triggered"` and `matchType` is non-empty. Import `buildMatchSummaryParts()` and map the returned segments to JSX, wrapping `isCode: true` segments in `<code>` elements.

**Changes in CSS**:

1. `.templateVarHint`: Extends `.fieldHint` base (small, muted, `var(--font-code)`). `code` elements inside use `var(--font-code)` with slightly brighter color (`var(--color-text)` or `var(--color-brass)` at low opacity).

2. `.matchSummary`: Same base as `.fieldHint`, with `padding: var(--space-sm) 0` for vertical separation from the button row.

**REQs covered**: REQ-TCF-6, REQ-TCF-7, REQ-TCF-8, REQ-TCF-15, REQ-TCF-16.

**Verify**: Template hints appear below Title and Prompt when Trigger type selected. Hints update when event type changes. Max depth appears in Resource Overrides only for Trigger. Match summary renders above buttons with correct format.

### Step 4: Validation, submission, and dependency wiring

**Files**: `web/components/commission/CommissionForm.tsx`

**Changes**:

1. Update `canSubmit` (line 189-195) to handle all three types:
   ```tsx
   const canSubmit =
     title.trim().length > 0 &&
     workerName.length > 0 &&
     prompt.trim().length > 0 &&
     (commissionType === "one-shot"
       || (commissionType === "scheduled" && cron.trim().length > 0)
       || (commissionType === "triggered" && matchType.length > 0)) &&
     !submitting &&
     isOnline;
   ```

2. Update `handleSubmit` (after the schedule block at line 145-154) to add the triggered case. Import and use `buildTriggerPayloadFields()` from `./trigger-form-data`:
   ```tsx
   if (commissionType === "triggered") {
     payload.type = "triggered";
     const triggerFields = buildTriggerPayloadFields(
       matchType, projectFilter, fieldPatterns, approval, maxDepth
     );
     Object.assign(payload, triggerFields);
   }
   ```

3. Add new state variables to the `handleSubmit` `useCallback` dependency array (line 187): `matchType`, `approval`, `projectFilter`, `fieldPatterns`, `maxDepth`.

**REQs covered**: REQ-TCF-10, REQ-TCF-11, REQ-TCF-12 (complete).

**Verify**: Submit button disabled when Trigger selected without event type. Button enables when event type selected (with title, worker, prompt filled). Form submits successfully. Daemon creates a triggered commission.

### Step 5: Tests

**Files**: `tests/components/commission-form.test.tsx`, `tests/components/trigger-form-data.test.ts` (new)

**New test file `trigger-form-data.test.ts`**:

These are pure-function tests with no React dependency. They cover the extracted logic directly:

1. **EVENT_TYPE_FIELDS coverage**: Verify all 11 `SYSTEM_EVENT_TYPES` entries have a corresponding key in `EVENT_TYPE_FIELDS`. Verify each value is a non-empty string array.

2. **buildMatchSummaryParts tests**:
   - Event type only: returns segments producing "This trigger will fire on any `{type}` event." with type as code segment
   - With project filter: includes code segment for project name
   - With field patterns: includes code segments for key and pattern
   - With project filter and field patterns: both clauses present
   - Multiple field patterns: joined with "and"
   - Empty field patterns (key or value empty): excluded from summary
   - No event type: returns empty array

3. **buildTriggerPayloadFields tests**:
   - Minimal (event type only): returns `{ type: "triggered", match: { type } }`
   - With project filter: includes `match.projectName`
   - With field patterns: includes `match.fields` as Record
   - Empty field patterns filtered: rows with empty key/value excluded
   - All field patterns empty: `fields` omitted entirely
   - Approval "confirm": `approval` omitted from payload (daemon default)
   - Approval "auto": `approval: "auto"` included
   - Max depth valid: `maxDepth` included as number
   - Max depth empty: `maxDepth` omitted
   - Max depth zero or negative: `maxDepth` omitted
   - Max depth non-numeric: `maxDepth` omitted

**Additions to `commission-form.test.tsx`**:

Following the existing pattern (type-contract and payload format tests):

1. **Triggered payload format tests** (new describe block):
   - Triggered payload includes type, match with event type
   - Triggered payload with all optional fields (approval, projectFilter, match.fields, maxDepth)
   - Triggered payload omits approval when "confirm"
   - Triggered payload omits maxDepth when empty

2. **canSubmit logic tests** (new describe block):
   - canSubmit false when triggered type with no matchType
   - canSubmit true when triggered type with matchType set (and title, worker, prompt present)

3. **Type toggle persistence test**: Verify that trigger state variables are declared at component scope (not inside a conditional block), confirming they persist across type toggle switches. This is a structural guarantee from React's hooks model: `useState` at the top of the component retains its value regardless of which conditional branch renders. A type-contract test that verifies the state variables exist in the module's source or that the component exports are stable covers this.

**Note on behavioral/render tests**: The spec's AI Validation section lists 10 behavioral checks that require mounting the component (render test, event type selection, template variable hints, field pattern add/remove, etc.). The project's testing infrastructure uses bun test without a DOM environment (no jsdom/happy-dom), so client components cannot be rendered in tests. The existing test pattern (`tests/components/commission-form.test.tsx`) works around this with type-contract tests.

The pure-function extraction into `trigger-form-data.ts` compensates for the render gap: `buildMatchSummaryParts`, `buildTriggerPayloadFields`, and `EVENT_TYPE_FIELDS` cover the logic that the behavioral tests would exercise. What remains uncovered are the JSX wiring questions (does selecting "Trigger" actually render the section? does the event type dropdown actually list all options?). These are verified through the review commission (Step 6) and manual testing during development, not automated render tests.

If DOM testing infrastructure is added to the project in the future, the behavioral checks from the spec's AI Validation section provide an exact test plan.

**REQs validated**: All 16 REQs are covered through the combination of pure-function tests (data and logic), type-contract tests (payload shape), and review verification (JSX wiring).

**Verify**: `bun test tests/components/commission-form.test.tsx tests/components/trigger-form-data.test.ts` passes.

### Step 6: Review

Dispatch a review commission (Thorne) targeting `web/components/commission/CommissionForm.tsx`, `web/components/commission/CommissionForm.module.css`, `web/components/commission/trigger-form-data.ts`, and the two test files. The review should check:

- All 16 REQs are addressed
- Field pattern add/remove logic handles edge cases (empty array, rapid add/remove)
- Template variable hint text matches spec format exactly
- Match summary format matches spec examples exactly
- Payload shape matches what `daemon/routes/commissions.ts:104-121` expects
- No daemon or API proxy files were modified
- CSS classes don't collide with existing styles
- `useCallback` dependency array includes all trigger state variables

## Risk Areas

**File size.** CommissionForm.tsx will grow significantly. The utility extraction (`trigger-form-data.ts`) mitigates this, but the JSX in the form component will still be substantial. If the implementer finds the render function exceeding comfortable reading length, the trigger section JSX can be extracted into a `TriggerFormSection` component within the same file (not a separate file, since it shares state with the parent).

**Field pattern row key handling.** React list rendering with dynamic add/remove needs stable keys. Using array index as the React key is fine here since rows are only added at the end and removed by index, with no reordering. If the implementer reaches for a UUID key generator, that's unnecessary complexity.

**handleSubmit dependency array.** The `fieldPatterns` array reference changes on every add/remove. This is fine for `useCallback` correctness (it should recapture the current array), but the implementer should confirm the dependency list is complete. Missing a dependency means stale state in the submit handler.

**Approval radio name collision.** The approval radios use `name="trigger-approval"`, which is distinct from the type toggle's `name="commission-type"`. This is correct. If both used the same name, selecting an approval option would deselect the type.

## Delegation

| Step | Worker | Notes |
|------|--------|-------|
| 1-4 | Dalton | Single implementation pass. Steps are ordered but not independent enough to parallelize. |
| 5 | Dalton | Same session, immediately after implementation. |
| 6 | Thorne | Fresh-context review after implementation + tests pass. |

## Scope Estimate

This is a single-phase implementation. The total change is:

- 1 new file (~80 lines): `trigger-form-data.ts`
- 1 new test file (~120 lines): `trigger-form-data.test.ts`
- 1 modified file (~180 lines added): `CommissionForm.tsx`
- 1 modified file (~60 lines added): `CommissionForm.module.css`
- 1 modified test file (~50 lines added): `commission-form.test.tsx`

Roughly 490 lines of new/changed code across 5 files. All frontend, no API surface changes, no daemon changes. A single commission for Dalton should handle Steps 1-5, followed by a review commission for Thorne (Step 6).
