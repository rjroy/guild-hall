---
title: "Commission: Review: Collapsible metadata sidebar"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the collapsible metadata sidebar implementation.\n\nRead the plan at `.lore/plans/ui/collapse-metadata-sidebar.md` and the issue at `.lore/issues/collapse-metadata-sidebar.md` for context.\n\nReview focus areas from the plan:\n- CSS transition correctness (width animation, overflow hidden during collapse)\n- Accessibility: `aria-expanded`, `aria-label`, focus management\n- localStorage edge cases: SSR hydration, missing key, invalid value\n- Mobile fallback: CollapsibleSidebar hidden at <=768px, InlinePanel unaffected\n- No regressions in existing sidebar content rendering\n- CSS uses project design tokens, not hardcoded values\n- Vendor prefix ordering (project quirk: -webkit- before standard)\n\nReview these files:\n- `web/components/ui/CollapsibleSidebar.tsx`\n- `web/components/ui/CollapsibleSidebar.module.css`\n- `web/components/artifact/ArtifactDetailLayout.tsx`\n- `web/app/projects/[name]/artifacts/[...path]/page.module.css`\n- `web/components/meeting/MeetingView.tsx`\n- `web/components/meeting/MeetingView.module.css`\n- `tests/web/components/ui/CollapsibleSidebar.test.tsx`\n\nWrite findings to `.lore/reviews/collapse-metadata-sidebar.md`."
dependencies:
  - commission-Dalton-20260330-220809
linked_artifacts:
  - .lore/plans/ui/collapse-metadata-sidebar.md

  - web/components/ui/CollapsibleSidebar.tsx
  - web/components/ui/CollapsibleSidebar.module.css
  - web/components/artifact/ArtifactDetailLayout.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.module.css
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/MeetingView.module.css
  - tests/web/components/ui/CollapsibleSidebar.test.ts
  - web/components/ui/CollapsibleSidebar.tsx
  - web/components/ui/CollapsibleSidebar.module.css
  - web/components/artifact/ArtifactDetailLayout.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.module.css
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/MeetingView.module.css
  - tests/web/components/ui/CollapsibleSidebar.test.ts
