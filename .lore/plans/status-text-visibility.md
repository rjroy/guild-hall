---
title: Status Text Visibility
date: 2026-03-10
status: draft
tags: [ui, status, gem, list-views, accessibility]
modules: [CommissionList, MeetingList, ArtifactList, RecentArtifacts, DependencyMap, StatusBadge]
related:
  - .lore/plans/commission-status-gem-and-sort-fix.md
  - .lore/plans/artifact-sorting.md
---

# Plan: Status Text Visibility

## Goal

Replace the bare `GemIndicator` in all list views with a `StatusBadge` composite component that renders a gem plus a text label. After this change, users can tell "complete" from "approved" from "implemented" without having to open each item.

## Codebase Context

**GemIndicator** (`web/components/ui/GemIndicator.tsx`): A plain `<img>` with a CSS filter applied to shift the base blue gem to green/amber/red/blue. Props: `status: "active" | "pending" | "blocked" | "info"`, `size: "sm" | "md"`. No wrapper element, no text. 16×16px (sm) or 24×24px (md).

**Status mapping**: `statusToGem()` at `lib/types.ts:252` maps ~20 freeform status strings to four gem variants. Unrecognized strings → "info". `meetingStatusToGem()` in `MeetingList.tsx:22` is a separate mapping for the four meeting-specific statuses (open/requested/declined/closed). These two mappings differ for "open": `statusToGem("open") = "pending"` (amber), but `meetingStatusToGem("open") = "active"` (green). Any status component that centralizes gem computation must handle this split or accept a pre-computed gem variant as a prop.

**Current gem usage in list views** (five components with status-driven gems):

| Component | Gem position | Raw status available | Gem computed by |
|-----------|-------------|---------------------|-----------------|
| `CommissionList.tsx:91` | Left, before `.info` | `commission.status` | `statusToGem()` |
| `MeetingList.tsx:111,135,163,184` | Left, before `.info` | `status` (normalized) | `meetingStatusToGem()` |
| `ArtifactList.tsx:88` | Right, after `.info` | `node.artifact.meta.status` | `statusToGem()` |
| `RecentArtifacts.tsx:100` | Right, after `.info` | (via `gemStatus` computed above the read) | `statusToGem()` |
| `DependencyMap.tsx:64` | Left, before `.info` | `commission.status` (from `CommissionMeta`) | `statusToGem()` |

**GemIndicator usage NOT targeted by this plan** (decorative/hardcoded/single-item views):
- `ProjectTabs.tsx`, `WorkspaceSidebar.tsx`: hardcoded `status="info"`, decorative only
- `ToolUseIndicator.tsx`, `ErrorMessage.tsx`: meeting-view tool state, context is clear
- `CommissionHeader.tsx`, `CommissionTimeline.tsx`: single-commission detail views
- `MetadataSidebar.tsx`: artifact metadata sidebar (enhancement for a follow-on)

**Row layouts**: CommissionList and MeetingList use `flex row: [gem | info]` (gem on left). ArtifactList and RecentArtifacts use `flex row: [scroll-icon | info | gem]` (gem on right). DependencyMap uses cards with `flex row: [gem | info]`. The StatusBadge is a drop-in replacement in all positions — its internal layout is self-contained.

**Existing status color tokens in `web/app/globals.css`**: `--color-brass: #b8860b`, `--color-amber: #ffb000`, `--color-text-muted: #a89878`. There is no green or red text token. New tokens are required for status label colors.

**Test infrastructure**: Tests use `findComponentElements(el, "ComponentName")` to find component instances by display name in the JSX tree. The five list components listed above have associated test files that assert `GemIndicator` presence/props. After replacing `<GemIndicator>` with `<StatusBadge>` in those components, `GemIndicator` becomes an implementation detail of `StatusBadge`. Tests should be updated to assert at the `StatusBadge` level. The direct `tests/components/GemIndicator.test.tsx` needs no changes.

## Design Decisions

