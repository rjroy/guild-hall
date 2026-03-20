---
title: Commission and Meeting Outcomes to Project Memory
date: 2026-03-20
status: draft
tags: [memory, commissions, meetings, automation, lifecycle, haiku, triage]
modules: [daemon/services/commission/orchestrator, daemon/services/meeting/orchestrator, daemon/services/memory-injector, daemon/services/memory-sections, daemon/lib/event-bus]
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

This spec defines an automatic triage step: after an activity finishes, a Haiku call evaluates the outcome and decides whether anything belongs in project memory. Most outcomes produce nothing. The ones that do produce a concise, standalone entry written to the project-scope memory file via the existing `parseMemorySections`/`renderMemorySections` path. The triage call is fire-and-forget. If it fails, the activity's completion is unaffected.

## Entry Points

- Brainstorm `.lore/brainstorm/commission-outcomes-to-memory.md` defines the triage approach, hook points, and input shape.
- Research `.lore/research/memory-retention-prompt-design.md` surveys how production memory systems decide what to remember.
- Memory system redesign (`.lore/specs/infrastructure/memory-single-file-redesign.md`) provides the storage target.
- Event router (`.lore/specs/infrastructure/event-router.md`) provides the subscription mechanism.

## Requirements

### Event Subscription

- REQ-OTMEM-1: The triage service subscribes to the EventBus via `eventBus.subscribe()`, matching the pattern established by the Event Router (REQ-EVRT-10). It is created during `createProductionApp` and holds the subscription for the daemon's lifetime.

- REQ-OTMEM-2: The triage service listens for two event types:
  - `commission_result`: Fires when a commission calls `submit_result`. The event carries `commissionId`, `summary`, and optionally `artifacts`. This is the primary trigger for completed commissions, since it carries the result text directly.
  - `commission_status`: Fires on status transitions. The triage service acts only when `status` is `halted` or `failed`. It ignores `completed` (handled via `commission_result`), `cancelled`, `pending`, `dispatched`, and `in_progress`.
  - `meeting_ended`: Fires when a meeting session closes. The event carries `meetingId`.

- REQ-OTMEM-3: For `commission_result` events (completed commissions), the triage service uses the `summary` and `artifacts` fields from the event directly. No artifact read is needed for the result text. For `halted` and `failed` commissions (received via `commission_status`), the triage service reads the commission artifact from the integration worktree to extract `lastProgress`, `task`, `worker`, and `linked_artifacts`. Cancelled commissions do not trigger triage.

- REQ-OTMEM-4: The `commission_result` and `commission_status` events do not carry `projectName`. The `meeting_ended` event also does not carry `projectName`. The triage service resolves `projectName` by reading the activity artifact, which is in the integration worktree at `.lore/commissions/{commissionId}.md` or `.lore/meetings/{meetingId}.md`. The artifact's location within a project's `.lore/` directory identifies the project. The `readArtifact` callback (REQ-OTMEM-27) must accept an activity ID and return both the artifact content and the owning project name. This is a lookup against the project registry's known integration worktree paths.

### Input Assembly

- REQ-OTMEM-5: For commission outcomes, the triage call receives:
  - **Worker name**: from the commission artifact frontmatter (or from the `commission_result` event context).
  - **Task description**: the commission prompt (the `task` field from the artifact).
  - **Outcome status**: `completed`, `halted`, or `failed`.
  - **Result or progress text**: for `completed`, the `summary` field from the `commission_result` event. For `halted` and `failed`, the `lastProgress` field from the commission artifact.
  - **Artifact list**: files created or modified, from the `linked_artifacts` field in the commission artifact. For `commission_result` events, the `artifacts` field on the event is used if present.

