---
title: "Decisions Surface"
date: 2026-03-20
status: open
author: Celeste
tags: [brainstorm, observability, decisions, ui, daemon-api]
parent: whats-missing-2026-03-20.md
---

# Decisions Surface

## Evidence

Workers call `record_decision(question, decision, reasoning)` during commissions and meetings. The tool exists in `daemon/services/base-toolbox.ts` and writes JSONL entries to `~/.guild-hall/state/{contextType}/{contextId}/decisions.jsonl`. The meeting notes generator at `daemon/services/meeting/notes-generator.ts` references decisions.

The problem: no REST endpoint exposes these decisions. The commission routes at `daemon/routes/commissions.ts` list 12 endpoints; none reads decisions. The meeting routes at `daemon/routes/meetings.ts` are the same. The web UI's commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) shows timeline entries and streaming output but not decisions. The meeting detail page is the same.

Decisions are written, then invisible. The user cannot see what reasoning a worker recorded during a commission without manually navigating to state files. Worse, commission state files are deleted after successful completion (`handleSuccessfulCompletion` in `daemon/services/commission/orchestrator.ts` calls cleanup). The decisions die with the state.

The briefing generator (`daemon/services/briefing-generator.ts`) also doesn't include decisions. A worker starting a new commission has no access to decisions made in previous commissions.

## Proposal

Three changes that make decisions visible:

1. **Persist decisions to the commission artifact.** When `handleSessionCompletion` runs, read the decisions JSONL and append a `## Decisions` section to the commission artifact body before state cleanup. The artifact already has timeline entries; decisions are higher-signal than most timeline entries.

2. **Add `GET /commission/:id/decisions` and `GET /meeting/:id/decisions` endpoints.** For active sessions, read from state files. For completed commissions, read from the artifact body.

3. **Show decisions in the web UI detail pages.** A collapsible "Decisions" section below the timeline. Each entry shows the question, the decision, and the reasoning.

## Rationale

Vision Principle 1 says artifacts are the work. Decisions are the *reasoning behind* the work. A commission that produced a spec also made decisions about what to include and what to defer. Those decisions are invisible unless the user reads the full transcript (which doesn't persist for commissions either). Surfacing decisions makes the artifact self-documenting: not just "what was produced" but "what was decided along the way."

## Vision Alignment

1. **Anti-goal check:** No conflict. Decisions surface existing data through existing channels (daemon API, web UI).
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is directly served. Principle 3 (Files Are Truth) is served by persisting decisions to the artifact. Principle 5 (One Boundary) is served by the route going through the daemon.
3. **Tension resolution:** No tension.
4. **Constraint check:** No new infrastructure. JSONL parsing, artifact body appending, and route creation are all established patterns.

## Scope

Small. One lifecycle hook (persist to artifact), two route handlers, one UI component.
