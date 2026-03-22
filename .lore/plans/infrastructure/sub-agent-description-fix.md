---
title: "Sub-agent description fix: guidance property replaces lookup table"
date: 2026-03-21
status: executed
tags: [workers, sub-agents, fix, identity, packages]
modules: [lib/types, lib/packages, packages/shared/sub-agent-description, daemon/lib/agent-sdk/sdk-runner]
related:
  - .lore/specs/infrastructure/worker-sub-agents.md
  - .lore/plans/infrastructure/worker-sub-agents.md
---

# Plan: Sub-Agent Description Fix

## Goal

Replace the hardcoded `INVOCATION_GUIDANCE` lookup table in `packages/shared/sub-agent-description.ts` with a `guidance` property on `WorkerIdentity`. Each worker declares its own invocation guidance in `package.json`, and `buildSubAgentDescription` reads it from the identity instead of looking it up by name.

This is a fix to an already-implemented feature (Phases 1-4 of the worker sub-agents spec are complete). The lookup table was a workaround for guidance not being in the package metadata. REQ-SUBAG-32 and REQ-SUBAG-33 formalize the correction.

## Scope

Fourteen files change (2 lib files, 8 worker `package.json` files, 1 shared module, 1 daemon call site, 2 test files). No new files are created. No behavioral change from the caller's perspective: the descriptions produced are the same strings, sourced from a different location.

## Steps

### Step 1: Add `guidance` to `WorkerIdentity` type

**File:** `lib/types.ts`

Add `guidance?: string` to the `WorkerIdentity` interface, after `portraitPath`.

```typescript
export interface WorkerIdentity {
  name: string;
  description: string;
  displayTitle: string;
  portraitPath?: string;
  guidance?: string;
}
```

No other type changes needed. `WorkerMetadata` already references `WorkerIdentity`.

### Step 2: Add `guidance` to the Zod schema

**File:** `lib/packages.ts`

Add `guidance: z.string().optional()` to `workerIdentitySchema`.

```typescript
export const workerIdentitySchema = z.object({
  name: z.string(),
  description: z.string(),
  displayTitle: z.string(),
  portraitPath: z.string().optional(),
  guidance: z.string().optional(),
});
```

No `.min(1)` constraint. If a worker declares `guidance: ""`, that's the same as omitting it (the description function falls back to `identity.description`). But `z.string().optional()` is cleaner and matches the `portraitPath` pattern.

### Step 3: Add `guidance` values to each worker's `package.json`

**Files:** All worker packages that have an identity block. The guidance strings are taken from the current `INVOCATION_GUIDANCE` lookup table so the output is identical.

| Package | Worker | `guidance` value |
|---------|--------|------------------|
| `guild-hall-reviewer` | Thorne | `"Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code."` |
| `guild-hall-writer` | Octavia | `"Invoke this worker when you need a spec reviewed for clarity, completeness, or consistency with the codebase. Strong on documentation structure and precision."` |
| `guild-hall-developer` | Dalton | `"Invoke this worker when you need implementation advice, code architecture review, or help understanding how existing code works."` |
| `guild-hall-visionary` | Celeste | `"Invoke this worker when you need strategic direction, vision alignment, or creative exploration of possibilities."` |
| `guild-hall-steward` | Edmund | `"Invoke this worker when you need project maintenance, cleanup, or organizational tasks."` |
| `guild-hall-researcher` | Verity | `"Invoke this worker when you need external research, documentation gathering, or prior art analysis."` |
| `guild-hall-test-engineer` | Sable | `"Invoke this worker when you need test strategy advice, test coverage analysis, or help writing tests."` |
| `guild-hall-illuminator` | Sienna | `"Invoke this worker when you need image generation, visual analysis, or image-related tasks."` |

Packages without identity blocks (`guild-hall-email`, `guild-hall-replicate`) are toolbox-only; they have no `WorkerIdentity` and are unaffected.

Each `guidance` value goes inside the `identity` object in `package.json`:

```json
{
  "guildHall": {
    "identity": {
      "name": "Thorne",
      "displayTitle": "Guild Warden",
      "description": "Oversees all work with a critical eye. Inspects everything, alters nothing.",
      "guidance": "Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code."
    }
  }
}
```

