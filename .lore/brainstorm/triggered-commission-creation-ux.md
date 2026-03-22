---
title: "Triggered Commission Creation UX"
date: 2026-03-21
status: active
author: Octavia
tags: [brainstorm, ui, commissions, triggers, ux]
related:
  - .lore/specs/commissions/triggered-commissions.md
  - .lore/brainstorm/triggered-commissions.md
---

# Triggered Commission Creation UX

Brainstorm for adding a "Trigger" option to the commission creation form in the web UI.

## What Exists Today

The form lives in `web/components/commission/CommissionForm.tsx`. It has a type selector (radio buttons: One-shot / Schedule) and conditional fields for the selected type. Scheduling shows a cron expression field and an optional repeat count. Then the shared section: Title, Worker, Prompt, Dependencies, and a collapsed Resource Overrides expander.

The daemon route at `POST /commission/request/commission/create` already handles `type: "triggered"`. It accepts `match`, `approval`, and `maxDepth` fields. No backend work is needed to support the creation form — only frontend.

The `type: "triggered"` entry is already in `CommissionType` in `daemon/types.ts`. TriggerInfo and TriggerActions components already exist for the detail view.

## Field Mapping

Before exploring UX options, here's what needs to go where.

**Shared with one-shot and scheduled:**

| Field | Notes |
|-------|-------|
| `title` | Supports `{{fieldName}}` template variables (unique to triggers — see below) |
| `workerName` | Same dropdown |
| `prompt` | Supports `{{fieldName}}` template variables |
| `dependencies` | Same comma-separated input. Also supports template variables |

**Trigger-specific:**

| Field | Required | Notes |
|-------|----------|-------|
| `match.type` | Yes | Dropdown of `SYSTEM_EVENT_TYPES` |
| `match.projectName` | No | Exact project name filter |
| `match.fields` | No | Key-value pairs with glob patterns |
| `approval` | No | `confirm` (default) or `auto` |
| `maxDepth` | No | Integer, defaults to 3 |

## The Third-Tab Question

Yes, "Trigger" fits naturally as a third option on the type selector. The form's pattern — type toggle, conditional section, shared fields — is already established and it maps cleanly:

- One-shot: no type-specific section
- Schedule: cron expression + repeat count
- Trigger: match rule + approval mode

The shared fields (Title, Worker, Prompt, Dependencies, Resource Overrides) stay the same for all three types. The conditional section just gains a third branch.

The submit button label should follow the pattern: "Create Trigger" (vs. "Create Commission" and "Create Schedule").

One subtlety: the Title and Prompt fields support template variables only when the type is Trigger. The form should surface this conditionally rather than always, to avoid confusing one-shot and scheduled users.

## Option A: Flat Trigger Section (Simplest)

Everything in one visible block. No nesting.

```
Type:  [One-shot]  [Schedule]  [Trigger]

[ Trigger section — visible when type = "Trigger" ]

  Event type:  [commission_status ▼]

  Project filter (optional):
    [_________________________________]
    Hint: Only respond to events from this project

  Field patterns (optional):
    Key                 Pattern
    [_____________]     [___________________] [×]
    [_____________]     [___________________] [×]
                        [ + Add pattern ]
    Hint: Supports glob patterns (*, ?, {a,b}, !x). e.g. status: completed

  Approval:
    (●) Confirm before dispatch
    ( ) Auto-dispatch

[ Shared fields ]

  Title:
  Worker:
  Prompt:
    [ Available variables: {{commissionId}}, {{status}}, {{oldStatus}}, {{projectName}}, {{reason}} ]
  Dependencies (optional):

[ ▶ Resource Overrides ]
[ ▶ Advanced (max depth) ]

[ Create Trigger ]
```

**Pro:** Everything is immediately visible. No discovery problem with important fields.
**Con:** The trigger section is longer than the schedule section (cron + repeat is short). The form gets taller. But it's not unreasonably long.

## Option B: Basic + Advanced Split

Separate the essential fields from power-user options.

```
Type:  [One-shot]  [Schedule]  [Trigger]

[ Trigger section ]

  Event type:  [commission_status ▼]

  Approval:
    (●) Confirm before dispatch
    ( ) Auto-dispatch

[ ▶ Advanced matching ]
  Project filter (optional): [_______]

  Field patterns (optional):
    [key] [pattern] [×]
    [ + Add pattern ]

[ Shared fields ]
...
[ ▶ Resource Overrides + Max depth ]
```

