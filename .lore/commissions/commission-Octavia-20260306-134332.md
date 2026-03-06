---
title: "Commission: Spec: Artifact Sorting by Status, Date, and Title"
date: 2026-03-06
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "A previous attempt to implement artifact sorting failed because the requirements weren't grounded in the actual codebase. Your job is to fix that.\n\n**What to do:**\n\n1. **Excavate the current state.** Read the code that fetches, lists, and displays artifacts in the UI. Understand:\n   - Where artifacts are loaded (server components, lib functions, etc.)\n   - What data is available at each point (frontmatter fields, file metadata, parsed types)\n   - How artifacts are currently ordered (if at all)\n   - Which views display artifact lists (dashboard, project pages, artifact browsers, commission/meeting views)\n   - What Zod schemas or types define artifact shape\n\n2. **Identify the sorting surfaces.** Not every list of artifacts needs the same sort. Some are timelines (chronological makes sense), some are browsing views (status grouping makes sense). Document each surface and what sort order would serve its purpose.\n\n3. **Write a spec** that covers:\n   - What fields are available for sorting (status, date, title, type, etc.)\n   - What the default sort should be for each view/surface\n   - Whether sorting should be user-configurable or fixed per view\n   - Edge cases: missing dates, missing status, mixed artifact types in one list\n   - Requirements with REQ IDs following existing project conventions\n\nGround every requirement in what the code says, not assumptions. Reference file paths and line numbers where relevant. If a previous sorting attempt exists in the codebase, note what it did and what it got wrong."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T21:43:32.358Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:43:32.360Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
