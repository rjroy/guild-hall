---
title: "Plan: Worker Identity and Personality"
date: 2026-03-06
status: executed
tags: [workers, personality, identity, soul, system-prompt]
modules: [packages, daemon, lib]
related:
  - .lore/specs/worker-identity-and-personality.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/research/soul-md-personality-techniques.md
  - .lore/plans/worker-posture-to-markdown.md
---

# Plan: Worker Identity and Personality

## Spec Reference

**Spec**: `.lore/specs/worker-identity-and-personality.md`

Requirements addressed:

- REQ-WID-1: soul.md file in each worker package -> Steps 6, 7
- REQ-WID-2: Three sections (Character, Voice, Vibe) -> Steps 6, 7
- REQ-WID-3: Character section in identity framing -> Steps 6, 7
- REQ-WID-4: Voice section with anti-examples and calibration pairs -> Steps 6, 7
- REQ-WID-5: Vibe section as metaphorical summary -> Steps 6, 7
- REQ-WID-6: Soul file under 80 lines -> Steps 6, 7
- REQ-WID-7: Posture files no longer contain personality content -> Step 5
- REQ-WID-8: Posture retains Principles/Workflow/Quality Standards -> Step 5
- REQ-WID-9: Package structure is package.json + soul.md + posture.md + index.ts -> Steps 5, 6
- REQ-WID-10: Identity block in package.json unchanged -> No code change (verified by tests)
- REQ-WID-11: Discovery loads soul.md alongside posture.md -> Step 2
- REQ-WID-12: WorkerMetadata gains optional soul field -> Step 1
- REQ-WID-13: System prompt assembly order: soul, identity, posture, memory, context -> Step 3
- REQ-WID-14: ActivationContext gains optional soul field, session preparation passes it -> Steps 1, 4
- REQ-WID-15: Manager adopts soul/posture separation -> Step 7
- REQ-WID-16: Soul content is stable across activations -> Verified by tests in Steps 3, 4
- REQ-WID-17: Soul content not configurable per commission/project/user -> No code change (inherent from design)

## Codebase Context

### Key Files

| File | Role | Changes Expected |
|------|------|-----------------|
| `lib/types.ts:62-73` | `WorkerMetadata` interface | Add optional `soul` field |
| `lib/types.ts:113-136` | `ActivationContext` interface | Add optional `soul` field |
| `lib/packages.ts:48-57` | `workerMetadataSchema` Zod schema | Add optional `soul` field |
| `lib/packages.ts:158-179` | Soul/posture loading in `discoverPackages()` | Load `soul.md` alongside `posture.md` |
| `packages/shared/worker-activation.ts:3-50` | `buildSystemPrompt()` | New assembly order: soul, identity, posture, memory, context |
| `daemon/lib/agent-sdk/sdk-runner.ts:237-249` | `ActivationContext` construction | Pass `workerMeta.soul` into context |
| `daemon/services/manager/worker.ts:16-31` | `MANAGER_POSTURE` constant | Split into `MANAGER_SOUL` + `MANAGER_POSTURE` |
| `daemon/services/manager/worker.ts:104-124` | `activateManager()` | Adopt soul-first assembly order, include identity metadata |
| `packages/guild-hall-*/posture.md` | Worker posture files | Remove Vibe line |
| `packages/guild-hall-*/soul.md` | Worker soul files (new) | Create with Character, Voice, Vibe sections |

### Patterns to Follow

- **File loading**: The posture-to-markdown migration (`lib/packages.ts:158-178`) established the pattern for loading markdown files during discovery. Soul loading follows the same try/catch pattern but treats absence as a warning, not a skip condition.
- **Type/schema symmetry**: Changes to `WorkerMetadata` and `ActivationContext` TypeScript interfaces must have matching Zod schema updates. The Zod schema is the validation boundary; the TypeScript type is the consumption boundary.
- **Manager divergence**: The manager worker uses inline constants and a separate activation function. This plan maintains that pattern (soul as inline constant) rather than introducing a filesystem dependency for a built-in worker.
- **Test factory functions**: `validWorkerGuildHall()` in `tests/lib/packages.test.ts` and `makeContext()` in `tests/daemon/services/manager-worker.test.ts` are the factories that need updating when interfaces change.

### Integration Points

