---
title: Move worker posture prompts from JSON to markdown files
date: 2026-03-04
status: draft
tags: [worker-packages, authoring, developer-experience, refactor]
modules: [packages, daemon, lib]
related: [.lore/issues/worker-posture-to-markdown.md, .lore/specs/guild-hall-workers.md, .lore/specs/guild-hall-worker-roster.md]
---

# Plan: Worker Posture to Markdown Files

## Goal

Move worker posture text from `guildHall.posture` strings in `package.json` to standalone `posture.md` files in each worker package directory. This improves authoring ergonomics (real markdown, syntax highlighting, no `\n` escapes) and separates content from config.

The loader gains backward compatibility: `posture.md` takes precedence, `guildHall.posture` in `package.json` serves as fallback for packages that haven't migrated yet. Fallback removal is a separate future cleanup.

The Guild Master is excluded. It's a built-in worker with no filesystem package directory; its posture is a TypeScript constant in `daemon/services/manager/worker.ts` that already has proper formatting. Moving it would require a different pattern and can be addressed separately.

## Codebase Context

**Current flow:** `discoverPackages()` in `lib/packages.ts` scans directories for `package.json` files with a `guildHall` key, validates metadata with Zod (`workerMetadataSchema`), and produces `DiscoveredPackage` objects. The `sdk-runner.ts` reads `workerMeta.posture` from the discovered metadata and passes it into `ActivationContext.posture`. Worker activation functions (`packages/shared/worker-activation.ts`) use `context.posture` as the first section of the system prompt.

**Key files:**
- `lib/packages.ts` (lines 47-56): `workerMetadataSchema` with `posture: z.string()`
- `lib/types.ts` (lines 62-71): `WorkerMetadata` interface with `posture: string`
- `daemon/lib/agent-sdk/sdk-runner.ts` (line 236): `posture: workerMeta.posture` wiring
- `packages/shared/worker-activation.ts` (line 4): `context.posture` usage
- `daemon/services/manager/worker.ts` (lines 16-29, 45): Guild Master posture constant
- `tests/lib/packages.test.ts`: 27 discovery tests, validates posture extraction
- `tests/packages/worker-roster.test.ts`: Reads posture directly from `package.json` (bypasses discovery)
- `tests/packages/worker-role-smoke.test.ts`: Reads posture directly from `package.json` (bypasses discovery)

**Five workers affected:**
- `packages/guild-hall-developer/package.json`
- `packages/guild-hall-researcher/package.json`
- `packages/guild-hall-reviewer/package.json`
- `packages/guild-hall-test-engineer/package.json`
- `packages/guild-hall-writer/package.json`

**Package locations:** The daemon scans configurable paths. In dev mode, it scans `packages/` (local). In production, it scans `~/.guild-hall/packages/` (installed). Both paths go through the same `discoverPackages()` function. The `posture.md` file needs to work in either location.

**Spec constraints preserved:**
- REQ-WKR-1: Metadata readable at discovery time without executing code (file read is OK)
- REQ-SYS-26a: Posture lives within the bun package, not a separate directory
- REQ-WRS-3: Differentiation via metadata and posture content, not custom runtime wiring
- REQ-SYS-32: Discovery scans for `package.json` with `guildHall` key (unchanged)

## Implementation Steps

### Step 1: Create `posture.md` files for all five workers

**Files**: `packages/guild-hall-{developer,researcher,reviewer,test-engineer,writer}/posture.md`

Extract the `guildHall.posture` string from each worker's `package.json` and write it as a standalone `posture.md` file in the same directory. Convert JSON `\n` escapes to real newlines. The content is plain text with markdown-compatible formatting (the existing posture text uses a Principles/Workflow/Quality Standards structure with list items and numbered steps).

No frontmatter needed. The file is pure posture content, read as a string. Adding YAML frontmatter would mean the loader needs to strip it, which adds complexity for no benefit.

### Step 2: Update Zod schema to make posture optional

**Files**: `lib/packages.ts` (line 50)

Change `posture: z.string()` to `posture: z.string().optional()` in `workerMetadataSchema`. This allows `package.json` files that have migrated to `posture.md` to omit the `guildHall.posture` field without failing validation.

The `WorkerMetadata` TypeScript interface in `lib/types.ts` stays unchanged (`posture: string` remains required). The discovery function guarantees resolution from one source or the other before returning the package. The Zod inferred type and the TypeScript interface diverge at this point; the discovery function bridges the gap with a type assertion after resolving posture.

### Step 3: Update `discoverPackages()` to read `posture.md`

**Files**: `lib/packages.ts` (inside the discovery loop, after Zod validation)

After successful Zod validation of a worker package, add posture resolution:

1. Check if a `posture.md` file exists in the package directory (`path.join(pkgDir, "posture.md")`)
2. If it exists, read it and use its content as the posture (trimmed)
3. If it doesn't exist, use `guildHall.posture` from the validated metadata (the fallback)
4. If neither source provides a posture string (no file AND no JSON field), warn and skip the package

This logic only applies to worker packages (those matching `workerMetadataSchema`). Toolbox packages don't have posture and are unaffected.

