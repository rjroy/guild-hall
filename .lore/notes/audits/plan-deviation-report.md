# Plan Deviation Report

Audit of `.lore/plans/` for documented deviations from specs. Companion to `spec-audit-report.md`, which audited specs against the codebase. This report audits plans against specs: where did a plan decide to deviate from what a spec required?

## Summary

| Plan Group | Plans | With Deviations | Deviation Count |
|------------|-------|-----------------|-----------------|
| Foundation (phases 1-7) | 7 | 6 | 29 |
| Feature plans | 16 | 4 | 5 |
| Toolbox refactor | 8 | 2 | 3 |
| **Total** | **31** | **12** | **37** |

All 37 deviations are explicitly documented in plan text with rationale. None are silent omissions.

## Deviation Types

| Type | Count | Description |
|------|-------|-------------|
| Deferred | 19 | Spec requirement acknowledged, pushed to a later phase |
| Simplified | 6 | Partial implementation, reduced scope |
| Replaced | 5 | Different mechanism than spec described |
| Extended beyond spec | 2 | Plan adds something the spec didn't call for |
| Design decision modifying assumption | 3 | Spec assumed X, plan chose Y for pragmatic reasons |
| Accepted tradeoff | 1 | Bug fix introduced a secondary information loss |

Note: One deviation (Finding F5.26) appears in both "replaced" and "design decision" categories.

## Already Known

The spec audit report already identified these themes. The plan deviations confirm where the decisions were made:

- **In-process sessions vs. OS processes** (spec audit: REQ-COM-9, REQ-COM-12). Plan source: `in-process-commissions.md` explicitly replaces REQ-COM-10.
- **Activity state machine split** (spec audit: ~11 ASM requirements superseded). Plan source: `activity-state-machine.md` extends REQ-ASM-10 with `abandoned` state; `commission-layer-separation.md` extends the transition graph.
- **CLS integration wiring** (spec audit: REQ-CLS-28/29/30a/30b partial). Plan source: `commission-layer-separation.md` documents these as deferred verification items.

## New Findings

These deviations are documented in plans but were not called out in the spec audit report.

### Toolbox contract deviations (workers spec)

**REQ-WKR-8**: Spec says "workers do not declare [system toolboxes]; the system provides them." Plan `toolbox-refactor/toolbox-system-registry.md` adds `systemToolboxes: ["manager"]` to the manager's WorkerMetadata. The manager now declares its system toolbox rather than the system injecting it. This inverts the spec's stated intent.

**REQ-WKR-26**: Related to above. The spec implies structural exclusivity for the manager toolbox (system decides who gets it). The plan implements runtime eligibility validation instead (worker declares, system validates). The exclusivity outcome is preserved but the mechanism changed.

**REQ-WKR-6a**: Spec says "a toolbox package exports a collection of tool definitions." Plan `toolbox-refactor/toolbox-domain-loading.md` implements it as a factory function (`toolboxFactory`) that returns a fully constructed MCP server. Package authors get more control, but the contract shape differs from what the spec envisioned.

### Timeline event type change (CLS spec)

**REQ-CLS-32**: Spec says "timeline format preserved." Plan `commission-layer-separation.md` drops the `manager_dispatched` event type from new timelines, replacing it with attribution in the dispatch reason string. The plan argues this doesn't violate the spec because the format is preserved and the spec doesn't freeze event types. Whether that reading holds is debatable.

### Commission transition graph extensions

**REQ-COM-6 / REQ-CLS-6**: The commission spec's transition graph doesn't include `dispatched -> cancelled`. Plan `commission-layer-separation.md` adds it (to support cancellation during workspace preparation). This is an extension, not a contradiction, but the spec graph is now incomplete.

### Tool display fidelity tradeoff

`fix-duplicate-tool-notifications.md` fixes a duplicate display bug but introduces a secondary loss: tool input shows `{}` during streaming instead of the full parameters. No REQ-ID involved, but it's a documented acceptance of degraded behavior. Accumulating `input_json_delta` is noted as a follow-up enhancement.

