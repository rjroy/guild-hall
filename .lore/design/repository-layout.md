---
title: Repository root layout design
date: 2026-04-22
status: approved
tags: [architecture, refactor, directory-structure, tests, monorepo, tsconfig, paths]
modules: [cli, daemon, web, lib, packages]
related:
  - .lore/specs/infrastructure/repository-layout.md
  - .lore/specs/infrastructure/p4-adapter.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/retros/build-break-client-fs-imports.md
---

# Design: Repository Root Layout

## Problem

See [Spec: repository-layout](.lore/specs/infrastructure/repository-layout.md). The spec defers the concrete directory names to this design. Decisions required:

1. **D1**: Shape of the applications grouping.
2. **D2**: Where the shared helpers live (root `lib/` vs. wrapped `shared/lib/`).
3. **D3**: Where `web`'s ambient type declaration (`css-modules.d.ts`) lands.
4. **D4**: Where the current single integration test folds to.
5. **D5**: How tests inside each module are organized.

## Constraints

- `web/tsconfig.json` uses `baseUrl: ".."` and `paths: { "@/*": ["./*"] }` to resolve the `@/` alias to repo root, because bun 1.3 can't resolve `paths` through `extends`. Any move of `web/` deepens that path.
- Root `tsconfig.json` has `paths: { "@/*": ["./*"] }` — the alias resolves via `baseUrl` default (`.`) plus the mapping. This is independent of where modules live, but include/exclude lists need updating when module parents change.
- `@/` alias is used extensively. Grep count: thousands of references. Every application path change is a sweep.
- `packages/` is loaded at runtime via `--packages-dir ./packages` (in `package.json` scripts, not a bun workspace). Keeping the name `packages/` avoids changing this flag (constraint from spec: not in scope).
- Pre-commit hook and CI do not reference module paths directly; both invoke `bun run typecheck`, `bun run lint`, `bun test`, `bun run build`. Path updates stay in `package.json` scripts.
- Next.js App Router reads `apps/web/app/` (or wherever `web/app/` lands) — test files cannot live inside `app/` or they become routes. Tests must live under `<web-location>/tests/`, outside the Next.js-scanned app dir.
- The `lib/` client-safe / server-only seam (per retro) means `lib/` files that touch `node:fs` must stay separable from client-importable code. This is an intra-`lib/` concern and does not affect root layout.

## Approaches Considered

### Option 1: apps/ wrapper + root lib/ + root packages/

```
apps/
  cli/
  daemon/
  web/
lib/
packages/
scripts/     (unchanged)
docs/        (unchanged)
```

**Pros:**
- Three top-level entries for three categories (`apps/`, `lib/`, `packages/`) — legible.
- `lib/` and `packages/` paths don't move → `@/lib/...` imports unchanged.
- Only the three application modules move; import sweep is bounded.
- `lib/` already has clear "shared helpers" semantics as a singular directory; a wrapper would be ceremony.

**Cons:**
- Asymmetric: one category is wrapped, two are flat.
- `web/tsconfig.json` deepens `baseUrl` from `".."` to `"../.."` — the existing workaround grows, but stays a single string change.
- `package.json` scripts, `--packages-dir` aside, all change: `daemon/index.ts` → `apps/daemon/index.ts`, `cli/index.ts` → `apps/cli/index.ts`, `next dev web` → `next dev apps/web`, etc.
- Cross-module imports: `@/cli/...` → `@/apps/cli/...`, `@/daemon/...` → `@/apps/daemon/...`, `@/web/...` → `@/apps/web/...` (thousands of sites).

### Option 2: apps/ + shared/ + packages/ (symmetric)

```
apps/
  cli/
  daemon/
  web/
shared/
  lib/
packages/
```

**Pros:**
- Symmetric grouping: every category wrapped.
- Leaves room for future shared helpers (a second shared module has a home).
- Most honest about the user's mental categorization.

**Cons:**
- Every `@/lib/...` import becomes `@/shared/lib/...` — additional sweep on top of Option 1's cost.
- `shared/` wrapping a single module is premature abstraction.
- Three-level path for `lib/` files (`shared/lib/types.ts`) is noisier without adding information.

### Option 3: Flat root, remove only the scaffolding

```
cli/
daemon/
web/
lib/
packages/
scripts/
docs/
```

**Pros:**
- Minimal churn: only `types/` removed and p4-adapter move (already done).
- No `@/` sweep beyond the already-completed p4-adapter move.
- `web/tsconfig.json`'s `baseUrl: ".."` stays unchanged.

**Cons:**
- Fails REQ-LAYOUT-1: five visible module directories at root (plus scripts, docs) give no signal that three of them are a group. The whole reason for this work is that a flat `ls` reads as a grab bag.
- Doesn't solve the original problem; we'd be paying the p4-adapter + types/ cleanup cost without delivering the category-legibility benefit.

## Decision

**Option 1: `apps/` + root `lib/` + root `packages/`.**

