---
title: "Commission: Spec: Decisions surface (artifact persistence + triage promotion)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Spec Task: Decisions Surface\n\nWrite a spec at `.lore/specs/infrastructure/decisions-surface.md`.\n\n### Source Material\n\nRead `.lore/brainstorm/decisions-surface.md` thoroughly. The user has chosen **Option 2 (continuity-focused)** from the Alternative Approaches section:\n\n1. **Persist decisions to the commission/meeting artifact body** before state cleanup (approach 4a). This solves the audit need: decisions survive cleanup and are readable in the artifact.\n2. **Let the outcomes-to-memory triage promote cross-cutting decisions** to project memory (approach 2b/2e). This solves the continuity need: Phase 2's worker sees Phase 1's important decisions automatically via memory injection.\n\n### What's In Scope\n\n- The lifecycle hook that reads `decisions.jsonl` and appends a `## Decisions` section to the artifact body before state cleanup. This applies to both commissions and meetings.\n- Guidance for the outcomes-to-memory triage prompt (already being built by Dalton at `daemon/services/outcome-triage.ts`) to recognize and promote cross-cutting decisions from the artifact's decisions section to project memory. This is NOT a new system — it's a prompt refinement for the existing triage call.\n- Optionally, posture improvements (approach 1a) that encourage workers to record better decisions. This is documentation/prompt changes, not code.\n\n### What's NOT In Scope\n\n- No new REST endpoints for decisions\n- No new UI components for decisions\n- No decision events on the EventBus\n- No `.lore/decisions/` directory\n- No metadata fields (category, scope, confidence) on `record_decision` — that's a future enhancement\n\n### Context to Read\n\n- `.lore/brainstorm/decisions-surface.md` — the full brainstorm with all approaches\n- `.lore/specs/infrastructure/commission-outcomes-to-memory.md` — the triage spec (decisions promotion piggybacks on this)\n- `daemon/services/base-toolbox.ts` — where `record_decision` and `makeRecordDecisionHandler` live\n- `daemon/services/commission/orchestrator.ts` — the completion/cleanup lifecycle where the persistence hook goes\n- `daemon/services/meeting/orchestrator.ts` — same for meetings\n\n### Format\n\nFollow existing spec format in `.lore/specs/`. Use REQ- prefixed requirement IDs. Keep it focused — this is a small feature."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/decisions-surface.md

activity_timeline:
  - timestamp: 2026-03-21T00:15:43.583Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T00:15:43.585Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T00:15:43.630Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T00:15:59.167Z
    event: progress_report
    reason: "Reading source materials: brainstorm, outcomes-to-memory spec, and relevant code files."
  - timestamp: 2026-03-21T00:17:30.677Z
    event: progress_report
    reason: "All source materials read. Drafting the spec now."
  - timestamp: 2026-03-21T00:20:01.097Z
    event: result_submitted
    reason: "Wrote the Decisions Surface spec at `.lore/specs/infrastructure/decisions-surface.md`.\n\nThe spec defines 15 requirements across three areas:\n\n**Decisions Persistence Hook (REQ-DSRF-1 through REQ-DSRF-10):** A lifecycle hook in both commission and meeting orchestrators reads `decisions.jsonl` and appends a `## Decisions` section to the artifact body before state cleanup. Runs after artifact status updates but before `deleteStateFile`. Best-effort with warn-level logging on failure. Preserves frontmatter byte-for-byte (no gray-matter stringify).\n\n**Triage Prompt Guidance (REQ-DSRF-11 through REQ-DSRF-13):** The outcomes-to-memory triage prompt (REQ-OTMEM-9) already covers decisions as an extraction category. The spec requires the triage input assembly to include the new `## Decisions` section from the artifact body so triage can evaluate recorded decisions for memory promotion. No prompt text changes needed.\n\n**Posture Improvements (REQ-DSRF-14, REQ-DSRF-15):** Updated `record_decision` tool description with guidance on what to record. Worker posture changes deferred to iterative observation.\n\nKey design decisions:\n- No REST endpoints, UI components, EventBus events, or `.lore/decisions/` directory (all explicitly out of scope per the task)\n- Hook location: after artifact writes, before state deletion, within existing try/catch for safety\n- Path resolution uses `stateSubdir` from the context type registry (meetings → \"meetings\", commissions → \"commissions\") to match `makeRecordDecisionHandler`\n- Ordering dependency with outcomes-to-memory is unidirectional: either can ship first"
  - timestamp: 2026-03-21T00:20:11.793Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source materials read. Drafting the spec now."
projectName: guild-hall
---
Wrote the Decisions Surface spec at `.lore/specs/infrastructure/decisions-surface.md`.

The spec defines 15 requirements across three areas:

**Decisions Persistence Hook (REQ-DSRF-1 through REQ-DSRF-10):** A lifecycle hook in both commission and meeting orchestrators reads `decisions.jsonl` and appends a `## Decisions` section to the artifact body before state cleanup. Runs after artifact status updates but before `deleteStateFile`. Best-effort with warn-level logging on failure. Preserves frontmatter byte-for-byte (no gray-matter stringify).

**Triage Prompt Guidance (REQ-DSRF-11 through REQ-DSRF-13):** The outcomes-to-memory triage prompt (REQ-OTMEM-9) already covers decisions as an extraction category. The spec requires the triage input assembly to include the new `## Decisions` section from the artifact body so triage can evaluate recorded decisions for memory promotion. No prompt text changes needed.

**Posture Improvements (REQ-DSRF-14, REQ-DSRF-15):** Updated `record_decision` tool description with guidance on what to record. Worker posture changes deferred to iterative observation.

Key design decisions:
- No REST endpoints, UI components, EventBus events, or `.lore/decisions/` directory (all explicitly out of scope per the task)
- Hook location: after artifact writes, before state deletion, within existing try/catch for safety
- Path resolution uses `stateSubdir` from the context type registry (meetings → "meetings", commissions → "commissions") to match `makeRecordDecisionHandler`
- Ordering dependency with outcomes-to-memory is unidirectional: either can ship first