activity_timeline:
  - timestamp: 2026-03-31T05:08:17.580Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T05:08:45.317Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-31T05:11:59.421Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-31T05:11:59.424Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T05:11:59.475Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T05:12:06.146Z
    event: progress_report
    reason: "Starting review. Reading plan, issue, and implementation files."
  - timestamp: 2026-03-31T05:14:24.584Z
    event: progress_report
    reason: "All files read. Analyzing against plan requirements and project standards."
  - timestamp: 2026-03-31T05:15:39.178Z
    event: progress_report
    reason: "Writing review findings to .lore/reviews/collapse-metadata-sidebar.md"
  - timestamp: 2026-03-31T05:16:34.540Z
    event: result_submitted
    reason: "## Review: Collapsible Metadata Sidebar\n\n**Source:** commission-Dalton-20260330-220809\n**Files reviewed:** 7 (2 new, 5 modified)\n**Plan:** `.lore/plans/ui/collapse-metadata-sidebar.md`\n\n---\n\n### Finding 1: CSS transition is visually broken (HIGH)\n\n**What:** The sidebar children are conditionally rendered (`{!collapsed && ...}` at `CollapsibleSidebar.tsx:88`). When collapsing, React removes the children from the DOM in the same render that applies `.collapsed` (width: 0). The CSS `transition: width 200ms ease` then animates an empty box from 280px to 0. The user sees content vanish instantly, then dead space shrinks.\n\nExpanding is worse. Children render at full width inside a container still at `width: 0`, and the `.collapsed` class is removed in the same render, restoring `overflow-y: auto`. The content pops in at full size while the container grows from 0 to 280px with no clipping.\n\n**Where:** `CollapsibleSidebar.tsx:88`, `CollapsibleSidebar.module.css:7-18`\n\n**Why it matters:** The plan specifies \"CSS transitions on width and opacity\" with \"overflow: hidden during transition to clip content cleanly.\" The transition exists in CSS but the conditional rendering defeats it. The 200ms animation is invisible on collapse and jarring on expand.\n\n**Fix:** Always render children. Remove the `{!collapsed && ...}` conditional around the children block (lines 88-103). Keep the collapse/expand buttons conditionally rendered. Add `opacity: 0` and `pointer-events: none` to `.collapsed` alongside the existing `width: 0; overflow: hidden`. The children stay in the DOM, `overflow: hidden` clips them during the width transition, and opacity fades them out.\n\n---\n\n### Finding 2: Focus management fires on initial mount (HIGH)\n\n**What:** The focus-management `useEffect` at `CollapsibleSidebar.tsx:59-67` runs on mount because `[collapsed]` is a dependency and `collapsed` has a value (`false`) on first render. The comment on line 65 says \"Only run on collapsed changes, not on mount\" but the `eslint-disable` on line 66 only suppresses the exhaustive-deps lint warning; it does not prevent the effect from running on mount.\n\nOn mount with `collapsed === false`, `collapseButtonRef.current?.focus()` executes, pulling focus to the sidebar collapse button. If the user navigated to this page via keyboard, their focus position is hijacked.\n\nWhen `storageKey` indicates collapsed state, it gets worse: the mount `useEffect` fires with `collapsed === false` (the default), focusing the collapse button. Then the SSR reconciliation `useEffect` (line 44-48) sets `collapsed` to `true`, triggering the focus effect again, now focusing the expand tab. Two focus jumps on a single page load.\n\n**Where:** `CollapsibleSidebar.tsx:59-67`\n\n**Why it matters:** Unexpected focus movement is an accessibility violation (WCAG 2.4.3 Focus Order). The plan specifies \"Focus moves to the collapsed tab when collapsing, and back to the sidebar content area when expanding\" but says nothing about mount behavior, which should be inert.\n\n**Fix:** Add a `useRef` to track whether the component has mounted. Skip the focus call on the first render:\n\n```tsx\nconst hasMounted = useRef(false);\n\nuseEffect(() => {\n  if (!hasMounted.current) {\n    hasMounted.current = true;\n    return;\n  }\n  if (collapsed) {\n    expandTabRef.current?.focus();\n  } else {\n    collapseButtonRef.current?.focus();\n  }\n}, [collapsed]);\n```\n\n---\n\n### Finding 3: Hardcoded color in expandTab border (MEDIUM)\n\n**What:** `CollapsibleSidebar.module.css:45` uses `border: 1px solid rgba(184, 134, 11, 0.3)`. This is a raw RGBA value for the brass color at 30% opacity. Every other component in the codebase references `var(--color-brass)` from the design tokens in `globals.css`. The plan's CSS block contains this same hardcoded value, so the implementation is faithful to the plan, but the plan conflicts with the project convention.\n\n**Where:** `CollapsibleSidebar.module.css:45`\n\n**Why it matters:** If the brass color token changes, this border won't update. The project explicitly uses CSS custom properties for theming.\n\n**Fix:** Use the token. If 30% opacity is needed, consider `color-mix(in srgb, var(--color-brass) 30%, transparent)` or define a token for brass-at-opacity. Multiple components already use raw rgba for this exact color (checked: at least 3 other CSS modules), so this is a codebase-wide pattern worth a separate cleanup pass. Not unique to this PR, but worth noting.\n\n---\n\n### Finding 4: Test coverage covers helpers only, not component behavior (MEDIUM)\n\n**What:** The plan specifies 7 test cases including: renders children when expanded, does not render children when collapsed, toggle button flips state, aria-expanded reflects state, and custom label on expand tab. The implementation tests only `readCollapsed` and `writeCollapsed` (localStorage helpers). No rendered component tests exist.\n\n**Where:** `tests/web/components/ui/CollapsibleSidebar.test.ts`\n\n**Why it matters:** The tested surface is ~10 lines of code (the two helper functions). The untested surface is the entire component: state management, SSR reconciliation, focus management, toggle behavior, aria attributes, and the conditional rendering logic (which contains Finding 1). The decision to skip @testing-library/react because it's not in project dependencies is reasonable, but the gap is significant.\n\n**What to do:** Either add @testing-library/react as a dev dependency (it's the standard React testing tool and this project will need it eventually), or accept the gap and document it. The helpers are tested, the component is not.\n\n---\n\n### Finding 5: Duplicate linked_artifacts in commission artifact (LOW)\n\n**What:** `commission-Dalton-20260330-220809.md` lists every linked artifact twice (lines 12-25). This is the known artifact writer quality issue.\n\n**Where:** `.lore/commissions/commission-Dalton-20260330-220809.md:12-25`\n\n**Why it matters:** Tracked issue. Noting for completeness.\n\n---\n\n### Plan Compliance\n\n| Plan Requirement | Status |\n|---|---|\n| CollapsibleSidebar component with props interface | Met |\n| localStorage persistence per storageKey | Met |\n| SSR-safe read via useEffect + startTransition | Met |\n| CSS transition on width (200ms ease) | Exists in CSS but ineffective (Finding 1) |\n| overflow: hidden during transition | Class applied but children removed from DOM (Finding 1) |\n| aria-expanded on toggle buttons | Met |\n| aria-label on toggle buttons (Show/Hide) | Met |\n| Focus management on toggle | Partially met (fires on mount, Finding 2) |\n| writing-mode: vertical-rl on expand tab | Met |\n| Wrapper div with className prop for mobile hiding | Met |\n| .sidebar → .desktopSidebar in both CSS modules | Met |\n| Mobile InlinePanel unchanged | Met |\n| Unit tests (7 cases) | Partially met (10 helper tests, 0 component tests) |\n| Design tokens (not hardcoded values) | Partially met (Finding 3) |\n| Vendor prefix ordering (-webkit- before standard) | N/A (no backdrop-filter in new CSS) |\n\n---\n\n### Summary\n\nThe component structure, API design, integration points, and accessibility attributes are sound. The two high-severity findings (broken transition, mount focus hijack) are both fixable without changing the component's public API. Finding 1 requires removing conditional rendering of children and using CSS to manage content visibility. Finding 2 requires a mount guard ref. Both are localized changes.\n\n**Could not write:** `.lore/reviews/collapse-metadata-sidebar.md` (no write tool available). Review delivered in this commission result."
  - timestamp: 2026-03-31T05:16:39.071Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Writing review findings to .lore/reviews/collapse-metadata-sidebar.md"
