---
title: "Commission: Implement: Artifact Sorting by Status, Date, Title"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement sorting for artifact lists in the web UI. When artifacts are displayed (any view that lists .lore/ artifacts), they should be sorted by three keys in priority order:\n\n1. **Status** (highest priority): Draft > Open > Closed. Draft artifacts surface first, closed sink to the bottom.\n2. **Date** (secondary): Newer before older (descending).\n3. **Title** (tertiary): Alphabetical tiebreaker.\n\nThis is a UI concern. Find where artifacts are read and listed in the web app (`web/` directory), understand how they're currently ordered, and add the sorting logic. The status values come from frontmatter in the artifact markdown files.\n\nKey guidelines:\n- Keep the sorting logic simple and localized. A compare function, not an abstraction.\n- If multiple views list artifacts, apply the sort consistently (ideally one shared sort function).\n- Write tests for the sort logic.\n- If some artifacts lack a status or date field, they should sort after items that have values (don't crash on missing frontmatter fields)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T19:30:07.663Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T19:30:07.663Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
