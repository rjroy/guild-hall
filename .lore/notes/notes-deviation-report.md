# Notes Deviation Report

Audit of `.lore/notes/` for documented deviations from specs. Third in the audit chain: spec audit (specs vs code), plan deviation (plans vs specs), and now notes (implementation decisions vs specs).

This report surfaces deviations that the implementation notes explicitly document, cross-referenced against what the existing audit reports already captured.

## Summary

| Notes File | Divergences Documented | New (not in prior reports) |
|------------|----------------------|---------------------------|
| activity-state-machine | 6 (divergence section) + 6 (Phase 8 validation) | 8 |
| commission-layer-separation | 1 (divergence section) + 5 (Phase 8 validation) | 2 |
| phase-1-empty-hall | 3 (divergence section) | 0 (plan deviations, not spec) |
| phase-2-workers-first-audience | 4 (divergence section) | 0 (phase deferrals, resolved) |
| phase-5-git-integration | 1 (Phase 10 minor note) | 1 |
| artifact-tree-view | 1 (divergence section) | 0 (plan deviation, not spec) |
| commission-meeting-state-ownership | 0 | 0 |
| multiline-tool-display-on-reopen | 0 | 0 |
| phase-3-meeting-lifecycle | 0 | 0 |
| phase-4-commissions | 0 | 0 |
| phase-6-guild-master | 0 | 0 |
| phase-7-hardening | 0 | 0 |
| simplify-* (4 files) | 0 | 0 |
| **Total** | **~27** | **11** |

## Already Captured

The following deviations are documented in notes but already appear in the spec audit report or plan deviation report. No action needed beyond what those reports recommend.

**Phase deferrals (plan deviation report, "Foundation Phase Deferrals" section):**
- Phase 2 notes: WKR-6/6a/12 (domain toolbox loading), MTG-4/5 (requested/declined states), MTG-8 steps 3-4 (git worktrees), VIEW-17 (generic Start Audience). All resolved by later phases.

**In-process sessions (both reports):**
- in-process-commissions notes document the entire REQ-COM-9/REQ-COM-12 replacement of OS processes with async sessions. Fully covered by both reports.

**ASM commission split (both reports):**
- The ~11 superseded ASM requirements are covered at a high level in the spec audit's "Activity state machine split" section. The notes provide the implementation detail behind that summary.

**Plan-level deviations (plan deviation report):**
- Phase 1 notes: Artifact type nesting (`{ meta: ArtifactMeta }` vs flat merge), lib/artifact-grouping.ts extraction, GUILD_HALL_HOME env var. These are structural implementation choices. Specs don't prescribe internal type shapes or file organization.
- Artifact-tree-view notes: Component split (ArtifactList + ArtifactTree instead of single component). Needed for React rules-of-hooks compliance. Specs don't prescribe component boundaries.

## New Findings

These deviations are documented in notes but were not called out in either audit report.

### Activity state machine: 6 specific partial/unmet requirements

The spec audit report says "~8 partial, ~11 superseded" for the ASM spec but doesn't enumerate the partials. The ASM notes Phase 8 validation provides the exact breakdown:

**Partially met (behavioral outcome preserved, structural boundary differs):**

**REQ-ASM-3** (handler context encapsulation): Spec says the context object is the single mechanism for passing data to handlers. Implementation maintains a separate `trackedEntries` Map alongside the machine, so handlers aren't the only consumers of entry state. The machine doesn't fully encapsulate entry tracking.

**REQ-ASM-14** (enter in_progress fires SDK session): Spec says the SDK session is launched inside the enter handler. Implementation launches it after the machine transition returns, outside the handler. Reason: async generator streaming requires yield after transition, not inside a handler callback.

**REQ-ASM-17** (enter failed cleanup): Spec says cleanup (worktree preservation, state file write, post-cleanup hook) happens inside the enter handler. Implementation cleans up `trackedEntries` in session code, not via the machine lifecycle. Partial encapsulation leak.

**REQ-ASM-28** (single entry point for state changes): Spec says the machine's transition method is the single entry point for all status updates. Implementation derives recovery count from state file scan rather than machine method. Minor: recovery operates outside the machine by design (REQ-ASM-31), so this is a boundary case.

**Not met as described:**

**REQ-ASM-19** (enter pending from blocked): Spec says the blocked-to-pending dependency satisfaction transition goes through the machine. Implementation: `checkDependencyTransitions` moves commissions between blocked and pending without the machine because they haven't been dispatched yet. Machine only governs post-dispatch lifecycle.

**REQ-ASM-20** (enter blocked from pending): Same as REQ-ASM-19 in reverse. Pending-to-blocked transitions bypass the machine for the same reason.

