---
title: Commission and Meeting Outcomes to Project Memory
date: 2026-03-20
status: implemented
tags: [memory, commissions, meetings, automation, lifecycle, haiku, triage]
modules: [daemon/services/commission/orchestrator, daemon/services/meeting/orchestrator, daemon/services/base-toolbox, daemon/services/memory-sections, daemon/lib/event-bus]
related:
  - .lore/brainstorm/commission-outcomes-to-memory.md
  - .lore/research/memory-retention-prompt-design.md
  - .lore/research/agent-memory-systems.md
  - .lore/specs/infrastructure/memory-single-file-redesign.md
  - .lore/specs/infrastructure/event-router.md
req-prefix: OTMEM
---

# Spec: Commission and Meeting Outcomes to Project Memory

## Overview

When a commission completes or a meeting closes, the outcome data (result summary, artifact list, notes) contains information that future workers should know. Today, that information stays in the commission artifact or meeting notes. Workers only encounter it if the briefing generator happens to surface it or the user includes it in a prompt.

This spec defines an automatic triage step: after an activity finishes, a Haiku session evaluates the outcome and decides whether anything belongs in project memory. The session has access to `read_memory` and `edit_memory`, the same tools workers use, so it writes through the existing memory path with no custom integration layer. Most outcomes produce nothing. The triage session is fire-and-forget. If it fails, the activity's completion is unaffected.

## Entry Points

- Brainstorm `.lore/brainstorm/commission-outcomes-to-memory.md` defines the triage approach, hook points, and input shape.
- Research `.lore/research/memory-retention-prompt-design.md` surveys how production memory systems decide what to remember.
- Memory system redesign (`.lore/specs/infrastructure/memory-single-file-redesign.md`) provides the storage target.
- Event router (`.lore/specs/infrastructure/event-router.md`) provides the subscription mechanism.

## Requirements

### Event Subscription

- REQ-OTMEM-1: The triage service subscribes to the EventBus via `eventBus.subscribe()`, matching the pattern established by the Event Router (REQ-EVRT-10). It is created during `createProductionApp` and holds the subscription for the daemon's lifetime.

- REQ-OTMEM-2: The triage service listens for two event types:
  - `commission_result`: Fires when a commission calls `submit_result`. The event carries `commissionId`, `summary`, and optionally `artifacts`.
  - `meeting_ended`: Fires when a meeting session closes. The event carries `meetingId`.
  Failed and halted commissions do not trigger triage. Failed commissions broke before reaching conclusions. Halted commissions are recoverable: they either get continued (eventually emitting `commission_result` on success), saved (partial work, no real conclusions), or abandoned. In all cases, either the triage fires later on the real result or there's nothing worth extracting.

- REQ-OTMEM-3: For `commission_result` events, the triage service uses the `summary` and `artifacts` fields from the event directly. No artifact read is needed for the result text. The commission artifact is read only to resolve `projectName` (REQ-OTMEM-4) and to fill `worker` and `task` fields for the triage prompt.

- REQ-OTMEM-4: The `commission_result` event does not carry `projectName`. The `meeting_ended` event also does not carry `projectName`. The triage service resolves `projectName` by reading the activity artifact, which is in the integration worktree at `.lore/commissions/{commissionId}.md` or `.lore/meetings/{meetingId}.md`. The artifact's location within a project's `.lore/` directory identifies the project. The `readArtifact` callback (REQ-OTMEM-21) must accept an activity ID and return both the artifact content and the owning project name. This is a lookup against the project registry's known integration worktree paths.

### Input Assembly

- REQ-OTMEM-5: For commission outcomes, the triage call receives:
  - **Worker name**: from the commission artifact frontmatter.
  - **Task description**: the commission prompt (the `task` field from the artifact).
  - **Outcome status**: `"completed"`.
  - **Result text**: the `summary` field from the `commission_result` event.
  - **Artifact list**: the `artifacts` field from the `commission_result` event if present, otherwise `linked_artifacts` from the commission artifact.