- `sdk-runner.ts:237-249` constructs `ActivationContext` from `workerMeta`. Adding `soul: workerMeta.soul` is a one-line wiring change. The field is optional on both sides, so undefined propagates cleanly.
- `sdk-runner.ts:265` appends the assembled system prompt to the Claude Code preset. The soul content prepended to the prompt will appear after the preset's operational instructions. The spec notes this is unlikely to conflict since the preset defines behavior, not character.
- The REST API (`daemon/routes/workers.ts:26-44`) serves identity metadata to the UI. Soul content is not exposed. No changes needed.
- The UI components (`WorkerPicker.tsx`, `WorkerPortrait.tsx`) consume identity metadata only. No changes needed.

## Implementation Steps

### Step 1: Add soul field to types and Zod schema

**Files**: `lib/types.ts`, `lib/packages.ts`
**Addresses**: REQ-WID-12, REQ-WID-14 (type side)

Add `soul?: string` to the `WorkerMetadata` interface (`lib/types.ts:62-73`), after the `posture` field at line 65.

Add `soul?: string` to the `ActivationContext` interface (`lib/types.ts:113-136`), after the `posture` field at line 115.

Add `soul: z.string().optional()` to `workerMetadataSchema` in `lib/packages.ts:48-57`, after the `posture` field at line 51.

These are pure additive changes. All existing code continues to work because the field is optional on all three surfaces.

**Test strategy**:
- Verify `workerMetadataSchema` validates successfully with soul present (string value)
- Verify `workerMetadataSchema` validates successfully with soul absent (field omitted)
- Verify `workerMetadataSchema` rejects soul with wrong type (number, object)
- Run existing test suite to confirm no regressions

**Verification**: `bun test tests/lib/packages.test.ts` passes, including new schema tests.

### Step 2: Load soul.md in package discovery

**Files**: `lib/packages.ts` (inside the worker branch of the discovery loop, lines 158-179)
**Addresses**: REQ-WID-11

After the posture resolution block (line 178), add soul loading using the same try/catch pattern:

1. Attempt to read `soul.md` from the package directory (`path.join(pkgDir, "soul.md")`)
2. If it exists, trim the content and set it on the metadata object: `(metadata as WorkerMetadata).soul = soulContent`
3. If it doesn't exist, log a warning (`console.warn`) and continue. The worker is valid without soul content.

Soul is NOT a hard requirement for package validity. A missing `soul.md` produces a warning, not a skip. This is the asymmetry the spec calls out: posture is required (no posture = skip), soul is optional (no soul = generic but functional).

**Test strategy** (in `tests/lib/packages.test.ts`):
- `discovers soul from soul.md file`: Write a worker package with a `soul.md` file, verify `metadata.soul` contains the file content (trimmed)
- `worker without soul.md is still valid`: Write a worker package with no `soul.md`, verify it's discovered successfully with `soul` undefined, and a warning was logged
- `soul.md loading does not affect posture loading`: Write a package with both `soul.md` and `posture.md`, verify both fields are populated independently

Add a `writePackageWithSoul(scanDir, dirName, pkgJson, postureContent, soulContent?)` helper that extends the existing test factory, or add soul support to the existing `writePackageWithPosture` helper if one exists.

**Verification**: `bun test tests/lib/packages.test.ts` passes with new soul discovery tests.

### Step 3: Update system prompt assembly order

**Files**: `packages/shared/worker-activation.ts:3-50`
**Addresses**: REQ-WID-13

Rewrite `buildSystemPrompt()` to follow the new assembly order:

1. **Soul** (if present on context): `context.soul`
2. **Identity metadata** (always present): name, displayTitle, description lines
3. **Posture** (always present): `context.posture`
4. **Injected memory** (if present): `context.injectedMemory`
5. **Activity context** (if present): meeting agenda or commission prompt

Current order is: posture (line 4), identity (lines 6-13), memory (lines 15-17), context (lines 19-47). The change moves identity before posture, and prepends soul.

The `ActivationContext` type already gained the optional `soul` field in Step 1.

**Test strategy** (new test file `tests/packages/worker-activation.test.ts`):
- `prompt order: soul before identity before posture`: Provide all three, verify they appear in order with soul first, then identity, then posture
- `identity before posture when soul is absent`: When soul is undefined, the prompt must start with identity metadata then posture (not the old posture-first order). This is a deliberate behavior change per REQ-WID-13. The previous order was posture, identity; the new order is identity, posture regardless of soul presence.
- `soul content is included verbatim`: Verify soul text appears unmodified in the prompt
- `activity context still appended after memory`: Verify meeting/commission context is still at the end
- `stability: same inputs produce identical output`: Call twice with same context, verify identical prompts (REQ-WID-16)

