---
title: "Plan: Token-Efficient Git Tools"
date: 2026-03-30
status: executed 
tags: [git, tokens, toolbox, mcp-tools, performance, plan]
modules: [daemon/services/git-readonly-toolbox]
related:
  - .lore/specs/infrastructure/token-efficient-git-tools.md
  - .lore/research/token-efficient-git-tools.md
  - .lore/brainstorm/improve-token-perf-git-tools.md
  - .lore/issues/improve-token-perf-of-git-tools.md
  - .lore/plans/workers/worker-tool-boundaries.md
---

# Plan: Token-Efficient Git Tools

## Spec Reference

**Spec**: `.lore/specs/infrastructure/token-efficient-git-tools.md`

Requirements addressed:

- REQ-TEG-1: `git_show` passes `--no-binary` → Phase 1, Step 1
- REQ-TEG-2: `git_diff` passes `--no-binary` → Phase 1, Step 1
- REQ-TEG-3: `include_binary` parameter on both tools → Phase 1, Step 1
- REQ-TEG-4: Built-in file pattern exclusion → Phase 2, Step 2
- REQ-TEG-5: Exclusion list contents → Phase 2, Step 2
- REQ-TEG-6: `include_generated` parameter → Phase 2, Step 2
- REQ-TEG-7: Excluded file summary in output → Phase 2, Step 3
- REQ-TEG-8: Per-file size cap (20KB default) → Phase 3, Step 4
- REQ-TEG-9: Per-file truncation notice format → Phase 3, Step 4
- REQ-TEG-10: Total output cap (100KB) → Phase 3, Step 5
- REQ-TEG-11: `max_file_size` parameter → Phase 3, Step 4
- REQ-TEG-12: `diff` parameter on `git_show` (`none`/`stat`/`full`) → Phase 4, Step 6
- REQ-TEG-13: `diff="none"` returns metadata only → Phase 4, Step 6
- REQ-TEG-14: `diff="stat"` returns metadata + stat → Phase 4, Step 6
- REQ-TEG-15: `diff="full"` returns filtered patch → Phase 4, Step 6
- REQ-TEG-16: Updated `git_show` tool description → Phase 4, Step 6
- REQ-TEG-17: `stat` parameter on `git_diff` → Phase 4, Step 7

## Codebase Context

### Implementation File

All changes land in a single file: `daemon/services/git-readonly-toolbox.ts` (267 lines). The five tools are defined inside `createGitReadonlyTools()` (line 143), which takes `workingDirectory` and `runGit: GitRunner` parameters. The `GitRunner` DI pattern means all filtering logic can be tested with mock git output, no real repo needed.

### Current Tool Shapes

`git_diff` (lines 180-199): Builds `["diff"]` args, appends `--cached`/ref/file as needed, returns raw stdout as text. The `"--"` separator is already placed before the `file` arg, which matters for pathspec exclusion patterns (they go after `"--"` too).

`git_show` (lines 201-231): Two subprocess calls. First: `git show --no-patch --format=<fmt> <ref>` for metadata. Second: `git diff-tree --root -p <ref>` for the full patch. The patch result goes into a `diff` field in the JSON response.

### Test Patterns

Tests at `tests/daemon/services/git-readonly-toolbox.test.ts` (388 lines). The `mockGitRunner` helper (line 121) matches git args against string patterns and returns canned responses. The `callTool` helper (line 143) invokes a named tool and returns the text content. This infrastructure supports the new tests without modification.

### Wiring

The toolbox factory at line 264 and its registration in `daemon/services/toolbox-resolver.ts` are unaffected. All changes are internal to the tool handlers and new helper functions.

## Implementation Phases

The four phases build on each other. Each phase is independently shippable: the tools improve with each phase, and no phase leaves the code in a broken state.

### Phase 1: Binary Exclusion (REQ-TEG-1, REQ-TEG-2, REQ-TEG-3)

The simplest layer and the highest leverage. A flag addition to two git commands plus one new parameter on each tool.

#### Step 1: Add `--no-binary` and `include_binary` parameter

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Add `include_binary` parameter (optional boolean, default `false`) to the `git_diff` tool's Zod schema. Description: `"Include binary file diffs in output (default: false). Warning: can produce very large output."`.

