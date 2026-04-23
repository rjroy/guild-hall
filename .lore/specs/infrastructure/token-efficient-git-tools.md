---
title: Token-Efficient Git Tools
date: 2026-03-30
status: implemented 
tags: [git, tokens, toolbox, mcp-tools, performance]
modules: [apps/daemon/services/git-readonly-toolbox]
related:
  - .lore/brainstorm/improve-token-perf-git-tools.md
  - .lore/research/token-efficient-git-tools.md
  - .lore/issues/improve-token-perf-of-git-tools.md
  - .lore/specs/workers/worker-tool-boundaries.md
req-prefix: TEG
---

# Spec: Token-Efficient Git Tools

## Overview

A `git_show` call returned 122MB of output during a worker session. The git-readonly toolbox (`apps/daemon/services/git-readonly-toolbox.ts`) provides five MCP tools to workers without Bash access: `git_status`, `git_log`, `git_diff`, `git_show`, and `git_branch`. Two of these tools (`git_show` and `git_diff`) return raw diff output with no size limits, no binary filtering, and no noise exclusion.

This spec adds three layers of output protection to the diff-producing tools, plus a structural change to `git_show` that makes the safe path the default. The changes are grounded in industry research (`.lore/research/token-efficient-git-tools.md`) and a brainstorm that evaluated six approaches (`.lore/brainstorm/improve-token-perf-git-tools.md`).

The three layers work together: binary exclusion catches compiled and media files, generated file exclusion catches lockfiles and build artifacts, and per-file size caps catch everything else. Each layer is independently useful, but they're designed as a stack where earlier layers prevent the later ones from firing in the common case.

`git_status`, `git_log`, and `git_branch` are unaffected. Their outputs are inherently bounded (file names, commit metadata, branch names).

## Entry Points

- `apps/daemon/services/git-readonly-toolbox.ts` is the sole implementation file. All five tools are defined in `createGitReadonlyTools()`.
- The `git_show` tool (lines 201-231) runs `git diff-tree --root -p <ref>` with no output filtering.
- The `git_diff` tool (lines 180-199) runs `git diff` with no output filtering.
- Worker-tool-boundaries spec (`.lore/specs/workers/worker-tool-boundaries.md`) defined the toolbox in REQ-WTB-1 through REQ-WTB-3.

## Decision 1: Binary Exclusion (Always On)

### Motivation

Binary file diffs (images, compiled objects, fonts, PDFs) are the single most likely cause of the 122MB incident. Git includes full binary patch data by default, which is meaningless to an LLM: no AI reasoning is possible on binary patch content. Every major AI coding tool excludes binary diffs. The `--no-binary` flag on diff-producing git commands replaces binary content with a two-line note (`Binary files a/foo.png and b/foo.png differ`), preserving the signal that a binary file changed without the payload.

### Requirements

- REQ-TEG-1: The `git_show` tool must pass `--no-binary` to the `git diff-tree` command. Binary files in the commit are reported as changed but their patch content is replaced with git's standard binary notice.

- REQ-TEG-2: The `git_diff` tool must pass `--no-binary` to the `git diff` command. Same behavior as REQ-TEG-1.

- REQ-TEG-3: Both `git_show` and `git_diff` must accept an optional boolean parameter `include_binary` (default: `false`). When `true`, the `--no-binary` flag is omitted and binary content is included in the diff output. The parameter description should note that this can produce very large output.

## Decision 2: Generated File Exclusion (Always On, Overridable)

### Motivation

Lockfile diffs are the most common source of noise in typical development workflows. A `bun install` that adds a dependency produces a `bun.lockb` change that could be hundreds of KB. Build artifact diffs (`dist/`, `.next/`) are similarly voluminous and near-zero signal for code review. The research found that diffchunk MCP, rtk, and community `.gitattributes` templates all converge on the same exclusion patterns.

The exclusion list is hardcoded in the toolbox because the industry norm is hardcoded defaults with user override, not user-built lists. The list covers the Bun/Node patterns relevant to this project and common patterns from other ecosystems. Stale entries are harmless (they match nothing); missing entries are caught by Layer 3.

### Requirements

- REQ-TEG-4: The `git_show` and `git_diff` tools must exclude a built-in set of file patterns from diff output by default. Exclusion is implemented via git pathspec exclude patterns (`:!<pattern>`) appended to the git command.