**Verification**: `bun test tests/packages/worker-activation.test.ts` passes. Then run `bun test` for full suite to check for regressions.

### Step 4: Wire soul through session preparation

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts:237-249`
**Addresses**: REQ-WID-14 (wiring side)

Add `soul: workerMeta.soul` to the `ActivationContext` object constructed at lines 237-249. This is a single line addition. The field is optional on both `WorkerMetadata` and `ActivationContext`, so undefined flows through without issue.

**Test strategy**: This is a one-line wiring change. The risk is omission (forgetting to wire it), not incorrect logic. The prompt assembly tests from Step 3 validate the end-to-end behavior. For direct verification:
- Confirm the `ActivationContext` object in `prepareSdkSession()` includes `soul` alongside `identity` and `posture`
- Run existing `sdk-runner` tests to confirm no regressions

If there are no existing unit tests for `prepareSdkSession()` (it appears to be tested indirectly through integration), the fresh-eyes review in Step 9 should explicitly check this wiring.

**Verification**: `bun test` full suite passes. Code review confirms wiring.

### Step 5: Remove Vibe lines from posture files

**Files**: `packages/guild-hall-{developer,researcher,reviewer,test-engineer,writer}/posture.md`
**Addresses**: REQ-WID-7, REQ-WID-8, REQ-WID-9

Remove the first line ("Vibe: ...") and the blank line following it from each posture file. Each file should now start directly with "Principles:".

Current first lines:
- developer: `Vibe: Steady and workmanlike. Not cold, not chatty...`
- researcher: (check file)
- reviewer: (check file)
- test-engineer: (check file)
- writer: `Vibe: Warm but precise. Takes pride in getting the words right...`

After this step, posture files contain only operational content: Principles, Workflow, Quality Standards. No personality content remains.

Preserve the exact Vibe text from each posture file. It will be used in the corresponding soul.md (Step 6).

**Test strategy**:
- Existing test `each roster posture has exactly three explicit sections` (`tests/packages/worker-roster.test.ts:141-154`) should continue to pass, since it checks for Principles/Workflow/Quality Standards sections, not Vibe
- Existing test `each role posture encodes Phase 3 guardrails` (same file, lines 156-167) should pass since guardrails are in the operational sections
- Verify no posture file starts with "Vibe:" after the change

**Verification**: `bun test tests/packages/worker-roster.test.ts` passes. Grep for "Vibe:" in posture files returns no results.

### Step 6: Create soul.md files for five roster workers

**Files**: `packages/guild-hall-{developer,researcher,reviewer,test-engineer,writer}/soul.md` (new files)
**Addresses**: REQ-WID-1, REQ-WID-2, REQ-WID-3, REQ-WID-4, REQ-WID-5, REQ-WID-6, REQ-WID-9

Create a `soul.md` file in each of the five worker package directories. Each file must contain three sections with `##` headers: **Character**, **Voice**, and **Vibe**.

**Structure per file:**
```markdown
## Character

[5-15 lines of identity-framing prose in second person]

## Voice

### Anti-examples

[2-4 "Don't..." lines]

### Calibration pairs

[1-3 Flat/Alive pairs]

## Vibe

[1-3 sentences, migrated from the posture file's Vibe line]
```

Content guidelines from the spec:
- **Character**: Identity framing ("You are..."), not instruction framing ("Be..."). Fantasy guild aesthetic is part of character. 5-15 lines.
- **Voice anti-examples**: Target generic AI patterns and role-specific failure modes.
- **Voice calibration pairs**: Flat (generic) vs. alive (in-character). More pairs for voice-critical roles (researcher, writer), fewer for precision roles (test-engineer).
- **Vibe**: Migrate the existing Vibe line from posture. May expand slightly but keep to 1-3 sentences.
- **Total**: Under 80 lines per file.

The spec explicitly states: "This spec defines structure, not content. Writing the actual soul.md files for each roster worker is a separate task." The soul content should be handcrafted. This step creates the files with proper structure. If the plan implementer is the writer worker, they should draft content in character. If the implementer is a developer, they should create structurally correct files with placeholder content and flag the need for a writer to refine.

**Test strategy** (add to `tests/packages/worker-roster.test.ts`):
- `each roster package has a soul.md file`: Verify file exists for all five workers
- `each roster soul.md has three sections (Character, Voice, Vibe)`: Parse section headers, verify all three present
- `soul files are under 80 lines`: Count lines, verify each is under 80
- `soul files contain no operational content`: Grep for Principles/Workflow/Quality Standards keywords that would indicate posture leakage

