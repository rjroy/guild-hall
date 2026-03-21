---
title: Decisions Surface
date: 2026-03-20
status: approved
tags: [decisions, lifecycle, artifacts, memory, triage]
modules: [daemon/services/commission/orchestrator, daemon/services/meeting/orchestrator, daemon/services/base-toolbox]
related:
  - .lore/brainstorm/decisions-surface.md
  - .lore/specs/infrastructure/commission-outcomes-to-memory.md
req-prefix: DSRF
---

# Spec: Decisions Surface

## Overview

Workers call `record_decision(question, decision, reasoning)` during commissions and meetings. The tool writes JSONL entries to `~/.guild-hall/state/{contextType}/{contextId}/decisions.jsonl`. After the activity completes, the state directory becomes orphaned: nobody reads it, and the decisions are effectively lost. The artifact (the permanent record) contains timeline entries, progress, and results, but not the reasoning that shaped them.

Two changes fix this:

1. **Persist decisions to the artifact body.** A lifecycle hook reads `decisions.jsonl` and appends a `## Decisions` section to the commission or meeting artifact before state cleanup. Decisions survive in the artifact where they belong.

2. **Promote cross-cutting decisions to project memory.** The outcomes-to-memory triage (REQ-OTMEM-9) already extracts "Decisions" as a category. This spec refines the triage prompt guidance to recognize decisions from the artifact's new `## Decisions` section specifically, improving extraction accuracy for the decisions that workers explicitly recorded.

An optional third change improves the input: strengthen worker postures and the `record_decision` tool description so workers record more useful decisions in the first place.

## Entry Points

- Brainstorm `.lore/brainstorm/decisions-surface.md` maps the full design space. The user chose Option 2 (continuity-focused): artifact persistence + memory promotion via triage.
- Outcomes-to-memory spec (`.lore/specs/infrastructure/commission-outcomes-to-memory.md`) defines the triage service that handles memory promotion.
- `daemon/services/base-toolbox.ts:330-364` defines `makeRecordDecisionHandler` and the `record_decision` tool.

## Requirements

### Decisions Persistence Hook

- REQ-DSRF-1: A function `readDecisions(guildHallHome: string, contextType: string, contextId: string): Promise<DecisionEntry[]>` reads the JSONL file at `~/.guild-hall/state/{contextType}/{contextId}/decisions.jsonl`. Each line is a JSON object with `timestamp`, `question`, `decision`, and `reasoning` fields. If the file does not exist or is empty, the function returns an empty array. Malformed lines are skipped with no error (workers may have written partial entries on crash).

- REQ-DSRF-2: A function `formatDecisionsSection(decisions: DecisionEntry[]): string` renders the array into a markdown section. The format:

  ```markdown
  ## Decisions

  **{question}**
  {decision}
  *Reasoning: {reasoning}*

  **{question}**
  {decision}
  *Reasoning: {reasoning}*
  ```

  Entries appear in chronological order (the order they were written to the JSONL file). If the array is empty, the function returns an empty string (no section is appended).

- REQ-DSRF-3: For commissions, the persistence hook runs in `handleSuccessfulCompletion` (`daemon/services/commission/orchestrator.ts`), after the artifact status is updated to `completed` but before `deleteStateFile` is called. The hook reads decisions via REQ-DSRF-1, formats them via REQ-DSRF-2, and appends the result to the commission artifact body. The artifact body is the markdown content after the YAML frontmatter. The decisions section is appended at the end of the existing body content.

- REQ-DSRF-4: For meetings, the persistence hook runs in `closeMeeting` (`daemon/services/meeting/orchestrator.ts`), after notes are written to the artifact (step 3, `closeArtifact`) but before `deleteStateFile` is called (step 6). The hook reads decisions and appends them to the meeting artifact body, same as commissions.

- REQ-DSRF-5: If `readDecisions` returns an empty array (no decisions recorded), no `## Decisions` section is appended. The artifact body is unchanged.

