---
title: "Commission: Spec: Request Meeting from Artifact sidebar"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for adding a \"Request Meeting\" button to the artifact detail sidebar, alongside the existing \"Create Commission from Artifact\" link.\n\n**Context:**\n- The artifact detail page has a `MetadataSidebar` component (`web/components/artifact/MetadataSidebar.tsx`) that shows metadata and an \"Associated Commissions\" section.\n- Inside that section, there's already a \"Create Commission from Artifact\" link that navigates to the project page with query params to pre-fill the commission form (`?tab=commissions&newCommission=true&dep=<artifactPath>`).\n- We want a parallel \"Request Meeting\" action so users can discuss an artifact interactively when a commission isn't the right tool.\n\n**What the spec should cover:**\n1. Where the button appears in the sidebar (it's a peer action to \"Create Commission,\" not nested inside commissions).\n2. What clicking it does. The existing commission pattern navigates to the project page with query params. The meeting equivalent could follow the same pattern, or it could hit the daemon's meeting initiation endpoint directly. Evaluate both and recommend one.\n3. How the artifact is referenced in the meeting (e.g., as a linked artifact, agenda context, or both).\n4. Worker selection: does the user pick a worker before or after clicking?\n5. Requirements with REQ IDs following the project's existing pattern.\n\n**Reference files to read:**\n- `web/components/artifact/MetadataSidebar.tsx` — current sidebar with commission link\n- `web/components/commission/CreateCommissionButton.tsx` — the commission form toggle pattern\n- `web/app/projects/[name]/page.tsx` — how the commission query params are consumed\n- `.lore/specs/meetings/` — existing meeting specs for REQ ID namespace\n\nKeep the spec focused and concise. This is a small feature, not an architectural change."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:33:21.033Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:33:21.036Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
