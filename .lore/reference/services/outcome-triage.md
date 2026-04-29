---
title: Outcome Triage
date: 2026-04-27
status: current
tags: [triage, memory, post-completion, haiku]
modules: [daemon-services]
---

# Outcome Triage

## What it does

Subscribes to terminal activity events on the EventBus and runs a Haiku session that decides whether anything from the outcome belongs in the project's long-term memory. Fire-and-forget: failures log and skip; never block the activity that triggered the triage.

## Two trigger events

- `commission_result` (any status that emits one — currently `completed` is the only path that does).
- `meeting_ended`, but only when the artifact's status is `closed`. Declined meetings and stale-cleanup recoveries also emit `meeting_ended`; triage skips those because there are no notes to triage.

The subscriber dispatches per event via a detached `void (async () => …)()` IIFE so the EventBus callback returns immediately. The actual triage runs concurrently with whatever else is happening.

## Hard-coded Haiku, hard-capped turns

`TRIAGE_MODEL = "claude-haiku-4-5-20251001"` is not configurable via `systemModels` (unlike briefing / notes / heartbeat). Cost-bounded by design — triage runs after every commission completion and meeting close, so the cost-per-trigger has to be small. `TRIAGE_MAX_TURNS = 10` caps session length; if the triage can't decide in 10 turns, the outcome wasn't worth memory either way.

## Tool surface is limited to memory I/O

`buildMemoryTools(guildHallHome, projectName)` constructs an MCP server with only `read_memory` and `edit_memory`. Triage cannot read files, walk the project, search code, or do anything else. The decision must be made from the prompt + memory state — there is no exploration phase.

The worker name passed to memory handlers is `"outcome-triage"`. The base toolbox's read-before-write guard (REQ-MEM-27) enforces that triage call `read_memory` for the project scope before any `edit_memory` write — so triage always sees current memory state before adding to it.

## Project scope only

The prompt says "Write to the 'project' scope only." The tools accept all three scopes; the prompt is policy, not enforcement. Triage isn't supposed to write to global (cross-project) or worker (its own private) scope — both would be in the wrong scope for outcome-triggered facts.

## System prompt is the whole template; user message is trivial

`assemblePrompt(input)` substitutes six placeholders into `TRIAGE_PROMPT_TEMPLATE`: input type, worker name, task description, outcome status, result text, artifact list. The user message is the constant "Triage the outcome described in your instructions. Read project memory first, then write entries if anything is worth remembering."

The interesting content is in the system prompt because the template body (the categories, the rules, the "what to skip" list) is constant — caches across every triage run. Putting outcome-specific content in the system prompt is the deliberate caching choice.

## Six memory-worthy categories define the contract

The prompt enumerates: **Decisions**, **Discoveries**, **Capabilities**, **Failures worth noting**, **Process lessons**, **Status changes**, **User direction**. Plus a "What to Skip" list (routine completions, transient failures, process details, info already in memory or in the artifact, restating what the worker said). Changing this list changes what triage will accept as memory-worthy across the entire system.

## No-write outcomes are the expected default

"Most outcomes produce nothing worth remembering... If nothing is worth remembering, do nothing." Triage is for rare signal, not every commission. A successful spec-compliant commission with no surprises should produce zero memory writes. The triage prompt emphasizes this so the model doesn't write something just because it ran.

## One fact per entry, dated, append-mostly

The prompt requires every entry be a standalone fact understandable months later, include a date (e.g., `2026-03-20`), keep entries to 1-2 sentences, and use `append` over `upsert` (upsert only for replacing outdated facts). A meeting with five decisions produces five entries, not one combined entry — granularity matters because entries are independently retrievable from the section.

Section names should match existing sections when the topic fits; new sections only when nothing fits. This keeps the project-scope memory file from growing a section per triage.

## Artifact reader walks integration first, then state-file fallback for commissions

`createArtifactReader(config, guildHallHome)` returns a function that:

1. Walks each project's integration worktree, trying `resolveCommissionArtifactPath` / `resolveMeetingArtifactPath` (dual-layout). First hit wins.
2. For commissions only: if the integration walk finds nothing, reads the commission's state file for `worktreeDir` and tries the activity worktree. This handles the window between `commission_result` and squash-merge, when the artifact still lives in the activity worktree.

Meetings have no fallback. By the time `meeting_ended` fires, the meeting is closed and the artifact is in integration. If it isn't, the meeting wasn't closed properly and there's nothing to triage.

## Commission triage pulls decisions from state, not the artifact

Commission decisions are stored in `state/commissions/<id>/decisions.jsonl` during the session and only appended to the artifact body *after* squash-merge. The `commission_result` event fires before squash-merge — so triage reads the JSONL directly via `decisions-persistence` and concatenates the formatted decisions onto `resultText`. Best-effort: a failure to read decisions falls through silently, and the triage runs with just the result summary.

## Meeting triage uses the artifact body as `resultText`

Meetings write notes to the artifact body during `closeMeeting` via `closeArtifact`. The artifact reader returns `notesText` (the parsed body) for meetings; commissions don't have this field. The triage feeds `notesText` (or "No notes generated.") into the prompt as `{result_text}`.

## Triage runs after the activity finalizes, not during

`commission_result` is emitted by the commission toolbox tool, which fires AFTER the orchestrator has written the result to the artifact and AFTER squash-merge has committed it. `meeting_ended` is emitted at the end of `closeMeeting` after notes are written, the worktree is removed, and the artifact is finalized. Triage sees a settled activity, never an in-flight one.

## Silent failure path

A triage error is caught at the IIFE boundary and logged as a warning. There is no retry, no escalation, no record on the artifact. A failed triage simply means no memory write happened for that outcome — equivalent to triage deciding nothing was worth remembering.

## Daemon owns the subscription

`createOutcomeTriage(deps)` returns an `unsubscribe` function. The daemon calls it once at startup (in `createProductionApp`) and stores the unsubscribe function for shutdown. Without explicit unsubscribe, the EventBus would still hold a reference to the dead subscriber on hot reloads or shutdown sequences. The daemon's shutdown path (in `app.ts`) calls `unsubscribeTriage()` alongside the other cleanup hooks.