2. In the `git_diff` handler, insert `--no-binary` into `gitArgs` unless `args.include_binary` is `true`. Place it immediately after `"diff"` (before `--cached`/ref/file args). The flag is a git diff option, not a pathspec, so position matters: it must come before `"--"`.

3. Add the same `include_binary` parameter to the `git_show` tool's Zod schema.

4. In the `git_show` handler, add `--no-binary` to the `diff-tree` args array (the second subprocess call, line 214) unless `args.include_binary` is `true`. The args become `["diff-tree", "--root", "--no-binary", "-p", args.ref]`.

**Tests to add** (in the existing test file):

- `git_diff` passes `--no-binary` by default (capture args, verify flag present)
- `git_diff` omits `--no-binary` when `include_binary: true`
- `git_show` passes `--no-binary` to diff-tree by default
- `git_show` omits `--no-binary` when `include_binary: true`

**Review checkpoint**: Thorne verifies the flag placement relative to `--` in git_diff. The `--no-binary` flag is a diff option that must precede the pathspec separator. This is easy to get wrong if the flag is appended after `"--"`.

### Phase 2: Generated File Exclusion (REQ-TEG-4, REQ-TEG-5, REQ-TEG-6, REQ-TEG-7)

This phase adds the exclusion pattern list and the summary of what was filtered. Two steps because the summary requires an additional git subprocess call.

#### Step 2: Add exclusion patterns and `include_generated` parameter

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Define a `GENERATED_FILE_EXCLUSIONS` constant (exported, for test access) near the top of the file, after the type definitions. Structure as an array of objects with `pattern` and `category` fields:

   ```typescript
   export const GENERATED_FILE_EXCLUSIONS: Array<{ pattern: string; category: string }> = [
     { pattern: "*.lock", category: "lockfile" },
     { pattern: "package-lock.json", category: "lockfile" },
     { pattern: "yarn.lock", category: "lockfile" },
     { pattern: "bun.lockb", category: "lockfile" },
     { pattern: "poetry.lock", category: "lockfile" },
     { pattern: "Gemfile.lock", category: "lockfile" },
     { pattern: "composer.lock", category: "lockfile" },
     { pattern: "Cargo.lock", category: "lockfile" },
     { pattern: "*.min.js", category: "minified" },
     { pattern: "*.min.css", category: "minified" },
     { pattern: "dist/*", category: "build artifact" },
     { pattern: "build/*", category: "build artifact" },
     { pattern: ".next/*", category: "build artifact" },
     { pattern: "out/*", category: "build artifact" },
     { pattern: "target/*", category: "build artifact" },
     { pattern: "__pycache__/*", category: "cache" },
     { pattern: ".cache/*", category: "cache" },
     { pattern: "*.pyc", category: "compiled" },
   ];
   ```

2. Add `include_generated` parameter (optional boolean, default `false`) to both `git_diff` and `git_show` Zod schemas. Description: `"Include lockfiles, build artifacts, and other generated files in diff (default: false)."`.

3. In the `git_diff` handler, when `include_generated` is not `true`, append pathspec exclusion patterns after `"--"`: `":!*.lock"`, `":!package-lock.json"`, etc. If `args.file` is provided, the file arg and the exclusion patterns both go after `"--"`. Order: `["--", file, ":!pattern1", ":!pattern2", ...]` when file is present, `["--", ":!pattern1", ":!pattern2", ...]` otherwise.

4. In the `git_show` handler, when `include_generated` is not `true`, append the same pathspec exclusions to the `diff-tree` command. The `diff-tree` command accepts pathspecs after the ref: `["diff-tree", "--root", "--no-binary", "-p", args.ref, "--", ":!pattern1", ...]`.

**Tests to add**:

- `git_diff` appends pathspec exclusions by default (capture args, verify `:!` patterns present after `"--"`)
- `git_diff` omits exclusions when `include_generated: true`
- `git_diff` with `file` arg places file before exclusion patterns after `"--"`
- `git_show` appends pathspec exclusions to diff-tree by default
- `git_show` omits exclusions when `include_generated: true`
- `GENERATED_FILE_EXCLUSIONS` contains all patterns from REQ-TEG-5