Rationale:
- The primary goal (REQ-LAYOUT-1) is that three categories are legible. Three top-level entries for three categories achieves this. The wrapper asymmetry is visible but not confusing — a reader sees one "apps" label, one "lib" singleton, one "packages" singleton. The labels are self-describing.
- Option 2's `shared/` wrapper costs every `@/lib/...` import to rewrite, for the speculative benefit of accommodating future shared modules. If a second shared helper appears, moving `lib/` into `shared/lib/` is a later refactor — cheaper to defer than to eat up-front.
- Option 3 fails the spec. Including it is completeness.

### D3: `css-modules.d.ts` → `apps/web/css-modules.d.ts`

Next.js convention places ambient type declarations at the web module root (e.g., `next-env.d.ts`). The existing `web/` already holds `next-env.d.ts` at its root. Following the same pattern, `css-modules.d.ts` lives at `apps/web/css-modules.d.ts`. The root `types/` directory is removed.

### D4: Integration test → `apps/web/tests/integration/navigation.test.ts`

The single integration test (`tests/integration/navigation.test.ts`) exercises UI navigation. Per REQ-LAYOUT-3's default rule (cross-cutting → closest to user-visible surface → `web/`), it lands under `apps/web/tests/integration/`.

### D5: Per-module test organization

Each module gets a `tests/` subdirectory. Internal layout mirrors source structure where useful; otherwise flat:

```
apps/cli/tests/                       (current tests/cli/* → here)
apps/cli/tests/__snapshots__/         (current tests/cli/__snapshots__/)
apps/daemon/tests/                    (current tests/daemon/*)
apps/daemon/tests/lib/                (current tests/daemon/lib/)
apps/daemon/tests/routes/             (current tests/daemon/routes/)
apps/daemon/tests/services/           (current tests/daemon/services/)
apps/web/tests/api/                   (current tests/api/ + tests/web/api/ merged)
apps/web/tests/components/            (current tests/components/ + tests/web/components/ merged)
apps/web/tests/lib/                   (current tests/web/lib/)
apps/web/tests/integration/           (current tests/integration/)
apps/web/tests/                       (current tests/web/*.test.ts flat files)
lib/tests/                            (current tests/lib/*)
lib/tests/p4-adapter/                 (current tests/lib/p4-adapter/)
packages/<worker>/tests/              (current tests/packages/<worker>/ for each worker)
packages/shared/tests/                (current tests/packages/shared/)
packages/tests/fixtures/              (current tests/packages/fixtures/ — shared test fixtures for workers)
```

Duplicate-location drift resolves: `tests/api/` and `tests/web/api/` merge into `apps/web/tests/api/`; same for `components/`.

## Interface / Contract

### Path alias

`@/` continues to resolve to repo root. Mapping unchanged in root `tsconfig.json`. In `apps/web/tsconfig.json`, `baseUrl` deepens from `".."` to `"../.."`. The existing comment explaining the bun-resolver workaround stays; the path string updates.

### Import rewrite rules

Systematic transforms across the codebase:
- `@/cli/X` → `@/apps/cli/X`
- `@/daemon/X` → `@/apps/daemon/X`
- `@/web/X` → `@/apps/web/X`
- `@/lib/X` → `@/lib/X` (unchanged)
- `@/types/css-modules` (or similar) → remove; `css-modules.d.ts` is ambient and doesn't need explicit import

### Test import rule

Tests use `@/` for source-under-test imports. Relative imports inside a test file's own test directory (e.g., fixtures colocated with tests) remain relative.

### Atomic migration unit

For each application module (cli, daemon, web), the directory move, the `@/` import sweep across every consumer, and the `package.json` script updates are a **single atomic unit** — one commit, not separable phases. Mid-state (directory moved but imports not yet rewritten, or imports rewritten but directory not yet moved) is non-buildable: `bun run typecheck` fails, `bun run build` fails, the pre-commit hook fails. The plan must sequence per-module units; splitting a module's work across commits is not an option.

Web's move additionally requires the `apps/web/tsconfig.json` edit (extends + baseUrl) as part of the same atomic unit. Without it, every web file's `@/` resolution breaks.

Supporting work that *can* be phased separately from the module moves:
- Test consolidation within a module that is not yet moved (e.g., merging `tests/api/` into `tests/web/api/` before web moves). These are intra-module reorganizations that can stand alone.
- Ambient type relocation (`types/css-modules.d.ts` → `web/css-modules.d.ts`) before the web move. Independent of web's directory name.
- Lore document sweep (REQ-LAYOUT-11). Follows the last module move.

### Configuration updates

