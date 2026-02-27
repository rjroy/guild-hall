---
title: Guild Hall Worker Roster Implementation Plan
date: 2026-02-25
status: implemented
tags: [plan, workers, roster, migration, validation]
modules: [guild-hall-workers, guild-hall-core, guild-hall-ui]
related:
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/brainstorm/worker-roster-generic-workers.md
  - .lore/plans/phase-2-workers-first-audience.md
---

# Plan: Guild Hall Worker Roster

## Spec Reference

**Spec**: `.lore/specs/guild-hall-worker-roster.md`
**Design**: None

Requirements addressed:
- REQ-WRS-1 (five default workers) -> Steps 1, 2, 5
- REQ-WRS-2 (existing worker package API) -> Steps 1, 2, 7
- REQ-WRS-3 (shared activation pattern) -> Steps 1, 3
- REQ-WRS-4 (posture sections) -> Step 3
- REQ-WRS-5 (developer config) -> Step 2
- REQ-WRS-6 (reviewer analysis-first, non-mutating output) -> Steps 2, 3, 6
- REQ-WRS-7 (researcher sparse + web + durable lore output) -> Steps 2, 3, 6
- REQ-WRS-8 (writer verifies technical claims) -> Steps 2, 3, 6
- REQ-WRS-9 (test engineer verification posture + bash) -> Steps 2, 3, 6
- REQ-WRS-10 (unambiguous routing descriptions) -> Steps 2, 6
- REQ-WRS-11 (retire sample-assistant from defaults, update docs/tests) -> Steps 5, 6, 7
- REQ-WRS-12 (preserve safety/execution model) -> Steps 4, 7

## Codebase Context

- Worker discovery and metadata validation are centralized in `lib/packages.ts` (`discoverPackages`, `workerMetadataSchema`, `getWorkers`, `getWorkerByName`).
- Runtime package loading happens in `daemon/app.ts` by scanning local `packages/` and installed `~/.guild-hall/packages/`, then prepending the built-in manager package.
- Worker list UI path is stable and metadata-driven: `daemon/routes/workers.ts` -> `app/api/workers/route.ts` -> `components/ui/WorkerPicker.tsx` and `components/commission/CommissionForm.tsx`.
- Meeting and commission dispatch paths resolve workers by identity name from persisted artifacts (`daemon/services/meeting-session.ts`, `daemon/services/commission-session.ts`), so identity uniqueness matters during migration.
- `packages/sample-assistant/` is currently the only in-repo worker package and is heavily referenced by tests under `tests/daemon/` and `tests/packages/`.

## Implementation Steps

### Step 1: Add shared roster worker foundation and install path

**Files**: `packages/` (new worker package directories), shared activation utility in `packages/` as needed, default-worker seeding path in daemon/CLI startup wiring, `tests/packages/*`, `tests/daemon/*`
**Addresses**: REQ-WRS-1, REQ-WRS-2, REQ-WRS-3
**Expertise**: none needed

Create five worker packages:
- `guild-hall-developer`
- `guild-hall-reviewer`
- `guild-hall-researcher`
- `guild-hall-writer`
- `guild-hall-test-engineer`

Use the current worker package contract (`guildHall` metadata + `activate(context)` export). Keep runtime wiring generic by sharing a common activation implementation pattern (single builder used across all five workers) and encode role differences in metadata/posture only.

Define how defaults reach production runtime (`~/.guild-hall/packages/`): add a deterministic seeding step that installs bundled default workers when missing (idempotent, non-destructive for user-installed packages). This closes the gap between repo-local worker definitions and default production discovery.

### Step 2: Define role metadata and capability profiles

**Files**: `packages/guild-hall-developer/package.json`, `packages/guild-hall-reviewer/package.json`, `packages/guild-hall-researcher/package.json`, `packages/guild-hall-writer/package.json`, `packages/guild-hall-test-engineer/package.json`
**Addresses**: REQ-WRS-4, REQ-WRS-5, REQ-WRS-6, REQ-WRS-7, REQ-WRS-8, REQ-WRS-9, REQ-WRS-10
**Expertise**: none needed

Set each package `guildHall.identity` and execution metadata so routing is unambiguous by task intent:
- Developer: implementation-focused description, `checkoutScope: full`, base file tools + `Bash`, practical resource defaults.
- Reviewer: analysis-first description, `checkoutScope: full`, outputs oriented to findings and explicit patch recommendations.
- Researcher: investigation-first description, `checkoutScope: sparse`, includes web research built-ins.
- Writer: documentation-first description, `checkoutScope: full`, emphasizes technical claim verification against repo state.
- Test Engineer: verification-first description, `checkoutScope: full`, base file tools + `Bash` for test/build execution.

Ensure each posture has exactly three explicit sections: Principles, Workflow, Quality Standards/Checklist.

### Step 3: Encode posture guardrails for role behavior

