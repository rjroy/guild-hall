---
title: "Implementation notes: repository-layout"
date: 2026-04-22
status: complete
tags: [implementation, notes, refactor, directory-structure]
source: .lore/plans/infrastructure/repository-layout.md
modules: [cli, daemon, web, lib, packages]
---

# Implementation Notes: Repository Layout

## Summary

Repository root layout refactor, implemented across seven phases plus a final
cleanup commit. All REQ-LAYOUT requirements validated in Phase 7; pre-commit
gate (typecheck, lint, test — 3637 pass / 4 skip — build) green at every
phase commit.

Phase commits on `claude/main`:

| Phase | Commit | Subject |
|-------|--------|---------|
| 1 | `eef6752c` | Refactor: relocate ambient CSS types into web/ |
| 2 | `4d5256e8` | Refactor: move cli/ → apps/cli/ |
| 3 | `268f517c` | Refactor: move daemon/ → apps/daemon/ |
| 4 | `fcf67ac4` | Refactor: move web/ → apps/web/ |
| 5 | `b4a9c843` | Refactor: colocate lib/ and packages/ tests under their modules |
| 6 | `d643f0fe` | Refactor: reconcile lore and docs with apps/ layout |
| 7 | `24d52cc1` | Refactor: Phase 7 sweep cleanup for p4-adapter path refs |

Plan artifact committed as `82c7791a` before Phase 1.

## Outstanding follow-ups

- **`lib/tests/` importing `@/apps/daemon/` in three files**
  (`config.test.ts`, `plugin-metadata.test.ts`, `workspace-scoping.test.ts`):
  surfaced by Phase 7. Tests live under `lib/tests/` but exercise daemon
  behavior through lib. Not a source-level REQ-LAYOUT-8 violation, but a
  candidate for reclassification — some tests may belong under
  `apps/daemon/tests/` instead. File as an issue for later.
- **Latent Turbopack import-type risk**: client components in
  `apps/web/components/commission/**` and
  `apps/web/components/dashboard/**` use `import type` from
  `lib/commissions.ts` and `lib/meetings.ts`, both of which import
  `node:fs/promises`. Build is currently clean, but per the
  `build-break-client-fs-imports` retro this pattern can silently pull
  `node:fs` into the client bundle. Candidate: extract the shared types
  into client-safe modules following the `commission-href.ts` and
  `artifact-sorting.ts` precedent.

## Progress
- [x] Phase 1: Groundwork (types/css-modules.d.ts → web/css-modules.d.ts; remove types/)
- [x] Phase 2: Move cli/ → apps/cli/
- [x] Phase 3: Move daemon/ → apps/daemon/
- [x] Phase 4: Move web/ → apps/web/ (includes tsconfig + test consolidation)
- [x] Phase 5: Consolidate lib/ and packages/ tests under their modules
- [x] Phase 6: Lore + docs + p4-adapter spec sweep
- [x] Phase 7: Validate against spec

## Log

### Phase 1: Groundwork
- Dispatched: `git mv types/css-modules.d.ts web/css-modules.d.ts`; remove `types/`; drop `types/**/*.d.ts` from root tsconfig `include`; add `css-modules.d.ts` to `web/tsconfig.json` `include`.
- Result: File moved, `types/` removed, both tsconfigs updated.
- Tests: typecheck / lint / test / build all pass via pre-commit hook.
- Review (code-reviewer): approved. Suggested TODO comment on the root `files` entry; added.
- Commit: `eef6752c Refactor: relocate ambient CSS types into web/`
- Surprise: implementation agent had to add `"files": ["web/css-modules.d.ts"]` to root tsconfig because `exclude: ["web"]` is still present in Phase 1 and tests transitively import web CSS modules. See Divergence.

### Phase 2: Move cli/ → apps/cli/
- Dispatched: `git mv cli apps/cli`; `git mv tests/cli apps/cli/tests`; 28-site `@/cli/` → `@/apps/cli/` sweep; root tsconfig `include` + `package.json` bin/scripts updated.
- Result: 22 renames (9 source + 12 test + 1 snapshot dir); 1 non-test production import rewritten in `daemon/services/git-admin.ts`; 12 test-file imports rewritten.
- Review (code-reviewer): flagged two stale `cli/index.ts` links in `docs/usage/README.md` and `docs/usage/getting-started.md` — fixed during Phase 2 rather than deferring to Phase 6. Also confirmed no `@/cli/` residue, no apps/cli production imports into daemon/web (test imports of daemon are expected).
- Commit: `4d5256e8 Refactor: move cli/ → apps/cli/`
- Note: plan's Phase 6 sweep explicitly enumerates CLAUDE.md + README.md but not `docs/usage/**`. Handled per-phase from here on so docs are never pointing at missing files mid-refactor.