- REQ-DSRF-6: If reading or appending decisions fails, the error is logged at `warn` level and the activity's completion proceeds normally. Decision persistence is best-effort. A failure here must not block commission finalization or meeting closure.

- REQ-DSRF-7: The persistence hook uses the same `stateSubdir` parameter that `makeRecordDecisionHandler` uses to locate the decisions file. For commissions, this is `"commissions"`. For meetings, this is `"meetings"`. The path resolution must match exactly, or the hook reads from the wrong directory.

### Artifact Body Append

- REQ-DSRF-8: Appending to the artifact body preserves existing YAML frontmatter byte-for-byte. The implementation reads the raw file, splits frontmatter from body (the same way `gray-matter` does), appends the decisions section to the body, and writes the file back with the original frontmatter bytes intact. This avoids the known issue where `gray-matter`'s `stringify()` reformats YAML and creates noisy git diffs.

- REQ-DSRF-9: For commissions, the artifact is in the activity worktree at the path returned by `commissionArtifactPath()`. The append happens before `workspace.finalize()` squash-merges the worktree, so the decisions section is included in the merged commit.

- REQ-DSRF-10: For meetings with project scope, the artifact is in the integration worktree. The append happens before the `git.commitAll` call in the project-scope branch of `closeMeeting`. For meetings with activity scope, the artifact is in the activity worktree, and the append happens before `workspace.finalize()`.

### Triage Prompt Guidance

- REQ-DSRF-11: The outcomes-to-memory triage prompt (REQ-OTMEM-9) already lists "Decisions" as an extraction category. No prompt change is required for the triage to recognize decisions in the artifact body. The existing category text ("A design choice, technology selection, or approach change was made with rationale that future work should know about") already covers what `record_decision` captures.

- REQ-DSRF-12: The `{result_text}` placeholder in the triage prompt (REQ-OTMEM-10) is populated from the commission's `summary` field or the meeting's notes. The decisions section, now part of the artifact body, is not automatically included in `{result_text}`. To make decisions visible to triage, the triage input assembly (REQ-OTMEM-5, REQ-OTMEM-6) should include the `## Decisions` section from the artifact body when it exists. This means the `readArtifact` callback (REQ-OTMEM-21) returns the full artifact body (which now contains the decisions section), and the triage input assembly extracts the decisions section and appends it to `{result_text}`.

- REQ-DSRF-13: When the triage session encounters decisions in the outcome text, it should evaluate each for cross-cutting impact. A decision scoped to one file or function ("used Zod for this validator") is not worth promoting to memory. A decision that constrains future work ("all LLM calls go through the Agent SDK, never the raw API") is. The existing triage prompt's skip criteria ("Information that lives in the artifact itself") applies: decisions that are purely local to the commission's output do not need promotion. Only decisions that future workers in other commissions would need to know about belong in project memory. No prompt change is needed; the existing language covers this judgment.

### Posture Improvements (Optional)

- REQ-DSRF-14: The `record_decision` tool description in `daemon/services/base-toolbox.ts` is updated from its current minimal text to include guidance on when and what to record. Suggested replacement:

  ```
  Record a decision made during this session. Use this when you make a
  choice that isn't obvious from the code alone: scope decisions (what to
  include or defer), interpretation choices (how you read an ambiguous
  requirement), approach selections (why A over B), and constraint
  discoveries (something you learned that shaped the work). The decision
  log is persisted to the activity artifact for future reference.
  ```

  The three input fields (`question`, `decision`, `reasoning`) remain unchanged.

- REQ-DSRF-15: Worker posture files are not modified by this spec. Posture improvements to encourage better `record_decision` usage are a documentation change that can happen independently and iteratively, informed by observing what workers actually record after the persistence hook ships. Changing postures in the same commit as the lifecycle hook conflates two concerns.

## Explicit Non-Goals