**Files**: `packages/guild-hall-*/index.ts` (or shared posture template files if used)
**Addresses**: REQ-WRS-3, REQ-WRS-4, REQ-WRS-6, REQ-WRS-7, REQ-WRS-8, REQ-WRS-9
**Expertise**: none needed

Implement role behavior through posture content only:
- Reviewer: non-mutating behavior, findings-first format, and recommended changes only as explicit patch text (no direct file edits).
- Researcher: source-backed synthesis, uncertainty handling, optional `.lore` artifact output when requested.
- Writer: mandatory technical verification against code/config before asserting claims.
- Developer/Test Engineer: concrete execution quality bars (tests, failure analysis, verification steps).

Do not introduce role-specific runtime permissions or custom execution branches.

### Step 4: Preserve runtime safety and tool-injection invariants

**Files**: `daemon/services/meeting-session.ts`, `daemon/commission-worker.ts`, `daemon/services/notes-generator.ts`, `daemon/services/briefing-generator.ts`, `daemon/services/toolbox-resolver.ts`, associated tests
**Addresses**: REQ-WRS-12
**Expertise**: Agent SDK/runtime behavior

Add regression tests (or strengthen existing tests) confirming roster migration does not alter:
- Base toolbox injection behavior
- Declared-tool execution boundaries
- Permission mode and skip-permission configuration
- No filesystem settings inheritance behavior

Cover every SDK invocation path used by workers (meeting turns, commission worker process, notes generation, briefing generation) so this requirement is verified end-to-end rather than only in one service.

This step is guardrail-first and should pass before sample-assistant retirement.

### Step 5: Adopt roster as default discoverable set (dev + production)

**Files**: package discovery tests and worker listing tests in `tests/lib/`, `tests/daemon/`, `tests/components/`, daemon startup tests in `tests/daemon/`
**Addresses**: REQ-WRS-1, REQ-WRS-11
**Expertise**: none needed

Update tests and fixtures to assert the five-worker roster is discoverable and visible via worker APIs/UI entry points. Change brittle assumptions that depend on a single sample worker (first/only worker) to set-based assertions and role-targeted fixtures.

Make the default-runtime target explicit:
- Dev mode: discovery via `--packages-dir` override (workspace `packages/`)
- Production/default mode: discovery from `~/.guild-hall/packages/`

Add startup/discovery tests for both modes so "default roster" behavior is defined and verified in runtime flows, including the seeding path from Step 1.

Add an identity uniqueness test to prevent ambiguous worker resolution when meeting/commission artifacts store worker identity names.

### Step 6: Add routing and behavior validation suite

**Files**: tests under `tests/daemon/`, `tests/integration/`, and role-specific tests under `tests/packages/`
**Addresses**: REQ-WRS-6, REQ-WRS-7, REQ-WRS-8, REQ-WRS-9, REQ-WRS-10
**Expertise**: none needed

Implement validation fixtures for representative intents:
- implement -> developer
- review -> reviewer
- research -> researcher
- document -> writer
- test -> test engineer

Use deterministic routing validation instead of LLM-behavior assertions:
- description-quality rubric tests (keyword/intent coverage and disambiguation checks)
- fixture-based expected role labels for representative and adversarial intents
- explicit confusion-matrix artifact generated from fixture expectations (not model output)

If live-manager routing smoke tests are added, keep them non-blocking and informational only.

Add role smoke tests (one per role) verifying expected output posture, including reviewer non-mutation behavior.

### Step 7: Retire sample-assistant safely

**Files**: `packages/sample-assistant/*`, all tests/docs referencing sample worker, any seed fixtures
**Addresses**: REQ-WRS-11, REQ-WRS-2, REQ-WRS-12
**Expertise**: none needed

Perform staged retirement:
1. Remove `sample-assistant` from default selection/discovery expectations once five-worker tests pass.
2. Update all tests/docs referencing sample-assistant in the same change.
3. Add migration safety gate: verify no open meeting/commission state files and no active artifacts still reference sample worker identity/package names.
4. Hard-delete `packages/sample-assistant/` only when no active references remain and the safety gate passes.

Run full regression (`bun test`, targeted daemon + UI suites) to ensure no behavior regressions.

### Step 8: Validate Against Spec

Launch a fresh-context sub-agent review (`lore-development:plan-reviewer` during planning, then implementation validation reviewer after code changes) that reads:
- `.lore/specs/guild-hall-worker-roster.md`
- this plan
- eventual implementation diff

Validation must explicitly check all REQ-WRS-1 through REQ-WRS-12 and flag any uncovered requirement or runtime invariant regression.

## Delegation Guide

Steps requiring specialized expertise:
- Step 4: Agent SDK/runtime regression validation (use `agent-sdk-dev:agent-sdk-verifier-ts`)
- Step 6: Test rigor and coverage quality review (use `pr-review-toolkit:pr-test-analyzer`)
- Step 8: Fresh-context plan/spec coverage review (use `lore-development:plan-reviewer`)

General implementation and migration execution can use `general-purpose` or `Explore` for targeted code search.

## Open Questions

- None blocking for implementation.