#### Step 3: Add excluded file summary

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Extract a helper function `buildExcludedSummary(statOutput: string, exclusions: typeof GENERATED_FILE_EXCLUSIONS): string`. This function:
   - Parses the stat output (one line per file, format: ` path | N +++---`)
   - Tests each file path against the exclusion patterns using simple glob matching (the patterns are simple enough that `String.endsWith` and `String.startsWith` cover them; no need for micromatch)
   - Returns a formatted summary: `[N files excluded by default filters: file1 (category), file2 (category), ...]\nUse include_generated=true to include these files.`
   - Returns empty string if no files match

2. Write a `matchesExclusionPattern(filePath: string, exclusions: typeof GENERATED_FILE_EXCLUSIONS): { pattern: string; category: string } | null` helper. This does the actual matching. Export it for direct testing.

   Matching rules:
   - `*.ext` patterns: check if file name ends with `.ext`
   - `dir/*` patterns: check if file path starts with `dir/`
   - Exact name patterns (e.g., `package-lock.json`): check if the file's basename matches exactly

3. In the `git_diff` handler (when `include_generated` is not `true`): before running the filtered diff, run an unfiltered `git diff --stat` (same ref/staged/file args, but no pathspec exclusions) to get the full file list. Pass this stat output through `buildExcludedSummary`. Append the summary to the end of the diff output if non-empty.

