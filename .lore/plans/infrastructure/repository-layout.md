---
title: "Implementation plan: repository-layout"
date: 2026-04-22
status: draft
tags: [plan, refactor, directory-structure, tests, monorepo, tsconfig, paths]
modules: [cli, daemon, web, lib, packages]
related:
  - .lore/specs/infrastructure/repository-layout.md
  - .lore/design/repository-layout.md
  - .lore/specs/infrastructure/p4-adapter.md
  - .lore/retros/build-break-client-fs-imports.md
---

# Plan: Repository Root Layout

## Spec Reference

**Spec**: `.lore/specs/infrastructure/repository-layout.md`
**Design**: `.lore/design/repository-layout.md`

Requirements addressed:
- REQ-LAYOUT-1 (three-category root) → Phases 2, 3, 4 (apps/ created, cli/daemon/web moved under it)
- REQ-LAYOUT-2 (no stragglers) → Phase 1 (types/ removed); p4-adapter already relocated in commit `4b7ded40`
- REQ-LAYOUT-3 (tests colocated, cross-cutting → web) → Phase 4 (tests/integration → apps/web/tests/integration)
- REQ-LAYOUT-4 (predictable test location per module) → Phases 2, 3, 4, 5 (each module's tests/ subdir)
- REQ-LAYOUT-5 (root tests/ removed) → Phase 5 (final tests/ directory removal)
- REQ-LAYOUT-6 (ambient types with their module) → Phase 1 (css-modules.d.ts → web/, types/ removed)
- REQ-LAYOUT-7 (lib/ client-safe seam preserved) → Verification in every phase touching lib/
- REQ-LAYOUT-8 (daemon/web/lib import direction preserved) → Verified by typecheck in every phase
- REQ-LAYOUT-9 (@/ alias, @/-based test imports) → Phases 2, 3, 4 (import rewrites), Phase 4 (web tsconfig update)
- REQ-LAYOUT-10 (p4-adapter spec reconciled) → Phase 6
- REQ-LAYOUT-11 (path-sweep across configs, lore, source) → Phase 6 (lore), Phases 2/3/4 (configs + source)
- REQ-LAYOUT-12 (phased, each phase buildable) → Atomic per-module units; pre-commit hook gate on every phase
- REQ-LAYOUT-13 (design names directories) → Plan follows design decision: `apps/` + root `lib/` + root `packages/`

## Codebase Context

Current state (verified 2026-04-22):

- **Root listing**: `cli/`, `daemon/`, `web/`, `lib/`, `packages/`, `tests/`, `types/`, `scripts/`, `docs/` plus config files. Five module-looking directories at root.
- **Import fanout** (`@/`-aliased, excluding `node_modules` and `.next/`):
  - `@/cli/` — 28 sites
  - `@/daemon/` — 538 sites
  - `@/web/` — 209 sites
  - `@/lib/` — 383 sites (unchanged by refactor)
  - `@/types/` — 0 sites (ambient `.d.ts`, no explicit importers)
- **Test distribution** (count of `*.test.ts(x)` files per source dir):
  - `tests/cli/` — 12 (+ `__snapshots__/`)
  - `tests/daemon/` — 73 total across lib/, routes/, services/
  - `tests/web/` — 13 across api/, components/, lib/ (plus 1 direct file)
  - `tests/api/` — 4 (duplicate-drift; merges with tests/web/api)
  - `tests/components/` — 24 (duplicate-drift; merges with tests/web/components)
  - `tests/integration/` — 1 (navigation.test.ts)
  - `tests/lib/` — 19 (15 flat + 4 under p4-adapter/)
  - `tests/packages/` — 24 across per-worker dirs + fixtures/
- **`types/` contents**: one file, `css-modules.d.ts` (374 bytes, ambient).
- **Config state**:
  - Root `tsconfig.json` `include`: `lib/**/*.ts`, `daemon/**/*.ts`, `cli/**/*.ts`, `tests/**/*.ts`, `tests/**/*.tsx`, `packages/**/*.ts`, `packages/**/*.tsx`, `scripts/**/*.ts`, `types/**/*.d.ts`, `**/*.mts`. `exclude`: `node_modules`, `web`.
  - `web/tsconfig.json`: `extends "../tsconfig.json"`, `baseUrl: ".."`, `paths: { "@/*": ["./*"] }`.
  - `package.json` `bin`: `./cli/index.ts`. Scripts hardcode `daemon/index.ts`, `cli/index.ts`, `next (dev|build|start) web`. Flag `--packages-dir ./packages` is unaffected (packages/ stays put).
  - No `bunfig.toml`.
- **Hook / CI**:
  - `.git-hooks/pre-commit.sh` runs typecheck, lint, test, build (all four gate every commit). No module-path refs.
  - `.github/workflows/ci.yml` — no module-path refs (invokes `bun run` scripts).
  - `.gitignore` — no module-path refs except `/web/.next/`. The `web/` prefix here means "relative to repo root" and needs updating to `/apps/web/.next/`.
- **Docs with path refs**:
  - `CLAUDE.md` — lines 13, 15, 21, 23, 35, 54 reference `daemon/app.ts`, `daemon/types.ts`, `lib/types.ts`, `daemon/lib/git.ts`, `daemon/services/git-admin.ts`, `web/tsconfig.json`, `web/app/globals.css`, `tests/lib/config.test.ts`.
  - `README.md` — lines 40, 51-53, 59 reference `tests/lib/config.test.ts`, `web/`, `daemon/`, `cli/`, `tests/`.
- **Issues referencing old test paths** (from lore-researcher):
  - `.lore/issues/worker-display-title-hardcoded-to-name.md:83` → `tests/web/artifact-attribution-resolution.test.ts`
  - `.lore/issues/mockup-metadata-sidebar-missing-file-size.md:27` → `tests/lib/artifacts.test.ts`
  - `.lore/issues/scheduler-removal-residue.md:15,17` → `tests/cli/cli-error-handling.test.ts`, `tests/components/commission-view.test.tsx`
- **p4-adapter spec refs to reconcile** (from lore-researcher): REQ-P4A-1, REQ-P4A-2, REQ-P4A-4, REQ-P4A-33, the "Files to Create" table (lines 333-343), and the `modules:` frontmatter entry (`[p4-adapter]`).

Per the retro `build-break-client-fs-imports`: the `lib/` client-safe / server-only seam is **file-grained, not directory-grained**. `import type` still triggers Turbopack module resolution even though TS erases the import. A file move that changes which module exports client-imported symbols can silently pull `node:fs` into the client bundle. The pre-commit hook's `bun run build` step catches this; tests alone do not.

Per the retro `unified-sdk-runner`: per-phase fresh-context review caught three bugs an implementation agent missed. This plan bakes a review gate into every atomic phase.

## Atomicity Rules

Reproduced from design, load-bearing for ordering:

1. **Per-application atomic unit.** For each of `cli`, `daemon`, `web`: the directory move, the `@/` import sweep across every consumer, the test subdir move, and the `package.json` script updates ship as **one commit**. Splitting is non-buildable.
2. **Web's atomic unit is larger.** It additionally includes `apps/web/tsconfig.json` (extends + baseUrl deepen from `"../tsconfig.json"` + `".."` to `"../../tsconfig.json"` + `"../.."`) and the `/web/.next/` → `/apps/web/.next/` line in `.gitignore`, or web's `@/` resolution breaks at the first file touched.
3. **Non-atomic work that can stand alone**:
   - Ambient type relocation (`types/css-modules.d.ts` → `web/css-modules.d.ts`) before the web move — it's ambient, has zero explicit importers, and references only `*.module.css`.
   - `lib/tests/` and `packages/*/tests/` consolidation after all apps are moved — `lib/` and `packages/` don't change parent.
   - Lore + doc sweep after all code is in place.

Commits must pass the full pre-commit gate (typecheck, lint, test, build). No `--no-verify`.

## Implementation Phases

### Phase 1: Groundwork (no module moves)

**Files**: `types/css-modules.d.ts`, `web/css-modules.d.ts` (new), root `tsconfig.json`
**Addresses**: REQ-LAYOUT-2 (types/ removal), REQ-LAYOUT-6
**Expertise**: none

Pre-work before any app moves:

1. `git mv types/css-modules.d.ts web/css-modules.d.ts`. The file is ambient (`declare module "*.module.css" { ... }`) and affects only `*.module.css` imports, which only happen inside `web/`. No `@/types/` importers exist (verified: 0 hits).
2. Remove the now-empty root `types/` directory.
3. In root `tsconfig.json`: remove `"types/**/*.d.ts"` from `include`. No other edits this phase.
4. In `web/tsconfig.json`: add `"css-modules.d.ts"` to `include` (alongside `next-env.d.ts`). Verifies Next.js picks it up without relying on the root-tsconfig include list.

Verification: pre-commit hook passes (typecheck, lint, test, build).

**Commit**: `Refactor: relocate ambient CSS types into web/`

---

### Phase 2: Move cli → apps/cli (atomic)

**Files**: every `cli/**` path; `tests/cli/**`; root `tsconfig.json`; `package.json` (bin + scripts); 28 `@/cli/` import sites across the codebase
**Addresses**: REQ-LAYOUT-1 (partial), REQ-LAYOUT-4, REQ-LAYOUT-9
**Expertise**: none (smallest atomic unit; proves the pattern)

This is the smallest app. Execute first to validate the mechanical steps before applying them to larger modules.

1. `mkdir -p apps/` (at repo root).
2. `git mv cli apps/cli`.
3. `git mv tests/cli apps/cli/tests` (includes `__snapshots__/`).
4. In root `tsconfig.json`:
   - Replace `"cli/**/*.ts"` with `"apps/cli/**/*.ts"` in `include`.
   - Replace `"tests/**/*.ts"` / `"tests/**/*.tsx"` entries by leaving them in place for now — tests under `apps/cli/tests/` are still matched because the `include` is global and tests/ is still populated by other modules. The full removal of `tests/**/*` happens in Phase 5.
   - Add `"apps/cli/tests/**/*.ts"` to `include` to make test inclusion explicit as each module moves (optional; glob `"apps/cli/**/*.ts"` already covers it).
5. In `package.json`:
   - `"bin": { "guild-hall": "./apps/cli/index.ts" }`.
   - Script `"guild-hall": "bun run apps/cli/index.ts"`.
6. Import sweep: rewrite `@/cli/X` → `@/apps/cli/X` across all `.ts` / `.tsx` files. Use:
   ```
   grep -rln "@/cli/" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".next/"
   ```
   Apply the substitution to each file via `sed -i 's|@/cli/|@/apps/cli/|g' <file>`. 28 sites — small enough to spot-check.
7. Run the pre-commit hook commands in order: `bun run typecheck && bun run lint && bun test && bun run build`.

**Commit**: `Refactor: move cli/ → apps/cli/`

---

### Phase 3: Move daemon → apps/daemon (atomic)

**Files**: every `daemon/**` path; `tests/daemon/**` (all 73 test files including nested `lib/`, `routes/`, `services/*/`); root `tsconfig.json`; `package.json` scripts; 538 `@/daemon/` import sites
**Addresses**: REQ-LAYOUT-1 (partial), REQ-LAYOUT-4, REQ-LAYOUT-8, REQ-LAYOUT-9
**Expertise**: none — mechanical — but the sheer volume of imports warrants a fresh-context reviewer checking the sed sweep for false positives (see Delegation Guide)

1. `git mv daemon apps/daemon`.
2. `git mv tests/daemon apps/daemon/tests`. Preserve sub-structure: `tests/daemon/lib/`, `tests/daemon/routes/`, `tests/daemon/services/{commission,heartbeat,manager,meeting}/`.
3. In root `tsconfig.json`: replace `"daemon/**/*.ts"` with `"apps/daemon/**/*.ts"` in `include`.
4. In `package.json` scripts:
   - `"dev:daemon": "bun --watch apps/daemon/index.ts -- --packages-dir ./packages"`.
   - `"start:daemon": "bun apps/daemon/index.ts"`.
5. Import sweep: rewrite `@/daemon/X` → `@/apps/daemon/X` across all `.ts` / `.tsx` files. Command per file:
   ```
   sed -i 's|@/daemon/|@/apps/daemon/|g' <file>
   ```
   538 sites. Check that no literal string `@/daemon/` survives in source (not just imports — user-visible strings in prompts or logs could also match).
6. Check for *non-aliased* `daemon/` references in source (e.g., `require("daemon/...")`, path-string literals). From `CLAUDE.md` hint: `daemon/lib/git.ts` is referenced in docs but likely not as source paths in code. Grep: `grep -rn "\"daemon/\|'daemon/" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".next/"`. Review and update each match individually.
7. Run pre-commit gate.

**Commit**: `Refactor: move daemon/ → apps/daemon/`

---

### Phase 4: Move web → apps/web (atomic, includes child tsconfig + duplicate-test-dir merges)

**Files**: every `web/**` path; `tests/web/**`, `tests/api/**`, `tests/components/**`, `tests/integration/**` (all merged under `apps/web/tests/`); `web/tsconfig.json`; root `tsconfig.json`; `package.json` scripts; `.gitignore`; 209 `@/web/` import sites
**Addresses**: REQ-LAYOUT-1 (completes three-category root), REQ-LAYOUT-3, REQ-LAYOUT-4, REQ-LAYOUT-8, REQ-LAYOUT-9
**Expertise**: frontend/Next.js — fresh-context reviewer verifies the child `tsconfig.json` and `.gitignore` edits, the Next.js build output location, and that no `import type` seam into `lib/` was accidentally broken (see retro `build-break-client-fs-imports`). See Delegation Guide.

1. `git mv web apps/web`.
2. Test consolidation into `apps/web/tests/`:
   - `git mv tests/web apps/web/tests` (creates `apps/web/tests/api/`, `apps/web/tests/components/`, `apps/web/tests/lib/`, and flat `*.test.ts` files).
   - Merge `tests/api/` (4 files) into `apps/web/tests/api/`. For each file, if the name doesn't collide with an existing file from `tests/web/api/`, `git mv`. (Pre-check: `diff <(ls tests/api) <(ls tests/web/api)`.)
   - Merge `tests/components/` (24 files) into `apps/web/tests/components/`. Sub-dirs (`artifact/`, `dashboard/`, `meeting/`, `ui/`) preserve their internal structure in the destination. (Pre-check: `diff <(ls tests/components) <(ls tests/web/components)`.)
   - **Collision resolution protocol**: on a name clash, do not silently overwrite. Open both files and compare. If the two tests cover the same behavior, keep the more thorough one and delete the other (use `git rm`, not plain delete, so the history is clean); confirm total test count decreases by the expected amount. If the two tests cover different behavior that happens to share a name, rename the incoming file to disambiguate (e.g., `artifacts.test.ts` + `artifacts-attribution.test.ts`) before the `git mv`. Do not defer collisions to a later phase — unresolved collisions block Phase 4's pre-commit gate.
   - `git mv tests/integration apps/web/tests/integration` (one file: `navigation.test.ts`).
3. Edit `apps/web/tsconfig.json`:
   - `"extends": "../../tsconfig.json"` (was `"../tsconfig.json"`).
   - `"baseUrl": "../.."` (was `".."`).
   - `"paths"` unchanged: `{ "@/*": ["./*"] }`. **Why unchanged**: `paths` entries resolve relative to `baseUrl`, not relative to the tsconfig file. `baseUrl: "../.."` points at repo root, so `"@/*": ["./*"]` still maps `@/foo` → `<repo-root>/foo`. Any "fix" that rewrites the paths mapping to `"../../*"` or similar breaks `@/` resolution.
   - Keep the explanatory comment about the bun-resolver workaround.
   - `"include"` additions: `"tests/**/*.ts"`, `"tests/**/*.tsx"` so tests fall under the child tsconfig (which has the Next.js plugin). Keep `"next-env.d.ts"`, `"css-modules.d.ts"`, `"**/*.ts"`, `"**/*.tsx"`, `".next/types/**/*.ts"`, `".next/dev/types/**/*.ts"`.
4. Edit root `tsconfig.json`:
   - Remove `"exclude": ["node_modules", "web"]` → leave only `"node_modules"`. (Root's `include` has never covered `web/**`, and after this phase does not cover `apps/web/**` either; the `exclude` entry was redundant and becomes actively wrong after web moves.)
   - Remove `"tests/**/*.ts"` and `"tests/**/*.tsx"` from `include` now that all non-lib/non-packages tests are under module subdirs — except — root `tests/` still contains `tests/lib/` and `tests/packages/` until Phase 5. **Deferral**: keep the root `tests/**/*` includes in place for this phase and remove them in Phase 5 after `tests/` is fully empty. Do not remove them now.
5. Edit `package.json` scripts:
   - `"dev:next": "next dev apps/web --turbopack"`.
   - `"build": "next build apps/web"`.
   - `"start:next": "next start apps/web"`.
6. Edit `.gitignore`: `/web/.next/` → `/apps/web/.next/`. Also grep `.gitignore` for any other `web/` or `cli/` or `daemon/` prefixed paths — update any that match.
7. Import sweep: rewrite `@/web/X` → `@/apps/web/X` across all `.ts` / `.tsx`. 209 sites.
8. Run pre-commit gate. In particular:
   - `bun run build` must produce Next.js output in `apps/web/.next/`, not `web/.next/`.
   - Visually check one CSS-module file compiles (ambient type at `apps/web/css-modules.d.ts` is picked up).
   - Check that no `web/` residue remains: `ls web/` should error, and `grep -rn "\"web/\|'web/\|@/web/" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".next/"` should return only legitimate non-path matches (e.g., the literal string `"web"` in code).

**Commit**: `Refactor: move web/ → apps/web/`

---

### Phase 5: Consolidate lib/ tests and packages/ tests

**Files**: `tests/lib/**`, `tests/packages/**`, root `tsconfig.json`, and finally the root `tests/` directory
**Addresses**: REQ-LAYOUT-4, REQ-LAYOUT-5 (root tests/ removed)
**Expertise**: none

`lib/` and `packages/` don't move. Their tests move into per-module subdirs.

1. `git mv tests/lib lib/tests`. Preserves `lib/tests/p4-adapter/` (already matches design).
2. For each worker in `tests/packages/`: `git mv tests/packages/<worker> packages/<worker>/tests`. Current worker dirs: `guild-hall-email`, `guild-hall-illuminator`, `guild-hall-replicate` (includes `tools/`), `guild-hall-steward`, `shared`.
3. `git mv tests/packages/fixtures packages/tests/fixtures`. **This creates a new `packages/tests/` directory at the `packages/` root level** — it is intentional and distinct from per-worker `packages/<worker>/tests/` directories. `packages/tests/fixtures/` holds shared test fixtures consumed by multiple workers; the design doc specifies this location. No worker owns the directory; it sits alongside the workers at the `packages/` root.
4. Remove root `tests/` (now empty). Verify with `ls tests` → "No such file or directory".
5. In root `tsconfig.json`:
   - Remove `"tests/**/*.ts"` and `"tests/**/*.tsx"` from `include`.
   - `"lib/**/*.ts"` already covers `lib/tests/**/*.ts`. Same for `packages/**/*.ts`. No additions needed.
6. Run pre-commit gate. `bun test` should still discover all tests (bun recurses for `*.test.ts*`).

**Commit**: `Refactor: colocate lib/ and packages/ tests under their modules`

---

### Phase 6: Lore + docs + p4-adapter spec sweep (REQ-LAYOUT-10, REQ-LAYOUT-11)

**Files**: `CLAUDE.md`, `README.md`, `.lore/specs/infrastructure/p4-adapter.md`, `.lore/issues/worker-display-title-hardcoded-to-name.md`, `.lore/issues/mockup-metadata-sidebar-missing-file-size.md`, `.lore/issues/scheduler-removal-residue.md`, plus any other `.lore/` document matching the grep patterns
**Addresses**: REQ-LAYOUT-10, REQ-LAYOUT-11
**Expertise**: none for docs; p4-adapter spec has a structured edit (requirements + table)

1. **Update `CLAUDE.md`**:
   - Line 13: `daemon/app.ts` → `apps/daemon/app.ts`.
   - Line 15: `daemon/types.ts` → `apps/daemon/types.ts`; `lib/types.ts` unchanged; the clause `lib/ never imports from daemon/ or web/` updates to `apps/daemon/ or apps/web/`.
   - Line 21: `daemon/lib/git.ts` → `apps/daemon/lib/git.ts`; `daemon/services/git-admin.ts` → `apps/daemon/services/git-admin.ts`.
   - Line 23: `web/tsconfig.json` → `apps/web/tsconfig.json`.
   - Line 35: `bun test tests/lib/config.test.ts` → `bun test lib/tests/config.test.ts`.
   - Line 54: `web/app/globals.css` → `apps/web/app/globals.css`.
2. **Update `README.md`**:
   - Line 40: `bun test tests/lib/config.test.ts` → `bun test lib/tests/config.test.ts`.
   - Lines 51-53: `web/`, `daemon/`, `cli/` → `apps/web/`, `apps/daemon/`, `apps/cli/`.
   - Line 59: `tests/` description no longer applies (no root tests/). Replace with a short note: "Tests live under each module's `tests/` subdirectory (e.g., `apps/cli/tests/`, `lib/tests/`, `packages/<worker>/tests/`)."
3. **Reconcile `.lore/specs/infrastructure/p4-adapter.md`** (REQ-LAYOUT-10):
   - `modules:` frontmatter: unchanged — stays `[p4-adapter]`. Per Open Questions resolution, frontmatter uses short labels, not paths; canonical location lives in the spec body (REQ-P4A-1).
   - REQ-P4A-1: update wording that names `p4-adapter/` as a root sibling. New text names `lib/p4-adapter/` as the canonical location.
   - REQ-P4A-2: "None of those systems import from `p4-adapter/`" → "None of those systems import from `lib/p4-adapter/`." Preserve the one-way boundary intent: no imports into `lib/p4-adapter/` from other `lib/` modules or from apps; no imports out of `lib/p4-adapter/` into daemon/apps/packages.
   - REQ-P4A-4: `bun run p4-adapter/index.ts` → `bun run lib/p4-adapter/index.ts`.
   - REQ-P4A-33: `p4-adapter/tests/` → `lib/tests/p4-adapter/` (matches Phase 5 destination).
   - "Files to Create" table (lines ~333-343): update all `p4-adapter/*` paths to `lib/p4-adapter/*`.
   - Add note at bottom of spec: "Location updated per `.lore/specs/infrastructure/repository-layout.md`; history preserved in commit `4b7ded40` (initial move) and the repository-layout plan's sweep."
4. **Update open issues** (REQ-LAYOUT-11):
   - `.lore/issues/worker-display-title-hardcoded-to-name.md:83`: `tests/web/artifact-attribution-resolution.test.ts` → `apps/web/tests/artifact-attribution-resolution.test.ts` (verify final location after Phase 4 merges — may be under `apps/web/tests/api/` or similar).
   - `.lore/issues/mockup-metadata-sidebar-missing-file-size.md:27`: `tests/lib/artifacts.test.ts` → `lib/tests/artifacts.test.ts`.
   - `.lore/issues/scheduler-removal-residue.md:15,17`: `tests/cli/cli-error-handling.test.ts` → `apps/cli/tests/cli-error-handling.test.ts`; `tests/components/commission-view.test.tsx` → `apps/web/tests/components/commission-view.test.tsx`.
5. **Broad lore sweep** for any other path references the researcher may have missed:
   ```
   grep -rn "\btests/cli\b\|\btests/daemon\b\|\btests/web\b\|\btests/lib\b\|\btests/packages\b\|\btests/api\b\|\btests/components\b\|\btests/integration\b" .lore/
   grep -rn "\bcli/[a-z]\|\bdaemon/[a-z]\|\bweb/[a-z]" .lore/ | grep -v "apps/cli/\|apps/daemon/\|apps/web/"
   ```
   Apply the sweep rule from Open Questions: **rewrite paths** in specs, plans, brainstorms, issues, reference docs; **preserve paths as-is** in retros and meeting notes (they're dated snapshots). Hits in retros/meeting notes are expected and stay put.
6. Run pre-commit gate (no code changes this phase; gate should pass trivially — but run it to catch any lint rule that scans markdown).

**Commit**: `Refactor: reconcile lore and docs with apps/ layout`

---

### Phase 7: Validate against spec

**Expertise**: general-purpose sub-agent

Launch a sub-agent with fresh context and the following brief:

> Read `.lore/specs/infrastructure/repository-layout.md`. Verify every requirement (REQ-LAYOUT-1 through REQ-LAYOUT-13) against the current repository state. For each requirement: quote the requirement, state pass/fail, and cite the evidence (path, grep output, file contents). Run the spec's "AI Validation" checks:
>
> - `ls` at repo root matches the design doc's directory names (`apps/`, `lib/`, `packages/`, `scripts/`, `docs/` plus config files; no `cli/`, `daemon/`, `web/`, `types/`, or `tests/` at root).
> - `grep -rn "@/types/" .` returns zero results (excluding `node_modules` and `.next/`).
> - Root `tests/` and `types/` directories do not exist.
> - `p4-adapter` spec's REQ-P4A-1 language matches actual module location (`lib/p4-adapter/`).
> - The broad grep from the spec (`grep -rn "p4-adapter\|tests/api\|tests/web\|tests/daemon\|tests/cli\|tests/lib\|tests/packages\|tests/components\|tests/integration" .lore/ .github/ .git-hooks/ package.json tsconfig.json`). **Expected false positives that must be filtered before counting hits**:
>   1. `lib/p4-adapter/` — the new canonical location (`p4-adapter` alternation matches it). Filter with `... | grep -v "lib/p4-adapter"`.
>   2. Retros (`.lore/retros/**`) and meeting notes (`.lore/meetings/**` or wherever they live) — preserved as dated snapshots per Phase 6 sweep rule. Filter with `... | grep -v "\.lore/retros/\|\.lore/meetings/"`.
>
>   Remaining hits are real findings and should be flagged.
> - Pre-commit hook passes cleanly: `bun run typecheck && bun run lint && bun test && bun run build`.
>
> Report: punch list of pass / fail / needs-attention, with evidence.

Do not commit based on this output. Use findings to drive any corrective commits.

## Delegation Guide

Per the pattern in `.lore/plans/infrastructure/cli-agent-surface.md` and the lesson from `unified-sdk-runner` (per-phase fresh-context review catches bugs the implementer missed), each phase has an explicit reviewer gate:

| Phase | Reviewer | Focus |
|-------|----------|-------|
| Phase 1 | general-purpose sub-agent | Verify `css-modules.d.ts` is picked up by Next.js build; ambient `declare module` reachable from `.module.css` imports. |
| Phase 2 | general-purpose sub-agent | Spot-check the 28 `@/cli/` rewrites; verify no non-aliased `cli/` string constants broke. |
| Phase 3 | general-purpose sub-agent — large blast radius | Spot-check a sample across `@/daemon/` rewrites (~10% = 50-ish sites); verify the one-way `lib/ → daemon/` import direction is preserved (grep `@/lib/` inside `apps/daemon/**` is fine; grep `@/apps/daemon/` inside `lib/**` must return zero). |
| Phase 4 | frontend-aware reviewer (general-purpose sub-agent briefed on the retro `build-break-client-fs-imports`) | Verify: (a) `apps/web/tsconfig.json` `baseUrl: "../.."` resolves correctly; (b) no client component's `import type` path now pulls `node:fs` into the bundle — the only reliable check is a green `bun run build` inspection of the output bundle for `node:fs` markers; (c) Next.js output lands at `apps/web/.next/`; (d) `.gitignore` updated. |
| Phase 5 | general-purpose sub-agent | Verify `bun test` discovers the same count of tests as pre-refactor; pipe pre- and post-counts for diff. |
| Phase 6 | general-purpose sub-agent briefed on the spec reconciliation | Verify p4-adapter spec is internally consistent after edits; verify no retained `p4-adapter/` root reference. |
| Phase 7 | spec-validation sub-agent (this plan's Phase 7) | Full spec audit (see Phase 7 brief above). |

Consult `.lore/lore-agents.md` if it exists for project-specific agent names. As of 2026-04-22 the repo does not mandate a specific reviewer agent type; `general-purpose` with a focused brief is sufficient.

## Open Questions

- **Single PR, separate commits per phase.** Each phase is its own commit on the branch; all phases ship in one PR. Every commit must pass the pre-commit hook (typecheck, lint, test, build) — the hook is not optional and must not be bypassed with `--no-verify`. The commit-per-phase structure preserves `git blame` granularity for each import sweep and each config change. If any phase's pre-commit gate fails, fix and re-commit on that phase before moving to the next; do not amend or reorder.
- **Lore sweep rule (resolved).** Documents describing the current system track current paths; dated snapshots preserve their original paths.
  - **Rewrite paths**: specs, plans, brainstorms, issues, reference docs, `CLAUDE.md`, `README.md`.
  - **Preserve paths as-is**: retros, meeting notes. These are dated records of what was true at the time; rewriting their paths makes them lie about what the codebase looked like when the event happened.
  - **Phase 7 implication**: the AI validation grep will return hits inside retros and meeting notes. Filter them the same way `lib/p4-adapter/` false positives are filtered. Hits outside retros/meeting notes are real findings.
- **`modules:` frontmatter convention (resolved).** Frontmatter `modules:` uses short labels, never paths. The p4-adapter spec keeps `modules: [p4-adapter]`. Canonical location (`lib/p4-adapter/`) lives in the spec body (REQ-P4A-1), not in the label. This matches sibling specs: `repository-layout.md` uses `[cli, daemon, web, lib, packages]`; `daemon-application-boundary.md` uses `[daemon, lib, web]`. Paths belong in requirements, not in search labels.
