---
title: Repository root layout
date: 2026-04-22
status: approved
tags: [architecture, refactor, directory-structure, tests, monorepo]
modules: [cli, daemon, web, lib, packages]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/infrastructure/p4-adapter.md
  - .lore/retros/build-break-client-fs-imports.md
req-prefix: LAYOUT
---

# Spec: Repository Root Layout

## Overview

The root directory has accreted into a flat list that hides three distinct module categories: applications (cli, daemon, web), shared helpers (lib), and workers (packages/*). Reading the top-level `ls` does not communicate this grouping, and the `tests/` directory has drifted into inconsistent mirroring (e.g., `tests/api/` duplicates `tests/web/api/`). This spec defines the target shape: three legible categories at root, colocated tests under each module, and a canonical home for each file.

## Entry Points

- `ls` at repo root reads as a grab bag: p4-adapter at root, types/ holding one file, tests/ with overlapping subdirectories (from direct observation, session 2026-04-22)
- Research confirms `tests/` layout is accretion, not decision (from lore-researcher survey of `.lore/specs/`, `.lore/retros/`)
- `p4-adapter` was relocated into `lib/` in commit `4b7ded40`, breaking REQ-P4A-1 of `p4-adapter.md`; the spec must be reconciled (from commit `4b7ded40`)

## Requirements

### Three-category root structure
- REQ-LAYOUT-1: The root directory communicates three module categories: applications (user-facing surfaces), shared helpers (code depended on by multiple applications), and workers (per-worker packages that plug into the daemon). Which directories host each category is a design decision; the spec requires that the grouping is legible from the top-level listing.
- REQ-LAYOUT-2: No application module lives outside the applications grouping. No shared helper lives outside the shared grouping. No worker module lives outside the workers grouping. Standalone root directories for single-purpose modules (e.g., the former `p4-adapter/`; `types/`, which is addressed separately by REQ-LAYOUT-6) are not acceptable.

### Tests colocated with source
- REQ-LAYOUT-3: Every test file lives under a `tests/` subdirectory of the module it exercises. Cross-cutting tests live under the module closest to the user-visible surface being exercised. When a scenario genuinely spans multiple applications without one dominating the entry point, the test lives under `web/` (the primary human surface).
- REQ-LAYOUT-4: A reader seeing `<module>/foo.ts` can find its test at a predictable location under `<module>/tests/`. Path-mirroring within a module is convention, not mandate.
- REQ-LAYOUT-5: No test files live outside their owning module's test subtree. The root `tests/` directory is removed.

### Ambient type declarations
- REQ-LAYOUT-6: Ambient type declarations (e.g., `.d.ts` files that extend the global type surface for a specific framework) live with the module that needs them, not in a shared location. The root `types/` directory is removed.

### Existing constraints preserved
- REQ-LAYOUT-7: The `lib/` client-safe / server-only seam (per `build-break-client-fs-imports` retro) is preserved. Any submodule of `lib/` that touches `node:fs` remains separated from client-importable code.
- REQ-LAYOUT-8: The daemon / web / lib one-way import rules (per `daemon-application-boundary` spec) are preserved. `lib/` never imports from `daemon/` or `web/`.
- REQ-LAYOUT-9: The `@/` alias resolves to repo root and is used for all cross-module imports. Tests use `@/` imports for source under test.

### Reconciliation with existing lore
- REQ-LAYOUT-10: The `p4-adapter` spec is updated to reflect the new location and to remove any requirements that named it as a root sibling.
- REQ-LAYOUT-11: Every artifact that hardcodes a path invalidated by this reshape is either updated or flagged for update as part of the implementation plan. Coverage includes: configuration (`tsconfig.json`, `bunfig.toml`, `package.json` scripts, `.github/` workflows, `.git-hooks/`), lore documents (specs, plans, retros, issues, brainstorms), and source/test imports. The migration plan enumerates the sweep.

### Migration safety
- REQ-LAYOUT-12: The migration is phased. Each phase leaves the repository in a buildable, testable state (pre-commit hook passes: typecheck, lint, test, build).

### Design authority
- REQ-LAYOUT-13: The design doc (see Exit Points) names the specific directory hosting each category (e.g., `apps/`, `lib/`, `packages/`). Once approved, the design doc is the authoritative verification target: "legible grouping" means "matches the design doc's chosen names." This spec does not name the directories because they are a design decision, not a requirement.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Design chosen | After spec approval, concrete target shape decided | [STUB: repository-layout-design] |
| Migration planned | After design, phased migration planned | [STUB: repository-layout-plan] |
| P4 adapter spec reconciled | During migration | [Spec: p4-adapter](./p4-adapter.md) |
| Future modules added | New modules follow this spec | [Spec: repository-layout](./repository-layout.md) (this spec) |

## Success Criteria
- [ ] `ls` at repo root matches the directory names chosen by the approved design doc
- [ ] Every test file is findable from its source module without searching at the root
- [ ] Root `tests/` and `types/` directories do not exist
- [ ] `p4-adapter` spec no longer contradicts current module placement
- [ ] Pre-commit hook passes on every migration phase commit
- [ ] No broken `@/` imports or test references after migration
- [ ] Configuration files (tsconfig, bunfig, package.json scripts, CI, hooks) reference current paths

## AI Validation

**Defaults apply** plus these custom checks:
- `ls` at repo root matches the directory names in the approved design doc
- `grep -rn "@/types/" .` returns zero results (after migration)
- Root `tests/` and `types/` directories do not exist
- `p4-adapter` spec's REQ-P4A-1 language matches actual module location
- `grep -rn "p4-adapter\|tests/api\|tests/web\|tests/daemon\|tests/cli\|tests/lib\|tests/packages\|tests/components\|tests/integration" .lore/ .github/ .git-hooks/ package.json tsconfig.json` returns zero hits for pre-migration paths
- Pre-commit hook passes cleanly on the final migration commit

## Constraints

- Phased migration; each phase passes pre-commit on its own commit.
- Blast radius: import paths across the codebase change; specs, plans, and retros may reference old paths and need a sweep. Treat as a project, not a cleanup pass.
- Not in scope: renaming `packages/` (the "workers" meaning is already conventional).
- Not in scope: splitting `daemon/` internal concerns (Five Concerns already govern that).
- Not in scope: Next.js app router layout (`web/app/`) — owned by Next.js convention.
- Not in scope: `scripts/` and `docs/` root directories; they stay where they are unless a specific requirement emerges.

## Context

Lore-researcher findings (2026-04-22):
- **P4 adapter** (`.lore/specs/infrastructure/p4-adapter.md`): REQ-P4A-1 names `p4-adapter/` as root sibling. Must be updated.
- **Daemon application boundary**: daemon/types.ts, lib/types.ts split, one-way imports. Preserve.
- **Capability-oriented module organization** (archived issue): organize by capability, not consumer. Principle carried forward.
- **Build break from client `node:fs` imports** (retro): `lib/` needs client-safe / server-only split. Preserve.
- **Path resolution audit** (retro): `daemon/lib/toolbox-resolver.ts`, `lib/paths.ts` are fixed reference points.
- Several retros and open issues reference literal test paths (`tests/daemon/...`, `tests/web/...`). Migration must sweep these.

**Bun test layout research** (2026-04-22, context7):
- Bun is unopinionated on location (`*.test.ts` discovered recursively).
- Snapshot convention (`__snapshots__/` adjacent to test file) and monorepo guidance both imply per-module colocation is the natural grain.
- Modern JS/TS ecosystem (Jest, Vitest defaults) agrees.
