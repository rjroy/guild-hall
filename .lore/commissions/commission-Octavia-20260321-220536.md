---
title: "Commission: Spec: Apply meeting view layout pattern to commission and artifact detail views"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nSpec out applying the meeting detail view's layout pattern to the commission detail view and the artifact detail view. Write it to `.lore/specs/ui/detail-view-layout-pattern.md`.\n\n## The pattern to replicate\n\nThe meeting view has a specific layout feel that the user loves:\n1. **Locked header** that stays fixed at the top of the viewport\n2. **Locked footer** (input area) that stays fixed at the bottom\n3. **Scrollable middle area** where the content lives, scrolling independently between the fixed header and footer\n4. **Condensing header** that collapses to a compact form as you scroll\n5. **Proper colorization** matching the fantasy theme\n\nThis creates an app-like feel where the chrome stays put and the content scrolls. The user wants this same feel for commission and artifact detail views.\n\n## What to read\n\n1. **Meeting view implementation** (the reference):\n   - `web/components/meeting/MeetingView.tsx` and its CSS module\n   - `web/components/meeting/MeetingHeader.tsx` and its CSS module\n   - `web/app/projects/[name]/meetings/[id]/page.tsx`\n   - Understand the viewport-locking, condensing header, and scrollable content area\n\n2. **Commission detail view** (needs the pattern):\n   - `web/components/commission/CommissionView.tsx` and its CSS module\n   - `web/app/projects/[name]/commissions/[id]/page.tsx`\n   - Understand what it currently looks like and what would change\n\n3. **Artifact detail view** (needs the pattern):\n   - `web/components/artifacts/` or similar\n   - `web/app/projects/[name]/artifacts/[...path]/page.tsx`\n   - Understand what it currently looks like and what would change\n\n4. **Any CSS tweaks the user made post-implementation** on the meeting view. Look at recent git history for the meeting CSS files to capture the final tuned state, not just the initial implementation.\n\n## Spec requirements\n\n- Define the shared layout pattern abstractly (what's the contract: fixed header, scrollable body, optional fixed footer)\n- Spec the commission detail view adaptation (what's the header content, what scrolls, does it have a footer?)\n- Spec the artifact detail view adaptation (what's the header content, what scrolls, does it have a footer?)\n- Address what \"condensing\" means for each view (commission header might condense differently than meeting header)\n- Address colorization\n- Consider whether this pattern should be extracted as a shared layout component or if each view implements it independently\n- Answer open questions yourself based on what you find in the code. Don't leave decisions for the user.\n- Follow the format and style of existing specs in `.lore/specs/`, with REQ IDs"
dependencies: []
linked_artifacts:
  - .lore/specs/ui/detail-view-layout-pattern.md

activity_timeline:
  - timestamp: 2026-03-22T05:05:36.415Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T05:05:36.416Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T05:05:36.465Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T05:05:44.600Z
    event: progress_report
    reason: "Reading reference implementation (meeting view) and target views (commission, artifact) to understand the current state before writing the spec."
  - timestamp: 2026-03-22T05:07:00.660Z
    event: progress_report
    reason: "Finished reading all source material: meeting view (reference), commission view, artifact view, CSS modules, and existing spec format. Now writing the spec."
  - timestamp: 2026-03-22T05:09:23.700Z
    event: result_submitted
    reason: "Wrote the spec at `.lore/specs/ui/detail-view-layout-pattern.md`. \n\nThe spec defines:\n\n1. **The abstract pattern** (CSS contract for viewport-locked column layout with condensing header, scrollable body, optional footer) so future views can adopt it.\n\n2. **Commission detail view adaptation** (REQ-DVL-1 through REQ-DVL-12): Viewport lock on `.commissionView`, condensing `CommissionHeader` (client component conversion, gem + title + status in condensed row, breadcrumb hidden when condensed), NeighborhoodGraph stays in fixed zone, main and sidebar scroll independently. No footer needed.\n\n3. **Artifact detail view adaptation** (REQ-DVL-20 through REQ-DVL-32): Structural change from flat row to column-first layout (provenance bar moves out of `.main` into fixed header zone), viewport lock, condensing `ArtifactProvenance` (breadcrumb-only condensed state, source row hidden), meeting banner in fixed zone, image artifacts included. No footer needed.\n\nKey decisions made:\n- **Independent implementation** over shared component (pattern is small, content differs too much)\n- **No sidebar relocation** for commission/artifact (unlike meetings, their sidebars are compact enough to stack)\n- **No footer pinning** for commission notes (occasional action, not primary interaction)\n- **NeighborhoodGraph stays fixed** (navigation context shouldn't scroll away)\n- **Breadcrumb hidden in condensed commission header** (title + gem provide sufficient context; 4-segment breadcrumb doesn't fit in 56px)\n- **Source row hidden in condensed artifact provenance** (it's currently a stub anyway)"
  - timestamp: 2026-03-22T05:09:28.007Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all source material: meeting view (reference), commission view, artifact view, CSS modules, and existing spec format. Now writing the spec."
projectName: guild-hall
---
Wrote the spec at `.lore/specs/ui/detail-view-layout-pattern.md`. 

The spec defines:

1. **The abstract pattern** (CSS contract for viewport-locked column layout with condensing header, scrollable body, optional footer) so future views can adopt it.

2. **Commission detail view adaptation** (REQ-DVL-1 through REQ-DVL-12): Viewport lock on `.commissionView`, condensing `CommissionHeader` (client component conversion, gem + title + status in condensed row, breadcrumb hidden when condensed), NeighborhoodGraph stays in fixed zone, main and sidebar scroll independently. No footer needed.

3. **Artifact detail view adaptation** (REQ-DVL-20 through REQ-DVL-32): Structural change from flat row to column-first layout (provenance bar moves out of `.main` into fixed header zone), viewport lock, condensing `ArtifactProvenance` (breadcrumb-only condensed state, source row hidden), meeting banner in fixed zone, image artifacts included. No footer needed.

Key decisions made:
- **Independent implementation** over shared component (pattern is small, content differs too much)
- **No sidebar relocation** for commission/artifact (unlike meetings, their sidebars are compact enough to stack)
- **No footer pinning** for commission notes (occasional action, not primary interaction)
- **NeighborhoodGraph stays fixed** (navigation context shouldn't scroll away)
- **Breadcrumb hidden in condensed commission header** (title + gem provide sufficient context; 4-segment breadcrumb doesn't fit in 56px)
- **Source row hidden in condensed artifact provenance** (it's currently a stub anyway)