- REQ-OTMEM-6: For meeting outcomes, the triage call receives:
  - **Worker name**: the meeting's worker, from the meeting artifact.
  - **Meeting agenda or topic**: from the meeting artifact's `agenda` field, or the first user message if no agenda exists.
  - **Outcome status**: `"closed"` (the only terminal status for meetings).
  - **Generated notes**: the meeting notes text. The notes generator runs before `meeting_ended` fires, so the notes file exists by the time triage reads it. The `readArtifact` callback retrieves both the meeting artifact and its associated notes file.
  - **Artifact list**: for meetings, the `{artifact_list}` placeholder receives `"None"`. Meetings do not produce linked artifacts in the same way commissions do.

- REQ-OTMEM-7: The triage call also receives the current project memory content (the full project-scope memory file). This enables deduplication: the model can see what's already stored and avoid re-extracting known facts. At Guild Hall's scale (project memory under 16K chars), loading the full file is affordable.

### Triage Prompt

- REQ-OTMEM-8: The triage prompt is a single generic template used for both commission outcomes and meeting summaries. The prompt includes an input-type indicator (`commission` or `meeting`) so the model knows what it's reading, but the extraction categories and skip criteria are shared. Two separate prompts would double maintenance without proportional improvement (the categories overlap substantially, per research section 3).

- REQ-OTMEM-9: The triage prompt follows the eight-part structure identified by the research (section 4): role statement, input description, categories to extract, skip criteria, examples, existing memory, output schema, and empty-result path.