- REQ-OTMEM-6: For meeting outcomes, the triage call receives:
  - **Worker name**: the meeting's worker, from the meeting artifact.
  - **Meeting agenda or topic**: from the meeting artifact's `agenda` field, or the first user message if no agenda exists.
  - **Outcome status**: `"closed"` (the only terminal status for meetings).
  - **Generated notes**: the meeting notes text. The notes generator runs before `meeting_ended` fires, so the notes file exists by the time triage reads it. The `readArtifact` callback retrieves both the meeting artifact and its associated notes file.
  - **Artifact list**: from the meeting artifact's `linked_artifacts` field. If the meeting linked no artifacts, the placeholder receives `"None"`.

### Triage Prompt

- REQ-OTMEM-7: The triage prompt is a single generic template used for both commission outcomes and meeting summaries. The prompt includes an input-type indicator (`commission` or `meeting`) so the model knows what it's reading, but the extraction categories and skip criteria are shared. Two separate prompts would double maintenance without proportional improvement (the categories overlap substantially, per research section 3).

- REQ-OTMEM-8: The triage prompt follows a simplified version of the structure identified by the research (section 4): role statement, input description, categories to extract, skip criteria, and tool usage instructions. The output schema and empty-result path from the research are unnecessary because the model writes via `edit_memory` directly (REQ-OTMEM-11) rather than producing structured JSON for the service to parse.

- REQ-OTMEM-9: The triage prompt template. This is the load-bearing artifact. The exact text:

  ```
  You are a memory triage filter for a software project. You receive the outcome
  of a completed work item (a commission or meeting) and decide whether anything
  from that outcome belongs in the project's long-term memory.

  Most outcomes produce nothing worth remembering. A routine feature built to spec,
  a standard review with no surprises, a meeting that confirmed existing plans: these
  are normal work. The artifacts and notes already record what happened. Memory is for
  the signal that future workers need and wouldn't find by reading the artifacts alone.

  ## What You're Looking At

  Type: {input_type}
  Worker: {worker_name}
  Task: {task_description}
  Status: {outcome_status}

  ### Outcome
  {result_text}

  ### Artifacts
  {artifact_list}

  ## What to Extract

  Look for these categories. If nothing fits, do nothing.

  - **Decisions**: A design choice, technology selection, or approach change was made
    with rationale that future work should know about. Not "followed the spec" but
    "deviated from the spec because X" or "chose approach A over B because Y."

  - **Discoveries**: A constraint, bug, limitation, or behavior was found that wasn't
    known before and that future work needs to account for. "Bun's mock.module() causes
    infinite loops" is a discovery. "The tests pass" is not.

  - **Capabilities**: Something new the system can do that changes what's possible.
    A major feature, integration, or tool. Not internal refactoring or minor fixes.

  - **Failures worth noting**: The outcome describes an approach that didn't work or
    a dead end that future workers should avoid. Not transient failures (rate limits,
    timeouts), but "we tried X and it doesn't work because Y."

  - **Process lessons**: How the work should be done going forward. A workflow
    insight, coordination pattern, or approach that worked (or didn't) and would
    generalize beyond this one commission.

  - **Status changes**: An issue was resolved, a spec was approved, a blocker was
    cleared, or a new gap was identified. Only when the status change isn't already
    reflected in the artifact's own frontmatter.

  - **User direction**: The user stated a preference, correction, or decision about
    how things should be done. Meetings are the primary source for these.

  ## What to Skip

  - Routine completions with no surprises. "Built feature X per spec, tests pass."
  - Transient failures: rate limits, network errors, timeout-and-retry.
  - Process details: how many turns it took, which files were read, what tools were used.
  - Information already in memory. Read it first. Do not duplicate.
  - Information that lives in the artifact itself. If the commission created or updated
    a spec, the knowledge is there. Memory should not duplicate spec content.
  - Restating what the worker said. Extract what was decided, discovered, or changed.

  ## How to Write

  Use read_memory to check what's already stored, then edit_memory to write entries.
  Write to the "project" scope only.

  Rules for entries:
  - Each entry must be a standalone fact. A reader encountering it months later,
    with no other context, should understand what it means.
  - Include a date (e.g., "2026-03-20") so the reader knows when this was true.
  - Use "append" to add a fact to an existing section. Use "upsert" only when
    replacing outdated information in a section.
  - Section names should match existing sections in memory when the topic fits.
    Create new sections only when no existing section is appropriate.
  - Keep entries concise. One to two sentences per entry. If it needs a paragraph,
    it belongs in a spec or retro, not memory.
  - A meeting with five decisions produces five entries, not one combined entry.

  If nothing is worth remembering, do nothing.
  ```

