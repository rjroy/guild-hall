---
title: "Commission: Meeting Layout Phase 3: Responsive refinements"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 3 of the meeting view layout spec at `.lore/specs/ui/meeting-view-layout.md`.\n\n**Scope:** REQ-MTG-LAYOUT-17 through REQ-MTG-LAYOUT-23.\n\n**Read first:**\n- The spec: `.lore/specs/ui/meeting-view-layout.md` (Phase 3 section, breakpoint summary table, component design notes)\n- `web/components/meeting/MeetingView.tsx` and `.module.css` (after Phase 1 changes)\n- `web/components/meeting/MeetingHeader.tsx` and `.module.css` (after Phase 2 changes)\n- `web/app/projects/[name]/meetings/[id]/page.module.css`\n\n**What to do:**\n\n1. **Header default condensed on tablet (REQ-MTG-LAYOUT-17, 18):** MeetingHeader reads `window.matchMedia('(max-width: 960px)')` at mount. If matches, initial `condensed` state is `true`. Toggle still works in both directions. This is a mount-time default, not reactive to resize.\n\n2. **Sidebar relocation below 768px (REQ-MTG-LAYOUT-19, 20, 21, 23):** MeetingView adds a `matchMedia('(max-width: 768px)')` listener. Below 768px:\n   - Hide `.sidebar` column entirely\n   - Render ArtifactsPanel and Close Audience button inside `.chatArea` as a collapsible panel above the input\n   - Panel collapsed by default, showing \"Artifacts (N)\" handle with chevron\n   - Expanding reveals the artifacts list and close button\n   - The 768px breakpoint in CSS that currently sets `flex-direction: column` changes to hide `.sidebar` instead\n\n3. **Phone close button (REQ-MTG-LAYOUT-22):** Below 480px, add a compact close button in the condensed header bar as a trailing icon. Close button also stays in the relocated panel (both active).\n\n**No information removal.** All sidebar content must be accessible at every breakpoint, just relocated.\n\n**Verify:**\n- Run `bun test` to confirm no regressions\n- Use a fresh-context sub-agent to verify all Phase 3 REQs\n- Check the breakpoint summary table in the spec matches the implementation"
dependencies:
  - commission-Dalton-20260321-095934
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:59:49.257Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:59:49.258Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T17:06:47.196Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T17:06:47.199Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