## Foundation Phase Deferrals (Resolved)

The foundation plans (phases 1-7) contain 19 deferrals. These are the phased rollout of spec requirements across implementation phases. Nearly all were resolved by Phase 7. Included here for completeness but these are not live gaps.

### Git integration (resolved Phase 5)
Phases 1-4 used temp directories instead of git worktrees. Phase 5 introduced real git isolation.
- REQ-SYS-22/28/29/29a (git branch strategy, worktrees)
- REQ-SYS-37 (register command creates integration worktree)
- REQ-MTG-8 (meeting creation git steps)
- REQ-COM-30 (re-dispatch branch preservation)

### Commission hardening (resolved Phase 7)
- REQ-COM-7 (dependency auto-transitions)
- REQ-COM-21/22/23 (concurrent limits with FIFO queue)
- REQ-COM-27/28/29 (crash recovery)

### Memory system (resolved Phase 7)
- REQ-SYS-20 (worker memory scope privacy)
- REQ-WKR-22 (memory injection from three scopes)

### Manager-dependent features (resolved Phase 6)
- REQ-VIEW-13 (Quick Comment)
- REQ-VIEW-17 ("Start Audience with Guild Master" button)
- REQ-VIEW-24 (Manager Notes tab)

### Dependency visualization (resolved Phase 7)
- REQ-VIEW-14 (commission dependency DAG)
- REQ-VIEW-22 (commission neighborhood graph)

### Other resolved deferrals
- REQ-MTG-9 (concurrent accept race / TOCTOU, resolved Phase 7)
- REQ-MTG-30 (state isolation proof, resolved Phase 7)
- REQ-SYS-23 (PR creation from claude to master, resolved Phase 6)

## Architectural Design Decisions

These are pragmatic choices documented in plans that modify spec assumptions. They're not gaps; they're intentional divergences that worked out.

**Phase 1 daemon bypass**: Phase 1 wrote artifacts directly from Next.js API routes. The spec's "daemon owns all writes" principle was suspended because there was no daemon yet. Resolved in Phase 2.

**Manager as daemon built-in**: REQ-SYS-31 says workers are bun packages. The manager is built into daemon code and injected as a synthetic DiscoveredPackage. Pragmatic: the manager needs direct access to daemon internals that external packages can't reach.

**Manager scoped to one project**: REQ-SYS-16 says the manager knows "all active workspaces." Implementation scopes the manager to one project per meeting. Cross-project coordination requires separate meetings.

**Meeting request artifacts write to integration worktree**: REQ-SYS-25 / REQ-MTG-27 assume workers write to their activity worktree. Meeting requests write directly to the integration worktree so they're immediately visible. Pragmatic UX choice.

**Manager Notes as timeline entries**: REQ-VIEW-24 implies Manager Notes might be a distinct data structure. Implementation uses timeline entries with a `manager_note` event type filtered into a tab view. Simpler data model, same user-facing behavior.

## What This Means for the Specs

The plan deviations fall into three categories of action:

1. **Specs that need updating** (new findings): REQ-WKR-8 (system toolbox declaration model), REQ-WKR-6a (toolbox export contract), REQ-WKR-26 (exclusivity mechanism), REQ-COM-6 (transition graph needs `dispatched -> cancelled`). These are cases where the implementation is correct but the spec describes something different.

2. **Specs that could use a note** (judgment call): REQ-CLS-32 (timeline event type change), REQ-SYS-16 (manager project scope), REQ-SYS-31 (manager as built-in). These are defensible readings of the spec, but a reader comparing spec to code would be confused without a note.

3. **Already tracked** (from spec audit report): REQ-COM-9/10/12 (in-process sessions), REQ-COM-15 (cancellation model), ASM commission-specific requirements (superseded by CommissionLifecycle). The plan audit confirms where these decisions were made.