**Pro:** Simpler initial view. Most users start with "when any commission_status event fires" and don't need field patterns.
**Con:** Field patterns are actually important for useful triggers. Hiding them trains users to create overly broad triggers ("fire on every commission_status") rather than targeted ones ("fire when status: completed"). That's a subtle footgun.

## Option C: Event Type drives field hints

Variation of Option A where the event type selection updates the form to show relevant field key suggestions.

When `commission_status` is selected:
- Field patterns show a hint: Available keys: `status`, `commissionId`, `oldStatus`, `projectName`, `reason`

When `meeting_ended` is selected:
- Available keys: `meetingId`

When `schedule_spawned` is selected:
- Available keys: `scheduleId`, `spawnedId`, `projectName`, `runNumber`

The same event-type-aware behavior can drive the template variable hint in the Prompt field.

**Pro:** Dramatically reduces the learning curve. Users don't need to read the spec to know what to type.
**Con:** Requires maintaining a static map of event types to field names. That map already exists implicitly in the spec (REQ-TRIG-11). It's not hard to maintain; it just needs to be explicit in the frontend code.

## Key Design Decisions

### Field patterns input: rows vs. textarea

**Option 1: Dynamic rows** (Add/Remove)
Each pattern is a key + value input pair. "Add pattern" appends a new row. "×" removes one.
- Matches the mental model (you're adding individual constraints)
- Error messages can be scoped to a specific pattern
- Familiar from environment variable editors, HTTP header builders
- Recommended

**Option 2: Multiline textarea**
One pattern per line, `key: value` format.
- Less implementation work
- More error-prone (easy to write malformed syntax)
- No per-field validation
- Not recommended — the structure is known; use structure

**Option 3: JSON object textarea**
`{ "status": "completed", "commissionId": "commission-Dalton-*" }`
- Feels wrong for this surface. JSON is for APIs, not UI forms.
- Rejected

### Approval mode: toggle vs. radio vs. dropdown

**Radio buttons** match the existing type toggle visual language and clearly show both options with their labels. Two choices with a default is exactly what radio buttons are for. Recommended.

**Checkbox** ("Auto-dispatch") is terser but makes the negative state ("Confirm before dispatch" when unchecked) invisible. Reasonable, but the default-confirm story is important for safety. Explicit radio labels communicate this better.

**Dropdown** is overkill for two options. Rejected.

### maxDepth placement

Default is 3. Most users will never touch it. It belongs in an Advanced section alongside Resource Overrides (or merged into that section). The existing Resource Overrides expander pattern is the right model.

Two sub-options:
- Add maxDepth as a field inside the existing Resource Overrides expander (alongside max turns, max budget, model)
- Create a separate Advanced expander for trigger-specific advanced settings

Prefer adding it to the existing Resource Overrides section. One expander is enough. The label "Resource Overrides" can be kept as-is since max depth is conceptually a resource constraint.

### Template variable hints in Prompt and Title

The Prompt and Title fields should show a contextual hint below them when the commission type is Trigger. The hint updates based on selected event type.

When no event type is selected:
> Template variables: select an event type to see available variables

When `commission_status` is selected:
> Template variables: `{{commissionId}}` `{{status}}` `{{oldStatus}}` `{{projectName}}` `{{reason}}`

When `commission_result` is selected:
> Template variables: `{{commissionId}}` `{{summary}}` `{{artifacts}}`

These are rendered as inline code tags (matching existing prompt preview style). Clicking a variable could insert it at cursor position — but that's a nice-to-have, not v1.

### Project filter framing

The `match.projectName` field is for limiting a trigger to events from a specific project. This is slightly confusing because the trigger artifact itself already belongs to a project, and spawned commissions go to that same project.

The key distinction: a trigger in project A can match events from *any* project by default. Setting `match.projectName` scopes it to events from a specific project. Most users writing triggers for their own project will set this to their project name, or leave it blank.

Label it clearly: "Respond only to events from (optional)" and hint: "Leave blank to match events from any project."

### Order of trigger-specific fields

Event type goes first — it's the required discriminant that shapes everything else. Approval goes second — it's a critical safety setting. Project filter and field patterns go last — they're refinements.

```
Event type (required)
Approval
Project filter (optional)
Field patterns (optional)
```

## Test Trigger Flow

The spec explicitly lists dry-run validation as a non-goal. No "test this trigger" button for v1. This is the right call — it would require a real event emission infrastructure to test against, which is non-trivial.

The approved fallback: explain what the trigger will match in a summary. If the form can show a human-readable description of the match rule ("Fires on commission_status events where status matches `completed`"), users can self-validate without a live test.

A static preview line above the form buttons:

> This trigger will fire when a `commission_status` event occurs where `status` matches `completed`.

Generated from the form state. No backend call. Feasible for v1.

## Recommendation

Use Option A (flat trigger section) with Option C enhancements (event-type-aware field hints). Specifically:

1. **Add "Trigger" to the type radio toggle** as a third option.

2. **Trigger section** (rendered when type = "Trigger", above shared fields):
   - Event type dropdown (required, validates against SYSTEM_EVENT_TYPES)
   - Approval radio buttons: "Confirm before dispatch" (default) / "Auto-dispatch"
   - Project filter text input (optional, labeled clearly)
   - Field patterns key-value rows with Add/Remove (optional, starts empty)
   - Per-field hint showing available keys when event type is selected

3. **Prompt and Title fields** show contextual template variable hints below them when type = "Trigger", keyed on the selected event type.

4. **maxDepth** goes into the Resource Overrides expander (new field, labeled "Max chain depth"). Shown only when type = "Trigger".

5. **Submit button** reads "Create Trigger" when type = "Trigger".

6. **Match summary line** above the submit button (optional but recommended): human-readable description of what the trigger will match, generated from form state.

7. **Validation**: Event type is required for type = "Trigger". canSubmit requires match.type is set (in addition to title, workerName, prompt).

## Rough Wireframe

```
Type:  [ One-shot ]  [ Schedule ]  [ Trigger* ]

─── Trigger settings ──────────────────────────────────────────────────

  Event type *
    [ commission_status                                              ▼ ]

  Approval
    (●) Confirm before dispatch
    ( ) Auto-dispatch

  Project filter  (optional)
    [ ________________________________________________ ]
    Only respond to events from this project. Leave blank for any.

  Field patterns  (optional)
    Key                     Pattern
    [ status             ]  [ completed                        ] [×]
    [ commissionId       ]  [ commission-Dalton-*              ] [×]
                            [ + Add pattern ]
    Available keys for commission_status: status, commissionId, oldStatus,
    projectName, reason. Supports glob: *, ?, {a,b}, !pattern

─── Commission template ───────────────────────────────────────────────

  Title *
    [ Review completed implementation                              ]
    Template variables: {{commissionId}} {{status}} ...

  Worker *
    [ Thorne — Guild Warden                                        ▼ ]

  Prompt *
    [ Review the implementation in commission {{commissionId}}.      ]
    [                                                                ]
    Available variables: {{commissionId}} {{status}} {{oldStatus}}
    {{projectName}} {{reason}}

  Dependencies  (optional)
    [ __________________________________________________________ ]

─── ▶ Resource Overrides ───────────────────────────────────────────────
  (includes Max chain depth field when type = Trigger)

────────────────────────────────────────────────────────────────────────

  This trigger will fire on commission_status events where status
  matches "completed" and commissionId matches "commission-Dalton-*".

                                         [ Cancel ]  [ Create Trigger ]
```

## What the Backend Already Handles

No changes needed to the daemon for the creation path:
- Route validates `match.type` against `SYSTEM_EVENT_TYPES`
- Handles `approval` and `maxDepth` with defaults
- `createTriggeredCommission` is fully wired

The Next.js API route at `web/app/api/commissions/route.ts` proxies to the daemon. If it currently passes through the `type`, `match`, `approval`, and `maxDepth` fields from the request body, no API route changes are needed. If it strips unknown fields, it needs updating.

Worth verifying: does `web/app/api/commissions/route.ts` pass through the full body, or does it rebuild the payload from specific fields?

## Open Questions

- Does the web API proxy pass `match`, `approval`, `maxDepth` through to the daemon, or does it need to be updated?
- Should field pattern keys support autocomplete/suggestions based on event type? (Nice-to-have; not v1)
- Should clicking a template variable token insert it into the prompt at cursor position? (Nice-to-have; not v1)
- The trigger section is meaningfully taller than the schedule section. Does the current form container handle the additional height gracefully, or does it need scrolling consideration?
