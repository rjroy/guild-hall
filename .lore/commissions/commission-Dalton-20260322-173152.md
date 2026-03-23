---
title: "Commission: Add collapsible mobile sidebar panels to artifact and commission detail views"
date: 2026-03-23
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nThe meeting detail view has a collapsible bottom panel on mobile (below 768px) that replaces the desktop sidebar. The artifact and commission detail views were migrated toward the same layout pattern but missed this key functional difference: their sidebars just stack below the main content instead of becoming collapsible panels.\n\nAdd the same collapsible inline panel pattern from the meeting view to both the artifact and commission detail views.\n\n## Reference Implementation\n\nThe meeting view's pattern is in:\n- `web/components/meeting/MeetingView.tsx` (lines 53-67 for mobile detection, lines 183-207 for the inline panel)\n- `web/components/meeting/MeetingView.module.css` (lines 52-105 for `.inlinePanel*` styles)\n\nKey behaviors:\n1. Below 768px, the desktop sidebar is hidden entirely\n2. A collapsible panel appears below the main content area with a handle button\n3. The handle shows a label and chevron (e.g., \"Artifacts (3)\")\n4. Panel is **collapsed by default** on mobile\n5. Clicking the handle toggles the panel open/closed\n\n## Changes Needed\n\n### Artifact Detail View\n- File: `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n- CSS: `web/app/projects/[name]/artifacts/[...path]/page.module.css`\n- The `MetadataSidebar` component content needs to become a collapsible panel on mobile\n- The page is currently a server component. You'll need a client wrapper component (similar to how `MeetingView` wraps `ArtifactsPanel`) to manage the expand/collapse state and media query\n- Handle label should be something like \"Details\" since the sidebar contains metadata (status, tags, modules, commissions, actions)\n- The `ImageMetadataSidebar` variant needs the same treatment\n\n### Commission Detail View  \n- File: `web/components/commission/CommissionView.tsx` (already a client component)\n- CSS: `web/components/commission/CommissionView.module.css`\n- The `.sidebar` div contains actions, linked artifacts, and optionally schedule/trigger info\n- On mobile, this should become a collapsible panel with a handle\n- Handle label should be something like \"Details\" or \"Actions &amp; Artifacts\"\n\n### Important\n- Reuse the same visual pattern (border-top, brass handle, chevron rotation) from the meeting view\n- Don't duplicate CSS. Consider whether the inline panel styles should be extracted to a shared CSS module or the Panel component\n- The desktop layout (side-by-side) must remain unchanged\n- Test that both collapsed and expanded states work correctly"
dependencies: []
linked_artifacts:
  - web/components/ui/InlinePanel.tsx

  - web/components/ui/InlinePanel.module.css
  - web/components/artifact/ArtifactDetailLayout.tsx
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/MeetingView.module.css
  - web/components/commission/CommissionView.tsx
  - web/components/commission/CommissionView.module.css
  - web/app/projects/[name]/artifacts/[...path]/page.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.module.css
  - web/components/ui/InlinePanel.module.css
  - web/components/artifact/ArtifactDetailLayout.tsx
  - web/components/meeting/MeetingView.tsx
  - web/components/meeting/MeetingView.module.css
  - web/components/commission/CommissionView.tsx
  - web/components/commission/CommissionView.module.css
  - web/app/projects/[name]/artifacts/[...path]/page.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.module.css
activity_timeline:
  - timestamp: 2026-03-23T00:31:52.142Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-23T00:31:52.145Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-23T00:31:52.194Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-23T00:31:57.808Z
    event: progress_report
    reason: "Reading reference implementation and target files."
  - timestamp: 2026-03-23T00:32:18.804Z
    event: progress_report
    reason: "Creating shared InlinePanel component, then wiring it into CommissionView and a new ArtifactDetailLayout client wrapper."
  - timestamp: 2026-03-23T00:36:00.341Z
    event: result_submitted
    reason: "Added collapsible inline panel pattern to artifact and commission detail views, matching the meeting view's mobile behavior.\n\n**Created:**\n- `web/components/ui/InlinePanel.tsx` + `.module.css` - shared collapsible panel component (brass handle, chevron rotation, collapsed by default)\n- `web/components/artifact/ArtifactDetailLayout.tsx` - client wrapper for the server-rendered artifact page, handles mobile detection and conditional rendering\n\n**Modified:**\n- `web/components/meeting/MeetingView.tsx` - refactored to use shared InlinePanel, removed duplicated inline panel state/markup\n- `web/components/meeting/MeetingView.module.css` - removed inline panel styles (now in shared component)\n- `web/components/commission/CommissionView.tsx` - added mobile detection, extracted sidebar content, renders InlinePanel on mobile\n- `web/components/commission/CommissionView.module.css` - removed mobile stacking media query (no longer needed)\n- `web/app/projects/[name]/artifacts/[...path]/page.tsx` - uses ArtifactDetailLayout instead of direct div structure\n- `web/app/projects/[name]/artifacts/[...path]/page.module.css` - removed mobile stacking media query\n\nAll three views now follow the same pattern: desktop shows side-by-side layout, mobile (<=768px) hides sidebar and shows a collapsible InlinePanel below the main content. Typecheck, lint, and all 3264 tests pass."
  - timestamp: 2026-03-23T00:36:04.590Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Creating shared InlinePanel component, then wiring it into CommissionView and a new ArtifactDetailLayout client wrapper."
projectName: guild-hall
---
Added collapsible inline panel pattern to artifact and commission detail views, matching the meeting view's mobile behavior.

**Created:**
- `web/components/ui/InlinePanel.tsx` + `.module.css` - shared collapsible panel component (brass handle, chevron rotation, collapsed by default)
- `web/components/artifact/ArtifactDetailLayout.tsx` - client wrapper for the server-rendered artifact page, handles mobile detection and conditional rendering

**Modified:**
- `web/components/meeting/MeetingView.tsx` - refactored to use shared InlinePanel, removed duplicated inline panel state/markup
- `web/components/meeting/MeetingView.module.css` - removed inline panel styles (now in shared component)
- `web/components/commission/CommissionView.tsx` - added mobile detection, extracted sidebar content, renders InlinePanel on mobile
- `web/components/commission/CommissionView.module.css` - removed mobile stacking media query (no longer needed)
- `web/app/projects/[name]/artifacts/[...path]/page.tsx` - uses ArtifactDetailLayout instead of direct div structure
- `web/app/projects/[name]/artifacts/[...path]/page.module.css` - removed mobile stacking media query

All three views now follow the same pattern: desktop shows side-by-side layout, mobile (<=768px) hides sidebar and shows a collapsible InlinePanel below the main content. Typecheck, lint, and all 3264 tests pass.
