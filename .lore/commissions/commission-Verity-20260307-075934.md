---
title: "Commission: Research: Fastmail JMAP Integration for TypeScript Toolbox"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what it would take to connect to Fastmail from TypeScript, with the goal of building a Guild Hall toolbox for email operations.\n\n**Key questions:**\n\n1. **JMAP protocol** — Fastmail uses JMAP (JSON Meta Application Protocol). What is JMAP? How does it differ from IMAP? What are the core operations (read, search, send, labels/folders)?\n\n2. **TypeScript JMAP libraries** — Are there existing TypeScript/JavaScript JMAP client libraries? How mature are they? What's the API surface look like? If no good library exists, how hard is it to use JMAP directly (it's HTTP + JSON, so potentially straightforward)?\n\n3. **Fastmail authentication** — How does auth work? API tokens? OAuth? App-specific passwords? What scopes are available? How do you get an API key/token from Fastmail?\n\n4. **Fastmail-specific JMAP extensions** — Does Fastmail extend JMAP beyond the standard? Any Fastmail-specific capabilities or limitations?\n\n5. **Core operations for a toolbox** — What would the API calls look like for:\n   - Searching/listing emails (by sender, subject, date, folder)\n   - Reading email content\n   - Sending email\n   - Managing folders/labels\n   - Checking for new mail (push notifications or polling?)\n\n6. **Rate limits and quotas** — Any API rate limits? Cost implications? Is JMAP access included in all Fastmail plans?\n\n7. **Security considerations** — Token storage, scope minimization, what permissions are needed for read-only vs read-write access?\n\n**Output:** Write findings to `.lore/research/fastmail-jmap-integration.md`. Include code snippets showing what the TypeScript API calls would look like for core operations. Assess feasibility and effort level for building a toolbox around this."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T15:59:34.821Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T15:59:34.822Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
