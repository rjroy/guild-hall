---
title: "Commission: Fix: Persist collapsible sidebar state in localStorage"
date: 2026-04-05
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The collapsible metadata sidebar (detailed header / provenance) in the detail views should persist its collapsed/expanded state in localStorage, matching how other sidebar collapse states work in the app.\n\nInvestigate:\n1. How existing sidebar collapse states are stored in localStorage (search for localStorage usage related to sidebar/collapse in `web/` components)\n2. The CollapsibleSidebar component and where its state is managed\n3. Follow the same pattern: a localStorage key, read on mount, write on toggle\n\nThis should be a small change: read initial state from localStorage, persist on toggle. Use the same naming convention as other sidebar localStorage keys."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-05T14:12:57.848Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-05T14:12:57.849Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
