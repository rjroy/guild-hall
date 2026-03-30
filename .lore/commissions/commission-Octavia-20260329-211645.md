---
title: "Commission: Brainstorm: Improve token performance of git tools"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/improve-token-perf-of-git-tools.md`.\n\n**Problem:** A `git show` recently returned 122MB of output. The git tools are custom MCP tools (in the `guild-hall-git-readonly` toolbox), so we have full control over their output. They need to be optimized for token performance.\n\n**Context:** The git-readonly tools are defined as MCP tools available to workers. The relevant code is likely in:\n- Look for the git-readonly toolbox implementation (check `packages/` and `daemon/` for git-related tool definitions)\n- `daemon/lib/git.ts` (git subprocess operations)\n\nThe tools include `git_status`, `git_log`, `git_diff`, `git_show`, and `git_branch`.\n\n**What to explore:**\n- What do the current git tools return? Read the actual implementations.\n- Where is the 122MB risk? `git show` on a large commit with binary files? `git diff` on generated files?\n- What truncation, filtering, or summarization strategies make sense?\n  - Output size caps (with a message saying output was truncated)\n  - Binary file detection and exclusion\n  - File-type filtering (skip lockfiles, generated files)\n  - Diff stat summary instead of full diff for large changes\n  - Pagination or chunk-based retrieval\n- What are other AI coding tools doing for this? (Cursor, Copilot, etc.)\n- How do we preserve usefulness while cutting token waste? The tools need to remain informative.\n- Should there be configurable limits, or sensible defaults that cover 99% of cases?\n\nWrite the brainstorm artifact to `.lore/brainstorm/improve-token-perf-git-tools.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/improve-token-perf-git-tools.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T04:16:45.446Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T04:16:45.450Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T04:16:45.497Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T04:16:52.854Z
    event: progress_report
    reason: "Starting brainstorm. Reading the issue file and relevant implementations before writing."
  - timestamp: 2026-03-30T04:18:15.549Z
    event: progress_report
    reason: "Read the full git-readonly-toolbox.ts implementation. Found the root cause: git_show runs diff-tree -p with no size limits, and git_diff is similarly unbounded. Now writing the brainstorm artifact."
  - timestamp: 2026-03-30T04:19:45.312Z
    event: result_submitted
    reason: "Brainstorm written to `.lore/brainstorm/improve-token-perf-git-tools.md`.\n\nRoot cause confirmed by reading the implementation: `git_show` runs `git diff-tree --root -p <ref>` with no filters, and `git_diff` is equally unbounded. The 122MB case was binary content or a large lockfile commit passing through raw.\n\nThe brainstorm covers six ideas with tradeoffs:\n1. Hard size cap with truncation — simple but truncates mid-file\n2. Binary exclusion via `--no-binary` — highest leverage, zero information loss for AI\n3. Lockfile/generated file exclusion via pathspec patterns — eliminates the most common noise source\n4. Stat-first `git_show` — structurally correct, breaks current behavior\n5. Per-file size caps within multi-file diffs — preserves small files, caps outliers\n6. Configurable parameters — right as opt-in wideners, wrong as the primary protection\n\nRecommended direction: three layers in combination (binary exclusion + generated file exclusion + per-file safety cap). Open questions call out threshold calibration, exclusion list scope, and whether behavior change is acceptable for `git_show`."
  - timestamp: 2026-03-30T04:19:54.587Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the full git-readonly-toolbox.ts implementation. Found the root cause: git_show runs diff-tree -p with no size limits, and git_diff is similarly unbounded. Now writing the brainstorm artifact."
projectName: guild-hall
---
Brainstorm written to `.lore/brainstorm/improve-token-perf-git-tools.md`.

Root cause confirmed by reading the implementation: `git_show` runs `git diff-tree --root -p <ref>` with no filters, and `git_diff` is equally unbounded. The 122MB case was binary content or a large lockfile commit passing through raw.

The brainstorm covers six ideas with tradeoffs:
1. Hard size cap with truncation — simple but truncates mid-file
2. Binary exclusion via `--no-binary` — highest leverage, zero information loss for AI
3. Lockfile/generated file exclusion via pathspec patterns — eliminates the most common noise source
4. Stat-first `git_show` — structurally correct, breaks current behavior
5. Per-file size caps within multi-file diffs — preserves small files, caps outliers
6. Configurable parameters — right as opt-in wideners, wrong as the primary protection

Recommended direction: three layers in combination (binary exclusion + generated file exclusion + per-file safety cap). Open questions call out threshold calibration, exclusion list scope, and whether behavior change is acceptable for `git_show`.