- **Root `tsconfig.json`:** `include` list updates: `cli/**` → `apps/cli/**`; `daemon/**` → `apps/daemon/**`; root `tests/**` entries removed (tests are colocated and covered by their owning module's include). `types/**/*.d.ts` entry removed. `lib/**`, `packages/**`, `scripts/**`, `**/*.mts` unchanged. The `exclude: ["web"]` entry is removed (it is redundant today — root's `include` is explicit and does not cover `web/**`). After restructure, root tsconfig does not reference `apps/web` at all; the child tsconfig owns it. This avoids any ambiguity around TypeScript's `extends` + `exclude` inheritance semantics.
- **Child `apps/web/tsconfig.json`:** `extends` updates `"../tsconfig.json"` → `"../../tsconfig.json"`. `baseUrl` updates `".."` → `"../.."`. `paths` unchanged. The existing explanatory comment about the bun-resolver workaround stays. `next-env.d.ts` include entry unchanged.
- **`apps/web/next.config.ts`:** Moves with the rest of `web/` (already lives at `web/next.config.ts` today, not repo root). Next.js's `next dev apps/web` continues to resolve it relative to the given project directory.
- **`package.json` scripts:** every `cli/…`, `daemon/…`, and `next (dev|build|start) web` reference updates to the new path (e.g., `next dev web` → `next dev apps/web`). The `--packages-dir ./packages` flag stays (packages/ does not move).
- **`.gitignore`:** currently has no module-path references; no changes expected. Verify during migration.
- **Pre-commit hook and CI:** no changes to hook/workflow files themselves — both invoke npm scripts. See atomicity note below for mid-migration implications.

### Reconciliation with `p4-adapter` spec

REQ-P4A-1 of `.lore/specs/infrastructure/p4-adapter.md` currently names the adapter as a root sibling. Update the spec to name `lib/p4-adapter/` as the location. REQ-P4A-2 (one-way import isolation) is unchanged in intent — the adapter still doesn't import from `daemon/`, `apps/*`, or other parts of `lib/`. Restate in new terms: "No imports into `lib/p4-adapter/` from other `lib/` modules; no imports out of `lib/p4-adapter/` into daemon/apps/packages. Colocated in `lib/`, not coupled."

## Edge Cases

**Next.js App Router scanning:** Next.js scans `apps/web/app/**` for routes. Tests at `apps/web/tests/**` are outside that scan — safe. Verify by running `bun run build` post-migration; any file accidentally placed under `app/` would be caught as a route compile error.

**`css-modules.d.ts` visibility to root tsconfig:** Root `tsconfig.json` excludes `web/` (and will exclude `apps/web/`). The CSS modules declaration only applies to web code. If daemon or lib ever imports a CSS module (they shouldn't, per daemon-application-boundary), the declaration would be unreachable. This is the intended boundary.

**`lib/` client-safe seam (retro):** Moving p4-adapter into `lib/` preserved this seam — p4-adapter doesn't touch client code. Reshape does not alter the split. Ongoing discipline, not a migration action.

**`bun test` discovery:** bun recursively scans for `*.test.ts*`. Files under `apps/*/tests/`, `lib/tests/`, `packages/*/tests/` are all discovered without configuration. No `bunfig.toml` changes required. Note: during migration, if tests are moved before root tsconfig's `include` is updated to reflect new paths, those tests may discover files that typecheck under an empty/partial config. The atomic-migration-unit rule (see Interface) prevents this: test moves happen inside a module's atomic unit, not as a separate step.

**Nested tsconfig resolution:** bun resolves the nearest `tsconfig.json` per file. `apps/web/tsconfig.json` governs web files; root `tsconfig.json` governs everything else. A file at `apps/daemon/index.ts` uses root tsconfig (no child tsconfig at `apps/daemon/`). This matches current behavior — only `web/` has a child tsconfig today, and that arrangement continues.

**tsconfig `extends` + `exclude` inheritance:** TypeScript's handling of inherited `exclude` through `extends` has subtle semantics — a child that doesn't redefine `exclude` may inherit the parent's list, with paths resolved ambiguously. The current setup happens to work because root's `exclude: ["web"]` is redundant (root's `include` is explicit and does not cover web). This design preserves that property: root tsconfig after migration does not include `apps/web/**` and does not need to exclude it. The child `apps/web/tsconfig.json` owns web compilation entirely. No ambiguity introduced.

**Package workers (`packages/*`) internal structure:** Each worker already has its own `package.json` and some have `tsconfig.json`. Worker-internal organization (src vs. index, tests placement) is not dictated by this design. Per-worker test subdirectories replace the current `tests/packages/<worker>/` pattern; individual workers may later choose different internal layouts.

**Path-referencing lore documents:** Numerous specs, plans, retros, and issues reference literal paths like `tests/daemon/...`, `cli/...`, `daemon/lib/...`. Migration plan enumerates and sweeps these (REQ-LAYOUT-11).

## Open Questions

- Whether the migration plan should do one big PR or phase-per-module. That's a planning decision, not a design decision. Deferred to plan.
- Whether `packages/shared/` (a per-worker shared helper) should move to `lib/workers-shared/` or similar. Out of scope — spec excludes `packages/` structure changes.
- Whether `scripts/` belongs under a `tooling/` category or stays root. Out of scope per spec constraints.