- REQ-OTMEM-10: The triage prompt template. This is the load-bearing artifact. The exact text:

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

  ## What's Already in Memory

  {current_project_memory}

  ## What to Extract

  Look for these categories. If nothing fits, return skip.

  - **Decisions**: A design choice, technology selection, or approach change was made
    with rationale that future work should know about. Not "followed the spec" but
    "deviated from the spec because X" or "chose approach A over B because Y."

  - **Discoveries**: A constraint, bug, limitation, or behavior was found that wasn't
    known before and that future work needs to account for. "Bun's mock.module() causes
    infinite loops" is a discovery. "The tests pass" is not.

  - **Capabilities**: Something new the system can do that changes what's possible.
    A major feature, integration, or tool. Not internal refactoring or minor fixes.

  - **Failures worth noting**: A commission halted or failed in a way that reveals a
    systemic issue or an approach that doesn't work. Transient failures (rate limits,
    timeouts) are not worth noting unless they reveal a pattern.

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
  - Information already in memory. Check the existing memory above. Do not duplicate.
  - Information that lives in the artifact itself. If the commission created or updated
    a spec, the knowledge is there. Memory should not duplicate spec content.
  - Restating what the worker said. Extract what was decided, discovered, or changed.

  ## Output Format

  Return a JSON array. Each element is one memory entry:

  {
    "action": "write",
    "section": "<section name>",
    "operation": "append" | "upsert",
    "content": "<standalone fact, stated as a simple sentence with date>"
  }

  If nothing is worth remembering, return:

  [{ "action": "skip" }]

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
  ```

- REQ-OTMEM-11: The prompt template uses seven placeholders: `{input_type}`, `{worker_name}`, `{task_description}`, `{outcome_status}`, `{result_text}`, `{artifact_list}`, and `{current_project_memory}`. These are string-interpolated before the call. No tool-based retrieval during the triage session.

### Memory Write

- REQ-OTMEM-12: The triage call's output is parsed as a JSON array. Each element with `"action": "write"` produces a memory write to the project-scope memory file at `~/.guild-hall/memory/projects/{projectName}.md`.

- REQ-OTMEM-13: Memory writes use the `parseMemorySections`/`renderMemorySections` path and the `withMemoryLock` mutex from `daemon/services/memory-sections.ts`. This is the same path `edit_memory` uses, called directly (not through the MCP tool). The lock key is `project:{projectName}`.

- REQ-OTMEM-14: The `operation` field from the triage output maps directly to the section manipulation logic in `makeEditMemoryHandler`: `append` adds content with a blank-line separator, `upsert` replaces the section. The triage service reuses that logic, not the MCP tool wrapper.

- REQ-OTMEM-15: If a triage call produces multiple entries, they are written sequentially within a single lock acquisition. This prevents interleaving with concurrent memory writes from workers or other triage calls.

- REQ-OTMEM-16: After writing, if the project memory file exceeds 16,000 characters, the triage service logs a budget note at `info` level (not `warn`, because the write succeeded and budget management is a separate concern). It does not compact, truncate, or refuse the write. The memory injector's `trimSections` handles budget enforcement at injection time.

### Model and Session Shape

- REQ-OTMEM-17: The triage call uses Haiku (Claude Haiku 4.5, model ID `claude-haiku-4-5-20251001`). This is classification plus light summarization, not reasoning. The failure mode (a bad entry or a missed one) is low-stakes and recoverable.

- REQ-OTMEM-18: The triage call is a single-turn LLM query, not a multi-turn SDK session. It sends the assembled prompt as a user message and parses the response. No tools are provided. The model does not need `read_memory` or `edit_memory` because the existing memory is injected into the prompt (REQ-OTMEM-7) and the writes are handled by the triage service (REQ-OTMEM-12).

- REQ-OTMEM-19: The triage call uses the Anthropic API directly (via the SDK's `client.messages.create`), not the full `runSdkSession` pipeline. It does not need worktrees, toolbox resolution, memory injection, or event translation. It is a single API call with a system prompt, one user message, and a parsed response.

### Failure Handling

- REQ-OTMEM-20: The triage call is fire-and-forget. It runs asynchronously after the activity completion event. If the call fails (API error, timeout, rate limit), the activity's completion is unaffected. The activity is already complete before the triage fires.

- REQ-OTMEM-21: Triage failures are logged at `warn` level with the activity ID and error message. No retry. No dead letter queue. The log entry is sufficient for the user to notice if triage is systematically failing.

- REQ-OTMEM-22: If the model's response is not valid JSON or doesn't match the expected schema (missing `action` field, unknown `action` value, missing `section` for write entries), the triage service logs the malformed response at `warn` level and discards it. No partial writes from a malformed response.

- REQ-OTMEM-23: If the model returns entries with empty `content` or empty `section`, those individual entries are skipped (logged at `debug` level). Valid entries in the same response are still written.

### Logging

- REQ-OTMEM-24: The triage service uses the injectable logger (`Log` interface from `daemon/lib/log.ts`) with tag `"outcome-triage"`.

- REQ-OTMEM-25: Log levels:
  - `info`: triage initiated (includes activity type and ID), triage completed (includes number of entries written or "skipped"), memory budget warning.
  - `warn`: triage API call failed, malformed response, write failure.
  - `debug`: individual entry skipped (empty content/section), triage skipped for cancelled commission.

### Dependency Injection

- REQ-OTMEM-26: The triage service is created by a factory function (`createOutcomeTriage`) that accepts: `EventBus`, `guildHallHome` (for memory file paths), `Log`, and an API client (or client factory) for making the Haiku call. The factory returns a cleanup function (the EventBus unsubscribe callback), following the Event Router pattern (REQ-EVRT-24).

- REQ-OTMEM-27: The triage service needs to read commission and meeting artifacts to assemble input. It receives a `readArtifact` callback (or equivalent) rather than importing filesystem operations directly. This keeps the service testable with in-memory fixtures.

## Explicit Non-Goals

- **Compaction.** The triage service writes entries. If the memory file grows too large, that's a separate concern. The memory injector already handles budget enforcement at injection time via `trimSections`.
- **Cross-project memory.** Triage writes to the project scope of the activity's project. No cross-project writes.
- **User-configurable categories.** The extraction categories are hardcoded in the prompt template. If specific projects consistently produce bad extractions, the prompt can be revised, but per-project prompt overlays are not in scope.
- **Confidence scores.** The model returns binary write/skip decisions. No confidence threshold, no probabilistic filtering. Research (section 6, question 3) found no evidence that confidence scores improve outcomes.
- **Retry on failure.** A missed triage call is low-stakes. The information still exists in the commission artifact or meeting notes. Retry logic adds complexity for minimal recovery value.
- **Cancelled commissions.** Commissions cancelled before producing meaningful work do not trigger triage. There's nothing to extract.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Per-project prompt overlays | Specific project types consistently produce bad extractions | Extend factory to accept project-specific category overrides |
| Memory compaction | Project memory file grows beyond 16K chars regularly | New spec for automated compaction or summarization |
| Richer event data | `commission_result` or `meeting_ended` events carry insufficient context | Modify emit sites to include additional fields (e.g., `projectName` on commission events) |

## Success Criteria

- [ ] Triage fires after commission completion (`completed`, `halted`, `failed`) and meeting close
- [ ] Triage resolves `projectName` correctly from activity artifacts and writes to the correct project-scope memory file
- [ ] Routine completions (feature built to spec, no surprises) produce `skip` output
- [ ] Commissions with architectural decisions, discovered constraints, or new capabilities produce relevant memory entries
- [ ] Meeting decisions are extracted as individual standalone facts
- [ ] Entries already in memory are not duplicated
- [ ] Entries are standalone: readable without context months later
- [ ] Triage failure does not delay or affect activity completion
- [ ] Malformed model output is logged and discarded without partial writes
- [ ] Memory file is written atomically with proper locking
- [ ] Concurrent triage calls for the same project serialize their memory writes (no interleaving)
- [ ] Triage service is injectable and testable (factory pattern, no global state, mockable API client)
- [ ] All daemon tests pass, including new tests for the triage service

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm the triage factory is wired in `createProductionApp()` (`daemon/app.ts`).
- Confirm the triage service uses `Log` from `daemon/lib/log.ts`, not direct `console` calls.
- Confirm memory writes use `withMemoryLock` from `daemon/services/memory-sections.ts`.
- Confirm the Haiku call uses the Anthropic API client, not the full SDK runner pipeline.

**Behavioral checks (all use a mock API client returning predetermined JSON, not live Haiku calls):**
- Test with a routine commission outcome (feature built to spec) and verify `skip` output.
- Test with a commission that made an architectural decision and verify a relevant entry is produced.
- Test with a meeting containing multiple decisions and verify multiple entries.
- Test with existing memory that already contains a fact, and verify the model does not duplicate it.
- Test with a halted commission and verify the `lastProgress` text is used as input.
- Test with a malformed model response (invalid JSON, missing fields) and verify no writes occur.
- Test that triage failures are logged and do not propagate.
- Test that concurrent triage calls for the same project serialize their memory writes.

## Constraints

- The triage prompt (REQ-OTMEM-10) is a first draft. It will need tuning based on observed output quality. The prompt should be stored as a constant (not inline in the call site) so it can be revised without restructuring the service.
- The Haiku model choice assumes the prompt stays within Haiku's capability range (classification and light summarization). If the prompt grows to require multi-step reasoning, the model should be reconsidered.
- The triage service depends on the EventBus, which means it only works when the daemon is running. Commission and meeting completions that happen outside daemon management (e.g., manual artifact edits) do not trigger triage.

## Context

- The brainstorm (`.lore/brainstorm/commission-outcomes-to-memory.md`) resolved the core design: LLM triage over mechanical extraction. This spec codifies that decision and fills in the details the brainstorm left open (prompt template, output schema, failure handling).
- The research (`.lore/research/memory-retention-prompt-design.md`) surveyed six production memory systems. Three patterns recur: explicit skip criteria, concrete examples, and conservative bias. The triage prompt incorporates all three.
- The event router spec (`.lore/specs/infrastructure/event-router.md`) establishes the EventBus subscription pattern. The triage service follows the same DI and lifecycle model.
- The memory redesign spec (`.lore/specs/infrastructure/memory-single-file-redesign.md`) defines the storage target. The triage service writes to the same file format using the same section parser.