### Phase 3: Move daemon/ → apps/daemon/
- Dispatched: `git mv daemon apps/daemon`; `git mv tests/daemon apps/daemon/tests`; 538-site `@/daemon/` → `@/apps/daemon/` sweep across 157 files; root tsconfig `include` + `package.json` scripts updated.
- Result: Sweep exact-parity (538 in / 538 out). Sub-structure preserved (lib/, routes/, services/{commission,heartbeat,manager,meeting}/). One-way `lib/ → daemon/` direction verified (0 `@/apps/daemon/` imports inside lib/).
- Review (code-reviewer): flagged four stale `tests/daemon/routes/` doc-comment references in `tests/api/*.test.ts` — fixed before commit. Eslint override glob extension (`apps/*/tests/**`) judged correctly scoped, no production code inherits the test-file rule relaxation.
- Commit: `268f517c Refactor: move daemon/ → apps/daemon/`
- Divergence: eslint.config.mjs override glob extended (see Divergence section).

### Phase 4: Move web/ → apps/web/
- Dispatched: `git mv web apps/web`; merged four test dirs (`tests/web`, `tests/api`, `tests/components`, `tests/integration`) under `apps/web/tests/`; 209-site `@/web/` sweep; tsconfig deepens; root tsconfig loses `"files"` + `exclude: ["web"]`; `.gitignore`, `package.json`, `eslint.config.mjs` updated; docs/usage/*.md link targets updated.
- Result: 79 files touched by sweep (209 → 0). No filename collisions on test merges. Nine `Bun.file()` string-literal paths in `CopyPathButton.test.tsx` rewritten (not module specifiers — would have slipped past the import sweep).
- Tests: all four gates green; `apps/web/.next/` produced, `web/.next/` does not exist.
- Review (code-reviewer, briefed on build-break-client-fs-imports retro): approved. Verified `paths` unchanged (still `{"@/*": ["./*"]}`), `baseUrl: "../.."` correctly targets repo root.
- Commit: `fcf67ac4 Refactor: move web/ → apps/web/`
- Follow-up observation (not blocking): reviewer noted pre-existing `import type` imports from `lib/commissions.ts` and `lib/meetings.ts` (both import `node:fs/promises`) into several client components. Phase 4 does not regress this and `bun run build` is currently clean, but the pattern remains latent Turbopack risk. Candidate for a future issue: extract the shared types into client-safe modules, following the `commission-href.ts` / `artifact-sorting.ts` precedent.
- Divergence: `eslint.config.mjs` required three additional edits beyond the plan (see Divergence section).

### Phase 5: Consolidate lib/ and packages/ tests
- Dispatched: `git mv tests/lib lib/tests`; per-worker test moves into `packages/<worker>/tests/`; `tests/packages/fixtures` + four cross-worker `worker-*.test.ts` files → `packages/tests/`; removed root `tests/` (including a stray `.gitkeep` not in the plan).
- Result: 3637 pass / 4 skip / 169 files — identical to Phase 4 baseline. Fixture imports under `packages/tests/fixtures/` resolve correctly (tests use `__dirname`-relative paths).
- Review (code-reviewer): flagged five stale-path references outside the `.lore/` sweep scope — two plugin skill reference docs (spec-writing.md, commission-prompts.md) and three in-code comments (app-operations-wiring.test.ts, commission-form.test.tsx). Fixed before commit. One historical migration comment in `git-admin.test.ts` that references a file which no longer exists anywhere was intentionally left alone — it describes prior state, not current.
- Commit: `b4a9c843 Refactor: colocate lib/ and packages/ tests under their modules`
- Divergence: four flat cross-worker tests (`worker-*.test.ts`) placed at `packages/tests/` alongside fixtures — not enumerated in the plan but consistent with the design's "shared tests that no worker owns sit at `packages/` root" rule.

### Phase 6: Lore + docs + p4-adapter spec sweep
- Dispatched: rewrite path references across CLAUDE.md, README.md, p4-adapter spec, three open issues, and every non-snapshot `.lore/` document. Preserve paths in retros / meetings / commissions / `_archive` / `_abandoned`.
- Result: 188 `.md` files changed, ~2,700 line substitutions. Spot-checks confirmed: no rewrites under `.lore/retros`, `.lore/meetings`, `.lore/commissions`, `_archive`, `_abandoned`; no doubled prefixes; `modules:` labels preserved as short names; p4-adapter spec internally consistent.
- Review (code-reviewer): all priority checks passed. Final grep residue is only within the explicit allowlist (repository-layout spec + p4-adapter Location History + preserved files).
- Commit: `d643f0fe Refactor: reconcile lore and docs with apps/ layout`
- Bugs found during sweep: implementation agent's first pass produced 23 files with doubled prefixes (`apps/web/apps/web/...`) and the tag regex initially false-skipped files containing "meeting" as substring. Both fixed before commit.

### Phase 7: Validate against spec
- Dispatched: spec validation sub-agent with the full REQ-LAYOUT-1..13 checklist, AI Validation grep list, and robustness checks.
- Result: REQ-LAYOUT-1..10, 12, 13 PASS; REQ-LAYOUT-11 PASS with NEEDS-ATTENTION on three sweep residues; REQ-LAYOUT-8 PASS-with-caveat on `lib/tests/` importing `@/apps/daemon/`.
- Residues fixed in the final cleanup commit:
  - `.lore/brainstorm/disposable-local-git-p4.md`: rewrote the "Separate tool?" answer to name `lib/p4-adapter/` and drop the `cli/` analogue.
  - `.lore/brainstorm/projfs-lazy-worktree-population.md`: three `p4-adapter/init.ts` references → `lib/p4-adapter/init.ts`.
  - `.lore/plans/infrastructure/p4-adapter.md`: added a historical note at the top. Plan is `status: executed`; body preserved as a dated record, note links readers to current spec.
- Caveats recorded in Outstanding follow-ups (above).
- Stale root `.next/` cache (pre-migration build output, gitignored) removed during Phase 7; Next.js regenerates.
- Commit: `24d52cc1 Refactor: Phase 7 sweep cleanup for p4-adapter path refs`.

## Divergence

- **Root tsconfig `files` entry for `web/css-modules.d.ts`** (Phase 1): plan said "no other edits" to root tsconfig, but removing `types/**/*.d.ts` from `include` broke typecheck because tests under `tests/components/` and `tests/api/` import `@/web/...` which transitively reference `.module.css`. Root tsconfig excludes `web/`, so the ambient declaration is unreachable without an explicit entry. TypeScript's `files:` entries bypass `exclude`. Approved; comment added pointing at Phase 4 cleanup. Status: approved (self-approved under Auto mode; low-risk, reversible in Phase 4 when `exclude: ["web"]` is removed).
- **eslint.config.mjs test-file override glob extension** (Phase 3): plan did not enumerate eslint config edits. Moving `tests/daemon/` to `apps/daemon/tests/` caused the existing override (scoped to `tests/**/*.ts(x)`) to stop matching daemon tests, surfacing 732 pre-existing lint exemptions as errors. Extended the glob to also cover `apps/*/tests/**/*.ts(x)`. Exemption stays gated on the `/tests/` path segment so production code under `apps/<x>/lib|routes|services/**` does not inherit the rule relaxation. Status: approved (self-approved under Auto mode). Phase 5 will extend it again for `lib/tests/**` and `packages/*/tests/**`.
- **eslint.config.mjs Next.js plugin config** (Phase 4): plan did not anticipate these edits. Three fields hardcoded the old `web/` prefix and had to move: `next.rootDir` (`"web"` → `"apps/web"`), plus two `globalIgnores` entries (`web/.next/**` → `apps/web/.next/**`, `web/next-env.d.ts` → `apps/web/next-env.d.ts`). Without these, `eslint-config-next`'s default ignore behavior would have started scanning the moved `.next/` build output. Status: approved (self-approved under Auto mode); load-bearing for lint to stay green.
- **`docs/usage/**.md` path sweep** (Phases 2 and 4): plan's Phase 6 enumerates `CLAUDE.md` and `README.md` but not `docs/usage/**`. Handling the doc link/label updates per-phase rather than deferring to Phase 6 so documentation never points at missing files mid-refactor. Status: approved (self-approved; reversible and reduces reviewer back-and-forth).