**StatusBadge, not a GemIndicator extension.** Adding `label` to GemIndicator would require adding layout (flexbox wrapper) and text styling to a component whose current job is "render one decorative image." The wrapper and label are new concerns. A separate `StatusBadge` composite component keeps GemIndicator clean and single-purpose. StatusBadge is a new leaf in the component tree; GemIndicator remains unchanged.

**StatusBadge accepts pre-computed `gem` prop, not the raw status string.** Centralizing gem computation inside StatusBadge would require StatusBadge to know about the `meetingStatusToGem` divergence. The mapping logic already lives in `statusToGem()` and `meetingStatusToGem()`, which are well-tested. StatusBadge should not duplicate or conditionally override them. The callers pass in `gem` (pre-computed, as they do today) plus the raw `label` string.

**Label color matches the gem.** A label color that contradicts the gem color would be confusing. New design tokens (`--color-status-active`, `--color-status-pending`, `--color-status-blocked`, `--color-status-info`) provide consistent colors for both the label and any future elements that need to communicate status meaning without a gem image.

**Label text is formatted, not raw.** The raw status string is lowercase and may contain underscores (e.g., `in_progress`). A `formatStatus()` utility converts it to title-case with spaces: "In Progress". This lives in `lib/types.ts` near `statusToGem()`, as display formatting of status strings is the same concern.

**Mobile behavior: keep text visible.** Hiding the label on small screens defeats the purpose of this change. The gem is 16px, the label is ~60px at 0.75rem. The combined badge is ~84px. The `.info` block (title + meta) uses `flex: 1; min-width: 0`, so the title truncates before the status badge is squeezed. This is acceptable — the status is more actionable than a truncated title. No mobile breakpoint hiding is planned.

## Implementation Steps

### Phase 1: Foundation

#### Step 1: Add status color tokens to `web/app/globals.css`

**File**: `web/app/globals.css`

In the `:root` block, after the gem filter variables (around line 71), add:

```css
/* Status label text colors (paired with --gem-* filter variables) */
--color-status-active: #6abf69;
--color-status-pending: var(--color-amber);
--color-status-blocked: #e57373;
--color-status-info: var(--color-text-muted);
```

