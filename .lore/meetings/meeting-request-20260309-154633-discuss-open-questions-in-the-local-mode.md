---
title: "Discuss open questions in the local model support plan (.lore/plans/local-model-support.md). The spec is approved but the plan has design decisions that need user input before implementation can start."
date: 2026-03-09
status: closed
result_summary: "All open questions in the local model support plan resolved. Six codebase verifications confirmed existing error handling is adequate (with one gap found in mail reader timeline tracking, added to plan). Model name character restriction decided ([a-zA-Z0-9_-]+) and added to spec REQ-LOCAL-1. Model-selection spec updated with local model cross-references. Plan marked approved."
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Octavia"
agenda: "Discuss open questions in the local model support plan (.lore/plans/local-model-support.md). The spec is approved but the plan has design decisions that need user input before implementation can start."
deferred_until: ""
linked_artifacts:
  - .lore/plans/local-model-support.md
  - .lore/specs/local-model-support.md
  - .lore/issues/local-model-support.md
  - specs/model-selection.md
meeting_log:
  - timestamp: 2026-03-09T22:53:33.555Z
    event: opened
    reason: "User accepted meeting request"
  - timestamp: 2026-03-10T01:10:28.714Z
    event: progress_summary
    reason: "All three agenda items resolved:\n\n1. **Codebase verification** (6 questions investigated):\n   - Meeting orchestrator: checks `{ ok: false }`, surfaces error via SSE. Meeting stays \"open\" for retry. No change needed.\n   - Mail orchestrator: checks `{ ok: false }`, wakes sender with error. Gap found: no timeline event recorded for reader prep failures. Plan updated to add `mail_reader_failed` timeline append.\n   - Briefing generator: correctly falls back to template. No change needed.\n   - resolvedModel guard: already present via conditional spread. Confirmed safe.\n   - GuildHallToolServices: found at `toolbox-utils.ts:28-34`, constructed in 2 places (commission + meeting orchestrator). Plan Step 6 updated with both sites.\n   - Circular import: confirmed safe, one-way dependency.\n\n2. **Model name restriction**: Decision recorded. Names restricted to `[a-zA-Z0-9_-]+`. Spec REQ-LOCAL-1 updated, plan Step 1 updated with `.refine()`.\n\n3. **Spec cross-references**: Model-selection spec updated with references to REQ-LOCAL-2, REQ-LOCAL-8, REQ-LOCAL-9, REQ-LOCAL-19, REQ-LOCAL-22. Local model support spec added to related list.\n\nPlan status changed from draft to approved. All open questions resolved."
  - timestamp: 2026-03-10T01:14:51.298Z
    event: closed
    reason: "User closed audience"
---
Meeting Notes — Discuss Open Questions in the Local Model Support Plan
Date: 2026-03-09 | Worker: Octavia | Status: Closed

DISCUSSION SUMMARY

The meeting addressed open design questions in the local model support plan before implementation could begin. The agenda had three areas: codebase verification of six outstanding questions, a decision on model name character restrictions, and ensuring cross-references between the local model support spec and the model-selection spec were complete and accurate.

Codebase verification resolved all six questions without requiring architectural changes. The meeting orchestrator correctly surfaces prep failures via SSE and keeps the meeting open for retry. The briefing generator falls back to a template when the SDK is unavailable. One gap was identified: the mail orchestrator does not record a timeline event when a mail reader prep fails. The plan was updated to add a mail_reader_failed timeline append. The GuildHallToolServices interface was located at toolbox-utils.ts lines 28-34, and services objects are constructed in exactly two places — the commission orchestrator and the meeting orchestrator — both gated on the worker being the Guild Master. The resolvedModel guard was confirmed present via conditional spread. No circular import issues were found; the dependency is one-way.

With codebase questions resolved, the model name restriction decision was made and recorded, and spec cross-references between the model-selection spec and local model support spec were added in both directions. The plan status was updated from draft to approved. The user confirmed approval at the end of the meeting and directed it to be closed.

KEY DECISIONS

Model names for local models are restricted to characters matching [a-zA-Z0-9_-]. This will be enforced via a .refine() call on the modelDefinitionSchema.name field. The reasoning is that model names flow into YAML frontmatter in commission artifacts and worker metadata files, where they appear unquoted. Characters such as colons, brackets, or spaces would break YAML parsing. The chosen character set covers realistic local model naming conventions (examples: llama3, mistral-local, qwen2_5) while guaranteeing safe serialization.

ARTIFACTS PRODUCED OR REFERENCED

Four artifacts are linked to this meeting. The local model support plan (.lore/plans/local-model-support.md) was updated in multiple places: Step 1 updated to include the .refine() validation, Step 6 updated with both construction sites for GuildHallToolServices, and the mail reader gap addressed by adding a mail_reader_failed timeline event. Plan status changed from draft to approved. The local model support spec (.lore/specs/local-model-support.md) was updated with the model name restriction in REQ-LOCAL-1. The model-selection spec (.lore/specs/model-selection.md) was updated to include cross-references to REQ-LOCAL-2, REQ-LOCAL-8, REQ-LOCAL-9, REQ-LOCAL-19, and REQ-LOCAL-22, and the local model support spec was added to its related list. The local model support issue (.lore/issues/local-model-support.md) was referenced throughout for background.

OPEN ITEMS AND FOLLOW-UPS

No open items remain from this meeting. All agenda questions were resolved and both the spec and plan are approved. Implementation can begin. The mail reader timeline gap (no event recorded on prep failure) was added to the plan and should be addressed as part of the implementation work in the relevant step.