- REQ-TEG-5: The built-in exclusion list must include at minimum:

  | Category | Patterns |
  |----------|----------|
  | Lockfiles | `*.lock`, `package-lock.json`, `yarn.lock`, `bun.lockb`, `poetry.lock`, `Gemfile.lock`, `composer.lock`, `Cargo.lock` |
  | Minified | `*.min.js`, `*.min.css` |
  | Build artifacts | `dist/*`, `build/*`, `.next/*`, `out/*`, `target/*` |
  | Cache/compiled | `__pycache__/*`, `.cache/*`, `*.pyc` |

  The list is defined as a constant in the toolbox source, not in configuration. It can be extended in future changes without a spec revision.

- REQ-TEG-6: Both tools must accept an optional boolean parameter `include_generated` (default: `false`). When `true`, the exclusion list is not applied. The parameter description should note that this bypasses lockfile and build artifact filtering.

- REQ-TEG-7: When files are excluded by the pattern list, the tool output must include a summary line listing the excluded files. Format: `[N files excluded by default filters: <file1> (<category>), ...]\nUse include_generated=true to include these files.` This summary appears at the end of the diff output (for `git_diff`) or in a dedicated `excluded` field (for `git_show`'s structured JSON).

  Implementation note: to generate this summary, the tool runs `git diff-tree --stat` (for `git_show`) or `git diff --stat` (for `git_diff`) first without exclusions, then compares the file list against the exclusion patterns. Files that match are listed in the summary. This is one additional git subprocess call per invocation; the stat output is small and bounded.

## Decision 3: Per-File Size Cap (Safety Net)

### Motivation

Layers 1 and 2 handle the known categories (binary, lockfiles, build artifacts). Layer 3 catches everything else: unusually large source files, generated files that don't match known patterns, data files that aren't binary (SVG, large JSON, CSV). The research validates 20KB per file as appropriate: a 400-line TypeScript refactor produces roughly 8-16KB of diff, which passes without truncation. The total output cap of 100KB (~25,000 tokens) aligns with the threshold where GitHub MCP server users reported failures.

Per-file caps are better than global caps because they preserve complete diffs for small files while only truncating outliers. A commit touching five TypeScript files and one 300KB SVG returns full diffs for the five source files and a summary for the SVG.

### Requirements

- REQ-TEG-8: After binary and generated file exclusion, the `git_show` and `git_diff` tools must enforce a per-file size cap on remaining diff output. The default per-file cap is 20KB (20,480 bytes).

- REQ-TEG-9: When a file's diff exceeds the per-file cap, its diff content is replaced with a notice:

  ```
  diff --git a/<path> b/<path>
  [File diff exceeds 20KB limit (<actual_size>). Use git_diff with file="<path>" to view full diff.]
  ```

  The file header is preserved so the worker sees which file was capped. The notice includes the actual size and a recovery action.

- REQ-TEG-10: After per-file caps, the tool must enforce a total output cap of 100KB (102,400 bytes) across all files. If total output still exceeds this after per-file caps have been applied, remaining files are replaced with a summary:

  ```
  [Output truncated at 100KB. N remaining files not shown: <file1>, <file2>, ...]
  Use git_diff with file="<path>" to inspect specific files.
  ```

  Truncation happens at file boundaries, not byte boundaries. A file is either fully included or replaced with its summary.

- REQ-TEG-11: Both tools must accept an optional `max_file_size` parameter (number, in bytes) that overrides the default 20KB per-file cap. Setting to `0` disables the per-file cap. The total cap is not user-configurable (it is the last-resort safety net).

## Decision 4: Stat-First Default for git_show

### Motivation

The research validates the stat-first pattern strongly. rtk achieves 94% token reduction by returning file-level statistics instead of full patches. Copilot users and Windsurf users manually apply this pattern as a workaround. The stat output for even a 50-file commit is under 2KB.

Currently, `git_show` always returns the full patch in the `diff` field. This is the most dangerous default because workers typically call `git_show` to understand a commit, and the full patch is often far more than they need. The stat gives a map of what changed; the worker then fetches specific files via `git_diff`.

This is a breaking change for workers that assume `git_show` returns a full diff. The change is worth it: the 122MB incident wouldn't have happened with a stat default, and the full patch is always available via an explicit parameter.

### Requirements

- REQ-TEG-12: The `git_show` tool must accept a `diff` parameter with three values: `"none"`, `"stat"` (default), and `"full"`. The parameter controls what diff information is included in the response.

- REQ-TEG-13: When `diff` is `"none"`, `git_show` returns commit metadata only (hash, author, date, subject, body). No diff-related git subprocess is executed.

- REQ-TEG-14: When `diff` is `"stat"` (default), `git_show` returns commit metadata plus a `stat` field containing the output of `git diff-tree --stat --root <ref>`. This shows file names and line counts (e.g., `src/foo.ts | 42 ++++----`). The `stat` field also includes a `total_files` count.

- REQ-TEG-15: When `diff` is `"full"`, `git_show` returns commit metadata plus a `diff` field containing the full patch output, subject to all three filtering layers (binary exclusion, generated file exclusion, per-file size cap). This is the current behavior with filtering applied.

- REQ-TEG-16: The `git_show` tool description must be updated to reflect the stat-first default: "Show commit details. Returns diff stat by default. Use diff='full' for the complete patch (filtered for size). Use diff='none' for metadata only."

## Decision 5: Diff Stat Mode for git_diff

### Motivation

The same stat-first pattern is useful for `git_diff`, though the default should remain full diff output. A worker inspecting uncommitted changes usually wants the actual diff. But a worker surveying what changed across a large ref range (`HEAD~50`, `main..feature`) benefits from seeing the stat first.

### Requirements

- REQ-TEG-17: The `git_diff` tool must accept an optional `stat` boolean parameter (default: `false`). When `true`, the tool returns `git diff --stat` output instead of the full unified diff. Filtering layers do not apply to stat output (it is inherently bounded).

## Interaction Between Layers

The three filtering layers and the diff mode parameter interact as follows:

1. **Diff mode** is evaluated first. If `git_show` is called with `diff="none"` or `diff="stat"`, no filtering is needed because no patch output is generated. If `git_diff` is called with `stat=true`, no filtering is needed.

2. For full diff output, **binary exclusion** (Layer 1) is applied via the `--no-binary` git flag unless `include_binary=true`.

3. **Generated file exclusion** (Layer 2) is applied via pathspec patterns unless `include_generated=true`.

4. **Per-file size cap** (Layer 3) is applied to the resulting output. This is post-processing: the tool parses the diff output, splits it by file header (`diff --git a/... b/...`), measures each segment, and replaces oversized segments with a notice.

5. **Total output cap** is applied last, after per-file caps. If the aggregate still exceeds 100KB, remaining files are listed by name only.

A worker who passes `include_binary=true` and `include_generated=true` still has the per-file and total caps as safety nets. A worker who passes `max_file_size=0` disables only the per-file cap; the total cap remains.

## Testing Considerations

- The diff output parsing (splitting by file, measuring size) is pure string processing on a well-defined format (`diff --git a/... b/...` headers). This is testable with mock git output.
- The exclusion pattern matching against file paths is testable independently.
- The `GitRunner` dependency injection pattern already in place allows all filtering behavior to be tested without a real git repository.
- Edge cases to cover: commits with only binary files, commits with only excluded files, single-file commits that exceed the per-file cap, empty diffs, root commits (the `--root` flag on `diff-tree`).

## Out of Scope

- **Configurable exclusion lists** (e.g., per-project ignore files). The hardcoded list is sufficient for now. If projects need custom patterns, that's a future spec.
- **Structural diffing** (AST-level diffs via difftastic or tree-sitter). The research identifies this as a valid approach but it adds an external dependency and is language-specific. Not justified for this change.
- **Diff caching or deduplication** across tool calls within a session. The research found cachebro MCP doing this, but it requires session-level state that the toolbox doesn't currently maintain.
- **Changes to git_status, git_log, or git_branch.** Their outputs are inherently bounded.
- **Changes to the `GitRunner` interface.** All filtering is post-processing on the stdout string, not changes to how git is invoked (except for the `--no-binary` flag and pathspec patterns, which are argument-level changes).
- **Notification or logging of filtered content to the daemon.** The worker sees what was filtered; the daemon does not need to know.
