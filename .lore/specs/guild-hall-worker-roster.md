---
title: Guild Hall Worker Roster
date: 2026-02-25
status: draft
tags: [workers, roster, posture, developer, reviewer, researcher, writer, test-engineer]
modules: [guild-hall-workers]
related:
  - .lore/brainstorm/worker-roster-generic-workers.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
req-prefix: WRS
---

# Spec: Guild Hall Worker Roster

## Overview

Guild Hall needs a practical default roster of generic workers so the manager can delegate real work. This spec defines five project-agnostic workers (Developer, Code Reviewer, Researcher, Technical Writer, Test Engineer), their required metadata, posture depth, and validation criteria. This spec specializes worker identity and posture selection behavior while preserving the core worker runtime contract defined in the Workers and System specs.

## Entry Points

- Manager or user creates a commission and needs to select an appropriate worker (from [Spec: guild-hall-commissions](guild-hall-commissions.md))
- UI displays available workers and their descriptions for selection (from [Spec: guild-hall-views](guild-hall-views.md))
- Package discovery loads worker definitions from installed packages (from [Spec: guild-hall-workers](guild-hall-workers.md))

## Requirements

- REQ-WRS-1: The default generic roster MUST include five worker packages: `guild-hall-developer`, `guild-hall-reviewer`, `guild-hall-researcher`, `guild-hall-writer`, and `guild-hall-test-engineer`. Additional workers MAY coexist.

- REQ-WRS-2: Each roster worker MUST conform to the existing worker package API in [Spec: guild-hall-workers](guild-hall-workers.md) (identity metadata, posture, toolbox requirements, built-in tool requirements, checkout scope, resource defaults). This spec does not introduce a new package contract.

- REQ-WRS-3: Roster workers MUST share a common activation implementation pattern; role differentiation MUST be encoded in package metadata and posture content, not custom per-role runtime wiring.

- REQ-WRS-4: Each roster worker posture MUST include three explicit sections: Principles, Workflow, and Quality Standards/Checklist.

- REQ-WRS-5: Developer MUST be configured for implementation work with full checkout scope, base file tools plus Bash, and resource defaults suitable for non-trivial code changes.

- REQ-WRS-6: Code Reviewer MUST be configured for analysis-first behavior with full checkout scope and read-only posture constraints. Reviewer read-only behavior is enforced by posture and output expectations; this spec does not alter global base tool availability from [Spec: guild-hall-system](guild-hall-system.md). Reviewer outputs MUST be findings-first and non-mutating by default; suggested code changes are provided as explicit patch recommendations rather than direct edits.

- REQ-WRS-7: Researcher MUST be configured for investigation and synthesis with sparse checkout scope, web research capability, and ability to produce durable `.lore` outputs when requested.

- REQ-WRS-8: Technical Writer MUST be configured for documentation work with full checkout scope and explicit requirement to verify technical claims against actual code/configuration.

- REQ-WRS-9: Test Engineer MUST be configured for verification work with full checkout scope, base file tools plus Bash, and testing-focused posture standards.

- REQ-WRS-10: Worker `description` metadata MUST be written so manager routing is unambiguous by task intent (implement, review, research, document, test).

- REQ-WRS-11: The existing `sample-assistant` worker MUST be retired from default runtime selection after the five-worker roster is discoverable and validated in runtime flows. Any tests or docs that reference `sample-assistant` MUST be updated in the same migration; hard deletion is deferred until no active references remain.

- REQ-WRS-12: Roster adoption MUST preserve existing worker runtime safety and execution model from [Spec: guild-hall-workers](guild-hall-workers.md), including declared-tool execution boundaries and no per-invocation approval prompts.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Worker package implementation details | Need concrete package files and metadata values | [Spec: guild-hall-workers](guild-hall-workers.md) |
| Commission dispatch behavior | Need task-state transitions and dispatch lifecycle semantics | [Spec: guild-hall-commissions](guild-hall-commissions.md) |
| Meeting behavior | Need synchronous audience session behavior and lifecycle | [Spec: guild-hall-meetings](guild-hall-meetings.md) |
| Worker presentation in UI | Need rendering details for roster cards, picker, and status | [Spec: guild-hall-views](guild-hall-views.md) |

## Success Criteria

- [ ] Five generic workers are discoverable through worker discovery and visible to the UI
- [ ] Each worker has distinct identity metadata and posture aligned to its role
- [ ] Worker selection from descriptions passes predefined routing fixtures for representative intents
- [ ] Reviewer commissions produce structured findings without code edits
- [ ] Researcher commissions can produce source-backed recommendations and optional `.lore` artifacts
- [ ] Developer and Test Engineer can execute build/test commands when required
- [ ] Writer output references verified code/config behavior
- [ ] `sample-assistant` is removed without breaking worker discovery or existing flows

## AI Validation

**Defaults:**
- Unit tests with mocked time/network/filesystem/LLM calls (including Agent SDK `query()`)
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Package discovery test: the five roster workers are discovered and valid after migration; additional workers are allowed
- Metadata validation test: each worker package satisfies required `guildHall` metadata fields and valid checkout scope values
- Manager routing validation: worker descriptions map cleanly to representative commission intents (implement/review/research/document/test)
- Manager routing robustness: adversarial and overlapping intents produce an explicit confusion matrix and expected routing decisions
- Role behavior smoke tests: one commission per role verifies expected output posture (implementation diff, review findings, research synthesis with sources, documentation update, test additions)
- Reviewer behavior test: reviewer commissions produce findings and patch suggestions without direct file mutation
- Regression validation: no changes to base toolbox injection and permission-mode behavior for worker runtime

## Constraints

- Posture over permissions: role specialization is primarily behavioral, not a new permission system.
- No new worker or toolbox package APIs in this spec.
- No changes to checkout scope semantics, commission lifecycle, or meeting lifecycle.
- No new manager capabilities are introduced; this spec only improves roster quality and routability.

## Context

- [Brainstorm: Worker roster - generic workers for common development tasks](.lore/brainstorm/worker-roster-generic-workers.md)
- [Spec: Guild Hall Workers](.lore/specs/guild-hall-workers.md)
- [Spec: Guild Hall System](.lore/specs/guild-hall-system.md)
- [Spec: Guild Hall Commissions](.lore/specs/guild-hall-commissions.md)
- [Spec: Guild Hall Meetings](.lore/specs/guild-hall-meetings.md)
- [Spec: Guild Hall Views](.lore/specs/guild-hall-views.md)
- Prior-work findings: reviewer read-only posture must coexist with always-on base file tools from current system/worker specs; this spec codifies posture-level enforcement to avoid contract conflicts.