- REQ-OTMEM-10: The prompt template uses six placeholders: `{input_type}`, `{worker_name}`, `{task_description}`, `{outcome_status}`, `{result_text}`, and `{artifact_list}`. These are string-interpolated before the call. The model reads current memory via `read_memory` during the session rather than having it injected into the prompt.

### Memory Write

- REQ-OTMEM-11: The triage session uses the existing `read_memory` and `edit_memory` tools from the base toolbox. The tools are scoped to the activity's project (the `projectName` resolved in REQ-OTMEM-4). The model reads current memory to check for duplicates, then writes entries via `edit_memory`. No custom JSON parsing, no shadow write path. The same code path that workers use for memory operations is the code path triage uses.

- REQ-OTMEM-12: The triage session's `edit_memory` tool is configured with `projectName` from the activity artifact and a synthetic worker name (e.g., `"outcome-triage"`) for the worker scope (which it does not use). The tools are constructed via `makeEditMemoryHandler` and `makeReadMemoryHandler`, the same factories the base toolbox uses. Both tools share a `readScopes` set so the existing read-before-write guard (REQ-MEM-27) applies: the model must call `read_memory` for a scope before `edit_memory` will accept writes to it. The triage prompt instructs this sequence. Locking, section parsing, and write semantics are inherited, not reimplemented.

### Model and Session Shape

- REQ-OTMEM-13: The triage call uses Haiku (Claude Haiku 4.5, model ID `claude-haiku-4-5-20251001`). This is classification plus light summarization, not reasoning. The failure mode (a bad entry or a missed one) is low-stakes and recoverable.

- REQ-OTMEM-14: The triage call is a short tool-using session via the Claude Agent SDK. It provides `read_memory` and `edit_memory` as tools. It does not use the full `runSdkSession` pipeline (no worktrees, no toolbox resolution, no memory injection, no event translation). The session runs the prompt as the system message, the assembled outcome as the user message, and the SDK handles the tool-use loop until the model stops. Most triage calls will be 2-3 turns: read memory, optionally write, done.

- REQ-OTMEM-15: The triage session enforces a turn limit (e.g., 10 turns) to prevent runaway tool-use loops. If the limit is reached, the session stops. Any writes already made via `edit_memory` during the session are retained (they were committed to disk when the tool executed). The turn limit is a safety bound, not an expected path.

### Failure Handling

- REQ-OTMEM-16: The triage call is fire-and-forget. It runs asynchronously after the activity completion event. If the session fails (SDK error, timeout, rate limit), the activity's completion is unaffected. The activity is already complete before the triage fires.

- REQ-OTMEM-17: Triage failures are logged at `warn` level with the activity ID and error message. No retry. No dead letter queue. The log entry is sufficient for the user to notice if triage is systematically failing.

### Logging

- REQ-OTMEM-18: The triage service uses the injectable logger (`Log` interface from `daemon/lib/log.ts`) with tag `"outcome-triage"`.

- REQ-OTMEM-19: Log levels:
  - `info`: triage initiated (includes activity type and ID), triage completed (includes whether memory was written or session ended without writes).
  - `warn`: triage session failed, session exceeded turn limit.
  - `debug`: triage skipped for cancelled commission.

### Dependency Injection

- REQ-OTMEM-20: The triage service is created by a factory function (`createOutcomeTriage`) that accepts: `EventBus`, `guildHallHome` (for memory file paths and tool construction), `Log`, and an SDK session runner (or factory) for the Haiku call. The factory returns a cleanup function (the EventBus unsubscribe callback), following the Event Router pattern (REQ-EVRT-24).

- REQ-OTMEM-21: The triage service needs to read commission and meeting artifacts to assemble input. It receives a `readArtifact` callback (or equivalent) rather than importing filesystem operations directly. This keeps the service testable with in-memory fixtures.

## Explicit Non-Goals