projectName: guild-hall
---
## Review: Collapsible Metadata Sidebar

**Source:** commission-Dalton-20260330-220809
**Files reviewed:** 7 (2 new, 5 modified)
**Plan:** `.lore/plans/ui/collapse-metadata-sidebar.md`

---

### Finding 1: CSS transition is visually broken (HIGH)

**What:** The sidebar children are conditionally rendered (`{!collapsed && ...}` at `CollapsibleSidebar.tsx:88`). When collapsing, React removes the children from the DOM in the same render that applies `.collapsed` (width: 0). The CSS `transition: width 200ms ease` then animates an empty box from 280px to 0. The user sees content vanish instantly, then dead space shrinks.

Expanding is worse. Children render at full width inside a container still at `width: 0`, and the `.collapsed` class is removed in the same render, restoring `overflow-y: auto`. The content pops in at full size while the container grows from 0 to 280px with no clipping.

**Where:** `CollapsibleSidebar.tsx:88`, `CollapsibleSidebar.module.css:7-18`

**Why it matters:** The plan specifies "CSS transitions on width and opacity" with "overflow: hidden during transition to clip content cleanly." The transition exists in CSS but the conditional rendering defeats it. The 200ms animation is invisible on collapse and jarring on expand.

**Fix:** Always render children. Remove the `{!collapsed && ...}` conditional around the children block (lines 88-103). Keep the collapse/expand buttons conditionally rendered. Add `opacity: 0` and `pointer-events: none` to `.collapsed` alongside the existing `width: 0; overflow: hidden`. The children stay in the DOM, `overflow: hidden` clips them during the width transition, and opacity fades them out.

---

### Finding 2: Focus management fires on initial mount (HIGH)

**What:** The focus-management `useEffect` at `CollapsibleSidebar.tsx:59-67` runs on mount because `[collapsed]` is a dependency and `collapsed` has a value (`false`) on first render. The comment on line 65 says "Only run on collapsed changes, not on mount" but the `eslint-disable` on line 66 only suppresses the exhaustive-deps lint warning; it does not prevent the effect from running on mount.

On mount with `collapsed === false`, `collapseButtonRef.current?.focus()` executes, pulling focus to the sidebar collapse button. If the user navigated to this page via keyboard, their focus position is hijacked.

When `storageKey` indicates collapsed state, it gets worse: the mount `useEffect` fires with `collapsed === false` (the default), focusing the collapse button. Then the SSR reconciliation `useEffect` (line 44-48) sets `collapsed` to `true`, triggering the focus effect again, now focusing the expand tab. Two focus jumps on a single page load.

**Where:** `CollapsibleSidebar.tsx:59-67`

