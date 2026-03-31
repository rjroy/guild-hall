---
title: "Commission: Review: Collapsible metadata sidebar"
date: 2026-03-31
status: blocked
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the collapsible metadata sidebar implementation.\n\nRead the plan at `.lore/plans/ui/collapse-metadata-sidebar.md` and the issue at `.lore/issues/collapse-metadata-sidebar.md` for context.\n\nReview focus areas from the plan:\n- CSS transition correctness (width animation, overflow hidden during collapse)\n- Accessibility: `aria-expanded`, `aria-label`, focus management\n- localStorage edge cases: SSR hydration, missing key, invalid value\n- Mobile fallback: CollapsibleSidebar hidden at <=768px, InlinePanel unaffected\n- No regressions in existing sidebar content rendering\n- CSS uses project design tokens, not hardcoded values\n- Vendor prefix ordering (project quirk: -webkit- before standard)\n\nReview these files:\n- `web/components/ui/CollapsibleSidebar.tsx`\n- `web/components/ui/CollapsibleSidebar.module.css`\n- `web/components/artifact/ArtifactDetailLayout.tsx`\n- `web/app/projects/[name]/artifacts/[...path]/page.module.css`\n- `web/components/meeting/MeetingView.tsx`\n- `web/components/meeting/MeetingView.module.css`\n- `tests/web/components/ui/CollapsibleSidebar.test.tsx`\n\nWrite findings to `.lore/reviews/collapse-metadata-sidebar.md`."
dependencies:
  - commission-Dalton-20260330-220809
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-31T05:08:17.580Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T05:08:45.317Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
