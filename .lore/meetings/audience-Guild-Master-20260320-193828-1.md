---
title: "Discussion: Worker Sub-Agents and Mail Removal"
date: 2026-03-21
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Work on realizing some brainstorms"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-21T02:38:28.622Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-21T02:39:56.430Z
    event: renamed
    reason: "Renamed to: Discussion: Worker Sub-Agents and Mail Removal"
  - timestamp: 2026-03-21T14:21:07.258Z
    event: closed
    reason: "User closed audience"
---
GUILD HALL ARCHITECTURE REVIEW: TRIGGERED COMMISSIONS AND WORKER GUIDANCE

The Guild Master and team discussed two major topics. The primary brainstorm addressed triggered commissions—a reactive system for automatically dispatching commissions when specific events occur (e.g., starting a review commission when an implementation commission completes). The discussion covered five core questions: event matching and filtering mechanisms, handling triggered commissions within existing dependency chains, preventing infinite trigger loops, relationships to the existing scheduled commissions system, and approval workflows for triggered dispatches. The team established that triggered commissions solve reactive ("when X happens, do Y") problems, while dependencies solve sequencing ("B must wait for A") problems, and that conflating the two leads to unnecessary complexity. The recommendation is to define full sequences upfront with explicit dependencies rather than using triggers to dynamically modify dependency graphs.

The secondary discussion identified a design issue in the recently shipped worker sub-agents feature: invocation guidance for workers was hardcoded in a lookup table in `sub-agent-description.ts`, when it should instead be declared in each worker's `package.json` as part of `WorkerIdentity`. This change centralizes knowledge with the worker that possesses it, improving maintainability and scalability as workers are added.

DECISIONS AND REASONING

Triggered commissions architecture (near-term): Event matching uses config.yaml alongside existing notification rules. Match patterns can filter by event type and optional projectName, with future support for glob patterns on string fields. When a trigger rule matches, a commission is created with an inline template (worker, prompt, title) and dispatched according to approval mode (auto or confirm). Implementation extends the event router to handle commission dispatch as a third action type alongside shell and webhook notifications. This reuses existing matching and routing logic rather than introducing a separate subscriber.

Loop prevention strategy: Combination of provenance tracking with depth limits (primary mechanism) plus source commission exclusion (secondary guard). Every triggered commission carries a `triggered_by` frontmatter field tracking source commission, trigger rule name, and chain depth. A configurable maximum depth (default 3) prevents runaway chains; commissions at max depth require human approval. This creates an audit trail and catches most accidental cycles while allowing legitimate multi-step trigger sequences.

Interrupt problem resolution: Rather than use triggers to inject dependencies into existing chains, define the full sequence upfront with explicit dependencies. If a user wants "Phase 1 → Review 1 → Fix 1 → Phase 2 → Review 2 → Fix 2," create all commissions and dependencies at planning time. Triggers remain valuable for reactive patterns ("when any Dalton commission fails, dispatch a diagnostic"), but should not be repurposed as a runtime graph modification mechanism. Future planning tools could generate interleaved sequences from compact definitions.

Worker guidance property: Add optional `guidance: string` to `WorkerIdentity` interface and schema. Each worker declares its invocation guidance in `package.json` within the `guildHall.identity` object. The `buildSubAgentDescription` function reads `identity.guidance` instead of consulting a lookup table, with fallback to `identity.description` if absent. This is a fix to the already-implemented worker sub-agents feature (Phases 1-4 complete).

ARTIFACTS PRODUCED AND REFERENCED

Primary artifact: `.lore/brainstorm/triggered-commissions.md` (361 lines, committed) containing the full analysis of all five questions, architectural recommendations, loop prevention strategies, comparison to scheduled commissions, concrete scenario walkthrough, open questions, and three-horizon implementation roadmap.

Secondary artifacts created during discussion:
- `.lore/specs/commissions/triggered-commissions.md` (specification document)
- `.lore/specs/infrastructure/worker-sub-agents.md` (updated worker sub-agents spec with REQ-SUBAG-32 and REQ-SUBAG-33 formalizing the guidance property requirement)
- `.lore/plans/infrastructure/sub-agent-description-fix.md` (implementation plan for moving guidance values from lookup table to package metadata)

COMMISSIONS DISPATCHED

Three commissions chained for the guidance property fix:
1. `commission-Dalton-20260321-020719`: Implement the sub-agent description fix (seven steps: add guidance to WorkerIdentity type and schema, update all eight worker package.json files, refactor buildSubAgentDescription function, update call site in sdk-runner, update existing tests, add new tests for guidance-based description generation)
2. `commission-Thorne-20260321-020726`: Review Dalton's implementation for completeness and correctness
3. `commission-Dalton-20260321-020732`: Fix any findings from Thorne's review

OPEN ITEMS

Triggered commissions roadmap has five open questions requiring future clarification: event enrichment vs. lookup strategy for metadata beyond commissionId and status; whether triggers should have an exit path to artifact-based definitions in `.lore/triggers/`; cross-project trigger semantics; relationship to a reusable commission template system; and testing/validation tooling for trigger rules. Medium-term enhancements include glob pattern matching on event fields, template variable expansion, and a dry-run validation tool. Long-term directions include artifact-based trigger definitions, trigger analytics, trust escalation (auto-promoting from confirm to auto mode after N successful firings), and workflow composition patterns.

Sub-agent description work has no open items; the implementation plan is complete and commissions are in flight.