The resolution happens inside the existing discovery loop, between the Zod validation step (line 146) and the `seen.set()` call (line 157). The resolved posture is set on the metadata object before it's stored.

Detection of worker vs toolbox: use `"identity" in result.data` as the structural discriminant. Workers have an `identity` object; toolboxes have `name` and `description` instead. This is reliable because it's a required field on each branch of the Zod union, not an optional property that could be absent for multiple reasons.

After narrowing, the posture assignment requires a type assertion since the Zod output type has `posture?: string` while `WorkerMetadata` requires `posture: string`. The assertion is safe because the discovery function guarantees resolution before storing the package.

### Step 4: Remove `guildHall.posture` from worker `package.json` files

**Files**: `packages/guild-hall-{developer,researcher,reviewer,test-engineer,writer}/package.json`

Delete the `posture` field from each `guildHall` object. After step 1 creates the markdown files and step 3 adds file-reading support, the JSON field is redundant for local packages.

The loader's fallback (step 3) ensures that installed packages in `~/.guild-hall/packages/` that haven't been updated yet continue to work with posture in `package.json`.

### Step 5: Update tests

**Files**: `tests/lib/packages.test.ts`, `tests/packages/worker-roster.test.ts`, `tests/packages/worker-role-smoke.test.ts`

Three test files need changes. Two of them (`worker-roster.test.ts` and `worker-role-smoke.test.ts`) read posture directly from `package.json` via `packageJson.guildHall.posture`, bypassing `discoverPackages()` entirely. They will break when Step 4 removes the JSON field.

**`tests/lib/packages.test.ts` -- new tests:**
- `discovers posture from posture.md file`: Write a `posture.md` file in the test package directory, verify it's used as the posture
- `posture.md takes precedence over guildHall.posture`: Write both a `posture.md` file and a `guildHall.posture` field, verify the file wins
- `falls back to guildHall.posture when no posture.md`: Write only `guildHall.posture` in JSON (no file), verify fallback works
- `skips worker package with no posture source`: Write a worker package with no `guildHall.posture` and no `posture.md`, verify it's skipped with a warning

**`tests/lib/packages.test.ts` -- updated tests:**
- Keep `validWorkerGuildHall()` factory with its `posture` field for backward-compat fallback tests. Add a `writePackageWithPosture(scanDir, dirName, pkgJson, postureContent)` helper that writes both `package.json` and `posture.md` for file-based tests.
- `skips packages with missing required fields` (line 339): This test deletes `posture` from metadata. Update it to also ensure no `posture.md` exists, confirming the package is skipped for having no posture source at all.

**`tests/packages/worker-role-smoke.test.ts`:** Update the `readWorkerMetadata()` helper to read posture from `posture.md` in the package directory instead of `packageJson.guildHall.posture`. These tests operate on real packages in `packages/`, not temp directories.

**`tests/packages/worker-roster.test.ts`:** Update the two posture tests that read `packageJson.guildHall.posture` directly. Change them to read `posture.md` from the package directory instead. The `extractPostureSections()` call and guardrail assertions remain the same, only the source of the posture string changes.

### Step 6: Validate against goal

Launch a sub-agent that reads this plan's Goal section, reviews the implementation, and flags anything that doesn't match. This step is not optional.

Specific checks:
- All five workers have a `posture.md` with content matching the original JSON posture
- The loader reads `posture.md` first, falls back to JSON, skips if neither exists
- `guildHall.posture` is removed from all five `package.json` files
- All existing tests pass (no regressions in the 1706-test suite)
- New tests cover file reading, precedence, fallback, and error cases
- The Guild Master is unchanged
- `sdk-runner.ts` and `packages/shared/worker-activation.ts` are untouched (they consume `workerMeta.posture` which is still a string)
- Grep for `guildHall.posture` and `packageJson.guildHall.posture` across the codebase to confirm no stale direct reads remain (the two test files `worker-roster.test.ts` and `worker-role-smoke.test.ts` were the known instances; verify no others exist)

## Delegation Guide

No specialized expertise is needed for this change. It's a straightforward refactor touching the package loader, five worker configs, and tests. A single developer worker can handle all steps.

After implementation, run a fresh-eyes review agent to verify:
- The posture resolution is wired end-to-end (retro lesson: DI wiring gaps)
- No stale references to `guildHall.posture` remain in code comments or docs (retro lesson: grep for old terminology). Specifically check `tests/packages/worker-roster.test.ts` and `tests/packages/worker-role-smoke.test.ts` which had direct `packageJson.guildHall.posture` reads.
- The fallback path actually works with both local and installed package layouts

## Open Questions

- **Installed package migration:** When packages are "installed" to `~/.guild-hall/packages/`, the install process presumably copies the package directory. Does it copy all files, or just `package.json`? If it only copies `package.json`, installed packages will always use the JSON fallback. The install mechanism should be checked and updated if needed. (See `.lore/issues/package-distribution-model.md` for the broader distribution question.)
- **Spec update:** REQ-WKR-2 lists posture as part of `package.json` metadata. After this change, posture comes from `posture.md` with JSON fallback. The spec should be updated to reflect the new source of truth. This is documentation work, not a blocker.
