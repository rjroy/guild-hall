---
title: Cleanup old code and verify layer boundaries
date: 2026-03-01
status: pending
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 7
modules: [commission-session, commission-handlers, commission-artifact-helpers, commission-recovery, commission-toolbox]
---

# Task: Cleanup Old Code and Verify Layer Boundaries

## What

Remove old commission code and verify the import graph enforces layer boundaries.

1. **Remove old files:**
   - `daemon/services/commission-session.ts` (replaced by orchestrator)
   - `daemon/services/commission-handlers.ts` (replaced by lifecycle)
   - `daemon/services/commission-artifact-helpers.ts` (replaced by record)
   - `daemon/services/commission-recovery.ts` (absorbed into orchestrator)
   - Old toolbox factory function in `commission-toolbox.ts` (keep callback-based factory)

2. **Update imports**: Grep for all imports of removed files across the entire codebase. Update to import from new layer modules. Verify no dangling references. Check comments, JSDoc, log messages, and tool descriptions for stale terminology (per retro lesson: grep for old terminology after each migration phase).

3. **Boundary enforcement test** (static analysis of import graph):
   - `commission/record.ts` imports nothing from other layers
   - `commission/lifecycle.ts` imports only from `commission/record.ts`
   - `workspace.ts` does not import any commission types
   - `session-runner.ts` does not import any commission types
   - `commission/orchestrator.ts` is the only file that imports from all layers

4. **ActiveCommissionEntry split test** (type inspection):
   - `TrackedCommission` (Layer 2) does not contain worktreeDir, branchName, or abortController
   - `ExecutionContext` (Layer 5) does not contain transition validation or artifact ops

5. **Run full test suite** one final time. All tests pass.

6. **Run linter and typecheck**: `bun run lint` and `bun run typecheck` pass clean.

## Validation

- All removed files are gone and no imports reference them
- No stale terminology in comments, JSDoc, log messages, or tool descriptions
- Import graph boundary test passes (each layer only imports from permitted dependencies)
- `TrackedCommission` has no execution state fields; `ExecutionContext` has no lifecycle fields
- Full test suite passes
- `bun run lint` and `bun run typecheck` pass clean

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-2: Layers 1 and 2 together form the commission's public interface
- REQ-CLS-16: Layers 3 and 4 never read or write commission artifact files (hard boundary)
- REQ-CLS-18: ActiveCommissionEntry is split: identity in Layer 2, execution state in Layer 5

## Files

- `daemon/services/commission-session.ts` (delete)
- `daemon/services/commission-handlers.ts` (delete)
- `daemon/services/commission-artifact-helpers.ts` (delete)
- `daemon/services/commission-recovery.ts` (delete)
- `daemon/services/commission-toolbox.ts` (modify - remove old factory)
- Various files (modify - update imports)