- **Compaction.** The triage service writes entries. If the memory file grows too large, that's a separate concern. The memory injector already handles budget enforcement at injection time via `trimSections`.
- **Cross-project memory.** Triage writes to the project scope of the activity's project. No cross-project writes.
- **User-configurable categories.** The extraction categories are hardcoded in the prompt template. If specific projects consistently produce bad extractions, the prompt can be revised, but per-project prompt overlays are not in scope.
- **Confidence scores.** The model decides whether to call `edit_memory` or not. No confidence threshold, no probabilistic filtering. Research (section 6, question 3) found no evidence that confidence scores improve outcomes.
- **Retry on failure.** A missed triage call is low-stakes. The information still exists in the commission artifact or meeting notes. Retry logic adds complexity for minimal recovery value.
- **Non-completed commissions.** Only `commission_result` (successful completion) triggers triage. Failed, halted, and cancelled commissions do not. Failed and cancelled have nothing to extract. Halted commissions either resolve into completions (triage fires then) or get abandoned.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Per-project prompt overlays | Specific project types consistently produce bad extractions | Extend factory to accept project-specific category overrides |
| Memory compaction | Project memory file grows beyond 16K chars regularly | New spec for automated compaction or summarization |
| Richer event data | `commission_result` or `meeting_ended` events carry insufficient context | Modify emit sites to include additional fields (e.g., `projectName` on commission events) |

## Success Criteria

- [ ] Triage fires after commission completion (`commission_result`) and meeting close (`meeting_ended`)
- [ ] Triage resolves `projectName` correctly from activity artifacts and writes to the correct project-scope memory file
- [ ] Routine completions (feature built to spec, no surprises) produce no memory writes
- [ ] Commissions with architectural decisions, discovered constraints, or new capabilities produce relevant memory entries
- [ ] Meeting decisions are extracted as individual standalone facts
- [ ] Entries already in memory are not duplicated
- [ ] Entries are standalone: readable without context months later
- [ ] Triage failure does not delay or affect activity completion
- [ ] Memory writes go through `edit_memory` tool (same path workers use), not a custom write path
- [ ] Triage service is injectable and testable (factory pattern, no global state, mockable SDK session)
- [ ] All daemon tests pass, including new tests for the triage service

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm the triage factory is wired in `createProductionApp()` (`daemon/app.ts`).
- Confirm the triage service uses `Log` from `daemon/lib/log.ts`, not direct `console` calls.
- Confirm memory tools are constructed via `makeReadMemoryHandler`/`makeEditMemoryHandler` (same factories as base toolbox).
- Confirm the triage session uses the Claude Agent SDK, not the full `runSdkSession` pipeline.

**Behavioral checks (all use a mock SDK session, not live Haiku calls):**
- Test with a routine commission outcome (feature built to spec) and verify no memory writes occur.
- Test with a commission that made an architectural decision and verify `edit_memory` is called with a relevant entry.
- Test with a meeting containing multiple decisions and verify multiple `edit_memory` calls.
- Test that triage failures are logged and do not propagate.
- Test that the session respects the turn limit.

## Constraints

- The triage prompt (REQ-OTMEM-9) is a first draft. It will need tuning based on observed output quality. The prompt should be stored as a constant (not inline in the call site) so it can be revised without restructuring the service.
- The Haiku model choice assumes the prompt stays within Haiku's capability range (classification and light summarization). If the prompt grows to require multi-step reasoning, the model should be reconsidered.
- The triage service depends on the EventBus, which means it only works when the daemon is running. Commission and meeting completions that happen outside daemon management (e.g., manual artifact edits) do not trigger triage.

## Context

- The brainstorm (`.lore/brainstorm/commission-outcomes-to-memory.md`) resolved the core design: LLM triage over mechanical extraction. This spec codifies that decision and fills in the details the brainstorm left open (prompt template, tool usage, failure handling).
- The research (`.lore/research/memory-retention-prompt-design.md`) surveyed six production memory systems. Three patterns recur: explicit skip criteria, concrete examples, and conservative bias. The triage prompt incorporates all three.
- The event router spec (`.lore/specs/infrastructure/event-router.md`) establishes the EventBus subscription pattern. The triage service follows the same DI and lifecycle model.
- The memory redesign spec (`.lore/specs/infrastructure/memory-single-file-redesign.md`) defines the storage target. The triage service writes to the same file format using the same section parser.