**Verification**: `bun test tests/packages/worker-roster.test.ts` passes with new soul tests.

### Step 7: Split manager posture into soul and posture

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-WID-15

The manager's `MANAGER_POSTURE` constant (lines 16-31) currently mixes personality and methodology. Split it into two constants:

**`MANAGER_SOUL`**: The personality content that survives a role change. From the current posture, this includes the Vibe line ("Authoritative but measured...") and the role identity line ("You are the Guild Master, the coordination specialist for this project."). Expand into the three-section soul structure: Character, Voice, Vibe.

**`MANAGER_POSTURE`**: The operational methodology. From the current posture, this includes: tool descriptions ("You have tools to create commissions..."), dispatch behavior ("When the user agrees on work..."), deference rules ("Defer to the user on..."), and working style ("Be direct. Present status...").

Update `createManagerPackage()` (lines 38-64) to set `soul: MANAGER_SOUL` on the metadata object alongside the existing `posture: MANAGER_POSTURE`.

Update `activateManager()` (lines 104-124) to follow the same assembly order as `buildSystemPrompt()`:
1. Soul (from `context.soul` or fall back to `MANAGER_SOUL` -- but since `prepareSdkSession` passes `workerMeta.soul` into context, and `createManagerPackage` sets `soul`, the context will have it)
2. Identity metadata (name, displayTitle, description from `context.identity` -- currently omitted by the manager, this is a behavior change)
3. Posture (from `context.posture`)
4. Injected memory (from `context.injectedMemory`)
5. Manager context (from `context.managerContext`)

The spec identifies three required changes: split the constant, update the assembly order, and include identity metadata. All three happen in this step.

**Test strategy** (update `tests/daemon/services/manager-worker.test.ts`):
- `manager metadata has soul field`: Verify `createManagerPackage()` returns metadata with a non-empty `soul` string
- `manager soul contains personality content`: Check for character-relevant content (e.g., "Guild Master", personality descriptors)
- `manager posture contains only operational content`: Check for dispatch/deference rules, verify no Vibe line
- `activateManager includes soul in system prompt`: Provide soul in context, verify it appears in the prompt
- `activateManager includes identity metadata`: Verify prompt contains the manager's name and displayTitle (new behavior)
- `activateManager assembly order: soul, identity, posture, memory, context`: Provide all fields, verify they appear in order
- Update existing test `system prompt sections are separated by double newlines`: The expected format changes from `"POSTURE\n\nMEMORY\n\nCONTEXT"` to `"SOUL\n\nYour name is: ...\n...\n\nPOSTURE\n\nMEMORY\n\nCONTEXT"`. Update the assertion and the `makeContext` factory to include soul.
- Update existing test `works when both managerContext and injectedMemory are empty/undefined`: The prompt is no longer just posture. It's soul + identity lines + posture. Update the assertion to expect all three sections.
- **Audit the `manager posture content` describe block** (lines 202-231 in `tests/daemon/services/manager-worker.test.ts`). Each test asserts against `meta.posture`. After the split, some asserted content moves to `meta.soul`. Reclassify each:
  - `contains dispatch-with-review instructions` (checks "create and dispatch commissions", "review and cancel"): stays in posture. No change needed.
  - `contains deference rules` (checks "Defer to the user", "project scope or direction", "protected branch", "domain knowledge"): stays in posture. No change needed.
  - `contains coordination role statement` (checks "coordination specialist"): moves to soul. Update to check `meta.soul` instead of `meta.posture`.
  - `contains working style directive` (checks "Be direct", "execute when authorized"): stays in posture. No change needed.

**Verification**: `bun test tests/daemon/services/manager-worker.test.ts` passes with updated and new tests.

### Step 8: Update smoke tests and roster tests

**Files**: `tests/packages/worker-role-smoke.test.ts`, `tests/packages/worker-roster.test.ts`
**Addresses**: Cross-cutting verification

**`tests/packages/worker-role-smoke.test.ts`**:
- Update `readWorkerMetadata()` helper to also read `soul.md` from the package directory and return it
- Update `makeActivationContext()` to accept and pass soul content
- Add tests verifying soul content appears in activation output for each worker
- Existing posture-in-activation tests should still pass (posture is still present in the prompt, just in a different position)
- **Full-stack graceful degradation test**: Create a context with `soul: undefined`, call `activateWorkerWithSharedPattern()`, and verify the prompt starts with identity metadata (not soul content, not posture) and contains posture after identity. This exercises the entire chain for workers without soul.md and validates the wiring from Step 4 without needing `sdk-runner.ts` integration.