Green (#6abf69) and red (#e57373) are chosen as muted tones readable on the dark parchment/dark-bg background without screaming. They pair visually with the gem filter hues (green/amber/red/blue) without needing to derive exact colors from the filter math.

**Test strategy**: No automated test needed. Visual check: confirm each color reads against `--color-dark-bg` (#1a1412) and `--color-panel-bg` (rgba(26,20,18,0.75)).

#### Step 2: Add `formatStatus()` to `lib/types.ts`

**File**: `lib/types.ts`

Add after `statusToGem()` (around line 258):

```typescript
/**
 * Formats a raw status string for display. Replaces underscores with spaces
 * and title-cases each word. "in_progress" → "In Progress", "complete" → "Complete".
 */
export function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

**Test strategy** (add to `tests/lib/types.test.ts` or create if absent):
- `formatStatus("complete")` → "Complete"
- `formatStatus("in_progress")` → "In Progress"
- `formatStatus("wontfix")` → "Wontfix"
- `formatStatus("open")` → "Open"
- `formatStatus("")` → ""
- `formatStatus("DONE")` → "Done" (already-uppercase input round-trips cleanly)

Check if `tests/lib/types.test.ts` exists before creating it.

#### Step 3: Create `StatusBadge` component

**Files**: `web/components/ui/StatusBadge.tsx` (new), `web/components/ui/StatusBadge.module.css` (new)

`StatusBadge.tsx`:

```tsx
import GemIndicator from "./GemIndicator";
import { formatStatus } from "@/lib/types";
import type { GemStatus } from "@/lib/types";
import styles from "./StatusBadge.module.css";

interface StatusBadgeProps {
  gem: GemStatus;
  label: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ gem, label, size = "sm" }: StatusBadgeProps) {
  return (
    <span className={styles.badge}>
      <GemIndicator status={gem} size={size} />
      <span className={`${styles.label} ${styles[`label${capitalize(gem)}`]}`}>
        {formatStatus(label)}
      </span>
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

`StatusBadge.module.css`:

```css
/* StatusBadge: gem + text label, inline-flex, colors keyed by gem status */

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.label {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1;
}

.labelActive {
  color: var(--color-status-active);
}

.labelPending {
  color: var(--color-status-pending);
}

.labelBlocked {
  color: var(--color-status-blocked);
}

.labelInfo {
  color: var(--color-status-info);
}
```

Note: `capitalize()` is a module-private helper, not exported. It exists only to map the `gem` prop to a CSS class suffix.

#### Step 4: Create `tests/components/StatusBadge.test.tsx`

The component is a server component (no `"use client"`), so it can be tested with direct function calls like `GemIndicator.test.tsx`. Follow the same pattern.

Tests to write:
- Renders a `GemIndicator` child with `status` matching the `gem` prop
- Renders label text via `formatStatus(label)`: "complete" → "Complete", "in_progress" → "In Progress"
- Applies the correct label color class for each gem status (active/pending/blocked/info)
- Default size is "sm"; passing "md" passes through to GemIndicator
- `flex-shrink: 0` on the badge wrapper (structural, prevents squeezing in flex rows)

### Phase 2: Rollout to list components

All five components follow the same change pattern:
1. Add `StatusBadge` import, add `formatStatus` import if raw status needs formatting
2. Replace `<GemIndicator status={gem} size="sm" />` with `<StatusBadge gem={gem} label={rawStatus} size="sm" />`
3. Remove `GemIndicator` import if no other uses remain in the file

#### Step 5: Update `CommissionList.tsx`

**File**: `web/components/commission/CommissionList.tsx`

The raw status is `commission.status`. In the render:
```tsx
// was:
<GemIndicator status={gem} size="sm" />
// becomes:
<StatusBadge gem={gem} label={commission.status} size="sm" />
```

Remove `import GemIndicator` (no other uses in this file). Add `import StatusBadge`.

The status text appears to the left of `.info`, inline with the gem, because StatusBadge is `display: inline-flex`. The label is compact enough (~60px) that it fits without reflow. No changes to `CommissionList.module.css`.

#### Step 6: Update `MeetingList.tsx`

**File**: `web/components/project/MeetingList.tsx`

MeetingList has four render branches (`open`, `requested`, `closed`, fallback). All four use `<GemIndicator status={gem} size="sm" />`. Replace all with `<StatusBadge gem={gem} label={status} size="sm" />`. The `status` variable is already computed at the top of the map callback (line 97).

Note: for the "requested" branch, the badge sits between the gem and the Accept button. The accepted `.requestedEntry` CSS already uses `align-items: center`, so StatusBadge slots in cleanly. No layout changes to `MeetingList.module.css`.

#### Step 7: Update `ArtifactList.tsx`

**File**: `web/components/project/ArtifactList.tsx`

The gem appears at the end of the artifact link row. `TreeNodeRow` computes:
```typescript
const gemStatus = statusToGem(node.artifact.meta.status);
```

Replace `<GemIndicator status={gemStatus} size="sm" />` with:
```tsx
<StatusBadge gem={gemStatus} label={node.artifact.meta.status} size="sm" />
```

The StatusBadge renders inline-flex at the right end of the row. The label appears to the right of the gem image (i.e., at the far right of the row). The `.info` block has `flex: 1; min-width: 0` so the title still truncates before the badge is squeezed.

#### Step 8: Update `RecentArtifacts.tsx`

**File**: `web/components/dashboard/RecentArtifacts.tsx`

Same pattern as ArtifactList: gem is at the right end. The raw artifact status is accessible from `artifact.meta.status` in the render loop (the `gemStatus` variable is computed from it). Replace `<GemIndicator status={gemStatus} size="sm" />` with `<StatusBadge gem={gemStatus} label={artifact.meta.status} size="sm" />`.

#### Step 9: Update `DependencyMap.tsx`

**File**: `web/components/dashboard/DependencyMap.tsx`

Same pattern as CommissionList: gem on the left. The raw status is `commission.status`. Replace `<GemIndicator status={gemStatus} size="sm" />` with `<StatusBadge gem={gemStatus} label={commission.status} size="sm" />`.

### Phase 3: Update tests

#### Step 10: Update affected component tests

The following test files assert GemIndicator presence in components that are changing. Each needs to be checked and updated to assert at the StatusBadge level instead.

**Files to check** (look for `findComponentElements(el, "GemIndicator")` in trees that render the five updated components):
- `tests/components/dashboard-commissions.test.ts` — likely covers DependencyMap and/or CommissionList
- `tests/components/commission-form.test.tsx` — check whether it renders CommissionList or a separate form component
- Any test file that renders CommissionList, MeetingList, ArtifactList, RecentArtifacts, or DependencyMap

For each assertion `findComponentElements(el, "GemIndicator")` inside an updated component's render tree:
- Replace with `findComponentElements(el, "StatusBadge")`
- Assert the `gem` prop matches the expected GemStatus value
- Assert the `label` prop contains the expected raw status string (e.g., `"complete"`)
- The `GemIndicator` is still rendered inside `StatusBadge`, so gem-specific assertions about CSS classes or alt text remain accessible via the nested GemIndicator node

**Files that do NOT need changes**:
- `tests/components/GemIndicator.test.tsx` — tests GemIndicator directly, which is unchanged
- Tests for `CommissionHeader.tsx`, `CommissionTimeline.tsx`, `MetadataSidebar.tsx` — those components are not touched

#### Step 11: Full test suite and review

Run `bun test`. All 1982 existing tests plus the new StatusBadge tests should pass.

Launch a code-reviewer sub-agent with fresh context to verify:
1. No component outside the five targeted ones was accidentally modified
2. `GemIndicator` itself has no changes (it's tested separately and must stay clean)
3. `formatStatus()` handles edge cases: empty string, underscore-heavy inputs, already-uppercase strings
4. StatusBadge label colors use the new CSS tokens and not hardcoded hex values
5. Mobile layout: the five updated rows still have `flex: 1; min-width: 0` on the info block, ensuring title truncates before the badge is squeezed
6. Import graph: `lib/types.ts` does not import from `web/` (no circular dependency introduced)

## Delegation Guide

Phase 1 (Steps 1–4) is the foundation. It should be implemented and tested before Phase 2 begins, because the list component changes depend on StatusBadge existing.

Phase 2 (Steps 5–9) can run as a single pass — all five components follow the same pattern. The risk is low because no logic changes, only component substitution.

| After Step | Reviewer | Focus |
|-----------|----------|-------|
| Step 4 | code-reviewer | StatusBadge renders gem + label correctly, CSS classes are wired to tokens, formatStatus handles edge cases |
| Step 9 | code-reviewer | All five list components use StatusBadge, no stray GemIndicator imports remain in updated files |
| Step 11 | code-reviewer (fresh context) | Full review: no regressions, no accidental scope creep into non-targeted components |

## Open Questions

1. **`MetadataSidebar.tsx` and `CommissionHeader.tsx`**: Both use status-driven GemIndicator in sidebar/detail views where the status isn't currently labeled. These were excluded from this plan (scope: list views only). Whether they should get the same treatment is a follow-on decision.

2. **`RecentArtifacts` layout adjustment**: The RecentArtifacts component wasn't fully read during planning (only lines 90–109). Confirm the raw artifact status is accessible in the render loop via `artifact.meta.status`. If `gemStatus` is computed without the original string being in scope, derive it from `artifact.meta.status` directly (the pattern is the same as ArtifactList).

3. **Label width at narrow viewports**: 0.75rem text at 12px, one word (~6–8 chars), is approximately 55–70px. The combined badge (16px gem + 4px gap + ~65px text) is ~85px. If test on a physical device shows this clips the title to the point of unreadability, the fallback is `@media (max-width: 480px) { .label { display: none; } }` in `StatusBadge.module.css`. Decide after visual testing.

4. **`DependencyMap` card layout**: Confirmed gem is at the left in a card, but the card's full CSS wasn't inspected. Confirm the card flex direction and that StatusBadge + existing info block still fits within the card bounds at typical viewport widths.
