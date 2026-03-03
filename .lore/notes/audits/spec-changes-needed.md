# Spec Changes Needed

Unified extraction from three audit reports (spec audit, plan deviation, notes deviation). Each item describes what the spec says, what was built, and the change needed.

Sources: `spec-audit-report.md`, `plan-deviation-report.md`, `notes-deviation-report.md`

## Spec Rewrites

These describe something fundamentally different from what was built. The spec text needs to change, not just get an annotation.

### guild-hall-commissions

**REQ-COM-9** (Dispatch) and **REQ-COM-12** (Process lifecycle): Spec assumes commissions run as separate OS processes with PID tracking. Built as async sessions within the daemon process. Crash detection uses heartbeat + session callbacks, not PID monitoring. Rewrite to describe in-process async model with AbortController.

**REQ-COM-15** (Cancellation): Spec describes 30-second grace period then forceful termination. Built with AbortController that signals the session runner to stop. No two-phase timeout. Rewrite to describe signal-based cancellation.

**REQ-COM-6** (Transition graph): Spec's transition graph doesn't include `dispatched -> cancelled`. Built to support cancellation during workspace preparation. Add the transition.

### guild-hall-workers

**REQ-WKR-8** (System toolbox declaration): Spec says "workers do not declare system toolboxes; the system provides them." Built with `systemToolboxes: ["manager"]` in the manager's WorkerMetadata. The manager declares its system toolbox, the system validates eligibility. Rewrite to describe declaration + validation model.

**REQ-WKR-26** (Manager toolbox exclusivity): Spec implies the system structurally decides who gets the manager toolbox. Built as runtime eligibility validation (worker declares, system validates). Same outcome, different mechanism. Rewrite to describe validation-based exclusivity.

**REQ-WKR-6a** (Toolbox package export): Spec says "a toolbox package exports a collection of tool definitions." Built as a factory function (`toolboxFactory`) that returns a fully constructed MCP server. Rewrite to describe factory contract.
- USER NOTE: Just be careful you don't get tripped by the term "MCP Server". It's not a network server, it just "serves" tools which are traditionally expected as a REST API, even if these are not that at all. They are a set of functions.

### activity-state-machine

**REQ-ASM-19** (enter pending from blocked) and **REQ-ASM-20** (enter blocked from pending): Spec says these dependency transitions go through the machine. Built with `checkDependencyTransitions` moving commissions between blocked and pending without the machine, because they haven't been dispatched yet. Machine governs post-dispatch lifecycle only. Rewrite to define machine scope as post-dispatch, or document the pre-dispatch bypass.

**REQ-ASM-14** (enter in_progress fires SDK session): Spec says SDK session launches inside the enter handler. Built to launch after the machine transition returns, outside the handler. Reason: async generator streaming requires yield after transition, not inside a handler callback. Rewrite handler placement model to accommodate streaming.

**~11 commission-specific ASM requirements**: The ASM spec was written assuming a shared `ActivityMachine` for both meetings and commissions. `CommissionLifecycle` (CLS-10) replaced the machine for commissions. These requirements are satisfied through a different mechanism. Add a section acknowledging the split and pointing to the CLS spec for commission-specific behavior.
- USER NOTE: I still want to re-unify this. the ASM was for both, then we did a major refactor of the commision. Next step (after this doc refresh) will be to do a similiar rewrite of meeting. Then re-unify these.

## Spec Annotations

These are defensible design choices where the spec text is close enough, but a reader comparing spec to code would be confused without a note.

### activity-state-machine

**REQ-ASM-3** (Handler context encapsulation): Spec says the context object is the single mechanism for passing data to handlers. Implementation maintains a separate `trackedEntries` Map alongside the machine. Behavior correct, encapsulation boundary differs. Note the deviation.

**REQ-ASM-17** (enter failed cleanup): Spec says cleanup happens inside the enter handler. Implementation cleans up `trackedEntries` in session code, not via machine lifecycle. Note the split responsibility.

**REQ-ASM-28** (Single entry point for state changes): Spec says the machine's transition method is the single entry point. Recovery count derived from state file scan rather than machine method. Note that recovery operates outside the machine by design (REQ-ASM-31).

**Handler placement pattern** (relates to REQ-ASM-14, escalation, meeting SDK): Three behaviors (SDK session launch, merge conflict escalation, meeting SDK streaming) fire after handlers return, not inside them. The spec's handler placement model doesn't accommodate streaming. Note the pattern and rationale.

### commission-layer-separation

**REQ-CLS-23** (Layer boundaries, implied): `syncStatusToIntegration` in the orchestrator (Layer 5) writes to the integration worktree via Layer 1's `recordOps`, bypassing Layer 2's lifecycle. The integration sync copies already-transitioned state to a different path, not a second state transition. Note the bypass and rationale.

**REQ-CLS-32** (Timeline format preserved): Plan drops the `manager_dispatched` event type, replacing it with attribution in the dispatch reason string. The plan argues format is preserved and event types aren't frozen. Note the event type removal.

**REQ-CLS-28/29/30a/30b** (Integration wiring): Code exists for crash recovery, dependency auto-dispatch, merge conflict escalation, and terminal artifact visibility. These are "verify the wiring" items. Note verification status or mark verified after confirmation.

### guild-hall-system

**REQ-SYS-31** (Workers are bun packages): Manager is built into daemon code, injected as a synthetic DiscoveredPackage. Pragmatic: needs direct access to daemon internals. Note the exception.

**REQ-SYS-16** (Manager knows all active workspaces): Implementation scopes the manager to one project per meeting. Cross-project coordination requires separate meetings. Note the scope reduction.

## Not Spec Issues

**Phase 5 SDK read context path**: `additionalDirectories` in `meeting-session.ts` passes `project.path` (repo root) instead of worktree path for SDK read context. Inconsistent with git isolation model but read-only, low risk. This is an implementation consistency question, not a spec gap. Track as a potential fix, not a spec change.

**Tool display fidelity** (`fix-duplicate-tool-notifications`): Tool input shows `{}` during streaming instead of full parameters. No REQ-ID involved. Documented as accepted tradeoff with follow-up enhancement noted.
