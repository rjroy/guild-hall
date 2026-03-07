---
title: "Commission: Research: Fastmail JMAP Integration for TypeScript Toolbox"
date: 2026-03-07
status: completed
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what it would take to connect to Fastmail from TypeScript, with the goal of building a Guild Hall toolbox for email operations.\n\n**Key questions:**\n\n1. **JMAP protocol** — Fastmail uses JMAP (JSON Meta Application Protocol). What is JMAP? How does it differ from IMAP? What are the core operations (read, search, send, labels/folders)?\n\n2. **TypeScript JMAP libraries** — Are there existing TypeScript/JavaScript JMAP client libraries? How mature are they? What's the API surface look like? If no good library exists, how hard is it to use JMAP directly (it's HTTP + JSON, so potentially straightforward)?\n\n3. **Fastmail authentication** — How does auth work? API tokens? OAuth? App-specific passwords? What scopes are available? How do you get an API key/token from Fastmail?\n\n4. **Fastmail-specific JMAP extensions** — Does Fastmail extend JMAP beyond the standard? Any Fastmail-specific capabilities or limitations?\n\n5. **Core operations for a toolbox** — What would the API calls look like for:\n   - Searching/listing emails (by sender, subject, date, folder)\n   - Reading email content\n   - Sending email\n   - Managing folders/labels\n   - Checking for new mail (push notifications or polling?)\n\n6. **Rate limits and quotas** — Any API rate limits? Cost implications? Is JMAP access included in all Fastmail plans?\n\n7. **Security considerations** — Token storage, scope minimization, what permissions are needed for read-only vs read-write access?\n\n**Output:** Write findings to `.lore/research/fastmail-jmap-integration.md`. Include code snippets showing what the TypeScript API calls would look like for core operations. Assess feasibility and effort level for building a toolbox around this."
dependencies: []
linked_artifacts:
  - .lore/research/fastmail-jmap-integration.md

activity_timeline:
  - timestamp: 2026-03-07T15:59:34.821Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T15:59:34.822Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T15:59:34.887Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T15:59:45.806Z
    event: progress_report
    reason: "Starting research on Fastmail JMAP integration. Checking existing .lore/research/ for cached context, then gathering external sources on JMAP protocol, TypeScript libraries, Fastmail auth, and API operations."
  - timestamp: 2026-03-07T16:00:25.369Z
    event: progress_report
    reason: "Core protocol and Fastmail docs gathered. Now investigating TypeScript libraries in more detail, the JMAP mail spec (RFC 8621), and looking at real-world JMAP integration examples."
  - timestamp: 2026-03-07T16:01:25.606Z
    event: progress_report
    reason: "Found critical reference: existing Fastmail MCP servers in TypeScript show proven patterns. Fetching one for implementation details, plus the official Fastmail JMAP-Samples JavaScript code."
  - timestamp: 2026-03-07T16:01:58.948Z
    event: progress_report
    reason: "All primary research gathered. Now synthesizing findings into the research artifact at .lore/research/fastmail-jmap-integration.md with code examples, feasibility assessment, and options with tradeoffs."
  - timestamp: 2026-03-07T16:04:17.107Z
    event: result_submitted
    reason: "Research complete. Findings written to `.lore/research/fastmail-jmap-integration.md`.\n\nKey findings:\n\n1. **JMAP is ideal for this use case.** HTTP + JSON, stateless, batched method calls. Designed for exactly what we'd build. Fastmail created the protocol and it's what their own web client uses.\n\n2. **No library needed.** Existing TypeScript JMAP libraries are either dormant (jmap-client-ts, last release 2022), limited (jmap-yacl, basic auth only), or coupled to Fastmail's Overture framework (jmap-js). Multiple working Fastmail MCP servers prove the pattern: thin `fetch()` wrapper with typed interfaces, ~200 lines of TypeScript.\n\n3. **Auth is simple.** API token created in Fastmail settings, used as `Authorization: Bearer {token}`. Tokens support read-only scope. Requires Individual plan ($6/mo) or higher (not available on Basic).\n\n4. **Fastmail extends JMAP minimally.** Only the Masked Email API is Fastmail-specific. Everything else is standard RFC 8620/8621.\n\n5. **All core operations are straightforward.** The research document includes complete TypeScript code examples for: search/list emails, read email content, send email (two-step: create draft + submit), manage mailboxes, and check for changes (polling and SSE).\n\n6. **Three implementation options presented** with tradeoffs: custom toolbox package (most control), wrap existing MCP server (fastest), or hybrid approach (best of both).\n\n7. **Open questions flagged:** EventSource auth mechanism for push notifications, exact read-operation rate limits, and precise scope of \"read-only\" tokens all need verification during implementation."
  - timestamp: 2026-03-07T16:04:24.474Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All primary research gathered. Now synthesizing findings into the research artifact at .lore/research/fastmail-jmap-integration.md with code examples, feasibility assessment, and options with tradeoffs."
projectName: guild-hall
---
Research complete. Findings written to `.lore/research/fastmail-jmap-integration.md`.

Key findings:

1. **JMAP is ideal for this use case.** HTTP + JSON, stateless, batched method calls. Designed for exactly what we'd build. Fastmail created the protocol and it's what their own web client uses.

2. **No library needed.** Existing TypeScript JMAP libraries are either dormant (jmap-client-ts, last release 2022), limited (jmap-yacl, basic auth only), or coupled to Fastmail's Overture framework (jmap-js). Multiple working Fastmail MCP servers prove the pattern: thin `fetch()` wrapper with typed interfaces, ~200 lines of TypeScript.

3. **Auth is simple.** API token created in Fastmail settings, used as `Authorization: Bearer {token}`. Tokens support read-only scope. Requires Individual plan ($6/mo) or higher (not available on Basic).

4. **Fastmail extends JMAP minimally.** Only the Masked Email API is Fastmail-specific. Everything else is standard RFC 8620/8621.

5. **All core operations are straightforward.** The research document includes complete TypeScript code examples for: search/list emails, read email content, send email (two-step: create draft + submit), manage mailboxes, and check for changes (polling and SSE).

6. **Three implementation options presented** with tradeoffs: custom toolbox package (most control), wrap existing MCP server (fastest), or hybrid approach (best of both).

7. **Open questions flagged:** EventSource auth mechanism for push notifications, exact read-operation rate limits, and precise scope of "read-only" tokens all need verification during implementation.
