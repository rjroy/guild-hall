---
title: "Commission: Brainstorm: Improve token performance of git tools"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/improve-token-perf-of-git-tools.md`.\n\n**Problem:** A `git show` recently returned 122MB of output. The git tools are custom MCP tools (in the `guild-hall-git-readonly` toolbox), so we have full control over their output. They need to be optimized for token performance.\n\n**Context:** The git-readonly tools are defined as MCP tools available to workers. The relevant code is likely in:\n- Look for the git-readonly toolbox implementation (check `packages/` and `daemon/` for git-related tool definitions)\n- `daemon/lib/git.ts` (git subprocess operations)\n\nThe tools include `git_status`, `git_log`, `git_diff`, `git_show`, and `git_branch`.\n\n**What to explore:**\n- What do the current git tools return? Read the actual implementations.\n- Where is the 122MB risk? `git show` on a large commit with binary files? `git diff` on generated files?\n- What truncation, filtering, or summarization strategies make sense?\n  - Output size caps (with a message saying output was truncated)\n  - Binary file detection and exclusion\n  - File-type filtering (skip lockfiles, generated files)\n  - Diff stat summary instead of full diff for large changes\n  - Pagination or chunk-based retrieval\n- What are other AI coding tools doing for this? (Cursor, Copilot, etc.)\n- How do we preserve usefulness while cutting token waste? The tools need to remain informative.\n- Should there be configurable limits, or sensible defaults that cover 99% of cases?\n\nWrite the brainstorm artifact to `.lore/brainstorm/improve-token-perf-git-tools.md`."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
