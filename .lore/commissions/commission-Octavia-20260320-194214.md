---
title: "Commission: Plan: Mail system removal"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for removing the mail system from Guild Hall.\n\n**Context:** The mail system (`daemon/services/mail/`) has never been used by any commission. It adds dead code, a `sleeping` commission status, mail-specific fields in ToolboxResolverContext, capacity management, and event types that pollute the architecture. We're removing it entirely.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 1. Use the deletion checklist there as your starting point.\n\n**This is a removal plan, not a feature spec.** The plan should cover:\n\n1. **Code deletion** — what files, functions, types, config fields, and event types to remove. Be exhaustive. Consult the actual codebase, not just the brainstorm's list.\n2. **Spec and lore updates** — which existing specs reference mail and need updating or archiving. Check `.lore/specs/workers/worker-communication.md` and any other specs that reference mail, send_mail, sleeping status, or mail reader activation.\n3. **CLAUDE.md updates** — strip mail references from the project CLAUDE.md.\n4. **Test deletion** — which test files to delete entirely vs. which need surgical removal of mail-related test cases.\n5. **Phasing** — order the work so each phase leaves the codebase compiling and tests passing. Deletions that break imports need to happen in dependency order.\n6. **Delegation guide** — which phases Dalton implements, which phases Thorne reviews.\n\nDo NOT write a new spec. The existing specs that describe mail are part of what gets cleaned up."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T02:42:14.326Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:42:14.329Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