4. In the `git_show` handler (when `include_generated` is not `true` and diff mode is `"full"`, which doesn't exist yet but will in Phase 4): run an unfiltered `git diff-tree --stat --root <ref>` to get the full file list. Pass through `buildExcludedSummary`. For `git_show`, add the summary as an `excluded` field in the JSON response rather than appending to the diff string (per REQ-TEG-7).

   Implementation note for Phase 2: since the `diff` parameter doesn't exist yet, the summary goes into the JSON response alongside the `diff` field. When Phase 4 restructures `git_show`, the `excluded` field moves into the `diff="full"` response path.

**Tests to add**:

- `matchesExclusionPattern` correctly matches `*.lock`, `package-lock.json`, `dist/*`, `*.min.js`, etc.
- `matchesExclusionPattern` returns `null` for non-matching paths like `src/index.ts`
- `buildExcludedSummary` produces correct format with multiple excluded files
- `buildExcludedSummary` returns empty string when no files match
- `git_diff` output includes excluded summary at end when files are filtered
- `git_show` response includes `excluded` field when files are filtered
- Both tools omit summary when `include_generated: true`

**Review checkpoint**: Thorne reviews after Phase 2. Key concerns: (a) pathspec ordering with the `file` parameter in `git_diff`, (b) correctness of the pattern matching helper against all REQ-TEG-5 patterns, (c) the stat subprocess overhead (one extra call per invocation, acceptable per spec).

### Phase 3: Per-File Size Cap (REQ-TEG-8, REQ-TEG-9, REQ-TEG-10, REQ-TEG-11)

This phase adds post-processing of diff output. The filtering layers are now: git flags (binary, pathspec) then string processing (per-file cap, total cap). Two steps because per-file and total caps have different logic.

#### Step 4: Per-file size cap

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Define constants: `const DEFAULT_MAX_FILE_SIZE = 20_480;` and `const MAX_TOTAL_OUTPUT = 102_400;`.

2. Extract a `splitDiffByFile(diffOutput: string): Array<{ path: string; content: string }>` function (exported). Splits on `diff --git a/<path> b/<path>` headers. Each entry contains the full segment including the header. The `path` is extracted from the `b/` side of the header (the destination path).

3. Extract an `applyPerFileCap(files: Array<{ path: string; content: string }>, maxFileSize: number): Array<{ path: string; content: string; capped: boolean }>` function (exported). For each file segment, if `content.length > maxFileSize`, replace `content` with:
   ```
   diff --git a/<path> b/<path>
   [File diff exceeds 20KB limit (<actual_size>). Use git_diff with file="<path>" to view full diff.]
   ```
   The notice formats `maxFileSize` as a human-readable size (e.g., `Math.round(maxFileSize / 1024) + "KB"`), so it reads "20KB" at the default but stays accurate when the parameter is overridden (e.g., "40KB" for `max_file_size=40960`). The spec's example shows "20KB" as a literal, but the intent is readable output at any threshold.

4. Add `max_file_size` parameter (optional number) to both `git_diff` and `git_show` Zod schemas. Description: `"Maximum bytes per file diff before truncation (default: 20480). Set to 0 to disable."`. Default is handled in the handler, not the schema, so the schema just marks it optional.

5. In both tool handlers, after getting the raw diff output (and after any pathspec filtering), apply `splitDiffByFile` then `applyPerFileCap`. Reassemble the segments into a single string.

**Tests to add**:

- `splitDiffByFile` correctly splits multi-file diff output
- `splitDiffByFile` handles single-file diffs
- `splitDiffByFile` handles empty diff
- `applyPerFileCap` replaces oversized file with notice
- `applyPerFileCap` preserves files under the cap
- `applyPerFileCap` notice includes actual file size
- `applyPerFileCap` with `maxFileSize: 0` disables capping
- `git_diff` applies per-file cap by default
- `git_diff` respects custom `max_file_size` parameter
- `git_show` applies per-file cap to diff output

#### Step 5: Total output cap

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Extract an `applyTotalCap(files: Array<{ path: string; content: string; capped: boolean }>, maxTotal: number): string` function (exported). Iterates through the file segments, accumulating total bytes. When adding the next file would exceed `maxTotal`, stop including files and append:
   ```
   [Output truncated at 100KB. N remaining files not shown: file1, file2, ...]
   Use git_diff with file="<path>" to inspect specific files.
   ```
   Files already included are not retroactively removed. The cap triggers at file boundaries only.

2. Wire `applyTotalCap` into both tool handlers after `applyPerFileCap`. The pipeline is: raw diff → split → per-file cap → total cap → reassemble.

**Tests to add**:

- `applyTotalCap` includes all files when under limit
- `applyTotalCap` truncates at file boundary when over limit
- `applyTotalCap` lists remaining file names in the notice
- Integration test: diff with many files, some large, verifies the full pipeline (split → per-file cap → total cap)

**Review checkpoint**: Thorne reviews after Phase 3. Key concerns: (a) `splitDiffByFile` regex correctness against real git output formats (rename headers, new file mode lines, etc.), (b) byte counting uses `Buffer.byteLength` or string length consistently, (c) the per-file and total cap interact correctly (per-file cap reduces individual files first, then total cap applies to the reduced set).

### Phase 4: Diff Mode Parameters (REQ-TEG-12 through REQ-TEG-17)

The structural change. `git_show` gets a `diff` parameter that controls output shape. `git_diff` gets a `stat` parameter. This phase depends on Phases 1-3 because the `diff="full"` path uses all three filtering layers.

#### Step 6: `git_show` diff parameter

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Add `diff` parameter to `git_show` Zod schema: `z.enum(["none", "stat", "full"]).optional().default("stat")`. Description per REQ-TEG-16: `"Diff output mode. 'stat' (default): file names and line counts. 'full': complete patch (filtered for size). 'none': metadata only."`.

2. Update the tool description string to: `"Show commit details. Returns diff stat by default. Use diff='full' for the complete patch (filtered for size). Use diff='none' for metadata only."`.

3. Restructure the handler into three branches:

   **`diff="none"`**: Only the first subprocess call (metadata). No `diff-tree` call at all. Response is `{ hash, author, date, subject, body }`.

   **`diff="stat"`** (default): Metadata call plus `git diff-tree --stat --root <ref>`. Parse the stat output to extract `total_files`: count lines containing ` | ` (the per-file stat lines), excluding the final summary line which matches the pattern `N files? changed`. Response is `{ hash, author, date, subject, body, stat, total_files }`.

   **`diff="full"`**: Metadata call plus filtered `diff-tree` (with `--no-binary`, pathspec exclusions, per-file cap, total cap). This is the current behavior enhanced with all filtering from Phases 1-3. The excluded summary goes in an `excluded` field. Response is `{ hash, author, date, subject, body, diff, excluded }`.

4. Remove the `diff` field from the default response path. Workers who were relying on `git_show` returning a diff will now see `stat` instead. This is the intentional breaking change documented in the spec.

**Tests to add**:

- `git_show` with `diff="none"` makes no diff-tree call
- `git_show` with `diff="none"` returns metadata only (no `diff`, `stat`, or `excluded` fields)
- `git_show` with `diff="stat"` (default) returns `stat` and `total_files` fields
- `git_show` with `diff="stat"` calls `diff-tree --stat`
- `git_show` with `diff="full"` returns `diff` field with filtered output
- `git_show` with `diff="full"` applies all three filtering layers
- `git_show` with `diff="full"` includes `excluded` field when files are filtered

**Tests to update**:

- The existing `git_show` tests (lines 282-327) assert a `diff` field in the response. These need updating: the default response now has `stat` instead of `diff`. Update the "returns structured commit with diff" test to verify the stat-default behavior, and add a new test for `diff="full"` that covers the old behavior.

#### Step 7: `git_diff` stat parameter

**Files modified**: `daemon/services/git-readonly-toolbox.ts`

**Changes**:

1. Add `stat` parameter to `git_diff` Zod schema: `z.boolean().optional()`. Default `false`. Description: `"Return diff stat (file names and line counts) instead of full unified diff. Useful for surveying large ref ranges."`.

2. In the `git_diff` handler, when `stat` is `true`, replace the `"diff"` command with `"diff", "--stat"`. No filtering layers apply (stat output is inherently bounded per REQ-TEG-17). Return the stat output as text.

3. When `stat` is `false` (default), the current behavior continues with all filtering layers applied.

**Tests to add**:

- `git_diff` with `stat: true` passes `--stat` to git
- `git_diff` with `stat: true` does not apply filtering layers: no `--no-binary` flag, no pathspec exclusions in args, and `splitDiffByFile`/`applyPerFileCap`/`applyTotalCap` are not invoked on the output
- `git_diff` with `stat: true` and `ref` passes both args correctly
- `git_diff` default behavior unchanged (no `--stat`, filtering applied)

**Review checkpoint**: Thorne reviews after Phase 4. Key concerns: (a) the `diff="stat"` response shape matches what the spec says, (b) existing test updates don't lose coverage of the old behavior (just moved to `diff="full"` tests), (c) the `stat: true` path in `git_diff` correctly bypasses all filtering.

### Step 8: Validate Against Spec

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/token-efficient-git-tools.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

The validation should verify:
- Every REQ-TEG-* has a corresponding code change
- Parameter names, defaults, and descriptions match the spec
- Truncation notice formats match the spec exactly
- The interaction between layers follows the spec's documented order (binary → generated → per-file → total)
- Edge cases from the spec's testing section are covered: commits with only binary files, commits with only excluded files, single-file commits exceeding per-file cap, empty diffs, root commits

## Delegation Guide

All implementation is Dalton's domain. The changes are concentrated in one file with established patterns.

Steps requiring specialized review:

- **After Phase 2**: Thorne reviews pathspec handling. Git pathspec ordering has subtle rules (exclusion patterns after `--`, interaction with file arguments). Getting this wrong means patterns silently don't match.
- **After Phase 3**: Thorne reviews diff parsing. The `splitDiffByFile` function must handle git's full diff header format, including rename headers (`rename from/to`), mode change lines, and new file mode headers. Edge cases in real git output are the primary risk.
- **After Phase 4**: Thorne reviews the breaking change to `git_show`. Verify that the stat-default response provides equivalent or better information for the common case, and that the `diff="full"` path preserves all existing capability.

## Open Questions

None blocking. All spec requirements are concrete and implementation-ready. Two implementation notes:

1. **Pattern matching in Step 3**: The spec doesn't specify a matching library. The patterns in REQ-TEG-5 are simple enough for string operations (`endsWith`, `startsWith`, basename comparison). Using micromatch would be consistent with the event router's field matching, but adds coupling to a utility the toolbox doesn't otherwise need. String operations are the simpler choice.

2. **Byte measurement in Steps 4-5**: The spec says "20KB (20,480 bytes)" but diff output is UTF-8 text where `string.length` counts UTF-16 code units. For TypeScript source diffs this difference is negligible. Using `string.length` is simpler than `Buffer.byteLength` and matches the spirit of the threshold. If precision matters, `Buffer.byteLength` is one line to swap in.