**Why it matters:** Unexpected focus movement is an accessibility violation (WCAG 2.4.3 Focus Order). The plan specifies "Focus moves to the collapsed tab when collapsing, and back to the sidebar content area when expanding" but says nothing about mount behavior, which should be inert.

**Fix:** Add a `useRef` to track whether the component has mounted. Skip the focus call on the first render:

```tsx
const hasMounted = useRef(false);

useEffect(() => {
  if (!hasMounted.current) {
    hasMounted.current = true;
    return;
  }
  if (collapsed) {
    expandTabRef.current?.focus();
  } else {
    collapseButtonRef.current?.focus();
  }
}, [collapsed]);
```

---

### Finding 3: Hardcoded color in expandTab border (MEDIUM)

**What:** `CollapsibleSidebar.module.css:45` uses `border: 1px solid rgba(184, 134, 11, 0.3)`. This is a raw RGBA value for the brass color at 30% opacity. Every other component in the codebase references `var(--color-brass)` from the design tokens in `globals.css`. The plan's CSS block contains this same hardcoded value, so the implementation is faithful to the plan, but the plan conflicts with the project convention.

**Where:** `CollapsibleSidebar.module.css:45`

**Why it matters:** If the brass color token changes, this border won't update. The project explicitly uses CSS custom properties for theming.

**Fix:** Use the token. If 30% opacity is needed, consider `color-mix(in srgb, var(--color-brass) 30%, transparent)` or define a token for brass-at-opacity. Multiple components already use raw rgba for this exact color (checked: at least 3 other CSS modules), so this is a codebase-wide pattern worth a separate cleanup pass. Not unique to this PR, but worth noting.

---

### Finding 4: Test coverage covers helpers only, not component behavior (MEDIUM)

**What:** The plan specifies 7 test cases including: renders children when expanded, does not render children when collapsed, toggle button flips state, aria-expanded reflects state, and custom label on expand tab. The implementation tests only `readCollapsed` and `writeCollapsed` (localStorage helpers). No rendered component tests exist.

**Where:** `tests/web/components/ui/CollapsibleSidebar.test.ts`

**Why it matters:** The tested surface is ~10 lines of code (the two helper functions). The untested surface is the entire component: state management, SSR reconciliation, focus management, toggle behavior, aria attributes, and the conditional rendering logic (which contains Finding 1). The decision to skip @testing-library/react because it's not in project dependencies is reasonable, but the gap is significant.

**What to do:** Either add @testing-library/react as a dev dependency (it's the standard React testing tool and this project will need it eventually), or accept the gap and document it. The helpers are tested, the component is not.

---

### Finding 5: Duplicate linked_artifacts in commission artifact (LOW)

**What:** `commission-Dalton-20260330-220809.md` lists every linked artifact twice (lines 12-25). This is the known artifact writer quality issue.

**Where:** `.lore/commissions/commission-Dalton-20260330-220809.md:12-25`

**Why it matters:** Tracked issue. Noting for completeness.

---

### Plan Compliance

| Plan Requirement | Status |
|---|---|
| CollapsibleSidebar component with props interface | Met |
| localStorage persistence per storageKey | Met |
| SSR-safe read via useEffect + startTransition | Met |
| CSS transition on width (200ms ease) | Exists in CSS but ineffective (Finding 1) |
| overflow: hidden during transition | Class applied but children removed from DOM (Finding 1) |
| aria-expanded on toggle buttons | Met |
| aria-label on toggle buttons (Show/Hide) | Met |
| Focus management on toggle | Partially met (fires on mount, Finding 2) |
| writing-mode: vertical-rl on expand tab | Met |
| Wrapper div with className prop for mobile hiding | Met |
| .sidebar → .desktopSidebar in both CSS modules | Met |
| Mobile InlinePanel unchanged | Met |
| Unit tests (7 cases) | Partially met (10 helper tests, 0 component tests) |
| Design tokens (not hardcoded values) | Partially met (Finding 3) |
| Vendor prefix ordering (-webkit- before standard) | N/A (no backdrop-filter in new CSS) |

---

### Summary

The component structure, API design, integration points, and accessibility attributes are sound. The two high-severity findings (broken transition, mount focus hijack) are both fixable without changing the component's public API. Finding 1 requires removing conditional rendering of children and using CSS to manage content visibility. Finding 2 requires a mount guard ref. Both are localized changes.

**Could not write:** `.lore/reviews/collapse-metadata-sidebar.md` (no write tool available). Review delivered in this commission result.
