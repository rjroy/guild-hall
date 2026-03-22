---
title: "Commission: Spec: Apply meeting view layout pattern to commission and artifact detail views"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nSpec out applying the meeting detail view's layout pattern to the commission detail view and the artifact detail view. Write it to `.lore/specs/ui/detail-view-layout-pattern.md`.\n\n## The pattern to replicate\n\nThe meeting view has a specific layout feel that the user loves:\n1. **Locked header** that stays fixed at the top of the viewport\n2. **Locked footer** (input area) that stays fixed at the bottom\n3. **Scrollable middle area** where the content lives, scrolling independently between the fixed header and footer\n4. **Condensing header** that collapses to a compact form as you scroll\n5. **Proper colorization** matching the fantasy theme\n\nThis creates an app-like feel where the chrome stays put and the content scrolls. The user wants this same feel for commission and artifact detail views.\n\n## What to read\n\n1. **Meeting view implementation** (the reference):\n   - `web/components/meeting/MeetingView.tsx` and its CSS module\n   - `web/components/meeting/MeetingHeader.tsx` and its CSS module\n   - `web/app/projects/[name]/meetings/[id]/page.tsx`\n   - Understand the viewport-locking, condensing header, and scrollable content area\n\n2. **Commission detail view** (needs the pattern):\n   - `web/components/commission/CommissionView.tsx` and its CSS module\n   - `web/app/projects/[name]/commissions/[id]/page.tsx`\n   - Understand what it currently looks like and what would change\n\n3. **Artifact detail view** (needs the pattern):\n   - `web/components/artifacts/` or similar\n   - `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n   - Understand what it currently looks like and what would change\n\n4. **Any CSS tweaks the user made post-implementation** on the meeting view. Look at recent git history for the meeting CSS files to capture the final tuned state, not just the initial implementation.\n\n## Spec requirements\n\n- Define the shared layout pattern abstractly (what's the contract: fixed header, scrollable body, optional fixed footer)\n- Spec the commission detail view adaptation (what's the header content, what scrolls, does it have a footer?)\n- Spec the artifact detail view adaptation (what's the header content, what scrolls, does it have a footer?)\n- Address what \"condensing\" means for each view (commission header might condense differently than meeting header)\n- Address colorization\n- Consider whether this pattern should be extracted as a shared layout component or if each view implements it independently\n- Answer open questions yourself based on what you find in the code. Don't leave decisions for the user.\n- Follow the format and style of existing specs in `.lore/specs/`, with REQ IDs"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T05:05:36.415Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T05:05:36.416Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