**Verdict:** REQ-ASM-19 and REQ-ASM-20 are genuine spec-vs-implementation mismatches. The spec assumed the machine would govern the full commission lifecycle including pre-dispatch states. The implementation scoped the machine to dispatched-and-later only, which is a reasonable design choice but contradicts what the spec describes. The other four are partial encapsulation gaps where behavior is correct but structural boundaries differ.

### Activity state machine: 3 implementation placement deviations

The ASM notes "Divergence" section documents three placement decisions that move logic out of handlers and into session code:

**SDK session launch location** (relates to REQ-ASM-14): Spec placed SDK session start inside enter-open/enter-in_progress handlers. Moved outside because async generator streaming requires yield after machine transition, not inside handler. Affects both commissions and meetings.

**Escalation location**: Guild Master escalation on merge conflict fires from commission session code after the enter-completed handler, not inside the handler. Same pattern as SDK launch: the handler's return value controls downstream behavior.

**Meeting SDK streaming**: SDK session started after `machine.inject()` returns, not inside enter-open handler. Same streaming constraint.

**Verdict:** These three follow the same pattern. The spec assumed handlers could fire-and-forget async work. The implementation needs return values and yield points that don't fit inside handler callbacks. The spec's handler placement model doesn't accommodate streaming.

### CLS: syncStatusToIntegration bypasses Layer 2

The CLS notes document one accepted divergence not in either audit report.

**syncStatusToIntegration** in the orchestrator (Layer 5) writes terminal status to the integration worktree artifact directly via Layer 1's `recordOps`, bypassing Layer 2's lifecycle. The lifecycle has already transitioned the commission and written to the activity worktree. The integration sync is a copy of already-transitioned state to a different path, not a second state transition. Routing it through the lifecycle would require a `syncToPath` method that doesn't map to the state machine concept.

**Verdict:** Defensible. The CLS spec (REQ-CLS-23 boundary rules, implied by layer architecture) expects layers to call through their adjacent layers. This is a pragmatic shortcut. The spec should note that integration worktree sync is a write operation outside the lifecycle's jurisdiction.

### CLS: Phase 8 validation found 4 additional issues (all fixed)

The CLS notes Phase 8 validation surfaced 5 findings. Four were fixed during implementation:
1. `checkDependencyTransitions` bypassed lifecycle with direct recordOps writes (fixed: register-transition-forget cycle)
2. Untracked cancel/redispatch bypassed lifecycle (fixed: temporary registration)
3. Event shape missing `projectName` and `oldStatus` per REQ-CLS-9 (fixed: fields added)
4. `progressReported` signal didn't append timeline entry (fixed)

These are included for completeness. They were spec deviations that existed temporarily during implementation and were resolved before completion.

### Phase 5: SDK read context path mismatch

**additionalDirectories** in `meeting-session.ts` `startSession()` passes `project.path` (the user's repo root) for SDK read context instead of the worktree path. The SDK uses this for read-only context about the project.

No REQ ID directly involved. The meeting spec doesn't prescribe what paths the SDK receives for context. But git integration (Phase 5) established that meetings operate in worktrees, so passing the repo root instead of the worktree is inconsistent with the isolation model even if it doesn't cause problems.

**Verdict:** Not a spec violation, but an inconsistency with the git isolation architecture. Low risk (read-only), but the SDK could theoretically read stale state from the repo root instead of the worktree's view of the project.

## What This Means for the Specs

The findings sort into three categories:

1. **Specs that need updating** (structural mismatches): REQ-ASM-19, REQ-ASM-20 (machine scope doesn't cover pre-dispatch states), REQ-ASM-14 (handler placement model incompatible with streaming). These describe something fundamentally different from what was built.

2. **Specs that could use a note** (encapsulation gaps): REQ-ASM-3, REQ-ASM-17, REQ-ASM-28 (partial encapsulation where behavior is correct but boundaries differ from spec). CLS integration sync bypass (Layer 5 writes directly to Layer 1 for a specific case).

3. **Not spec issues** (implementation consistency): Phase 5 SDK read context is an architectural consistency question, not a spec gap.

## Relationship to Other Reports

This report refines two areas the spec audit report covered at high level:

- The spec audit's "~8 partial" for ASM now has 6 specific requirement IDs with explanations.
- The spec audit's 4 CLS partial items (28/29/30a/30b) are different from the CLS notes' 5 Phase 8 findings. The spec audit items are "verify the wiring" items from an external audit. The notes items are implementation-time findings, 4 of which were fixed.

The plan deviation report's ASM and CLS sections describe the same architectural decisions from the plan's perspective. This report adds the implementation-time reality: where did the code actually land relative to the spec, after all the in-flight decisions.