### Step 4: Update `buildSubAgentDescription`

**File:** `packages/shared/sub-agent-description.ts`

Replace the entire file. The new implementation:

1. Removes the `INVOCATION_GUIDANCE` lookup table.
2. Changes the function signature from `(identity: WorkerIdentity, posture: string)` to `(identity: WorkerIdentity)`.
3. Reads `identity.guidance` for the invocation line. Falls back to `Invoke this worker when: ${identity.description}` when absent.

```typescript
import type { WorkerIdentity } from "@/lib/types";

/**
 * Builds a sub-agent description for a worker. The description tells the
 * calling agent WHEN to invoke this worker, not just what it does.
 *
 * Uses identity.guidance when present; falls back to identity.description.
 */
export function buildSubAgentDescription(identity: WorkerIdentity): string {
  const header = `${identity.displayTitle} (${identity.name}). ${identity.description}`;
  const guidance =
    identity.guidance ?? `Invoke this worker when: ${identity.description}`;

  return `${header}\n\n${guidance}`;
}
```

### Step 5: Update the call site in `sdk-runner.ts`

**File:** `daemon/lib/agent-sdk/sdk-runner.ts`

The call at approximately line 460 currently passes both identity and posture:

```typescript
const description = buildSubAgentDescription(subMeta.identity, subMeta.posture);
```

Change to:

```typescript
const description = buildSubAgentDescription(subMeta.identity);
```

No other changes to `sdk-runner.ts`.

### Step 6: Update tests in `sub-agent-description.test.ts`

**File:** `tests/packages/shared/sub-agent-description.test.ts`

The test file needs these changes:

1. **`makeIdentity` helper**: Add `guidance` to the optional overrides. No default value (tests the fallback path by default).

2. **"known worker uses lookup table entry" test**: Rename to "worker with guidance uses guidance string". Pass `guidance` in the identity. Assert the guidance text appears and the fallback prefix does not.

3. **"unknown worker falls back to identity.description" test**: Rename to "worker without guidance falls back to identity.description". No `guidance` in the identity. Assert the `"Invoke this worker when:"` prefix appears with the description.

4. **"all current workers have lookup table entries" test**: Remove entirely. There is no lookup table to test. The equivalent validation is that each worker's `package.json` has a `guidance` field, which is verified by the schema and can be spot-checked in a package-level test if desired.

5. **"function is pure" test**: Update to pass only `identity` (remove posture argument).

6. **"description starts with displayTitle (name)" test**: Update to pass only `identity`.

7. **"description includes identity.description" test**: Update to pass only `identity`.

8. **Add new test**: "worker with guidance includes both header and guidance". Pass an identity with both `description` and `guidance`. Assert the output contains the header line and the guidance line.

### Step 7: Update sdk-runner tests

**File:** `tests/daemon/services/sdk-runner.test.ts`

The mock worker metadata objects construct `WorkerIdentity` without `guidance`. This is fine for testing the fallback path. Add one test case with a mock worker that has `guidance` set, and verify the generated `AgentDefinition.description` contains the guidance text rather than the fallback prefix.

The sdk-runner tests don't call `buildSubAgentDescription` directly (they exercise it through `prepareSdkSession`), so the signature change won't break them. However, `prepareSdkSession` will now produce descriptions from `identity.guidance` instead of the lookup table, so existing assertions about description content should still pass as long as the mock workers either have `guidance` set or match the fallback format.

## Verification

1. `bun test tests/packages/shared/sub-agent-description.test.ts` passes with all updated tests.
2. `bun test tests/daemon/services/sdk-runner.test.ts` passes, including the new guidance-based test.
3. `bun test tests/lib/packages.test.ts` passes (schema validation accepts `guidance` field).
4. `bun test` (full suite) passes.
5. `bun run typecheck` passes.

## Delegation

This is a single-commission task for Dalton. The changes are mechanical (move strings from a lookup table to package metadata, simplify a function signature). No architectural decisions remain. The spec revision (REQ-SUBAG-32, REQ-SUBAG-33) is already done.

**Review:** Thorne after implementation. Focus areas: (1) verify no other call sites reference the old two-argument signature, (2) verify all eight workers have guidance values, (3) verify the fallback path still works for workers without guidance.