**`tests/packages/worker-roster.test.ts`**:
- Add soul file tests per Step 6's test strategy
- Existing posture tests should pass unchanged since posture files retain their three-section structure

**Verification**: `bun test tests/packages/` passes all worker package tests.

### Step 9: Full suite verification and fresh-eyes review

**Files**: None (verification only)
**Addresses**: All REQ-WID-* (cross-cutting)

Run the full test suite (`bun test`) to confirm no regressions across the 1706+ existing tests.

Launch a fresh-context sub-agent to review the implementation against the spec. The reviewer should check:

1. **Wiring completeness**: `sdk-runner.ts` passes `workerMeta.soul` into `ActivationContext`. The field flows from discovery through session preparation into prompt assembly. No gap in the chain.
2. **Assembly order correctness**: Both `buildSystemPrompt()` and `activateManager()` follow the same soul -> identity -> posture -> memory -> context order.
3. **Boundary enforcement**: Soul files contain only personality content. Posture files contain only operational content. No cross-contamination.
4. **Graceful degradation**: A worker package without `soul.md` activates successfully. The prompt falls back to identity -> posture -> memory -> context.
5. **Manager parity**: The manager's prompt assembly matches the shared pattern's order, including identity metadata (which it previously omitted).
6. **No stale references**: Grep for "Vibe:" in posture files returns nothing. Grep for the old assembly order pattern (posture as first element) in prompt assembly code returns nothing.
7. **Test coverage**: New tests cover soul discovery (present/absent), prompt order (with/without soul), manager soul split, and roster soul file structure.

## Delegation Guide

**Steps 1-4** (types, discovery, prompt assembly, wiring): These are mechanical code changes. A developer worker handles them. The risk is in Step 3 (prompt assembly order change), which alters behavior for all workers. The fresh-eyes review in Step 9 should verify assembly order correctness.

**Step 5** (Vibe removal from posture): Straightforward file editing. Save the Vibe text before removing it. A developer worker handles this.

**Step 6** (soul.md creation): This is the creative step. The spec says content should be "handcrafted to match its role and aesthetic." A writer worker is the right choice here. The writer should read each worker's posture, identity metadata, and the research document (`.lore/research/soul-md-personality-techniques.md`) to inform the personality. If a developer implements this step, they should create structurally valid files and flag content refinement as a follow-up.

**Step 7** (manager soul/posture split): The manager's personality needs the same craft as Step 6, but the manager is a built-in worker with inline constants. A developer worker handles the code changes; the soul content benefits from writer review.

**Step 8** (test updates): Developer worker. These are test maintenance tasks that follow patterns established in earlier steps.

**Step 9** (review): A fresh-context reviewer sub-agent. This step is mandatory. The reviewer catches wiring gaps and boundary violations that the implementer misses. Run it even if all tests pass.

**Review priority**: Step 3 (prompt assembly change) and Step 7 (manager convergence) carry the most risk. Step 3 changes the prompt for every worker. Step 7 introduces identity metadata into the manager's prompt for the first time. Both should get careful review attention.

## Open Questions

1. **Prompt order change is not backward-compatible for workers without soul.** The current order is posture-first, identity-second. The new order is identity-first, posture-second (soul is just prepended on top). Even without soul.md, the relative order of identity and posture changes. This may affect how workers present themselves. The spec explicitly calls for this change (REQ-WID-13), but tests should verify existing worker behavior isn't degraded by the swap.

2. **Manager identity metadata inclusion is a behavior change.** The manager currently omits identity metadata from its prompt entirely (`activateManager` at lines 104-124 never references `context.identity`). Adding it means the manager's system prompt will now include "Your name is: Guild Master" / "Your title is: Guild Master" / "You are described as: ..." lines. This is correct per the spec but should be validated for prompt quality.

3. **Soul content authorship timing.** The spec says "Writing the actual soul.md files for each roster worker is a separate task." This plan includes soul file creation in Step 6 because the infrastructure changes in Steps 1-4 are testable but incomplete without content. The implementer should decide whether to write final content or placeholder content based on their role. Structural tests (section headers, line count) work with either approach.
