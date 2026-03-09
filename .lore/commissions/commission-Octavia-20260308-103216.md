---
title: "Commission: Specify mail reader toolbox from JMAP research"
date: 2026-03-08
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The research at `.lore/research/fastmail-jmap-integration.md` covers Fastmail's JMAP API, authentication, TypeScript implementation patterns, and feasibility for a Guild Hall toolbox.\n\nWrite a spec at `.lore/specs/guild-hall-mail-reader-toolbox.md` defining what a mail reader toolbox would be. The research covers the protocol and API surface; your job is to define the toolbox itself: what tools it exposes to workers, how it fits into the existing toolbox resolver pattern, token management, scope/permissions, and how workers would use it.\n\nKey context from the research:\n- JMAP is HTTP + JSON, no library needed (~200 lines of client wrapper)\n- API tokens via `Authorization: Bearer {token}`, requires Fastmail Individual plan ($6/mo)\n- The research recommends starting read-only to limit blast radius\n- Three implementation options were explored: custom toolbox package, wrap existing MCP server, or hybrid\n- Existing toolbox resolver pattern: `SYSTEM_TOOLBOX_REGISTRY` maps names to `ToolboxFactory` functions, factories receive `GuildHallToolboxDeps`\n\nReference the existing toolbox and worker specs (`.lore/specs/`) for conventions and REQ-ID format. The spec should cover: tool definitions, configuration, security model, which workers get access and how, and success criteria."
dependencies: []
linked_artifacts:
  - .lore/specs/guild-hall-mail-reader-toolbox.md

activity_timeline:
  - timestamp: 2026-03-08T17:32:16.239Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:37:22.983Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-08T17:37:23.016Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-08T17:37:32.022Z
    event: progress_report
    reason: "Starting spec work. Reading the research document, existing specs for conventions, and the toolbox resolver code."
  - timestamp: 2026-03-08T17:39:01.121Z
    event: progress_report
    reason: "Context gathering complete. Read the research doc, toolbox resolver code, toolbox types, existing specs (workers, commissions, worker roster, worker communication, domain plugins), and the base/mail toolbox implementations. Now drafting the spec."
  - timestamp: 2026-03-08T17:45:38.457Z
    event: progress_report
    reason: "Spec written, verified against codebase, reviewed by fresh-context sub-agent, and revised to address three priority findings (toolbox metadata schema example, session URL testability, misleading token source in REQ-EMT-2) plus four minor improvements (cache staleness note, search filter semantics, get_thread test coverage, success criterion wording)."
  - timestamp: 2026-03-08T17:45:53.100Z
    event: result_submitted
    reason: "Wrote the mail reader toolbox spec at `.lore/specs/guild-hall-mail-reader-toolbox.md`. The spec defines `guild-hall-email`, a domain toolbox package that gives workers read-only access to the user's Fastmail inbox via JMAP.\n\nKey decisions:\n- **Four tools**: `search_emails`, `read_email`, `list_mailboxes`, `get_thread`. All read-only.\n- **Domain toolbox pattern**: Package in `packages/guild-hall-email/`, exports `toolboxFactory`, workers opt in via `domainToolboxes: [\"guild-hall-email\"]`. No changes to the toolbox resolver or system toolboxes.\n- **Token via environment**: `FASTMAIL_API_TOKEN` env var. Soft failure when absent (tools return config error, worker still activates). Session URL injectable for testability.\n- **Security model**: Two layers. Fastmail token scope (hard boundary) plus tool-level read-only constraint (defense in depth). Shared token across workers, appropriate for single-user system.\n- **Scope deliberately limited**: No sending, no attachments, no push, no multi-account, Fastmail-specific. Read-only limits blast radius per the research recommendation.\n- **Naming**: \"email\" (not \"mail\") to distinguish from worker-to-worker mail system (REQ-MAIL).\n\n25 requirements (REQ-EMT-1 through REQ-EMT-25) covering package structure, tool definitions, JMAP client behavior, configuration, security, worker integration, and error handling. Verified all technical claims against source code. Fresh-context spec review caught three issues that were addressed: missing `toolboxMetadataSchema` fields, session URL testability, and misleading token source wording."
  - timestamp: 2026-03-08T17:46:04.426Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec written, verified against codebase, reviewed by fresh-context sub-agent, and revised to address three priority findings (toolbox metadata schema example, session URL testability, misleading token source in REQ-EMT-2) plus four minor improvements (cache staleness note, search filter semantics, get_thread test coverage, success criterion wording)."
projectName: guild-hall
---
Wrote the mail reader toolbox spec at `.lore/specs/guild-hall-mail-reader-toolbox.md`. The spec defines `guild-hall-email`, a domain toolbox package that gives workers read-only access to the user's Fastmail inbox via JMAP.

Key decisions:
- **Four tools**: `search_emails`, `read_email`, `list_mailboxes`, `get_thread`. All read-only.
- **Domain toolbox pattern**: Package in `packages/guild-hall-email/`, exports `toolboxFactory`, workers opt in via `domainToolboxes: ["guild-hall-email"]`. No changes to the toolbox resolver or system toolboxes.
- **Token via environment**: `FASTMAIL_API_TOKEN` env var. Soft failure when absent (tools return config error, worker still activates). Session URL injectable for testability.
- **Security model**: Two layers. Fastmail token scope (hard boundary) plus tool-level read-only constraint (defense in depth). Shared token across workers, appropriate for single-user system.
- **Scope deliberately limited**: No sending, no attachments, no push, no multi-account, Fastmail-specific. Read-only limits blast radius per the research recommendation.
- **Naming**: "email" (not "mail") to distinguish from worker-to-worker mail system (REQ-MAIL).

25 requirements (REQ-EMT-1 through REQ-EMT-25) covering package structure, tool definitions, JMAP client behavior, configuration, security, worker integration, and error handling. Verified all technical claims against source code. Fresh-context spec review caught three issues that were addressed: missing `toolboxMetadataSchema` fields, session URL testability, and misleading token source wording.
