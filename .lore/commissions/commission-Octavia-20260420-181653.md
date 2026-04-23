---
title: "Commission: Plan for cli-agent-surface spec"
date: 2026-04-21
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the spec at `.lore/specs/infrastructure/cli-agent-surface.md`.\n\nContext:\n- Spec is in draft status, 27 requirements, 1 review round completed 2026-04-19.\n- Key decisions: removes `cliPath` from `OperationDefinition`, makes CLI surface CLI-owned, adds 4 daemon leaf ops (`system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list/read`).\n- Supersedes `cli-commission-commands` REQ-CLI-COM-18/19 on formatter keying.\n- Related draft spec: `.lore/specs/infrastructure/cli-commission-commands.md` — consider whether this plan should subsume or coordinate with that one.\n\nUse the `/lore-development:prep-plan` skill to produce the plan. The plan should:\n1. Break the work into phases with clear boundaries (foundation phases that fan out need review+fix gates before downstream work).\n2. Identify which workers handle which phases (Dalton for implementation, Thorne for reviews).\n3. Call out requirement coverage — every REQ ID in the spec must map to a phase.\n4. Note any spec gaps or ambiguities surfaced during planning; these should go back to the spec, not be papered over in the plan.\n5. Right-size commissions — 2-3 phases per commission max, with explicit dependencies.\n\nOutput the plan to `.lore/plans/infrastructure/cli-agent-surface.md`. Do not dispatch implementation work; this is planning only."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/cli-agent-surface.md

activity_timeline:
  - timestamp: 2026-04-21T01:16:53.428Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T01:16:53.432Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T01:16:53.482Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T01:18:00.591Z
    event: progress_report
    reason: "Read spec, related specs (cli-commission-commands, cli-progressive-discovery), operation-contract design, current CLI code, and OperationDefinition type. Key finding: the spec says \"remove `cliPath` from `OperationDefinition`\" but the field does not currently exist in `lib/types.ts` — likely a spec gap or already handled. Now drafting the plan."
  - timestamp: 2026-04-21T01:29:05.795Z
    event: result_submitted
    reason: "Implementation plan drafted for the CLI agent-first surface spec. The plan at `.lore/plans/infrastructure/cli-agent-surface.md` covers all 27 REQ-CLI-AGENT requirements across 6 phases with 3 Thorne review gates, sized into 9 commissions (C1–C9) with explicit dependencies between Dalton (implementation), Thorne (review), and Octavia (spec back-propagation).\n\nShape:\n- Phase 1 (Dalton): four new daemon leaves — `system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list`, `workspace.issue.read`.\n- Phase 2 (Dalton): `cli/surface.ts` data model, compile-time no-`cliPath` assertion, package-op transitional fallback.\n- Review Gate 1 (Thorne): foundation review before fan-out.\n- Phase 3 (Dalton): CLI-owned help tree with JSON schema for `--json` mode.\n- Phase 4 (Dalton): resolver rewrite, meeting aggregation (REQ-10a), formatter registry refactor from path-keyed to operationId-keyed (superseding REQ-CLI-COM-18/19), daemonFetch DI.\n- Review Gate 2 (Thorne).\n- Phase 5 (Dalton): skill-builder test harness + structural invariants (depth, taboo segments, leaf help).\n- Review Gate 3 (Thorne).\n- Phase 6 (Octavia): back-propagate gaps to the spec.\n\nSeven spec gaps surfaced rather than papered over:\n- G1: REQ-CLI-AGENT-2 is already satisfied — `cliPath` is not present in `lib/types.ts`. Recommend rephrase to \"must not be reintroduced\" plus compile-time guard.\n- G2: Concrete top-level group set proposed (13 groups) to resolve REQ-CLI-AGENT-7's deferred planning decision.\n- G3: Daemon `/help` tree retained for non-CLI clients; CLI owns its own tree downstream.\n- G4: One-shot cutover recommended over phased migration.\n- G5: Stale `/commission/run/continue` and `/commission/run/save` formatter entries to be deleted.\n- G6: `package-op` group as transitional fallback until `cli-package-operation-mapping` spec lands.\n- G7: `commission.schedule.*` / `commission.trigger.*` operations are not present in the current daemon — REQs 21 and 22 will map to future operations and should be flagged as such.\n\nPlan does not subsume the implemented `cli-commission-commands` spec; it coordinates via Phase 6 annotation (only REQ-CLI-COM-18/19 are superseded)."
  - timestamp: 2026-04-21T01:29:09.008Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec, related specs (cli-commission-commands, cli-progressive-discovery), operation-contract design, current CLI code, and OperationDefinition type. Key finding: the spec says \"remove `cliPath` from `OperationDefinition`\" but the field does not currently exist in `lib/types.ts` — likely a spec gap or already handled. Now drafting the plan."
projectName: guild-hall
---
Implementation plan drafted for the CLI agent-first surface spec. The plan at `.lore/plans/infrastructure/cli-agent-surface.md` covers all 27 REQ-CLI-AGENT requirements across 6 phases with 3 Thorne review gates, sized into 9 commissions (C1–C9) with explicit dependencies between Dalton (implementation), Thorne (review), and Octavia (spec back-propagation).

Shape:
- Phase 1 (Dalton): four new daemon leaves — `system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list`, `workspace.issue.read`.
- Phase 2 (Dalton): `cli/surface.ts` data model, compile-time no-`cliPath` assertion, package-op transitional fallback.
- Review Gate 1 (Thorne): foundation review before fan-out.
- Phase 3 (Dalton): CLI-owned help tree with JSON schema for `--json` mode.
- Phase 4 (Dalton): resolver rewrite, meeting aggregation (REQ-10a), formatter registry refactor from path-keyed to operationId-keyed (superseding REQ-CLI-COM-18/19), daemonFetch DI.
- Review Gate 2 (Thorne).
- Phase 5 (Dalton): skill-builder test harness + structural invariants (depth, taboo segments, leaf help).
- Review Gate 3 (Thorne).
- Phase 6 (Octavia): back-propagate gaps to the spec.

Seven spec gaps surfaced rather than papered over:
- G1: REQ-CLI-AGENT-2 is already satisfied — `cliPath` is not present in `lib/types.ts`. Recommend rephrase to "must not be reintroduced" plus compile-time guard.
- G2: Concrete top-level group set proposed (13 groups) to resolve REQ-CLI-AGENT-7's deferred planning decision.
- G3: Daemon `/help` tree retained for non-CLI clients; CLI owns its own tree downstream.
- G4: One-shot cutover recommended over phased migration.
- G5: Stale `/commission/run/continue` and `/commission/run/save` formatter entries to be deleted.
- G6: `package-op` group as transitional fallback until `cli-package-operation-mapping` spec lands.
- G7: `commission.schedule.*` / `commission.trigger.*` operations are not present in the current daemon — REQs 21 and 22 will map to future operations and should be flagged as such.

Plan does not subsume the implemented `cli-commission-commands` spec; it coordinates via Phase 6 annotation (only REQ-CLI-COM-18/19 are superseded).
