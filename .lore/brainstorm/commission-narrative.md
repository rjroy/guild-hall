---
title: "Commission Narrative"
date: 2026-03-20
status: parked
author: Celeste
tags: [brainstorm, commissions, observability, narrative, llm-mediated]
parent: whats-missing-2026-03-20.md
---

# Commission Narrative

## Evidence

Meetings and commissions produce fundamentally different records. A meeting stores its transcript in state files and generates notes via `daemon/services/meeting/notes-generator.ts`, which passes the transcript through an LLM to produce a structured summary. The user can read what happened and why. A commission stores nothing. The SDK session streams events to SSE for real-time display, but when the session ends, the only record is the `result_summary` field in the commission artifact's frontmatter and whatever the worker wrote as its deliverable.

The asymmetry is stark. A meeting that produced a spec leaves behind: the spec artifact, the meeting transcript, and LLM-generated notes that narrate how the conversation arrived at the spec. A commission that produced the same spec leaves behind: the spec artifact and a one-line summary. The reasoning, the false starts, the decisions about what to include and exclude, the files the worker read before choosing an approach: all gone.

The `record_decision` tool (see decisions-surface.md) captures explicit decision points, but most reasoning is implicit. A worker reads five files, notices a pattern in three of them, and proposes a design based on that observation. None of that appears in a decision record. It's the connective tissue between "I was asked to do X" and "I produced Y."

The commission detail page (`web/app/projects/[name]/commissions/[id]/page.tsx`) shows timeline entries (status transitions) and streaming output (live only). After completion, the page shows metadata and linked artifacts. The reasoning is absent.

## Proposal

At commission completion, before state cleanup, run a lightweight LLM pass that produces a commission narrative: a structured account of what the worker did, what it considered, what it decided, and why. Not a transcript dump. A retrospective written by a witness.

The narrative is written to the commission artifact body (like how `result_summary` is written to frontmatter, but richer). It becomes part of the artifact, inspectable, searchable, and available to future workers and briefings.

The shape could be:

```markdown
## Commission Narrative

**Approach:** Read the existing mail system implementation across 4 files in daemon/services/mail/.
Noticed the sender and queue were tightly coupled. Decided to separate them because the queue
needed independent testability.

**Key decisions:**
- Chose DI callback over event emission for mail delivery confirmation (consistent with sdk-logging.ts pattern)
- Left mail retry logic out of scope (no evidence of delivery failures in production)

**Files consulted:** daemon/services/mail/sender.ts, daemon/services/mail/queue.ts,
daemon/services/base-toolbox.ts, tests/daemon/services/mail/

**Artifacts produced:** .lore/specs/infrastructure/mail-refactor.md
```

This is not a verbatim transcript. It's what the meeting notes generator already does for meetings: an LLM-mediated view that applies judgment to what's worth surfacing. The generation uses the session events that are already streaming through the SDK runner. The existing `notes-generator.ts` pattern shows how to pass session content through an LLM for structured extraction.

## Rationale

Vision Principle 1 says artifacts are the work. But the commission artifact as it stands records *what* was produced, not *how* or *why*. The gap matters because commissions are the system's primary production mechanism. Twenty commissions a day, each one a black box between "prompt" and "result." When a result is wrong or surprising, the user's only diagnostic path is to dispatch another commission to investigate. The reasoning that produced the original result is gone.

Meetings don't have this problem because they're synchronous. The user was there. Commissions are asynchronous by design, which makes the reasoning gap a structural feature of the system, not an oversight.

## Vision Alignment

1. **Anti-goal check:** No conflict. The narrative is a durable artifact, not a chat log. It doesn't make commissions conversational (anti-goal 5). It doesn't modify worker identity (anti-goal 4).
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is the primary alignment. Commission artifacts become self-documenting: not just "what was produced" but "how and why." Principle 3 (Files Are Truth) served by writing the narrative to the artifact body. Principle 6 (Tools Are Atomic) respected because the narrative generation is a completion-time step in the orchestrator, not a smart tool.
3. **Tension resolution:** Files (3) vs. Performance is relevant: narrative generation adds an LLM call at completion. But it runs after the worker's session ends and before state cleanup, so it doesn't affect the worker's turn budget or the user's wait time for results. The artifact write is a single append.
4. **Constraint check:** The notes-generator pattern exists. The SDK runner already emits session events. The orchestrator already has a completion handler where narrative generation slots naturally. The LLM call uses the same SDK infrastructure.

## Scope

Medium. Narrative generation service (modeled on notes-generator), orchestrator integration at completion, artifact body append. No new routes or UI required in v1 (the narrative is visible in the existing artifact detail view).