- **No REST endpoints for decisions.** The artifact body is the read path. Completed commissions and meetings are read through existing artifact endpoints. Active session decisions are ephemeral state; surfacing them live is a separate feature (Need C in the brainstorm).
- **No UI components for decisions.** The `## Decisions` section renders as markdown in the existing artifact viewer. No dedicated component is needed.
- **No decision events on the EventBus.** Events are for live surfacing and triggers. This spec solves audit and continuity, not real-time monitoring.
- **No `.lore/decisions/` directory.** Decisions live in their originating artifact, not as standalone files.
- **No metadata fields on `record_decision`.** Adding `category`, `scope`, or `confidence` fields is a future enhancement. The current three-field schema is sufficient for persistence and triage.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Decision metadata fields | Workers consistently record decisions that need filtering (too much noise at scale) | Add `scope` and `category` fields to `record_decision` |
| Live decision surfacing | User wants to monitor decisions during active sessions | REST endpoint + SSE events + UI component (Need C from brainstorm) |
| Posture tuning | Observing that workers under-record or over-record decisions | Iterative posture/prompt changes per worker package |

## Success Criteria

- [ ] Completed commissions with recorded decisions have a `## Decisions` section in their artifact body
- [ ] Completed meetings with recorded decisions have a `## Decisions` section in their artifact body
- [ ] Commissions and meetings with no recorded decisions have no `## Decisions` section (no empty section)
- [ ] Decision persistence failure does not block activity completion
- [ ] Artifact frontmatter is preserved byte-for-byte after decisions are appended
- [ ] The decisions section content matches the JSONL entries in order and content
- [ ] The outcomes-to-memory triage can see the decisions section in its input and evaluate decisions for memory promotion
- [ ] The `record_decision` tool description provides actionable guidance on what to record
- [ ] All existing daemon tests pass; new tests cover the persistence hook for both commissions and meetings

## AI Validation

**Defaults:**
- Read the full spec before starting implementation.
- Verify every requirement has at least one test.
- Run `bun test` and confirm all tests pass before declaring work complete.

**Structural checks:**
- Confirm the persistence hook is called before `deleteStateFile` in both commission and meeting orchestrators.
- Confirm `readDecisions` uses the same path convention as `makeRecordDecisionHandler` (`state/{contextType}/{contextId}/decisions.jsonl`).
- Confirm artifact body append preserves frontmatter bytes (no `gray-matter` stringify).
- Confirm the hook is wired inside the existing try/catch structure so failures don't propagate.

**Behavioral checks:**
- Test `readDecisions` with no file, empty file, valid entries, and mixed valid/malformed lines.
- Test `formatDecisionsSection` with zero, one, and multiple entries.
- Test the commission persistence hook by writing decisions to a temp state directory, running the hook, and verifying the artifact body contains the expected section.
- Test the meeting persistence hook the same way.
- Test that a failure in `readDecisions` (e.g., permission error) is caught and logged without blocking completion.

## Constraints

- The persistence hook runs in the orchestrator's completion path. It must be fast (filesystem reads only, no LLM calls, no network). The decisions JSONL file is small (each entry is a single JSON line; a busy session might have 10-20 entries).
- The triage prompt guidance (REQ-DSRF-11 through REQ-DSRF-13) depends on the outcomes-to-memory triage service being implemented. If that service ships first, the decisions section will already be in the artifact body waiting for triage. If this feature ships first, decisions are persisted but not automatically promoted to memory until the triage service is wired.
- The `stateSubdir` parameter in `makeRecordDecisionHandler` defaults to `"commissions"`. For meetings, the meeting orchestrator must pass `"meetings"` as the `stateSubdir` when constructing the base toolbox. The persistence hook must use the same value. If these ever diverge, the hook reads from the wrong path.

## Context

- The brainstorm (`.lore/brainstorm/decisions-surface.md`) mapped the full design space across input quality, storage location, user needs, and event-driven approaches. The user selected Option 2 (continuity-focused): persist to artifact + promote via triage.
- The outcomes-to-memory spec (`.lore/specs/infrastructure/commission-outcomes-to-memory.md`) defines the triage service that will consume decisions for memory promotion. The triage prompt already includes "Decisions" as an extraction category (REQ-OTMEM-9). This spec ensures decisions are present in the triage input by persisting them to the artifact body before the triage fires.
