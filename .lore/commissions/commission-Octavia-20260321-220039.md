---
title: "Commission: Spec: Triggered commission creation UX"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nTurn the brainstorm at `.lore/brainstorm/triggered-commission-creation-ux.md` into a proper spec. Write it to `.lore/specs/ui/triggered-commission-creation-ux.md`.\n\n## Approach\n\n- Read the brainstorm thoroughly\n- Read the existing commission creation form code to understand the current implementation (look in `web/components/commission/`)\n- Read the triggered commission spec (`.lore/specs/commissions/triggered-commissions.md`) and types for the data model\n- Read the daemon routes for commission creation to understand what API endpoints exist\n- Answer any open questions from the brainstorm yourself based on what you find in the code and specs. Don't leave questions open for the user. Make the call and document your reasoning.\n- Write a complete spec with requirements (REQ IDs), covering the form fields, validation, API integration, and any edge cases\n- Follow the format and style of existing specs in `.lore/specs/`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T05:00:39.549Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T05:00:39.551Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
