---
title: "What's Missing: Guild Hall Capability Gaps (March 2026)"
date: 2026-03-20
status: open
author: Celeste
tags: [brainstorm, roadmap, capabilities, infrastructure]
---

# What's Missing: Guild Hall Capability Gaps

**Vision status:** `approved` (v2, 2026-03-17). Four-step alignment analysis applied to each proposal.

**Context scanned:** Vision document (v2), 12 existing brainstorms (2 open: commission-outcomes-to-memory, replicate-native-toolbox spec deviations), 5 issues (1 open: package-distribution-model), 31 retros, all worker packages (10), daemon services and routes, SDK runner, toolbox resolver, scheduler, memory injector, base toolbox, web UI routes, recent git history (PRs #119-#128), project memory. Event router spec and plan are approved, awaiting implementation. Context type registry spec is approved, awaiting plan.

**Recent brainstorm check:** The March 17 brainstorm (`whats-next-2026-03-17.md`) proposed 6 items. Four are resolved (meeting layer separation, changelog catch-up, vision approval, web-to-daemon constraint removal). Two are open (commission outcomes to memory, artifact provenance tracking). The commission-outcomes-to-memory brainstorm was revised on 2026-03-20 with a Haiku triage approach. Neither is repeated here. The art-director-worker brainstorm is resolved (Sienna/Illuminator shipped in #121).

---

## Proposal 1: Decisions Surface

### Evidence

Workers call `record_decision(question, decision, reasoning)` during commissions and meetings. The tool exists in `daemon/services/base-toolbox.ts` and writes JSONL entries to `~/.guild-hall/state/{contextType}/{contextId}/decisions.jsonl`. The meeting notes generator at `daemon/services/meeting/notes-generator.ts` references decisions.

The problem: no REST endpoint exposes these decisions. The commission routes at `daemon/routes/commissions.ts` list 12 endpoints; none reads decisions. The meeting routes at `daemon/routes/meetings.ts` are the same. The web UI's commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) shows timeline entries and streaming output but not decisions. The meeting detail page is the same.

Decisions are written, then invisible. The user cannot see what reasoning a worker recorded during a commission without manually navigating to state files. Worse, commission state files are deleted after successful completion (`handleSuccessfulCompletion` in `daemon/services/commission/orchestrator.ts` calls cleanup). The decisions die with the state.

The briefing generator (`daemon/services/briefing-generator.ts`) also doesn't include decisions. A worker starting a new commission has no access to decisions made in previous commissions.

### Proposal

Three changes that make decisions visible:

1. **Persist decisions to the commission artifact.** When `handleSessionCompletion` runs, read the decisions JSONL and append a `## Decisions` section to the commission artifact body before state cleanup. The artifact already has timeline entries; decisions are higher-signal than most timeline entries.

2. **Add `GET /commission/:id/decisions` and `GET /meeting/:id/decisions` endpoints.** For active sessions, read from state files. For completed commissions, read from the artifact body.

3. **Show decisions in the web UI detail pages.** A collapsible "Decisions" section below the timeline. Each entry shows the question, the decision, and the reasoning.

### Rationale

Vision Principle 1 says artifacts are the work. Decisions are the *reasoning behind* the work. A commission that produced a spec also made decisions about what to include and what to defer. Those decisions are invisible unless the user reads the full transcript (which doesn't persist for commissions either). Surfacing decisions makes the artifact self-documenting: not just "what was produced" but "what was decided along the way."

### Vision Alignment

1. **Anti-goal check:** No conflict. Decisions surface existing data through existing channels (daemon API, web UI).
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is directly served. Principle 3 (Files Are Truth) is served by persisting decisions to the artifact. Principle 5 (One Boundary) is served by the route going through the daemon.
3. **Tension resolution:** No tension.
4. **Constraint check:** No new infrastructure. JSONL parsing, artifact body appending, and route creation are all established patterns.

### Scope

Small. One lifecycle hook (persist to artifact), two route handlers, one UI component.

---

## Proposal 2: Commission History Search

### Evidence

The commission list endpoint (`GET /commission/request/commission/list`) at `daemon/routes/commissions.ts:320-408` scans all commission artifacts in a project's `.lore/commissions/` directory and returns them sorted by date. The web UI's commission list (`web/app/projects/[name]/page.tsx`) renders them with client-side status filtering.

What's missing: there is no way to query commission history across projects, by worker, by date range, or by outcome. The user cannot ask "what has Dalton completed this week?" or "show me all failed commissions" without visually scanning the list. The Guild Master has `check_commission_status` in `daemon/services/manager/toolbox.ts` but it reads a single commission by ID, not a query.

The briefing generator provides a narrative summary but not a queryable feed. Workers starting a new commission get memory and briefing, neither of which includes a structured view of recent work.

This matters because the user dispatches commissions in batches (the retros show batches of 8-29 commissions). Tracking batch outcomes requires opening commission detail pages one at a time.

### Proposal

Add `GET /commission/request/commission/search` that accepts query parameters: `worker`, `status`, `since`, `until`, and optionally `projectName` (for cross-project queries). Return the same metadata as the list endpoint but with filter support.

On the web side, enhance the commission list filter (already implemented in `web/components/commission/CommissionList.tsx`) with a date range picker and worker selector. The filtering infrastructure already exists; it filters on status but nothing else.

### Rationale

Commission management at scale requires more than a chronological list. The user runs 20+ commissions per session. Answering "did everything from today's batch succeed?" should be a single query, not manual inspection.

### Vision Alignment

1. **Anti-goal check:** No conflict.
2. **Principle alignment:** Principle 5 (One Boundary) served by adding the query to the daemon API. Principle 3 (Files Are Truth) preserved because the query reads from artifact frontmatter, not a separate index.
3. **Tension resolution:** Files (3) vs. Performance is relevant: scanning all commission artifacts per query could be slow for projects with hundreds of commissions. An in-memory cache (loaded at startup, updated on events) resolves this without adding a database.
4. **Constraint check:** No new infrastructure. File scanning and frontmatter parsing already exist in `lib/commissions.ts`.

### Scope

Medium. Route handler, cache layer, web UI filter enhancement.

---

## Proposal 3: Worker Performance Feedback Loop

### Evidence

The system dispatches commissions to specific workers but has no mechanism to track whether workers are performing well at specific task types. The Guild Master selects workers based on declared capabilities in `packages/*/package.json` and the worker roster spec. There is no historical signal.

Concrete gaps:

- No record of how many turns a commission took vs. the maxTurns budget. The halted state (`daemon/services/commission/orchestrator.ts:550-679`) tracks `turnsUsed` but only when a commission halts. Successful commissions don't record turn count in the artifact.
- No record of which commissions required follow-up fix commissions after review. The retros show this pattern repeatedly (Dalton implements, Thorne reviews, Dalton fixes) but nothing tracks it systematically.
- No session duration or cost data persisted. `outcome.turnsUsed` exists in the SDK session result but isn't written to the artifact frontmatter.
- The scheduler (`daemon/services/scheduler/index.ts`) tracks consecutive failures per schedule but not aggregate success rates across scheduled runs.

### Proposal

Persist session metrics to commission artifact frontmatter at completion:

```yaml
session_metrics:
  turns_used: 47
  model: opus
  duration_seconds: 312
  halt_count: 0
```

This is a one-line addition to `handleSessionCompletion` in the orchestrator: write `outcome.turnsUsed` and the model name to the artifact. Duration comes from the execution context (start time already tracked). No new infrastructure.

Over time, these metrics make commission history queryable by efficiency: "which worker completes specs in the fewest turns?" "which task types tend to hit the turn limit?" The Guild Master's dispatch logic could eventually use this signal, but the immediate value is visibility.

### Rationale

The system dispatches 20+ commissions per day. Without metrics, every commission looks the same in the artifact: pending, completed, done. But some completed in 12 turns and some in 119. Some took 2 minutes and some took 40. That variance is invisible. Making it visible lets the user calibrate expectations and the system eventually optimize dispatch.

### Vision Alignment

1. **Anti-goal check:** No conflict. Metrics are observational data, not self-modifying worker identity (anti-goal 4).
2. **Principle alignment:** Principle 3 (Files Are Truth) served by persisting metrics to the artifact. Principle 1 (Artifacts Are the Work) served by enriching the commission record.
3. **Tension resolution:** No tension.
4. **Constraint check:** Data already exists in SDK session results. Persisting it is a frontmatter write.

### Scope

Small. Frontmatter fields added at completion. No new routes or UI required in v1 (the data is visible in the artifact detail view).

---

## Proposal 4: Commission Templates

### Evidence

The Guild Master dispatches commissions with a `prompt` field that contains the full task description. Looking at recent commission prompts in the git history, there are recurring structural patterns:

- **Spec commissions** follow: "Write a spec for [feature]. Read [these files] for context. The spec should cover [requirements]. Write to `.lore/specs/[domain]/[name].md`."
- **Review commissions** follow: "Review the code changes in [these files]. Check against [spec]. Report findings."
- **Implementation commissions** follow: "Implement [spec] following [plan]. The work is in [these files]."
- **Cleanup commissions** follow: "Update references to [old term] across [scope]."

The Guild Master generates these prompts from its own judgment each time. There's no mechanism for the user to define reusable commission templates that encode their preferences for how specific task types should be prompted. When the user dispatches a "write a spec" commission manually, they type the same structural instructions every time.

The retro at `.lore/retros/commission-cleanup-2026-03-18.md` notes that "commission prompts must require verification, not assumption" as a process decision. That instruction lives in project memory. But project memory is narrative text, not a structured template the Guild Master can instantiate.

### Proposal

Add a `~/.guild-hall/templates/` directory (or `.lore/templates/` per project) containing commission prompt templates as markdown files with frontmatter:

```yaml
---
name: spec-commission
worker: Octavia
description: Write a specification for a feature
variables:
  - name: feature
    description: Feature name
  - name: domain
    description: Spec domain subdirectory
  - name: context_files
    description: Files to read for context
---

## Task

Write a specification for {{feature}}.

## Context

Read these files for context:
{{context_files}}

## Requirements

- The spec must include numbered requirements (REQ-XXX-NN format)
- Include success criteria
- Write to `.lore/specs/{{domain}}/{{feature}}.md`
- Use existing specs in the same directory as format reference

## Verification

Run a fresh-context sub-agent review before submission.
```

The Guild Master's `dispatch_commission` tool and the daemon's `POST /commission/request/commission/create` route accept an optional `template` parameter that resolves the template and fills variables from the commission parameters. The user can also reference templates when dispatching manually: "use the spec-commission template for feature X."

### Rationale

Prompt quality determines commission quality. The same spec commission succeeds or fails based on whether the prompt includes verification requirements, format references, and output paths. Templates encode prompt engineering as reusable infrastructure. They turn the user's accumulated wisdom about "what makes a good commission prompt" into something the Guild Master can instantiate.

This is the prompt equivalent of the worker posture pattern: posture encodes how a worker approaches work; templates encode how work should be described when delegated.

### Vision Alignment

1. **Anti-goal check:** No conflict. Templates don't modify worker identity (anti-goal 4). They don't add multi-user features (anti-goal 1).
2. **Principle alignment:** Principle 3 (Files Are Truth) served by storing templates as markdown. Principle 2 (User Decides Direction) served by templates encoding user preferences for how work is delegated. Principle 6 (Tools Are Atomic) is respected: the template is a document, not a smart tool.
3. **Tension resolution:** Metaphor (4) vs. Usability: commission templates fit the guild metaphor naturally (a guild keeps standard forms for common commissions). No tension.
4. **Constraint check:** No new daemon services. Templates are files read at dispatch time. Variable interpolation is string replacement.

### Scope

Medium. Template format definition, file resolution, variable interpolation, Guild Master toolbox integration.

---

## Proposal 5: Cross-Commission Artifact Graph

### Evidence

Commissions declare `linked_artifacts` in their frontmatter, listing paths to files they consumed or produced. The commission record ops at `daemon/services/commission/record.ts` track this. The web UI shows linked artifacts as a list in the commission detail view.

What's missing is the reverse lookup: given an artifact, which commissions created it, modified it, or consumed it? And by extension: given a commission, what was its full upstream and downstream artifact chain?

This matters because the spec/plan/implement/review chain is the system's primary workflow. A spec artifact is consumed by a plan commission, which produces a plan artifact consumed by an implementation commission. But nothing links these together beyond the user's memory. The commission detail page shows "this commission linked these artifacts" but not "these other commissions also reference this artifact."

The artifact detail page (`web/app/projects/[name]/artifacts/[...path]/page.tsx`) shows the artifact content but has no "Referenced by" section. The earlier brainstorm (`whats-next-2026-03-17.md`, Proposal 4) proposed `created_by` frontmatter stamping. This proposal goes further: not just "who created this" but "what chain of work produced and consumed this artifact."

### Proposal

Build a reverse index from artifacts to commissions:

1. **At commission completion**, the orchestrator already knows `linked_artifacts`. Emit this as part of the `commission_result` event (already emitted). No new data needed.

2. **Add `GET /workspace/artifacts/:path/references`** that scans commission artifacts for any that link to the given path. Return commission IDs, worker names, and whether the commission created or consumed the artifact.

3. **Show a "Referenced by" section in the artifact detail web view.** Below the artifact content, list commissions that link to this artifact with their status and worker.

4. **In the commission detail view, make linked artifacts bidirectional.** Each linked artifact shows its own references, so the user can trace the chain: "this spec was consumed by these plan and implementation commissions."

### Rationale

Vision Principle 1 says artifacts are the work. But artifacts in isolation are documents. Artifacts connected by the commissions that produced and consumed them are a knowledge graph. The user can trace how a brainstorm became a spec, became a plan, became code, was reviewed, and was fixed. That provenance chain is the story of how the system worked. Right now, reconstructing it requires reading each commission's frontmatter manually.

### Vision Alignment

1. **Anti-goal check:** No conflict.
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is the primary alignment. Artifacts become navigable as a graph, not just a directory tree. Principle 3 (Files Are Truth) is preserved: the index is derived from existing frontmatter, not a separate store.
3. **Tension resolution:** Files (3) vs. Performance: scanning all commissions per artifact query is O(n). For projects with hundreds of commissions, an in-memory index built from event emissions (like the briefing cache pattern) avoids repeated scans.
4. **Constraint check:** All data exists. Commission artifacts already contain `linked_artifacts`. The reverse lookup is a new read pattern over existing data.

### Scope

Medium. Route handler, reverse index, web UI component. The index could be as simple as a Map built at daemon startup from a commission scan.

---

## Proposal 6: Standing Delegation

### Evidence

The vision's Growth Surface 3 (Worker Growth) includes a carve-out: "when the user has explicitly delegated standing authority for a bounded action (e.g., 'always triage new issues'), the worker may act within that grant." This carve-out exists in the tension resolution table under Autonomous Initiative (GS-3) vs. User Authority (2). The concept is named but no mechanism implements it.

Today, every commission is either manually dispatched (user tells the Guild Master) or scheduled (cron expression in a schedule artifact). There is nothing between "run this at 3am every Tuesday" and "run this right now because I said so." The middle ground, "whenever X happens, do Y," doesn't exist.

The event router (spec approved, plan approved at `.lore/plans/infrastructure/event-router.md`) will route events to notification channels. But notification is one-way: "tell me when a commission fails." Standing delegation is two-way: "when a commission fails, dispatch a diagnostic commission to investigate."

The scheduler at `daemon/services/scheduler/index.ts` already handles recurring work. Commission dependencies (`orchestrator.ts` lines 1030-1076) already handle "run B after A completes." What's missing is event-triggered commission dispatch: "when event X occurs, instantiate template Y and dispatch it."

Concrete scenarios this enables:

- When a review commission completes with findings, auto-dispatch a fix commission to the original worker.
- When a scheduled brainstorm (Celeste) completes, auto-dispatch a triage commission to assess proposals.
- When a commission fails, auto-dispatch a diagnostic commission that reads the failure context.
- When a new `.lore/issues/` file appears on the integration branch, auto-dispatch a triage commission.

### Proposal

Extend the event router (when implemented) with a `dispatch` action type alongside the existing `notify` action. A standing delegation rule in `config.yaml`:

```yaml
notifications:
  - match:
      type: commission_result
      status: completed
    channel: desktop

delegations:
  - match:
      type: commission_result
    condition: "worker === 'Thorne' && artifacts.some(a => a.includes('review'))"
    action:
      template: fix-commission
      variables:
        review_artifact: "{{artifacts[0]}}"
    approval: auto  # or "confirm" for user approval before dispatch
```

The `approval: auto` vs `approval: confirm` field is the trust boundary. `auto` means the system dispatches without asking. `confirm` means the system creates the commission in `pending` state and notifies the user. This respects Vision Principle 2 (User Decides Direction) while enabling the autonomous initiative described in Growth Surface 3.

### Rationale

The implement-review-fix cycle is the system's strongest quality signal (retro `commission-batch-cleanup.md`). Today it requires the Guild Master or user to manually chain these commissions. Dependencies help (`depends_on` in commission frontmatter) but they're set at creation time, not reactively. Standing delegation makes the chain automatic and reliable.

This is where the vision's "Autonomous Initiative" growth surface actually becomes concrete. The guild doesn't just do what you ask; it does what you've agreed it should do when certain things happen.

### Vision Alignment

1. **Anti-goal check:** Anti-goal 3 (general-purpose assistant) is not triggered; standing delegations are bounded, declared, and inspectable. Anti-goal 4 (self-modifying identity) is not triggered; workers don't change, the routing rules do.
2. **Principle alignment:** Principle 2 (User Decides Direction) is served by the `approval` field giving the user control over how much autonomy each delegation carries. Principle 3 (Files Are Truth) served by delegations stored in config. Principle 5 (One Boundary) served by delegation dispatch going through the daemon.
3. **Tension resolution:** Autonomous Initiative (GS-3) vs. User Authority (2) is the defining tension. The `approval` field is the resolution mechanism: the user configures how much they trust each delegation. The vision says "workers can observe, surface, and propose" by default. `approval: confirm` is observe-and-propose. `approval: auto` is the standing grant the tension resolution carve-out describes.
4. **Constraint check:** Depends on event router (approved, awaiting implementation). Depends on commission templates (Proposal 4 above). Both are prerequisites, not blockers. The delegation layer is an extension of the event router, not a separate system.

### Scope

Large. Depends on event router implementation and commission templates. The delegation engine itself is moderate (condition evaluation, template instantiation, dispatch call), but the full dependency chain makes this a multi-commission effort.

---

## Filed Observations

### Decisions Disappear on Commission Completion

This observation feeds Proposal 1 but is worth noting independently: the state cleanup in `handleSuccessfulCompletion` (orchestrator.ts ~line 730) deletes the state directory, which includes `decisions.jsonl`. If decisions aren't persisted to the artifact before cleanup, they're gone permanently. For meetings, `generateMeetingNotes` reads from the transcript, not from the decisions file, so meeting decisions have the same gap.

### Commission Transcripts Don't Persist

Meeting transcripts are stored in state files and displayed in the web UI. Commission transcripts are not stored at all. The SDK session streams events to SSE for real-time display but writes nothing to disk. When a commission completes, the only record of how the worker reasoned is the result summary. This is a significant observability gap but felt too infrastructure-heavy for this brainstorm (it would require changes to the SDK runner's event handling). Worth tracking as a separate issue.

### The Halted Commission UI Gap Persists

The retro at `.lore/retros/commission-cleanup-2026-03-18.md` notes this. The retro at `.lore/retros/commission-cleanup-2026-03-19.md` notes it again. The daemon supports continue/save/abandon for halted commissions since #117. The web UI shows halted status but no action buttons. This is a known gap, not a new observation, but it's becoming more visible as the halt count grows. Filing as a reminder, not a new proposal.

### Memory Budget Visibility

Workers receive a 16,000-character memory budget (`DEFAULT_MEMORY_LIMIT` in `daemon/services/base-toolbox.ts`). When the budget is exceeded, sections are dropped from lowest-priority scope. But workers have no visibility into how much budget they've used. The `read_memory` tool returns content but not a budget report. A worker that writes a large section to project memory might silently displace another worker's content. Adding a `budget_remaining` field to `read_memory` responses would make this visible, but it's a small enough change to note rather than propose.
